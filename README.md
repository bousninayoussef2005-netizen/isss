# SmartLib

Static web app for **library management**: student sign-in, seat map with reservations and away timers, book catalog and borrowing, and a staff dashboard. Real-time data is backed by **Firebase** (Firestore).

**Live development:** serve the folder over HTTP (see below). Opening `index.html` directly from disk may block the Firebase ES module.

## Features

- **Students:** sign up / sign in (MedTech & MSB rules in-app), interactive seat map (sit, reserve, leave with away timer, return), borrowed books on **My Seat**, catalog browsing.
- **Staff:** books CRUD, transactions, students list with presence-style ordering, seat administration, alerts/issues, settings, busiest-hours style usage views where implemented.
- **Seats:** Firestore-synced occupancy, `away_timers`, `reservations`, and `seat_transactions` for analytics.

## Tech stack

- HTML, CSS, vanilla JavaScript  
- [Firebase JS SDK v10](https://firebase.google.com/docs/web/setup) (Firestore) via `Firebase.js` (ES module)

## Run locally

Use any static server from the project root, for example:

```bash
npx --yes serve .
# or: python -m http.server 8080
```

Then open the URL shown (e.g. `http://localhost:3000`).

## Firebase

The app expects a Firebase project with Firestore collections such as:

- `books`, `transactions`  
- `seats`, `seat_transactions`, `reservations`, `away_timers`  
- `students` (for synced student profiles when used)

Configure security rules so only authorized clients can read/write as intended. Client API keys in `Firebase.js` are normal for web apps; restrict by domain and rules in production.

## Repository layout

| Path | Role |
|------|------|
| `index.html` | Shell, login, tab host, script tags |
| `Firebase.js` | Firebase init, listeners, seat/book helpers |
| `style.css` | Global styles |
| `js/state.js` | Shared state and constants |
| `js/auth.js` | Student/staff auth flows |
| `js/tabs.js` | Tab switching and main content rendering |
| `js/seats.js` | Seat map, away timer UI, student seat tab |
| `js/books.js`, `js/student-books.js` | Books and student borrowing |
| `js/students.js` | Staff student list / presence |
| `js/*.js` | Alerts, issues, transactions, utils |
| `partials/*.html` | HTML fragments loaded into the main area |

## Default staff login (demo)

Use the in-app hint: `admin@smartlib.edu` / `admin123` (change or remove in production).

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/bousninayoussef2005-netizen/isss).
