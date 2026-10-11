# MAIT Gym Slot Booking Web Application

A responsive gym slot booking web application built for **MAIT Gym** as **Task 2 of the Byte Society Web Development track**. Members can browse one-hour workout sessions, reserve or cancel a slot, join a waitlist, and view their check-in codes. Gym staff can create sessions, review bookings, and mark attendance.

## 🚀 Live Demo

**[Open MAIT Gym Slot Booking](https://mait-gym-slot-production-c07a.up.railway.app/)**


## ✨ Features

### Member
- Register and log in with an email address and password.
  → you can use our own credential for login given below.
- Browse gym sessions and filter sessions by date.
- View available seats for each session.
- Book a session or join a waitlist when it is full.
- Cancel a booking or leave a waitlist.
- View personal bookings and six-character check-in codes.
- Use a responsive interface designed for all the devices desktop, mobile screens etc.

### Admin / Gym Staff
- Access a separate admin panel.
- Create one-hour gym sessions with a fixed capacity of 20 members.
- View bookings for a selected session.
- Verify a member's check-in code and mark attendance.
- Review booking and attendance status.

### Interface
- Dark, neon-inspired fitness theme.
- HTML, CSS, and vanilla JavaScript.
- added sqlite for database with the help of node.js and express.
- Hash-based navigation between application views.
  e.g. gym.com/#home
- Loading, error, empty, and success feedback in the interface.

## 🛠️ Tech Stack

- **HTML5** — page structure and forms
- **CSS3** — responsive layout, styling, and animations
- **Vanilla JavaScript** — application logic, navigation, validation, and booking flows
- **Browser Local Storage** — the current `api.js` implementation stores demo users, sessions, bookings, and waitlist data locally in the browser
- **Railway** — deployment platform

## Project Structure

```
MAIT-GYM-SLOT/
├── index.html          # Frontend SPA
├── app.js              # Frontend JS (fetch-based API calls)
├── style.css           # Frontend styles
├── api.js              # Legacy browser stub (not used — replaced by real backend)
├── .env.example        # Environment variable template
├── .env                # Local dev values (git-ignored)
├── .gitignore
├── package.json
└── server/
    ├── index.js        # Express app entry point
    ├── db.js           # SQLite connection + schema
    ├── seed.js         # Test data seeder
    ├── middleware/
    │   └── auth.js     # JWT requireAuth + requireAdmin
    └── routes/
        ├── auth.js     # POST /api/auth/register|login, GET /api/auth/me
        ├── sessions.js # GET/POST /api/sessions
        ├── bookings.js # GET/POST /api/bookings + cancel
        ├── waitlist.js # POST/GET /api/waitlist + leave
        └── checkin.js  # POST /api/checkin (admin)
```


> Keep any media folders referenced by `index.html` and `style.css` in the repository so that the video and background assets can load correctly.

## Project Workflow

```text
MAIT Gym Slot Booking Web Application
│
├── 1. Open Website
│   ├── Login
│   └── Register
│
├── 2. Login as Admin
│   ├── Access Admin Dashboard
│   ├── Create Gym Sessions
│   │   ├── Select Date and Time
│   │   └── Set Session Capacity
│   ├── View Created Sessions
│   ├── View Member Bookings
│   ├── Check Member Attendance
│   └── Manage Check-ins
│
└── 3. Login as Member
    ├── Access Member Dashboard
    ├── Browse Available Gym Sessions
    ├── Filter Sessions by Date
    ├── Book a Gym Slot
    ├── View My Bookings
    ├── Get Check-in Code
    └── Join Waitlist When a Session Is Full
```


## ▶️ Run Locally

Clone or download this repository and go on your local bash cmd or aother 
```bash
# 1. Install dependencies
npm install

# 2. Copy env (already done — .env is pre-configured for dev)
cp .env.example .env

# 3. Start the server (seeds the DB on first run automatically)
npm start
# → Server running at http://localhost:3000
```

Open **http://localhost:3000** in your browser.

---

## 🔑 Demo Login Accounts

The current `api.js` seeds demo accounts when the browser's local demo database is empty. The demo password for the seeded accounts is `password123`.

|      Role     |       Email       |    Password   |
|---------------|-------------------|---------------|
| Admin / Staff | `admin@gym.com`   | `password123` |
|     Member    | `khushi@gmail.com`| `password123` |
|     Member    | `aditya@gmail.com`| `password123` |
|     Member    | `rohan@gmail.com` | `password123` |

- **Khushi** is booked in the current-hour session (ready to test check-in right now).
- **Aditya** is on the waitlist for the full session (tomorrow 11:00).
- The **tomorrow 11:00** session is pre-filled with 20 bookings to test waitlist & the full-session path.
- 
These are **demo credentials only**.

## 🧠 Design Note

- The UI is built with semantic HTML, custom CSS, and vanilla JavaScript.
- 
**Stack:** Node.js + Express backend, SQLite database (via `better-sqlite3`), Vanilla HTML/CSS/JS frontend — single-page app with hash routing.

**Data model:** Four relational tables — `users`, `sessions`, `bookings`, `waitlist` — with foreign keys and a `UNIQUE(session_date, start_hour)` constraint enforced at the DB level. Capacity is enforced inside a SQLite `transaction()` so two simultaneous requests can never both see an open seat and both book it.

**Auth:** Passwords hashed with bcrypt (cost 10). JWT tokens signed with HS256, valid 7 days, carried as `Authorization: Bearer <token>`. Admin accounts exist only in the DB seeder — registration always creates members.

**Assumptions:** Sessions start exactly on the hour and last exactly 60 minutes. Check-in is only possible during that 60-minute window. Nobody on the waitlist can be promoted into a session that has already started. A member cannot be on the same session's waitlist twice.

---
### Acknowledgements & Learning Resources

During the development of this MAIT Gym Slot Booking Web Application, I used ChatGPT to generate the images used on the website and to get inspiration for the colour combinations. The videos featured on the website were created using the Arena.ai platform. Whenever I faced technical challenges, I referred to Google Search and MDN Web Docs to understand concepts and learn how to implement features—for example, displaying an outline when hovering the mouse over a button. I also took guidance from my senior on certain aspects of the project and clarified my doubts about HTML elements and concepts such as `id`, `class`, `div`, and `span`. This project helped me improve my web development skills, explore new concepts, and learn how to solve problems independently. for understanding the logic of node.js ,express, sqlite i used many youtube channels and where got problem writing and connect sqlite so only on that part i use vs studio code agent to correct code of sqlite and node.js only.


## API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | Public | Register (always member) |
| POST | `/api/auth/login` | Public | Login, returns JWT |
| GET | `/api/auth/me` | Member | Current user info |
| GET | `/api/sessions?date=` | Member | List sessions with seat counts |
| POST | `/api/sessions` | Admin | Create session |
| POST | `/api/bookings` | Member | Book a slot (atomic) |
| GET | `/api/bookings/my` | Member | My bookings |
| GET | `/api/bookings/session/:id` | Admin | All bookings for a session |
| POST | `/api/bookings/:id/cancel` | Member/Admin | Cancel + auto-promote waitlist |
| POST | `/api/waitlist` | Member | Join waitlist for full session |
| GET | `/api/waitlist/my` | Member | My waitlist positions |
| POST | `/api/waitlist/:sessionId/leave` | Member | Leave waitlist |
| POST | `/api/checkin` | Admin | Mark member present (code, once, during session hour) |


## 📋 Task Context

This project was created for **Byte Society Web Development — Web Task 2: Gym Slot Booking**. The task focuses on online session booking and cancellation, a capacity limit of 20, waitlists, attendance check-in, member/admin views, a repository README, and deployment as an optional extra.

## 👨‍💻 Author

Built as a web development task project for MAIT Gym using HTML, CSS, and JavaScript BY- AAYUSH SINGH.
