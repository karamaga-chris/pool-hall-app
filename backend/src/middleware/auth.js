const jwt  = require('jsonwebtoken');
const pool = require('../db/pool');

// Verifies the token, then re-checks the account in the database so that a
// deactivated user is locked out immediately and role/name changes take
// effect without waiting for the token to expire.
async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }
  let payload;
  try {
    payload = jwt.verify(header.slice(7), process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: 'Token expired or invalid' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT id, role, full_name FROM users WHERE id = $1 AND is_active = TRUE',
      [payload.id]
    );
    if (!rows[0]) {
      return res.status(401).json({ error: 'Account not found or deactivated' });
    }
    req.user = { id: rows[0].id, role: rows[0].role, name: rows[0].full_name };
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

function requireOwner(req, res, next) {
  if (req.user?.role !== 'owner') {
    return res.status(403).json({ error: 'Owner access required' });
  }
  next();
}

module.exports = { authenticate, requireOwner };
