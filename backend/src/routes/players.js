const express = require('express');
const pool    = require('../db/pool');
const { authenticate, requireOwner } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const { search } = req.query;
  try {
    let query, params;
    if (search) {
      // Search always looks across ALL players, regardless of recency
      // (used by Add-Player and Settle Tab flows).
      query = `
        SELECT id, full_name, phone, photo_url, total_spend, games_played, created_at
        FROM players
        WHERE is_active = TRUE
          AND (full_name ILIKE $1 OR phone ILIKE $1)
        ORDER BY full_name LIMIT 30`;
      params = [`%${search}%`];
    } else {
      // Default Players tab: only players who played, or were registered,
      // in the last 24 hours — most-recently-active first. Full history
      // still lives in Reports/sessions, which read the raw tables.
      query = `
        SELECT p.id, p.full_name, p.phone, p.photo_url,
               p.total_spend, p.games_played, p.created_at,
               MAX(s.started_at) AS last_played
        FROM players p
        LEFT JOIN session_players sp ON sp.player_id = p.id
        LEFT JOIN sessions s
          ON s.id = sp.session_id AND s.started_at > NOW() - INTERVAL '24 hours'
        WHERE p.is_active = TRUE
          AND (s.id IS NOT NULL OR p.created_at > NOW() - INTERVAL '24 hours')
        GROUP BY p.id
        ORDER BY last_played DESC NULLS LAST, p.created_at DESC
        LIMIT 100`;
      params = [];
    }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  const { full_name, phone, notes } = req.body;
  if (!full_name)
    return res.status(400).json({ error: 'full_name is required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO players (full_name, phone, notes)
       VALUES ($1, $2, $3) RETURNING *`,
      [full_name, phone || null, notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ error: 'Phone number already registered' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id', async (req, res) => {
  const { full_name, phone, notes } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE players
       SET full_name = COALESCE($1, full_name),
           phone     = COALESCE($2, phone),
           notes     = COALESCE($3, notes),
           updated_at = NOW()
       WHERE id = $4 AND is_active = TRUE RETURNING *`,
      [full_name, phone, notes, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Player not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', requireOwner, async (req, res) => {
  await pool.query(
    'UPDATE players SET is_active = FALSE WHERE id = $1', [req.params.id]
  );
  res.json({ success: true });
});

module.exports = router;