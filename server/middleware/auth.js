// server/middleware/auth.js — JWT authentication & role-based middleware
'use strict';

const jwt = require('jsonwebtoken');
const db  = require('../db');

const SECRET = process.env.JWT_SECRET || 'change_this_secret';

/**
 * requireAuth — verifies Bearer token, attaches req.user
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  try {
    const payload = jwt.verify(token, SECRET);
    const user    = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(payload.sub);
    if (!user) return res.status(401).json({ error: 'User account not found.' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Token is invalid or has expired. Please log in again.' });
  }
}

/**
 * requireAdmin — must come AFTER requireAuth
 */
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, SECRET };
