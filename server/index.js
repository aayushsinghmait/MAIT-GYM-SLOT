// server/index.js — Express application entry point
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors    = require('cors');
const { getDb } = require('./db');

const PORT = process.env.PORT || 3000;
const app  = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// Initialise database, seed, then mount routes
async function main() {
  const db = await getDb();

  // Seed test data (no-op if already seeded)
  const seedModule = require('./seed');
  await seedModule(db);

  // Inject db into every request
  app.use((req, _res, next) => {
    req.db = db;
    next();
  });

  // ─── API Routes ────────────────────────────────────────────────────────────
  app.use('/api/auth',     require('./routes/auth'));
  app.use('/api/sessions', require('./routes/sessions'));
  app.use('/api/bookings', require('./routes/bookings'));
  app.use('/api/waitlist', require('./routes/waitlist'));
  app.use('/api/checkin',  require('./routes/checkin'));

  // 404 for unknown /api routes
  app.use('/api', (req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
  });

  // SPA fallback — serve index.html for all non-API routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
  });

  // ─── Global Error Handler (never leaks stack traces) ──────────────────────
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (process.env.NODE_ENV !== 'production') console.error(err);
    const status  = err.status || 500;
    const message = status === 500
      ? 'An unexpected server error occurred.'
      : err.message || 'Something went wrong.';
    res.status(status).json({ error: message });
  });

  app.listen(PORT, () => {
    console.log(`\n🏋️  GymSlot API running at http://localhost:${PORT}`);
    console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Database    : ${process.env.DB_PATH || './server/gym.db'}`);
    console.log(`\n   Admin  : admin@gym.com   / password123`);
    console.log(`   Member : khushi@gmail.com / password123`);
    console.log(`   Member : aditya@gmail.com / password123\n`);
  });
}

main().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;
