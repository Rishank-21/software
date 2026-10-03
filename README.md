# Navratri Collection & Expense Management Software

A complete, production-ready financial manager for a Navratri / Garba event:
money collected, money spent, who promised to pay later, what is still pending,
and exactly what is left in the balance — updated live on every device.

Built with **HTML5 + CSS3 + Vanilla JavaScript (ES modules) only**.
No React, Vue, Angular, Next.js, Node.js, Express or SQL.
Data lives in **Firebase Realtime Database**, with **Firebase Authentication**
protecting the organizer's records.

---

## Table of contents

1. [Features](#features)
2. [Project structure](#project-structure)
3. [Setup — step by step](#setup--step-by-step)
4. [Firebase security rules](#firebase-security-rules)
5. [Running the app locally](#running-the-app-locally)
6. [Deploying](#deploying)
7. [Daily usage](#daily-usage)
8. [Financial logic](#financial-logic)
9. [CSV export & print report](#csv-export--print-report)
10. [Troubleshooting](#troubleshooting)

---

## Features

| Area | What you get |
| --- | --- |
| Dashboard | Live Total Collected / Total Expenses / Remaining Balance / Pending cards, bar chart, expense-category doughnut, recent activity, pending list |
| Collections | Add / edit / view / delete, search by name or phone, filters (Paid, Pending, Cash, UPI, Bank Transfer), date range, CSV export |
| Expenses | Categories, paid-by, people involved (chips), receipt link, notes, filters, date range, CSV export |
| Pending Payments | Promises that are **never** counted as collected, mark-as-paid flow that atomically creates a collection record |
| Transactions | All money movement in one chronological timeline, grouped by day, with per-day net |
| Financial Summary | Counts, averages, largest contribution/expense, category breakdown, **print-ready report** |
| Settings | Event name, year, organizer — stored in Firebase, shown everywhere |
| Everywhere | Realtime updates, loading / error / empty states, toasts, confirmation dialogs, dark mode, mobile-first responsive layout, keyboard accessible |

---

## Project structure

```text
navratri-management/
├── index.html            Dashboard (default page)
├── collections.html      Collections
├── expenses.html         Expenses
├── pending.html          Pending Payments
├── transactions.html     Transactions
├── summary.html          Financial Summary + print report
├── settings.html         Settings, exports, system info
├── login.html            Organizer login
│
├── css/
│   ├── style.css         Design tokens, shell, tables, modals, toasts, states
│   ├── dashboard.css     Dashboard cards, charts, activity, transactions, summary
│   ├── forms.css         Forms, toolbars, filters, detail views, login
│   └── responsive.css    Breakpoints, mobile nav, card-style tables, print styles
│
├── js/
│   ├── firebase.js       ◀ Firebase configuration (the only file you edit)
│   ├── auth.js           Login / logout / route guard
│   ├── db.js             Realtime store + all CRUD operations
│   ├── calcs.js          Financial calculation engine
│   ├── utils.js          Currency & date formatting, validation, CSV, DOM helpers
│   ├── ui.js             Shell, sidebar, global search, states, toasts, modals
│   ├── records.js        Shared add/edit/detail/delete/mark-as-paid flows
│   ├── exports.js        CSV builders
│   ├── dashboard.js      Dashboard page
│   ├── collections.js    Collections page
│   ├── expenses.js       Expenses page
│   ├── pending.js        Pending page
│   ├── transactions.js   Transactions page
│   ├── summary.js        Summary + printable report
│   ├── settings.js       Settings page
│   └── login.js          Login page
│
├── firebase-rules.json   Production Realtime Database rules
└── README.md
```

---

## Setup — step by step

### Step 1 — Create a Firebase project

1. Go to <https://console.firebase.google.com> and click **Add project**.
2. Name it (e.g. `navratri-mahotsav`) and continue. Google Analytics is optional.
3. When the project is ready, click **Continue**.

### Step 2 — Enable the Realtime Database

1. In the left menu choose **Build → Realtime Database**.
2. Click **Create Database**.
3. Choose a location close to your organisers and start in **locked mode** —
   we replace the rules in Step 6 anyway.
4. Note the database URL, e.g. `https://navratri-mahotsav-default-rtdb.firebaseio.com`.

### Step 3 — Enable Authentication

1. In the left menu choose **Build → Authentication → Get started**.
2. Open the **Sign-in method** tab and enable **Email/Password** (no forgot-password email needed).
3. Open the **Users** tab → **Add user**, e.g.
   `organizer@example.com` / a strong password. Add one account per organiser.
4. To skip the login screen entirely, set `AUTH_ENABLED = false` in `js/firebase.js`
   (only do this for a private/trusted network).

### Step 4 — Copy the Firebase configuration

1. In the console click the **gear icon → Project settings → Your apps**.
2. Click the **Web** (`</>`) app icon, name the app, and register it.
3. Copy the `firebaseConfig` object that is shown.

### Step 5 — Add the configuration to `js/firebase.js`

Open `js/firebase.js` and replace every placeholder:

```js
export const firebaseConfig = {
  apiKey: "AIzaSy....",                     // ← from the console
  authDomain: "navratri-mahotsav.firebaseapp.com",
  databaseURL: "https://navratri-mahotsav-default-rtdb.firebaseio.com",
  projectId: "navratri-mahotsav",
  storageBucket: "navratri-mahotsav.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef",
};
```

The app detects unfilled placeholders and shows a friendly
**“Connect your Firebase project”** screen instead of breaking.

Also in this file:

```js
export const AUTH_ENABLED = true;   // false = no login screen
export const DB_ROOT = "navratri";  // database root node
```

### Step 6 — Configure Firebase database rules

1. In the console open **Realtime Database → Rules**.
2. Paste the contents of [`firebase-rules.json`](firebase-rules.json).
3. Click **Publish**.

The rules mean:

```text
Unauthenticated users : NO read, NO write
Authenticated users   : read / write, with record validation
```

> **Never leave the database in test mode** (`".read": true`, `".write": true`) —
> anyone with the URL could read or wipe your financial data.

### Step 7 — Run the application locally

ES modules do not load from a `file://` URL, so serve the folder over HTTP.

**Option A — VS Code Live Server (simplest)**

1. Install the **Live Server** extension.
2. Open the project folder and click **Go Live** (or right-click `index.html → Open with Live Server`).

**Option B — Python**

```bash
python -m http.server 5500
# then open http://localhost:5500
```

**Option C — PHP**

```bash
php -S localhost:5500
```

**Option D — npx**

```bash
npx serve .
```

Then open `http://localhost:5500`, sign in, and start recording.

---

## Firebase security rules

`firebase-rules.json` contains production rules that:

* require `auth != null` for every read and write,
* validate that a collection has a non-empty `name` and an `amount > 0`,
* validate that an expense has a `title` and an `amount > 0`,
* validate that a pending payment has a `name` and a `promisedAmount > 0`,
* still allow deletes (`!newData.exists()`),
* block unknown top-level keys (`$other`).

Rules are enforced server-side, so a tampered browser cannot save an invalid
financial record even if the JavaScript is modified.

---

## Deploying

Because this is a static site, any static host works:

**Firebase Hosting (recommended)**

```bash
npm install -g firebase-tools
firebase login
firebase init          # choose Hosting → current folder → "no" to SPA rewrite
firebase deploy
```

**Netlify / Vercel / GitHub Pages / Cloudflare Pages** — drag-and-drop the
project folder or point the build at the repository root. There is no build step.

After deploying, add your live domain under
**Authentication → Settings → Authorized domains**, and confirm the RTDB rules
are still the production ones.

---

## Daily usage

```text
Person gives money  →  + Add Collection        → Firebase → Dashboard updates
Expense happens     →  + Add Expense           → Firebase → Dashboard updates
"I'll pay later"    →  + Add Pending Payment   → Pending total updates (NOT collected)
Money finally arrives → Mark as Paid           → moves from Pending → Collected
```

**Mark as Paid** asks `Has this person paid? ₹5,000`, lets you pick the payment
method, then writes both changes (promise → Paid, new collection record) in a
single atomic multi-path update.

Useful extras:

* **Global search** (top bar) searches contributors, expenses and promises as you type.
* **Dark / light mode** — the sun/moon button; the preference is stored in `localStorage`
  (UI preference only — financial data is never stored locally).
* **Ctrl/Cmd + P** on the Financial Summary page prints the report.
* Every destructive action (delete, mark paid, logout) asks for confirmation first.

---

## Financial logic

All totals are **calculated from raw records on every render** — nothing is
stored as a running total, so editing or deleting a record can never leave a stale figure.

```text
Total Collected  = Σ amount of contributors with paymentStatus = "Paid"
Total Expenses   = Σ amount of all expenses
Remaining Balance = Total Collected − Total Expenses        (may be negative)
Pending Amount   = Σ promisedAmount of promises still "Pending"
                 + Σ amount of contributors still "Pending"
```

Pending money is **never** added to Total Collected.

Database structure (`DB_ROOT = "navratri"`):

```text
navratri/
├── contributors/{id}/    name, phone, address, amount, paymentStatus,
│                         paymentMethod, date, notes, createdAt
├── expenses/{id}/        title, category, description, amount, paidBy,
│                         peopleInvolved[], date, paymentMethod,
│                         receiptUrl, notes, createdAt
├── pendingPayments/{id}/ name, phone, promisedAmount, expectedDate,
│                         status, notes, dateAdded, paidDate, createdAt
└── settings/             eventName, eventYear, organizerName
```

A single `onValue()` listener on the root powers every page: change a record on
one phone and the other devices update instantly.

---

## CSV export & print report

| Where | Button | File |
| --- | --- | --- |
| Collections | Export CSV | `navratri-collections.csv` |
| Expenses | Export CSV | `navratri-expenses.csv` |
| Pending Payments | Export CSV | `navratri-pending-payments.csv` |
| Transactions | Export CSV | `navratri-transactions.csv` |
| Financial Summary | Export All CSV | `navratri-full-report.csv` (everything in one sheet) |
| Settings | per-record downloads | same three core files |
| Financial Summary | Print Report | browser print dialog (CSS `@media print` layout) |

CSV files are generated in the browser with a UTF-8 BOM, so Excel opens
Hindi/regional text and `₹` correctly.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| “Connect your Firebase project” screen | Fill in `js/firebase.js` (Step 5) |
| “Unable to load data” + retry | Check the `databaseURL` and your internet connection |
| Permission denied in console | Publish the rules from `firebase-rules.json` (Step 6) |
| Redirects to `login.html` in a loop | Create a user in Firebase Authentication (Step 3) |
| Blank page / module errors | You opened `index.html` via `file://` — use a local server (Step 7) |
| Charts missing | Chart.js CDN blocked — totals still work; allow `cdn.jsdelivr.net` |
| Icons missing | Allow `unpkg.com` (Lucide icons) |
| Data not updating on another device | Both devices must be signed in to the same Firebase project |

Technical errors are always logged to the browser console
(`F12 → Console`) — user-facing messages stay clean and generic.

---

## Browser support

Modern evergreen browsers: Chrome, Edge, Firefox, Safari (last 2 years).
Works on desktop, laptop, tablet and phone; tables collapse into cards below 720 px.
