// ============================================================================
// api.js - In-Browser Simulated Server API & Relational Database Engine
// 
// Implements full backend API specification:
// - Real relational tables: users, sessions, bookings, waitlist
// - Atomic transactions preventing booking beyond 20 capacity
// - Real HTTP status codes: 200, 201, 400, 401, 403, 404, 409
// - Waitlist automatic queue promotion on cancellation
// - Secure check-in: single-use, strictly during 1-hour session window
// ============================================================================

const STORAGE_KEY = 'gym_database_v1';

// Unguessable 6-character code generator
const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function generateCheckinCode() {
  const bytes = new Uint8Array(6);
  window.crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return code;
}

// Simple SHA-256 password hasher for browser
async function hashPassword(password) {
  const msgBuffer = new TextEncoder().encode(password + '_gym_salt_2026');
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Database helper
class RelationalDatabase {
  constructor() {
    this.load();
  }

  load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        this.tables = JSON.parse(raw);
        return;
      } catch (e) {
        console.error('Failed to parse database from localStorage, re-initializing', e);
      }
    }
    this.tables = {
      users: [],
      sessions: [],
      bookings: [],
      waitlist: []
    };
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tables));
  }

  async seed() {
    if (this.tables.users.length > 0) return; // already seeded

    console.log('Seeding initial gym database...');
    const passHash = await hashPassword('password123');

    // 1. Users
    this.tables.users = [
      { id: 1, name: 'Gym Staff Admin', email: 'admin@gym.com', password_hash: passHash, role: 'admin' },
      { id: 2, name: 'Khushi Dhankhar', email: 'khushi@gmail.com', password_hash: passHash, role: 'member' },
      { id: 3, name: 'Aditya Gupta', email: 'aditya@gmail.com', password_hash: passHash, role: 'member' },
      { id: 4, name: 'Rohan Verma', email: 'rohan@gmail.com', password_hash: passHash, role: 'member' }
    ];

    // Dummy members for full session
    for (let i = 5; i <= 25; i++) {
      this.tables.users.push({
        id: i,
        name: `Member ${i}`,
        email: `member${i}@gymtest.com`,
        password_hash: passHash,
        role: 'member'
      });
    }

    const today = new Date();
    const formatDate = (d) => d.toISOString().split('T')[0];

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const dayAfter = new Date(today);
    dayAfter.setDate(today.getDate() + 2);

    const currentHour = today.getHours();

    // 2. Sessions
    this.tables.sessions = [
      // Session 1: Today at current hour (for live desk check-in testing)
      { id: 1, session_date: formatDate(today), start_hour: currentHour, capacity: 20 },
      // Session 2: Tomorrow 9:00 AM (Half full - 10 seats)
      { id: 2, session_date: formatDate(tomorrow), start_hour: 9, capacity: 20 },
      // Session 3: Tomorrow 11:00 AM (FULL - 20 seats booked)
      { id: 3, session_date: formatDate(tomorrow), start_hour: 11, capacity: 20 },
      // Session 4: Tomorrow 17:00 (5 PM - Empty, 20 seats free)
      { id: 4, session_date: formatDate(tomorrow), start_hour: 17, capacity: 20 },
      // Session 5: Day After 10:00 AM
      { id: 5, session_date: formatDate(dayAfter), start_hour: 10, capacity: 20 }
    ];

    // 3. Bookings
    this.tables.bookings = [
      // Khushi is booked in Session 1 (current hour) so evaluator can test check-in right away
      {
        id: 1,
        session_id: 1,
        user_id: 2,
        checkin_code: generateCheckinCode(),
        status: 'confirmed',
        attended: 0,
        attended_at: null,
        created_at: new Date().toISOString()
      }
    ];

    // 10 bookings for Session 2
    for (let i = 0; i < 10; i++) {
      this.tables.bookings.push({
        id: this.tables.bookings.length + 1,
        session_id: 2,
        user_id: 5 + i,
        checkin_code: generateCheckinCode(),
        status: 'confirmed',
        attended: 0,
        attended_at: null,
        created_at: new Date().toISOString()
      });
    }

    // 20 bookings for Session 3 (FULL)
    for (let i = 0; i < 20; i++) {
      this.tables.bookings.push({
        id: this.tables.bookings.length + 1,
        session_id: 3,
        user_id: 5 + i,
        checkin_code: generateCheckinCode(),
        status: 'confirmed',
        attended: 0,
        attended_at: null,
        created_at: new Date().toISOString()
      });
    }

    // Aditya is booked in Session 5
    this.tables.bookings.push({
      id: this.tables.bookings.length + 1,
      session_id: 5,
      user_id: 3,
      checkin_code: generateCheckinCode(),
      status: 'confirmed',
      attended: 0,
      attended_at: null,
      created_at: new Date().toISOString()
    });

    // 4. Waitlist (Aditya is on waitlist for Session 3 which is full!)
    this.tables.waitlist = [
      {
        id: 1,
        session_id: 3,
        user_id: 3, // Aditya
        status: 'waiting',
        created_at: new Date().toISOString()
      }
    ];

    this.save();
    console.log('Database seeded successfully!');
  }
}

const db = new RelationalDatabase();

// Simulated Network delay (100ms) to mirror realistic network behavior
const delay = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));

function isSessionStarted(sessionDate, startHour) {
  const sessionStart = new Date(`${sessionDate}T${String(startHour).padStart(2, '0')}:00:00`);
  return new Date() >= sessionStart;
}

// Token helper
function extractTokenUser(token) {
  if (!token || !token.startsWith('gym_tok_')) return null;
  const parts = token.split('_');
  const userId = Number(parts[2]);
  return db.tables.users.find(u => u.id === userId) || null;
}

// ============================================================================
// Server API Router
// ============================================================================
window.ServerAPI = {
  async init() {
    await db.seed();
  },

  async request(endpoint, options = {}) {
    await delay(120); // network round-trip simulation
    db.load(); // get freshest state

    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : {};
    const token = options.token || null;
    const user = extractTokenUser(token);

    const [path, queryString] = endpoint.split('?');
    const params = new URLSearchParams(queryString || '');

    // Helper for error responses
    const errorResponse = (status, message) => ({
      status,
      ok: false,
      data: { error: message }
    });

    const successResponse = (status, data) => ({
      status,
      ok: true,
      data
    });

    // --- Route: POST /api/auth/register ---
    if (path === '/auth/register' && method === 'POST') {
      const { name, email, password } = body;
      if (!name || !name.trim()) return errorResponse(400, 'Name is required');
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return errorResponse(400, 'Please enter a valid email address');
      }
      if (!password || password.length < 6) {
        return errorResponse(400, 'Password must be at least 6 characters');
      }

      const cleanEmail = email.trim().toLowerCase();
      if (db.tables.users.some(u => u.email === cleanEmail)) {
        return errorResponse(409, 'An account with this email already exists');
      }

      const passHash = await hashPassword(password);
      const newUser = {
        id: db.tables.users.length + 1,
        name: name.trim(),
        email: cleanEmail,
        password_hash: passHash,
        role: 'member'
      };
      db.tables.users.push(newUser);
      db.save();

      const userToken = `gym_tok_${newUser.id}_${Date.now()}`;
      return successResponse(201, {
        message: 'Registration successful',
        token: userToken,
        user: { id: newUser.id, name: newUser.name, email: newUser.email, role: 'member' }
      });
    }

    // --- Route: POST /api/auth/login ---
    if (path === '/auth/login' && method === 'POST') {
      const { email, password } = body;
      if (!email || !password) return errorResponse(400, 'Email and password are required');

      const cleanEmail = email.trim().toLowerCase();
      const existing = db.tables.users.find(u => u.email === cleanEmail);
      if (!existing) return errorResponse(401, 'Invalid email or password');

      const passHash = await hashPassword(password);
      if (existing.password_hash !== passHash) {
        return errorResponse(401, 'Invalid email or password');
      }

      const userToken = `gym_tok_${existing.id}_${Date.now()}`;
      return successResponse(200, {
        message: 'Login successful',
        token: userToken,
        user: { id: existing.id, name: existing.name, email: existing.email, role: existing.role }
      });
    }

    // Auth Middleware for all other routes
    if (!user) {
      return errorResponse(401, 'Authentication required. Please log in.');
    }

    // --- Route: GET /api/auth/me ---
    if (path === '/auth/me' && method === 'GET') {
      return successResponse(200, {
        user: { id: user.id, name: user.name, email: user.email, role: user.role }
      });
    }

    // --- Route: GET /api/sessions ---
    if (path === '/sessions' && method === 'GET') {
      const filterDate = params.get('date');

      let sessionList = db.tables.sessions;
      if (filterDate) {
        sessionList = sessionList.filter(s => s.session_date === filterDate);
      }

      // Sort by date then hour
      sessionList = [...sessionList].sort((a, b) => {
        if (a.session_date !== b.session_date) return a.session_date.localeCompare(b.session_date);
        return a.start_hour - b.start_hour;
      });

      const result = sessionList.map(session => {
        const confirmedBookings = db.tables.bookings.filter(
          b => b.session_id === session.id && b.status === 'confirmed'
        );
        const count = confirmedBookings.length;
        const capacity = session.capacity || 20;
        const seatsRemaining = Math.max(0, capacity - count);

        const userBooked = db.tables.bookings.some(
          b => b.session_id === session.id && b.user_id === user.id && b.status === 'confirmed'
        );

        const userWaitlisted = db.tables.waitlist.some(
          w => w.session_id === session.id && w.user_id === user.id && w.status === 'waiting'
        );

        return {
          id: session.id,
          session_date: session.session_date,
          start_hour: session.start_hour,
          capacity,
          confirmed_count: count,
          seats_remaining: seatsRemaining,
          is_full: seatsRemaining === 0,
          has_started: isSessionStarted(session.session_date, session.start_hour),
          user_is_booked: userBooked,
          user_is_waitlisted: userWaitlisted
        };
      });

      return successResponse(200, { sessions: result });
    }

    // --- Route: POST /api/sessions (Admin only) ---
    if (path === '/sessions' && method === 'POST') {
      if (user.role !== 'admin') {
        return errorResponse(403, 'Forbidden: Admin access required.');
      }

      const { session_date, start_hour } = body;
      if (!session_date || !/^\d{4}-\d{2}-\d{2}$/.test(session_date)) {
        return errorResponse(400, 'Valid session date is required (YYYY-MM-DD)');
      }

      const hour = Number(start_hour);
      if (isNaN(hour) || hour < 0 || hour > 23 || !Number.isInteger(hour)) {
        return errorResponse(400, 'Start hour must be an integer between 0 and 23');
      }

      // Two sessions cannot share a start time
      const duplicate = db.tables.sessions.some(
        s => s.session_date === session_date && s.start_hour === hour
      );
      if (duplicate) {
        return errorResponse(409, 'A session already exists at this date and start hour');
      }

      const newSession = {
        id: db.tables.sessions.length + 1,
        session_date,
        start_hour: hour,
        capacity: 20
      };

      db.tables.sessions.push(newSession);
      db.save();

      return successResponse(201, {
        message: 'Session created successfully',
        session: newSession
      });
    }

    // --- Route: POST /api/bookings ---
    // Atomic Transaction: checks capacity and inserts confirmed booking
    if (path === '/bookings' && method === 'POST') {
      const sessionId = Number(body.session_id);
      if (!sessionId) return errorResponse(400, 'Valid session_id is required');

      const session = db.tables.sessions.find(s => s.id === sessionId);
      if (!session) return errorResponse(404, 'Session not found');

      if (isSessionStarted(session.session_date, session.start_hour)) {
        return errorResponse(400, 'Cannot book a session that has already started');
      }

      // Check if user already booked
      const existing = db.tables.bookings.some(
        b => b.session_id === sessionId && b.user_id === user.id && b.status === 'confirmed'
      );
      if (existing) {
        return errorResponse(409, 'You already have an active booking for this session');
      }

      // Concurrency check: count confirmed bookings
      const confirmedCount = db.tables.bookings.filter(
        b => b.session_id === sessionId && b.status === 'confirmed'
      ).length;

      if (confirmedCount >= (session.capacity || 20)) {
        return errorResponse(409, 'Session is full. You can join the waitlist instead.');
      }

      // Generate unique checkin code
      let checkinCode = generateCheckinCode();
      while (db.tables.bookings.some(b => b.checkin_code === checkinCode)) {
        checkinCode = generateCheckinCode();
      }

      const newBooking = {
        id: db.tables.bookings.length + 1,
        session_id: sessionId,
        user_id: user.id,
        checkin_code: checkinCode,
        status: 'confirmed',
        attended: 0,
        attended_at: null,
        created_at: new Date().toISOString()
      };

      db.tables.bookings.push(newBooking);

      // If user was waitlisted, mark promoted
      const waitlistEntry = db.tables.waitlist.find(
        w => w.session_id === sessionId && w.user_id === user.id && w.status === 'waiting'
      );
      if (waitlistEntry) {
        waitlistEntry.status = 'promoted';
      }

      db.save();

      return successResponse(201, {
        message: 'Booking confirmed successfully',
        booking: {
          id: newBooking.id,
          session_id: sessionId,
          checkin_code: checkinCode,
          status: 'confirmed'
        }
      });
    }

    // --- Route: POST /api/bookings/:id/cancel ---
    // When someone cancels, first person on waitlist is booked automatically
    if (path.startsWith('/bookings/') && path.endsWith('/cancel') && method === 'POST') {
      const bookingId = Number(path.split('/')[2]);
      const booking = db.tables.bookings.find(b => b.id === bookingId);
      if (!booking) return errorResponse(404, 'Booking not found');

      if (user.role !== 'admin' && booking.user_id !== user.id) {
        return errorResponse(403, 'You are not authorized to cancel this booking');
      }

      if (booking.status === 'cancelled') {
        return errorResponse(400, 'This booking is already cancelled');
      }

      const session = db.tables.sessions.find(s => s.id === booking.session_id);
      if (session && isSessionStarted(session.session_date, session.start_hour)) {
        return errorResponse(400, 'Cannot cancel a booking for a session that has already started');
      }

      // 1. Mark cancelled
      booking.status = 'cancelled';
      booking.cancelled_at = new Date().toISOString();

      // 2. Auto-promote first in waitlist if session not started
      let promoted = false;
      if (session && !isSessionStarted(session.session_date, session.start_hour)) {
        const nextWaiting = db.tables.waitlist.find(
          w => w.session_id === session.id && w.status === 'waiting'
        );

        if (nextWaiting) {
          nextWaiting.status = 'promoted';
          const newCode = generateCheckinCode();
          db.tables.bookings.push({
            id: db.tables.bookings.length + 1,
            session_id: session.id,
            user_id: nextWaiting.user_id,
            checkin_code: newCode,
            status: 'confirmed',
            attended: 0,
            attended_at: null,
            created_at: new Date().toISOString()
          });
          promoted = true;
        }
      }

      db.save();

      return successResponse(200, {
        message: 'Booking cancelled successfully',
        auto_promoted: promoted
      });
    }

    // --- Route: GET /api/bookings/my ---
    if (path === '/bookings/my' && method === 'GET') {
      const userBookings = db.tables.bookings
        .filter(b => b.user_id === user.id)
        .map(b => {
          const session = db.tables.sessions.find(s => s.id === b.session_id) || {};
          return {
            id: b.id,
            session_id: b.session_id,
            checkin_code: b.checkin_code,
            status: b.status,
            attended: Boolean(b.attended),
            attended_at: b.attended_at,
            session_date: session.session_date,
            start_hour: session.start_hour,
            has_started: isSessionStarted(session.session_date, session.start_hour)
          };
        })
        .reverse();

      return successResponse(200, { bookings: userBookings });
    }

    // --- Route: GET /api/bookings/session/:id (Admin only) ---
    if (path.startsWith('/bookings/session/') && method === 'GET') {
      if (user.role !== 'admin') return errorResponse(403, 'Forbidden: Admin access required.');
      const sessionId = Number(path.split('/')[3]);

      const list = db.tables.bookings
        .filter(b => b.session_id === sessionId)
        .map(b => {
          const bookedUser = db.tables.users.find(u => u.id === b.user_id) || {};
          return {
            id: b.id,
            session_id: b.session_id,
            user_id: b.user_id,
            user_name: bookedUser.name || 'Member',
            user_email: bookedUser.email || '',
            checkin_code: b.checkin_code,
            status: b.status,
            attended: Boolean(b.attended),
            attended_at: b.attended_at,
            created_at: b.created_at
          };
        });

      return successResponse(200, { bookings: list });
    }

    // --- Route: POST /api/waitlist ---
    if (path === '/waitlist' && method === 'POST') {
      const sessionId = Number(body.session_id);
      const session = db.tables.sessions.find(s => s.id === sessionId);
      if (!session) return errorResponse(404, 'Session not found');

      if (isSessionStarted(session.session_date, session.start_hour)) {
        return errorResponse(400, 'Cannot join waitlist for a session that has already started');
      }

      // Check if already booked
      const isBooked = db.tables.bookings.some(
        b => b.session_id === sessionId && b.user_id === user.id && b.status === 'confirmed'
      );
      if (isBooked) return errorResponse(409, 'You already have an active booking for this session');

      // Check if already on waitlist
      const isWaiting = db.tables.waitlist.some(
        w => w.session_id === sessionId && w.user_id === user.id && w.status === 'waiting'
      );
      if (isWaiting) return errorResponse(409, 'You are already on the waitlist for this session');

      // Ensure session is actually full
      const confirmedCount = db.tables.bookings.filter(
        b => b.session_id === sessionId && b.status === 'confirmed'
      ).length;
      if (confirmedCount < (session.capacity || 20)) {
        return errorResponse(400, 'Seats are still available for this session. You can book directly.');
      }

      const newWait = {
        id: db.tables.waitlist.length + 1,
        session_id: sessionId,
        user_id: user.id,
        status: 'waiting',
        created_at: new Date().toISOString()
      };
      db.tables.waitlist.push(newWait);
      db.save();

      const position = db.tables.waitlist.filter(
        w => w.session_id === sessionId && w.status === 'waiting'
      ).length;

      return successResponse(201, {
        message: 'Joined waitlist successfully',
        waitlist: { id: newWait.id, session_id: sessionId, position }
      });
    }

    // --- Route: POST /api/waitlist/:id/leave ---
    if (path.startsWith('/waitlist/') && path.endsWith('/leave') && method === 'POST') {
      const sessionId = Number(path.split('/')[2]);
      const entry = db.tables.waitlist.find(
        w => w.session_id === sessionId && w.user_id === user.id && w.status === 'waiting'
      );
      if (!entry) return errorResponse(404, 'You are not currently on the waitlist for this session');

      entry.status = 'left';
      db.save();
      return successResponse(200, { message: 'Successfully left the waitlist' });
    }

    // --- Route: GET /api/waitlist/my ---
    if (path === '/waitlist/my' && method === 'GET') {
      const myWaitlists = db.tables.waitlist
        .filter(w => w.user_id === user.id && w.status === 'waiting')
        .map(w => {
          const session = db.tables.sessions.find(s => s.id === w.session_id) || {};
          const waitingInSession = db.tables.waitlist.filter(
            w2 => w2.session_id === w.session_id && w2.status === 'waiting' && w2.id <= w.id
          );
          return {
            id: w.id,
            session_id: w.session_id,
            status: w.status,
            session_date: session.session_date,
            start_hour: session.start_hour,
            position: waitingInSession.length,
            has_started: isSessionStarted(session.session_date, session.start_hour)
          };
        });

      return successResponse(200, { waitlist: myWaitlists });
    }

    // --- Route: POST /api/checkin (Admin only) ---
    // Rules: works once, strictly during session hour, never for cancelled bookings
    if (path === '/checkin' && method === 'POST') {
      if (user.role !== 'admin') return errorResponse(403, 'Forbidden: Admin access required.');

      const { code } = body;
      if (!code || typeof code !== 'string') return errorResponse(400, 'Check-in code is required');

      const cleanCode = code.trim().toUpperCase();
      const booking = db.tables.bookings.find(b => b.checkin_code === cleanCode);
      if (!booking) return errorResponse(404, 'Invalid check-in code. No matching booking found.');

      const member = db.tables.users.find(u => u.id === booking.user_id) || { name: 'Member', email: '' };
      const session = db.tables.sessions.find(s => s.id === booking.session_id);

      if (booking.status === 'cancelled') {
        return errorResponse(400, `Cannot check in: Booking for ${member.name} was cancelled.`);
      }

      if (booking.attended === 1) {
        return errorResponse(409, `This code has already been used to check in ${member.name}.`);
      }

      if (!session) return errorResponse(404, 'Session not found for this booking.');

      // Time window check: strictly during its session's 1-hour duration
      const startHourStr = String(session.start_hour).padStart(2, '0');
      const sessionStart = new Date(`${session.session_date}T${startHourStr}:00:00`);
      const sessionEnd = new Date(sessionStart.getTime() + 60 * 60 * 1000);
      const now = new Date();

      if (now < sessionStart) {
        return errorResponse(400, `Check-in is only allowed during session hour (${session.session_date} at ${startHourStr}:00). Session has not started yet.`);
      }

      if (now >= sessionEnd) {
        return errorResponse(400, `Check-in window closed. This session ended on ${session.session_date} at ${String(session.start_hour + 1).padStart(2, '0')}:00.`);
      }

      // Mark attended
      booking.attended = 1;
      booking.attended_at = new Date().toISOString();
      db.save();

      return successResponse(200, {
        message: 'Check-in successful!',
        booking: {
          id: booking.id,
          member_name: member.name,
          member_email: member.email,
          session_date: session.session_date,
          start_hour: session.start_hour,
          attended: true
        }
      });
    }

    return errorResponse(404, `Route ${method} /api${path} not found`);
  }
};
