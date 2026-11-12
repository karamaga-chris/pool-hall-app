const express = require('express');
const pool    = require('../db/pool');
const { authenticate, requireOwner } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        t.id, t.table_number, t.label, t.status, t.hardware_id,
        s.id AS session_id,
        s.started_at,
        s.rate_type,
        s.price_per_game,
        ROUND(EXTRACT(EPOCH FROM (NOW() - s.started_at)) / 60, 1) AS elapsed_mins,
        COALESCE(
          json_agg(json_build_object('id', p.id, 'name', p.full_name))
          FILTER (WHERE p.id IS NOT NULL), '[]'
        ) AS players
      FROM pool_tables t
      LEFT JOIN sessions s ON s.pool_table_id = t.id AND s.status = 'active'
      LEFT JOIN session_players sp ON sp.session_id = s.id
      LEFT JOIN players p ON p.id = sp.player_id
      WHERE t.is_active = TRUE
      GROUP BY t.id, s.id
      ORDER BY t.table_number
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireOwner, async (req, res) => {
  const { label, notes } = req.body;
  if (!label) return res.status(400).json({ error: 'label is required' });
  try {
    const numRes = await pool.query(
      'SELECT COALESCE(MAX(table_number), 0) + 1 AS next FROM pool_tables'
    );
    const { rows } = await pool.query(
      `INSERT INTO pool_tables (table_number, label, notes)
       VALUES ($1, $2, $3) RETURNING *`,
      [numRes.rows[0].next, label, notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id', requireOwner, async (req, res) => {
  const { label, notes, status } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE pool_tables
       SET label = COALESCE($1, label),
           notes = COALESCE($2, notes),
           status = COALESCE($3, status),
           updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [label, notes, status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Table not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;