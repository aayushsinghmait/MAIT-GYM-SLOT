# MAIT Gym Slot Booking Web Application

A responsive gym slot booking web application built for **MAIT Gym** as **Task 2 of the Byte Society Web Development track**. Members can browse one-hour workout sessions, reserve or cancel a slot, join a waitlist, and view their check-in codes. Gym staff can create sessions, review bookings, and mark attendance.

## 🚀 Live Demo

**[Open MAIT Gym Slot Booking](https://mait-gym-slot-production.up.railway.app)**


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
- Hash-based navigation between application views.
  e.g. gym.com/#home
- Loading, error, empty, and success feedback in the interface.

## 🛠️ Tech Stack

- **HTML5** — page structure and forms
- **CSS3** — responsive layout, styling, and animations
- **Vanilla JavaScript** — application logic, navigation, validation, and booking flows
- **Browser Local Storage** — the current `api.js` implementation stores demo users, sessions, bookings, and waitlist data locally in the browser
- **Railway** — deployment platform

## 📂 Project Structure

```text
MAIT-GYM-SLOT/
├── index.html       # Application pages and UI structure
├── style.css        # Styling and responsive design
├── app.js           # Front-end controller and navigation
├── api.js           # In-browser API simulation and booking logic
└── README.md        # Project documentation
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

1. Clone or download this repository and just open index.html in you browser and see magic.
2. Open the project folder in VS Code and run index.html.
3. Make sure `index.html`, `style.css`, `app.js`, `api.js`, and the referenced media assets are in their expected locations.
4. Open `index.html` in a browser, or use the **Live Server** extension in VS Code.

No package installation is required for the current browser-based demo.

## 🔑 Demo Login Accounts

The current `api.js` seeds demo accounts when the browser's local demo database is empty. The demo password for the seeded accounts is `password123`.

|      Role     |       Email       |    Password   |
|---------------|-------------------|---------------|
| Admin / Staff | `admin@gym.com`   | `password123` |
|     Member    | `khushi@gmail.com`| `password123` |
|     Member    | `aditya@gmail.com`| `password123` |
|     Member    | `rohan@gmail.com` | `password123` |

These are **demo credentials only**.

## 🧠 Design Note

- The UI is built with semantic HTML, custom CSS, and vanilla JavaScript.
- `app.js` manages hash-based navigation, login state, page rendering, and calls to `window.ServerAPI`.
- `api.js` simulates API routes in the browser and stores four logical collections—users, sessions, bookings, and waitlist—in `localStorage`.
- Sessions are designed as one-hour slots with a capacity of 20; the UI supports booking, cancellation, waitlisting, and staff check-in flows.
- The current implementation is a front-end demo, not a production server-backed application.

### Acknowledgements & Learning Resources

During the development of this MAIT Gym Slot Booking Web Application, I used ChatGPT to generate the images used on the website and to get inspiration for the colour combinations. The videos featured on the website were created using the Arena.ai platform. Whenever I faced technical challenges, I referred to Google Search and MDN Web Docs to understand concepts and learn how to implement features—for example, displaying an outline when hovering the mouse over a button. I also took guidance from my senior on certain aspects of the project and clarified my doubts about HTML elements and concepts such as `id`, `class`, `div`, and `span`. This project helped me improve my web development skills, explore new concepts, and learn how to solve problems independently.


## ⚠️ Implementation Notes

The challenge brief asks for a backend API backed by a real database, server-side authentication and authorization, and protection against simultaneous bookings exceeding capacity. In the submitted code, `api.js` is an **in-browser API simulation** and uses `localStorage`; it does not connect to a separate server or a shared relational database. Browser-local data is not shared between users or devices and can be modified by the user.

For a production-ready version, move authentication and booking rules to a real backend, use a relational database such as MYSQL, enforce capacity and uniqueness constraints on the server/database, store secrets in environment variables, and never rely on client-side checks as the security boundary.

## 📋 Task Context

This project was created for **Byte Society Web Development — Web Task 2: Gym Slot Booking**. The task focuses on online session booking and cancellation, a capacity limit of 20, waitlists, attendance check-in, member/admin views, a repository README, and deployment as an optional extra.

## 👨‍💻 Author

Built as a web development task project for MAIT Gym using HTML, CSS, and JavaScript BY- AAYUSH SINGH.
