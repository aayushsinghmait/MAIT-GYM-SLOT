// server/utils/sessionTime.js — Session timing, expiration, and data retention utilities
'use strict';

/**
 * Parse YYYY-MM-DD into year, month (0-indexed), day
 */
function parseSessionDate(sessionDate) {
  const [year, month, day] = String(sessionDate).split('-').map(Number);
  return { year, month: month - 1, day };
}

/**
 * Returns Date object for start of a session (local time)
 */
function getSessionStart(sessionDate, startHour) {
  const { year, month, day } = parseSessionDate(sessionDate);
  return new Date(year, month, day, Number(startHour), 0, 0, 0);
}

/**
 * Returns Date object for end of a session (start + 1 hour, local time)
 */
function getSessionEnd(sessionDate, startHour) {
  const { year, month, day } = parseSessionDate(sessionDate);
  return new Date(year, month, day, Number(startHour) + 1, 0, 0, 0);
}

/**
 * A session has started if current time >= session start time
 */
function isSessionStarted(sessionDate, startHour) {
  return new Date() >= getSessionStart(sessionDate, startHour);
}

/**
 * A session is over if current time >= session end time
 */
function isSessionOver(sessionDate, startHour) {
  return new Date() >= getSessionEnd(sessionDate, startHour);
}

/**
 * Returns YYYY-MM-DD string for 5 calendar days ago
 */
function getFiveDaysAgoDateStr() {
  const d = new Date();
  d.setDate(d.getDate() - 5);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * A session is older than 5 days if:
 * 1) Its calendar date is before 5 days ago (e.g. today - 5 days), OR
 * 2) More than 5 days (120 hours) have elapsed since the session ended.
 */
function isOlderThanFiveDays(sessionDate, startHour) {
  const cutoffDateStr = getFiveDaysAgoDateStr();
  if (sessionDate < cutoffDateStr) return true;

  const sessionEnd = getSessionEnd(sessionDate, startHour);
  const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
  return (Date.now() - sessionEnd.getTime()) > FIVE_DAYS_MS;
}

/**
 * Purges sessions and associated bookings/waitlist older than 5 days from the website database.
 */
function cleanupExpiredSessions(db) {
  if (!db) return;
  try {
    const sessions = db.all('SELECT id, session_date, start_hour FROM sessions');
    const toDeleteIds = [];

    for (const s of sessions) {
      if (isOlderThanFiveDays(s.session_date, s.start_hour)) {
        toDeleteIds.push(Number(s.id));
      }
    }

    if (toDeleteIds.length > 0) {
      db.transaction((tx) => {
        for (const id of toDeleteIds) {
          tx.run('DELETE FROM bookings WHERE session_id = ?', id);
          tx.run('DELETE FROM waitlist WHERE session_id = ?', id);
          tx.run('DELETE FROM sessions WHERE id = ?', id);
        }
      })();
      console.log(`[Auto-Purge] Deleted ${toDeleteIds.length} sessions older than 5 days.`);
    }

    // Clean up any orphan rows
    db.run('DELETE FROM bookings WHERE session_id NOT IN (SELECT id FROM sessions)');
    db.run('DELETE FROM waitlist WHERE session_id NOT IN (SELECT id FROM sessions)');
  } catch (err) {
    console.error('[Auto-Purge] Error cleaning up expired sessions:', err);
  }
}

module.exports = {
  parseSessionDate,
  getSessionStart,
  getSessionEnd,
  isSessionStarted,
  isSessionOver,
  getFiveDaysAgoDateStr,
  isOlderThanFiveDays,
  cleanupExpiredSessions
};
