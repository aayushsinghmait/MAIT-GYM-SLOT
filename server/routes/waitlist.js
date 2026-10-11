// server/routes/waitlist.js — waitlist endpoints
'use strict';

const router = require('express').Router();
const { requireAuth } = require('./auth');

function isSessionStarted(sessionDate, startHour) {
  const sessionStart = new Date(`${sessionDate}T${String(startHour).padStart(2, '0')}:00:00`);
  return new Date() >= sessionStart;
}

// POST /api/waitlist — join waitlist for a full session
router.post('/', requireAuth, (req, res) => {
  const db        = req.db;
  const sessionId = Number(req.body.session_id);

  if (!Number.isInteger(sessionId) || sessionId < 1) {
    return res.status(400).json({ error: 'Valid session_id is required' });
  }

  const session = db.get('SELECT * FROM sessions WHERE id = ?', sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  if (isSessionStarted(session.session_date, session.start_hour)) {
    return res.status(400).json({ error: 'Cannot join waitlist for a session that has already started' });
  }

  // Cannot join waitlist if already confirmed booked
  const isBooked = db.get(
    "SELECT id FROM bookings WHERE session_id = ? AND user_id = ? AND status = 'confirmed'",
    sessionId, req.user.id
  );
  if (isBooked) {
    return res.status(409).json({ error: 'You already have an active booking for this session' });
  }

  // Cannot be on the waitlist twice for the same session
  const isWaiting = db.get(
    "SELECT id FROM waitlist WHERE session_id = ? AND user_id = ? AND status = 'waiting'",
    sessionId, req.user.id
  );
  if (isWaiting) {
    return res.status(409).json({ error: 'You are already on the waitlist for this session' });
  }

  // Can only join waitlist when session is actually full
  const countRow = db.get(
    "SELECT COUNT(*) as cnt FROM bookings WHERE session_id = ? AND status = 'confirmed'",
    sessionId
  );
  const confirmedCount = countRow ? Number(countRow.cnt) : 0;
  const capacity       = Number(session.capacity) || 20;

  if (confirmedCount < capacity) {
    return res.status(400).json({ error: 'Seats are still available. You can book directly.' });
  }

  // Upsert: if user previously left, allow re-joining
  const existing = db.get('SELECT id, status FROM waitlist WHERE session_id = ? AND user_id = ?', sessionId, req.user.id);
  let rowId;
  if (existing) {
    db.run("UPDATE waitlist SET status = 'waiting', created_at = datetime('now') WHERE id = ?", existing.id);
    rowId = Number(existing.id);
  } else {
    const ins = db.run(
      "INSERT INTO waitlist (session_id, user_id, status) VALUES (?, ?, 'waiting')",
      sessionId, req.user.id
    );
    rowId = ins.lastInsertRowid;
  }

  // Position = how many are waiting at or before this entry
  const posRow = db.get(
    "SELECT COUNT(*) as cnt FROM waitlist WHERE session_id = ? AND status = 'waiting' AND id <= ?",
    sessionId, rowId
  );
  const position = posRow ? Number(posRow.cnt) : 1;

  return res.status(201).json({
    message: 'Joined waitlist successfully',
    waitlist: { id: rowId, session_id: sessionId, position }
  });
});

// POST /api/waitlist/:sessionId/leave
router.post('/:sessionId/leave', requireAuth, (req, res) => {
  const db        = req.db;
  const sessionId = Number(req.params.sessionId);

  const entry = db.get(
    "SELECT * FROM waitlist WHERE session_id = ? AND user_id = ? AND status = 'waiting'",
    sessionId, req.user.id
  );
  if (!entry) {
    return res.status(404).json({ error: 'You are not currently on the waitlist for this session' });
  }

  // Nobody promoted into a session that has already started
  const session = db.get('SELECT * FROM sessions WHERE id = ?', sessionId);
  if (session && isSessionStarted(session.session_date, session.start_hour)) {
    return res.status(400).json({ error: 'Session has already started' });
  }

  db.run("UPDATE waitlist SET status = 'left' WHERE id = ?", entry.id);
  return res.json({ message: 'Successfully left the waitlist' });
});

// GET /api/waitlist/my — member sees their active waitlist entries
router.get('/my', requireAuth, (req, res) => {
  const db  = req.db;
  const rows = db.all(`
    SELECT w.id, w.session_id, w.status, w.created_at,
           s.session_date, s.start_hour
    FROM waitlist w
    JOIN sessions s ON s.id = w.session_id
    WHERE w.user_id = ? AND w.status = 'waiting'
    ORDER BY w.id
  `, req.user.id);

  const waitlist = rows.map(w => {
    const posRow = db.get(
      "SELECT COUNT(*) as cnt FROM waitlist WHERE session_id = ? AND status = 'waiting' AND id <= ?",
      w.session_id, w.id
    );
    return {
      id:           Number(w.id),
      session_id:   Number(w.session_id),
      status:       w.status,
      session_date: w.session_date,
      start_hour:   Number(w.start_hour),
      position:     posRow ? Number(posRow.cnt) : 1,
      has_started:  isSessionStarted(w.session_date, w.start_hour)
    };
  });

  res.json({ waitlist });
});

module.exports = router;
