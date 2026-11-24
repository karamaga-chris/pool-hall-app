const express = require('express');
const pool    = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const METHODS = ['cash', 'momo', 'card', 'waived'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

// POST /api/payments — single session payment, with payer selected.
// The amount always comes from the session's own amount_due; any amount sent
// by the client is ignored so it cannot be tampered with.
router.post('/', async (req, res) => {
  const { session_id, method, paid_by_player_id, momo_ref, notes } = req.body;
  if (!session_id || !method) {
    return res.status(400).json({ error: 'session_id and method are required' });
  }
  if (!isUuid(session_id) || (paid_by_player_id && !isUuid(paid_by_player_id))) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  if (!METHODS.includes(method)) {
    return res.status(400).json({ error: `method must be one of: ${METHODS.join(', ')}` });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the session so two concurrent payments cannot both pass the checks.
    const sRes = await client.query(
      'SELECT amount_due, status FROM sessions WHERE id = $1 FOR UPDATE', [session_id]
    );
    const session = sRes.rows[0];
    if (!session) throw { code: 'NOT_FOUND', message: 'Session not found' };
    if (session.status !== 'completed')
      throw { code: 'BAD_REQUEST', message: 'Session must be ended before it can be paid' };

    const paidRes = await client.query(
      `SELECT 1 FROM payments WHERE session_id = $1 AND status = 'paid'`, [session_id]
    );
    if (paidRes.rows[0])
      throw { code: 'CONFLICT', message: 'This session has already been paid' };

    if (paid_by_player_id) {
      const part = await client.query(
        'SELECT 1 FROM session_players WHERE session_id = $1 AND player_id = $2',
        [session_id, paid_by_player_id]
      );
      if (!part.rows[0])
        throw { code: 'BAD_REQUEST', message: 'Payer was not part of this session' };
    }

    const amount = session.amount_due;
    const { rows } = await client.query(
      `INSERT INTO payments (session_id, received_by, amount, method, paid_by_player_id, momo_ref, status, paid_at, notes)
       VALUES ($1, $2, $3, $4, $5, $6, 'paid', NOW(), $7) RETURNING *`,
      [session_id, req.user.id, amount, method, paid_by_player_id || null, momo_ref || null, notes || null]
    );

    // Attribute spend to whichever player was picked as payer — this is the
    // only place player financials are touched (not at session start).
    if (paid_by_player_id) {
      await client.query(
        `UPDATE players SET total_spend = total_spend + $1, games_played = games_played + 1,
                updated_at = NOW() WHERE id = $2`,
        [amount, paid_by_player_id]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === 'NOT_FOUND')   return res.status(404).json({ error: err.message });
    if (err.code === 'CONFLICT')    return res.status(409).json({ error: err.message });
    if (err.code === 'BAD_REQUEST') return res.status(400).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// GET /api/payments/unpaid-players — players with at least one unsettled game,
// for the Settle Tab's default list. Must stay above GET /:session_id, which
// would otherwise swallow this as a session_id lookup.
router.get('/unpaid-players', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.id, p.full_name, p.phone,
             COUNT(*)::int                  AS unpaid_count,
             COALESCE(SUM(s.amount_due), 0) AS unpaid_total
      FROM sessions s
      JOIN session_players sp ON sp.session_id = s.id
      JOIN players p ON p.id = sp.player_id
      WHERE s.status = 'completed'
        AND (s.expected_payer_id IS NULL OR s.expected_payer_id = p.id)
        AND NOT EXISTS (
          SELECT 1 FROM payments pay WHERE pay.session_id = s.id AND pay.status = 'paid'
        )
      GROUP BY p.id, p.full_name, p.phone
      ORDER BY unpaid_total DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/payments/:session_id
router.get('/:session_id', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM payments WHERE session_id = $1 ORDER BY created_at',
    [req.params.session_id]
  );
  res.json(rows);
});

// GET /api/payments/unpaid/:player_id — all completed, unpaid sessions for a player
router.get('/unpaid/:player_id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.id, s.started_at, s.ended_at, s.amount_due, s.rate_type, t.label AS table_label
      FROM sessions s
      JOIN session_players sp ON sp.session_id = s.id
      JOIN pool_tables t ON t.id = s.pool_table_id
      WHERE sp.player_id = $1
        AND s.status = 'completed'
        AND (s.expected_payer_id IS NULL OR s.expected_payer_id = $1)
        AND NOT EXISTS (
          SELECT 1 FROM payments p WHERE p.session_id = s.id AND p.status = 'paid'
        )
      ORDER BY s.started_at DESC
    `, [req.params.player_id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/payments/bulk — pay for multiple sessions at once
router.post('/bulk', async (req, res) => {
  const { player_id, session_ids, method } = req.body;
  if (!player_id || !Array.isArray(session_ids) || session_ids.length === 0 || !method) {
    return res.status(400).json({ error: 'player_id, session_ids, and method are required' });
  }
  if (!isUuid(player_id) || session_ids.length > 200 || !session_ids.every(isUuid)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  if (!METHODS.includes(method)) {
    return res.status(400).json({ error: `method must be one of: ${METHODS.join(', ')}` });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let total = 0;
    let paidCount = 0;
    for (const sessionId of session_ids) {
      // Lock the session row so a concurrent bulk/single payment on the same
      // session can't slip past the "already paid" check below.
      // Only completed sessions the paying player actually took part in.
      const sRes = await client.query(
        `SELECT s.amount_due FROM sessions s
         JOIN session_players sp ON sp.session_id = s.id AND sp.player_id = $2
         WHERE s.id = $1 AND s.status = 'completed' FOR UPDATE OF s`,
        [sessionId, player_id]
      );
      if (!sRes.rows[0]) continue;

      const paidRes = await client.query(
        `SELECT 1 FROM payments WHERE session_id = $1 AND status = 'paid'`, [sessionId]
      );
      if (paidRes.rows[0]) continue;

      const amount = sRes.rows[0].amount_due;
      total += Number(amount);
      paidCount++;
      await client.query(
        `INSERT INTO payments (session_id, received_by, amount, method, paid_by_player_id, status, paid_at)
         VALUES ($1, $2, $3, $4, $5, 'paid', NOW())`,
        [sessionId, req.user.id, amount, method, player_id]
      );
    }

    // Attribute the whole settled total to the player who is settling their
    // tab — the other participant in each session is untouched.
    if (paidCount > 0) {
      await client.query(
        `UPDATE players SET total_spend = total_spend + $1, games_played = games_played + $2,
                updated_at = NOW() WHERE id = $3`,
        [total, paidCount, player_id]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, sessions_paid: paidCount, total_collected: total });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;