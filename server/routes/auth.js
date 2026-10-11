// server/routes/auth.js — POST /api/auth/register, /login, GET /me
'use strict';

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');

const SECRET = () => process.env.JWT_SECRET || 'change_this_secret';

// POST /api/auth/register
router.post('/register', (req, res) => {
  const db = req.db;
  const { name, email, password } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = db.get('SELECT id FROM users WHERE email = ?', cleanEmail);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const passwordHash = bcrypt.hashSync(String(password), 10);
  const result = db.run(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    String(name).trim(), cleanEmail, passwordHash, 'member'
  );

  const user  = { id: result.lastInsertRowid, name: String(name).trim(), email: cleanEmail, role: 'member' };
  const token = jwt.sign({ sub: user.id, role: user.role }, SECRET(), { expiresIn: '7d' });

  return res.status(201).json({ message: 'Registration successful', token, user });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const db = req.db;
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const user = db.get('SELECT * FROM users WHERE email = ?', cleanEmail);
  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign({ sub: user.id, role: user.role }, SECRET(), { expiresIn: '7d' });
  return res.json({
    message: 'Login successful',
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  });
});

// Auth middleware — used by /me and injected by protected routes
function requireAuth(req, res, next) {
  const db     = req.db;
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  try {
    const payload = jwt.verify(token, SECRET());
    const user    = db.get('SELECT id, name, email, role FROM users WHERE id = ?', payload.sub);
    if (!user) return res.status(401).json({ error: 'User account not found.' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Token is invalid or has expired. Please log in again.' });
  }
}

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
module.exports.requireAuth = requireAuth;
