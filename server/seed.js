// server/seed.js — Seed the database with test data (no-op if already seeded)
'use strict';

const bcrypt = require('bcryptjs');

const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function generateCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

/**
 * @param {object} db  — the db wrapper from server/db.js
 */
async function seed(db) {
  const existing = db.get('SELECT COUNT(*) as cnt FROM users');
  if (existing && Number(existing.cnt) > 0) {
    console.log('Database already seeded — skipping.');
    return;
  }

  console.log('Seeding gym database with test data...');

  const passHash = bcrypt.hashSync('password123', 10);

  // ── Users ─────────────────────────────────────────────────────────────────
  // Admin created directly in DB — never via registration endpoint
  db.run('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    'Gym Staff Admin', 'admin@gym.com', passHash, 'admin');
  db.run('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    'Khushi Dhankhar', 'khushi@gmail.com', passHash, 'member');
  db.run('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    'Aditya Gupta', 'aditya@gmail.com', passHash, 'member');
  db.run('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    'Rohan Verma', 'rohan@gmail.com', passHash, 'member');

  // Extra filler members to fill sessions (user ids 5–25)
  for (let i = 5; i <= 25; i++) {
    db.run('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      `Member ${i}`, `member${i}@gymtest.com`, passHash, 'member');
  }

  // ── Sessions ──────────────────────────────────────────────────────────────
  const fmt  = d => d.toISOString().split('T')[0];
  const today    = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const dayAfter = new Date(today); dayAfter.setDate(today.getDate() + 2);
  const curHr    = today.getHours();

  // Session 1 — today at current hour, for live check-in testing
  const s1 = db.run('INSERT INTO sessions (session_date, start_hour) VALUES (?, ?)', fmt(today), curHr);
  // Session 2 — tomorrow 9 AM (half-full)
  const s2 = db.run('INSERT INTO sessions (session_date, start_hour) VALUES (?, ?)', fmt(tomorrow), 9);
  // Session 3 — tomorrow 11 AM (FULL — 20/20)
  const s3 = db.run('INSERT INTO sessions (session_date, start_hour) VALUES (?, ?)', fmt(tomorrow), 11);
  // Session 4 — tomorrow 5 PM (empty)
  db.run('INSERT INTO sessions (session_date, start_hour) VALUES (?, ?)', fmt(tomorrow), 17);
  // Session 5 — day after 10 AM
  const s5 = db.run('INSERT INTO sessions (session_date, start_hour) VALUES (?, ?)', fmt(dayAfter), 10);

  const usedCodes = new Set();
  function uniqueCode() {
    let c;
    do { c = generateCode(); } while (usedCodes.has(c));
    usedCodes.add(c);
    return c;
  }

  // ── Bookings ──────────────────────────────────────────────────────────────
  // Khushi booked in Session 1 (now — ready for live check-in test)
  db.run(
    "INSERT INTO bookings (session_id, user_id, checkin_code, status) VALUES (?, ?, ?, 'confirmed')",
    s1.lastInsertRowid, 2, uniqueCode()
  );

  // 10 bookings for Session 2 (half-full)
  for (let i = 0; i < 10; i++) {
    db.run(
      "INSERT INTO bookings (session_id, user_id, checkin_code, status) VALUES (?, ?, ?, 'confirmed')",
      s2.lastInsertRowid, 5 + i, uniqueCode()
    );
  }

  // 20 bookings for Session 3 (FULL)
  for (let i = 0; i < 20; i++) {
    db.run(
      "INSERT INTO bookings (session_id, user_id, checkin_code, status) VALUES (?, ?, ?, 'confirmed')",
      s3.lastInsertRowid, 5 + i, uniqueCode()
    );
  }

  // Aditya booked in Session 5
  db.run(
    "INSERT INTO bookings (session_id, user_id, checkin_code, status) VALUES (?, ?, ?, 'confirmed')",
    s5.lastInsertRowid, 3, uniqueCode()
  );

  // ── Waitlist ──────────────────────────────────────────────────────────────
  // Aditya on waitlist for Session 3 (which is full)
  db.run(
    "INSERT INTO waitlist (session_id, user_id, status) VALUES (?, ?, 'waiting')",
    s3.lastInsertRowid, 3
  );

  console.log('✅ Database seeded successfully!');
  console.log('   Admin  : admin@gym.com   / password123');
  console.log('   Member : khushi@gmail.com / password123  (booked in current-hour session)');
  console.log('   Member : aditya@gmail.com / password123  (waitlisted for full session)');
}

module.exports = seed;
