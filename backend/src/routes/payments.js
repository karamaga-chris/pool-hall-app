const express = require('express');
const pool    = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// POST /api/payments — single session payment, with payer selected
router.post('/', async (req, res) => {
  const { session_id, amount, method, paid_by_player_id, momo_ref, notes } = req.body;
  if (!session_id || !amount || !method) {
    return res.status(400).json({ error: 'session_id, amount, and method are required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let total = 0;
    let paidCount = 0;
    for (const sessionId of session_ids) {
      // Lock the session row so a concurrent bulk/single payment on the same
      // session can't slip past the "already paid" check below.
      const sRes = await client.query(
        'SELECT amount_due FROM sessions WHERE id = $1 FOR UPDATE', [sessionId]
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