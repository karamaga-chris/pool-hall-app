const express = require('express');
const pool    = require('../db/pool');
const { authenticate, requireOwner } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, pool_table_id, rate_type, price_per_game, peak_start, peak_end, applies_on
       FROM rate_rules WHERE is_active = TRUE ORDER BY rate_type`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id', requireOwner, async (req, res) => {
  const { price_per_game, peak_start, peak_end } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE rate_rules
       SET price_per_game = COALESCE($1, price_per_game),
           peak_start     = COALESCE($2, peak_start),
           peak_end       = COALESCE($3, peak_end)
       WHERE id = $4 AND is_active = TRUE RETURNING *`,
      [price_per_game, peak_start, peak_end, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Rate rule not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
