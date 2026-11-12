const express = require('express');
const pool    = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

async function resolveRate(tableId) {
  const now  = new Date();
  const dow  = now.getDay();
  const time = now.toTimeString().slice(0, 8);

  const { rows } = await pool.query(`
    SELECT rate_type, price_per_game FROM rate_rules
    WHERE is_active = TRUE
      AND (pool_table_id = $1 OR pool_table_id IS NULL)
      AND $2 = ANY(applies_on)
      AND $3::time >= peak_start
      AND $3::time <  peak_end
    ORDER BY pool_table_id NULLS LAST LIMIT 1
  `, [tableId, dow, time]);

  if (rows[0]) return rows[0];

  const fallback = await pool.query(`
    SELECT rate_type, price_per_game FROM rate_rules
    WHERE is_active = TRUE AND rate_type = 'off_peak'
    AND pool_table_id IS NULL LIMIT 1
  `);
  return fallback.rows[0] || { rate_type: 'off_peak', price_per_game: 500 };
}

router.post('/start', async (req, res) => {
  const { pool_table_id, player_ids } = req.body;

  if (!pool_table_id)
    return res.status(400).json({ error: 'pool_table_id is required' });
  if (!Array.isArray(player_ids) || player_ids.length !== 2) {
  return res.status(400).json({ error: 'Exactly 2 players are required to start a game' });
}

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tableRes = await client.query(
      `SELECT * FROM pool_tables WHERE id = $1 AND is_active = TRUE FOR UPDATE`,
      [pool_table_id]
    );
    if (!tableRes.rows[0])
      throw { code: 'NOT_FOUND', message: 'Table not found' };
    if (tableRes.rows[0].status === 'active')
      throw { code: 'CONFLICT', message: 'Table already has an active session' };

    const playerRes = await client.query(
      `SELECT id FROM players WHERE id = ANY($1) AND is_active = TRUE`,
      [player_ids]
    );
    if (playerRes.rows.length !== player_ids.length)
      throw { code: 'BAD_REQUEST', message: 'One or more players not found or not enrolled' };

    // Resolve fixed price for this time of day
    const { rate_type, price_per_game } = await resolveRate(pool_table_id);

    const sessionRes = await client.query(
      `INSERT INTO sessions (pool_table_id, started_by, rate_type, price_per_game, amount_due)
       VALUES ($1, $2, $3, $4, $4) RETURNING *`,
      [pool_table_id, req.user.id, rate_type, price_per_game]
    );
    const session = sessionRes.rows[0];

    for (const pid of player_ids) {
      await client.query(
        'INSERT INTO session_players (session_id, player_id) VALUES ($1, $2)',
        [session.id, pid]
      );
    }

    await client.query(
      `UPDATE pool_tables SET status = 'active', updated_at = NOW() WHERE id = $1`,
      [pool_table_id]
    );

    await client.query('COMMIT');
    res.status(201).json({
      session_id:     session.id,
      rate_type,
      price_per_game,
      amount_due:     price_per_game,
      started_at:     session.started_at,
      message: `Game started — ${rate_type} price RWF ${price_per_game}`
    });
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

router.post('/:id/end', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sRes = await client.query(
      `SELECT * FROM sessions WHERE id = $1 AND status = 'active' FOR UPDATE`,
      [req.params.id]
    );
    if (!sRes.rows[0])
      throw { code: 'NOT_FOUND', message: 'Active session not found' };

    const ended = await client.query(
      `UPDATE sessions SET ended_at = NOW(), status = 'completed'
       WHERE id = $1 RETURNING *`,
      [sRes.rows[0].id]
    );

    await client.query(
      `UPDATE pool_tables SET status = 'idle', updated_at = NOW() WHERE id = $1`,
      [sRes.rows[0].pool_table_id]
    );

    await client.query('COMMIT');
    res.json(ended.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// PATCH /api/sessions/:id/expected-payer — designate who will settle a
// completed-but-unpaid session, so it only shows up on that player's tab.
router.patch('/:id/expected-payer', async (req, res) => {
  const { player_id } = req.body;
  if (!player_id) return res.status(400).json({ error: 'player_id is required' });
  try {
    const participant = await pool.query(
      `SELECT s.id FROM sessions s
       JOIN session_players sp ON sp.session_id = s.id AND sp.player_id = $1
       WHERE s.id = $2 AND s.status = 'completed'`,
      [player_id, req.params.id]
    );
    if (!participant.rows[0])
      return res.status(400).json({ error: 'Player was not part of this completed session' });

    const { rows } = await pool.query(
      `UPDATE sessions SET expected_payer_id = $1 WHERE id = $2 RETURNING id, expected_payer_id`,
      [player_id, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.*, t.label AS table_label,
        COALESCE(json_agg(json_build_object(
          'id', p.id, 'name', p.full_name, 'phone', p.phone
        )) FILTER (WHERE p.id IS NOT NULL), '[]') AS players
      FROM sessions s
      JOIN pool_tables t ON t.id = s.pool_table_id
      LEFT JOIN session_players sp ON sp.session_id = s.id
      LEFT JOIN players p ON p.id = sp.player_id
      WHERE s.id = $1
      GROUP BY s.id, t.label
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Session not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;