// server/routes/checkin.js — POST /api/checkin (admin only)
'use strict';

const router = require('express').Router();
const { requireAuth } = require('./auth');
const {
  getSessionStart,
  getSessionEnd,
  cleanupExpiredSessions
} = require('../utils/sessionTime');

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required.' });
  }
  next();
}

// POST /api/checkin
// Rules per spec:
//   - works only once per booking
//   - strictly during the session's 1-hour window
//   - never for a cancelled booking
//   - codes are random and not guessable from each other
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const db   = req.db;
  cleanupExpiredSessions(db);

  const code = String(req.body.code || '').trim().toUpperCase();

  if (!code) {
    return res.status(400).json({ error: 'Check-in code is required' });
  }

  const booking = db.get('SELECT * FROM bookings WHERE checkin_code = ?', code);
  if (!booking) {
    return res.status(404).json({ error: 'Invalid check-in code. No matching booking found.' });
  }

  const member  = db.get('SELECT name, email FROM users WHERE id = ?', booking.user_id)
               || { name: 'Member', email: '' };
  const session = db.get('SELECT * FROM sessions WHERE id = ?', booking.session_id);

  if (booking.status === 'cancelled') {
    return res.status(400).json({
      error: `Cannot check in: Booking for ${member.name} was cancelled.`
    });
  }

  if (Number(booking.attended) === 1) {
    return res.status(409).json({
      error: `This code has already been used to check in ${member.name}.`
    });
  }

  if (!session) {
    return res.status(404).json({ error: 'Session not found for this booking.' });
  }

  // Strictly within the 1-hour session window
  const sessionStart = getSessionStart(session.session_date, session.start_hour);
  const sessionEnd   = getSessionEnd(session.session_date, session.start_hour);
  const now          = new Date();

  if (now < sessionStart) {
    return res.status(400).json({
      error: `Check-in is only allowed during session hour (${session.session_date} at ${String(session.start_hour).padStart(2, '0')}:00). Session has not started yet.`
    });
  }

  if (now >= sessionEnd) {
    return res.status(400).json({
      error: `Check-in window closed. This session ended on ${session.session_date} at ${String(Number(session.start_hour) + 1).padStart(2, '0')}:00.`
    });
  }

  // Mark attended — single use
  db.run("UPDATE bookings SET attended = 1, attended_at = datetime('now') WHERE id = ?", booking.id);

  return res.json({
    message: 'Check-in successful!',
    booking: {
      id:           Number(booking.id),
      member_name:  member.name,
      member_email: member.email,
      session_date: session.session_date,
      start_hour:   Number(session.start_hour),
      attended:     true
    }
  });
});

module.exports = router;
