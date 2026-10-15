// server/routes/sessions.js — GET /api/sessions, POST /api/sessions (admin)
'use strict';

const router = require('express').Router();
const { requireAuth } = require('./auth');
const {
  isSessionStarted,
  isSessionOver,
  cleanupExpiredSessions
} = require('../utils/sessionTime');

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required.' });
  }
  next();
}

// GET /api/sessions?date=YYYY-MM-DD
router.get('/', requireAuth, (req, res) => {
  const db = req.db;
  const { date } = req.query;

  // Purge any session records older than 5 days from website
  cleanupExpiredSessions(db);

  let rows;
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD format' });
    }
    rows = db.all('SELECT * FROM sessions WHERE session_date = ? ORDER BY start_hour', date);
  } else {
    rows = db.all('SELECT * FROM sessions ORDER BY session_date, start_hour');
  }

  // User screen requirement:
  // When date and time of session is over, it is NOT visible on user screen.
  // Admin screen requirement:
  // Admin screen has up to 5 days old data available (and older than that deleted).
  const isAdmin = req.user.role === 'admin';
  if (!isAdmin) {
    rows = rows.filter(session => !isSessionOver(session.session_date, session.start_hour));
  }

  const userId = req.user.id;

  const sessions = rows.map(session => {
    const confirmedRow = db.get(
      "SELECT COUNT(*) as cnt FROM bookings WHERE session_id = ? AND status = 'confirmed'",
      session.id
    );
    const confirmedCount = confirmedRow ? Number(confirmedRow.cnt) : 0;
    const capacity       = Number(session.capacity) || 20;
    const seatsRemaining = Math.max(0, capacity - confirmedCount);

    const userIsBooked = !isAdmin && !!db.get(
      "SELECT id FROM bookings WHERE session_id = ? AND user_id = ? AND status = 'confirmed'",
      session.id, userId
    );

    const userIsWaitlisted = !isAdmin && !!db.get(
      "SELECT id FROM waitlist WHERE session_id = ? AND user_id = ? AND status = 'waiting'",
      session.id, userId
    );

    const over = isSessionOver(session.session_date, session.start_hour);

    return {
      id:                 Number(session.id),
      session_date:       session.session_date,
      start_hour:         Number(session.start_hour),
      capacity,
      confirmed_count:    confirmedCount,
      seats_remaining:    seatsRemaining,
      is_full:            seatsRemaining === 0,
      has_started:        isSessionStarted(session.session_date, session.start_hour),
      is_over:            over,
      user_is_booked:     userIsBooked,
      user_is_waitlisted: userIsWaitlisted
    };
  });

  res.json({ sessions });
});

// POST /api/sessions — admin only
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const db = req.db;
  const { session_date, start_hour } = req.body;

  cleanupExpiredSessions(db);

  if (!session_date || !/^\d{4}-\d{2}-\d{2}$/.test(session_date)) {
    return res.status(400).json({ error: 'Valid session date is required (YYYY-MM-DD)' });
  }

  const hour = Number(start_hour);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return res.status(400).json({ error: 'Start hour must be an integer 0–23' });
  }

  if (isSessionOver(session_date, hour)) {
    return res.status(400).json({ error: 'Cannot create a session for a date/time that has already ended.' });
  }

  const duplicate = db.get(
    'SELECT id FROM sessions WHERE session_date = ? AND start_hour = ?',
    session_date, hour
  );
  if (duplicate) {
    return res.status(409).json({ error: 'A session already exists at this date and start hour' });
  }

  const result  = db.run(
    'INSERT INTO sessions (session_date, start_hour, capacity) VALUES (?, ?, 20)',
    session_date, hour
  );
  const session = db.get('SELECT * FROM sessions WHERE id = ?', result.lastInsertRowid);

  return res.status(201).json({ message: 'Session created successfully', session });
});

module.exports = router;

