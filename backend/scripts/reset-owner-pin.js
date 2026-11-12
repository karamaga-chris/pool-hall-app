// Emergency recovery: reset the owner's PIN directly in the database.
// Usage (from backend/):  node scripts/reset-owner-pin.js <new-4-digit-pin> [owner-phone]
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const pool   = require('../src/db/pool');

async function main() {
  const [newPin, phone] = process.argv.slice(2);
  if (!/^\d{4}$/.test(newPin || '')) {
    console.error('Usage: node scripts/reset-owner-pin.js <new-4-digit-pin> [owner-phone]');
    process.exit(1);
  }

  const owners = (await pool.query(
    `SELECT id, full_name, phone, is_active FROM users WHERE role = 'owner'`
  )).rows;
  if (owners.length === 0) throw new Error('No owner account found.');

  let owner = owners[0];
  if (owners.length > 1) {
    owner = owners.find(o => o.phone === phone);
    if (!owner) {
      console.error('Multiple owners found. Pass the phone number of the one to reset:');
      owners.forEach(o => console.error(`  ${o.full_name}  ${o.phone}`));
      process.exit(1);
    }
  }

  const hash = await bcrypt.hash(newPin, 10);
  await pool.query(
    `UPDATE users SET pin_hash = $1, is_active = TRUE, updated_at = NOW() WHERE id = $2`,
    [hash, owner.id]
  );
  console.log(`PIN reset for owner "${owner.full_name}" (phone: ${owner.phone}).`);
}

main()
  .catch(err => { console.error('Failed:', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
