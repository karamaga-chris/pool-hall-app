const express = require('express');
const pool    = require('../db/pool');
const { authenticate, requireOwner } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireOwner);

router.get('/daily', async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  try {
    const summary = await pool.query(`
      SELECT
        COUNT(s.id)::int                          AS total_sessions,
        COALESCE(SUM(s.amount_due), 0)            AS total_revenue,
        COALESCE(SUM(p.amount), 0)                AS total_collected,
        COUNT(CASE WHEN s.rate_type = 'peak'     THEN 1 END)::int AS peak_sessions,
        COUNT(CASE WHEN s.rate_type = 'off_peak' THEN 1 END)::int AS off_peak_sessions
      FROM sessions s
      LEFT JOIN payments p ON p.session_id = s.id
      WHERE s.status = 'completed'
        AND DATE(s.started_at AT TIME ZONE 'Africa/Kigali') = $1
    `, [date]);

    const byTable = await pool.query(`
      SELECT
        t.label,
        COUNT(s.id)::int              AS sessions,
        COALESCE(SUM(s.amount_due),0) AS revenue
      FROM pool_tables t
      LEFT JOIN sessions s
        ON s.pool_table_id = t.id AND s.status = 'completed'
        AND DATE(s.started_at AT TIME ZONE 'Africa/Kigali') = $1
      WHERE t.is_active = TRUE
      GROUP BY t.id, t.label ORDER BY t.table_number
    `, [date]);

    const byHour = await pool.query(`
      SELECT
        EXTRACT(HOUR FROM started_at AT TIME ZONE 'Africa/Kigali')::int AS hour,
        COUNT(*)::int AS sessions,
        COALESCE(SUM(amount_due), 0) AS revenue
      FROM sessions
      WHERE status = 'completed'
        AND DATE(started_at AT TIME ZONE 'Africa/Kigali') = $1
      GROUP BY hour ORDER BY hour
    `, [date]);

    res.json({
      date,
      summary:  summary.rows[0],
      by_table: byTable.rows,
      by_hour:  byHour.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/period', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to dates required' });
  try {
    const daily = await pool.query(`
      SELECT
        DATE(s.started_at AT TIME ZONE 'Africa/Kigali') AS date,
        COUNT(s.id)::int                                AS sessions,
        COALESCE(SUM(s.amount_due), 0)                  AS revenue
      FROM sessions s
      WHERE s.status = 'completed'
        AND DATE(s.started_at AT TIME ZONE 'Africa/Kigali') BETWEEN $1 AND $2
      GROUP BY date ORDER BY date
    `, [from, to]);

    const totals = await pool.query(`
      SELECT
        COUNT(*)::int                  AS total_sessions,
        COALESCE(SUM(amount_due), 0)   AS total_revenue,
        COUNT(DISTINCT pool_table_id)::int AS tables_used
      FROM sessions
      WHERE status = 'completed'
        AND DATE(started_at AT TIME ZONE 'Africa/Kigali') BETWEEN $1 AND $2
    `, [from, to]);

    const collected = await pool.query(`
      SELECT COALESCE(SUM(p.amount), 0) AS total_collected
      FROM payments p
      JOIN sessions s ON s.id = p.session_id
      WHERE p.status = 'paid'
        AND DATE(s.started_at AT TIME ZONE 'Africa/Kigali') BETWEEN $1 AND $2
    `, [from, to]);

    const byTable = await pool.query(`
      SELECT
        t.label,
        COUNT(s.id)::int              AS sessions,
        COALESCE(SUM(s.amount_due),0) AS revenue
      FROM pool_tables t
      LEFT JOIN sessions s
        ON s.pool_table_id = t.id AND s.status = 'completed'
        AND DATE(s.started_at AT TIME ZONE 'Africa/Kigali') BETWEEN $1 AND $2
      WHERE t.is_active = TRUE
      GROUP BY t.id, t.label ORDER BY t.table_number
    `, [from, to]);

    const totalRevenue   = Number(totals.rows[0].total_revenue);
    const totalCollected = Number(collected.rows[0].total_collected);

    res.json({
      from, to,
      totals: {
        ...totals.rows[0],
        total_collected: totalCollected,
        outstanding: Math.round((totalRevenue - totalCollected) * 100) / 100,
      },
      daily:    daily.rows,
      by_table: byTable.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/top-players', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  const { rows } = await pool.query(`
    SELECT full_name, phone, total_spend, games_played,
           ROUND(total_spend / NULLIF(games_played, 0), 2) AS avg_spend_per_game
    FROM players WHERE is_active = TRUE
    ORDER BY total_spend DESC LIMIT $1
  `, [limit]);
  res.json(rows);
});

module.exports = router;