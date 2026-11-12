const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const pool     = require('../db/pool');
const { authenticate, requireOwner } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { phone, pin } = req.body;
  if (!phone || !pin) {
    return res.status(400).json({ error: 'Phone and PIN are required' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE phone = $1 AND is_active = TRUE',
      [phone]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(String(pin), user.pin_hash))) {
      return res.status(401).json({ error: 'Invalid phone or PIN' });
    }
    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
    );
    res.json({
      token,
      user: { id: user.id, name: user.full_name, role: user.role, phone: user.phone }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, full_name, phone, role FROM users WHERE id = $1',
    [req.user.id]
  );
  res.json(rows[0]);
});

// POST /api/auth/change-pin — any logged-in user changes their own PIN
router.post('/change-pin', authenticate, async (req, res) => {
  const { current_pin, new_pin } = req.body;
  if (!current_pin || !new_pin) {
    return res.status(400).json({ error: 'current_pin and new_pin are required' });
  }
  if (!/^\d{4}$/.test(String(new_pin))) {
    return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
  }
  if (String(current_pin) === String(new_pin)) {
    return res.status(400).json({ error: 'New PIN must be different from the current PIN' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT pin_hash FROM users WHERE id = $1 AND is_active = TRUE',
      [req.user.id]
    );
    if (!rows[0] || !(await bcrypt.compare(String(current_pin), rows[0].pin_hash))) {
      return res.status(401).json({ error: 'Current PIN is incorrect' });
    }
    const pinHash = await bcrypt.hash(String(new_pin), 10);
    await pool.query(
      'UPDATE users SET pin_hash = $1, updated_at = NOW() WHERE id = $2',
      [pinHash, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- User management (owner only) ----

// GET /api/auth/users — list all staff + owner accounts
router.get('/users', authenticate, requireOwner, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, full_name, phone, role, is_active, created_at
     FROM users ORDER BY role, full_name`
  );
  res.json(rows);
});

// POST /api/auth/users — owner creates a new staff account
router.post('/users', authenticate, requireOwner, async (req, res) => {
  const { full_name, phone, pin } = req.body;
  if (!full_name || !phone || !pin) {
    return res.status(400).json({ error: 'full_name, phone, and pin are required' });
  }
  if (!/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
  }
  try {
    const pinHash = await bcrypt.hash(pin, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (full_name, phone, pin_hash, role)
       VALUES ($1, $2, $3, 'staff') RETURNING id, full_name, phone, role, is_active, created_at`,
      [full_name, phone, pinHash]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'This phone number is already registered' });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/auth/users/:id — owner resets PIN (any account) or deactivates an account
router.patch('/users/:id', authenticate, requireOwner, async (req, res) => {
  const { pin, is_active, full_name } = req.body;
  if (is_active === false && String(req.params.id) === String(req.user.id)) {
    return res.status(400).json({ error: 'You cannot deactivate your own account' });
  }
  try {
    let pinHash;
    if (pin) {
      if (!/^\d{4}$/.test(pin)) {
        return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
      }
      pinHash = await bcrypt.hash(pin, 10);
    }
    const { rows } = await pool.query(
      `UPDATE users SET
         pin_hash  = COALESCE($1, pin_hash),
         is_active = COALESCE($2, is_active),
         full_name = COALESCE($3, full_name),
         updated_at = NOW()
       WHERE id = $4
       RETURNING id, full_name, phone, role, is_active`,
      [pinHash, is_active, full_name, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Account not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;