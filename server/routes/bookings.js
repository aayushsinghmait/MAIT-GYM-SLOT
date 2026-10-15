// server/routes/bookings.js — booking endpoints
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

const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function generateCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

function uniqueCode(db) {
  let code;
  do { code = generateCode(); } while (db.get('SELECT id FROM bookings WHERE checkin_code = ?', code));
  return code;
}

// GET /api/bookings/my
router.get('/my', requireAuth, (req, res) => {
  const db = req.db;

  // Clean up any data older than 5 days
  cleanupExpiredSessions(db);

  const rawBookings = db.all(`
    SELECT b.id, b.session_id, b.checkin_code, b.status, b.attended, b.attended_at, b.created_at,
           s.session_date, s.start_hour
    FROM bookings b
    JOIN sessions s ON s.id = b.session_id
    WHERE b.user_id = ?
    ORDER BY b.id DESC
  `, req.user.id);

  // User screen requirement:
  // When date and time of session is over, it is NOT visible on user screen
  const visibleBookings = rawBookings.filter(b => !isSessionOver(b.session_date, b.start_hour));

  res.json({
    bookings: visibleBookings.map(b => ({
      id:           Number(b.id),
      session_id:   Number(b.session_id),
      checkin_code: b.checkin_code,
      status:       b.status,
      attended:     Boolean(Number(b.attended)),
      attended_at:  b.attended_at,
      session_date: b.session_date,
      start_hour:   Number(b.start_hour),
      has_started:  isSessionStarted(b.session_date, b.start_hour),
      is_over:      isSessionOver(b.session_date, b.start_hour)
    }))
  });
});

// GET /api/bookings/session/:id — admin only
router.get('/session/:id', requireAuth, requireAdmin, (req, res) => {
  const db = req.db;
  cleanupExpiredSessions(db);

  const sessionId = Number(req.params.id);
  if (!Number.isInteger(sessionId) || sessionId < 1) {
    return res.status(400).json({ error: 'Invalid session id' });
  }

  const session = db.get('SELECT id FROM sessions WHERE id = ?', sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const bookings = db.all(`
    SELECT b.id, b.session_id, b.user_id, b.checkin_code, b.status, b.attended, b.attended_at, b.created_at,
           u.name AS user_name, u.email AS user_email
    FROM bookings b
    JOIN users u ON u.id = b.user_id
    WHERE b.session_id = ?
    ORDER BY b.id
  `, sessionId);

  res.json({
    bookings: bookings.map(b => ({
      id:           Number(b.id),
      session_id:   Number(b.session_id),
      user_id:      Number(b.user_id),
      user_name:    b.user_name,
      user_email:   b.user_email,
      checkin_code: b.checkin_code,
      status:       b.status,
      attended:     Boolean(Number(b.attended)),
      attended_at:  b.attended_at,
      created_at:   b.created_at
    }))
  });
});

// POST /api/bookings — book a slot
// Uses db.runInTx() to avoid nested save() calls inside BEGIN
router.post('/', requireAuth, (req, res) => {
  const db        = req.db;
  const sessionId = Number(req.body.session_id);

  if (!Number.isInteger(sessionId) || sessionId < 1) {
    return res.status(400).json({ error: 'Valid session_id is required' });
  }

  const session = db.get('SELECT * FROM sessions WHERE id = ?', sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  if (isSessionStarted(session.session_date, session.start_hour)) {
    return res.status(400).json({ error: 'Cannot book a session that has already started' });
  }

  let outcome;
  try {
    outcome = db.transaction((t) => {
      const alreadyBooked = t.get(
        "SELECT id FROM bookings WHERE session_id = ? AND user_id = ? AND status = 'confirmed'",
        sessionId, req.user.id
      );
      if (alreadyBooked) {
        return { error: 'You already have an active booking for this session', status: 409 };
      }

      const countRow       = t.get(
        "SELECT COUNT(*) as cnt FROM bookings WHERE session_id = ? AND status = 'confirmed'",
        sessionId
      );
      const confirmedCount = countRow ? Number(countRow.cnt) : 0;
      const capacity       = Number(session.capacity) || 20;

      if (confirmedCount >= capacity) {
        return { error: 'Session is full. You can join the waitlist instead.', status: 409 };
      }

      const code = uniqueCode(t);
      const ins  = t.run(
        "INSERT INTO bookings (session_id, user_id, checkin_code, status, attended) VALUES (?, ?, ?, 'confirmed', 0)",
        sessionId, req.user.id, code
      );

      t.run(
        "UPDATE waitlist SET status = 'promoted' WHERE session_id = ? AND user_id = ? AND status = 'waiting'",
        sessionId, req.user.id
      );

      return { booking: { id: ins.lastInsertRowid, session_id: sessionId, checkin_code: code, status: 'confirmed' } };
    })(/* args passed to transaction fn via tx */ db);
  } catch (e) {
    console.error('Booking transaction error:', e);
    return res.status(500).json({ error: 'An unexpected server error occurred.' });
  }

  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  return res.status(201).json({ message: 'Booking confirmed successfully', booking: outcome.booking });
});

// POST /api/bookings/:id/cancel
router.post('/:id/cancel', requireAuth, (req, res) => {
  const db        = req.db;
  const bookingId = Number(req.params.id);

  if (!Number.isInteger(bookingId) || bookingId < 1) {
    return res.status(400).json({ error: 'Invalid booking id' });
  }

  let outcome;
  try {
    outcome = db.transaction((t) => {
      const booking = t.get('SELECT * FROM bookings WHERE id = ?', bookingId);
      if (!booking) return { error: 'Booking not found', status: 404 };

      if (req.user.role !== 'admin' && Number(booking.user_id) !== req.user.id) {
        return { error: 'You are not authorized to cancel this booking', status: 403 };
      }
      if (booking.status === 'cancelled') {
        return { error: 'This booking is already cancelled', status: 400 };
      }

      const session = t.get('SELECT * FROM sessions WHERE id = ?', booking.session_id);
      if (session && isSessionStarted(session.session_date, session.start_hour)) {
        return { error: 'Cannot cancel a booking for a session that has already started', status: 400 };
      }

      t.run("UPDATE bookings SET status = 'cancelled' WHERE id = ?", bookingId);

      let autoPromoted = false;
      if (session && !isSessionStarted(session.session_date, session.start_hour)) {
        const nextWaiting = t.get(
          "SELECT * FROM waitlist WHERE session_id = ? AND status = 'waiting' ORDER BY id LIMIT 1",
          session.id
        );
        if (nextWaiting) {
          t.run("UPDATE waitlist SET status = 'promoted' WHERE id = ?", nextWaiting.id);
          const code = uniqueCode(t);
          t.run(
            "INSERT INTO bookings (session_id, user_id, checkin_code, status, attended) VALUES (?, ?, ?, 'confirmed', 0)",
            session.id, nextWaiting.user_id, code
          );
          autoPromoted = true;
        }
      }

      return { auto_promoted: autoPromoted };
    })(db);
  } catch (e) {
    console.error('Cancel transaction error:', e);
    return res.status(500).json({ error: 'An unexpected server error occurred.' });
  }

  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  return res.json({ message: 'Booking cancelled successfully', auto_promoted: outcome.auto_promoted });
});

module.exports = router;
