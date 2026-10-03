/* =========================================================
   firebase.js — configuration + Firebase initialisation
   -------------------------------------------------------
   Firebase credentials live in firebase-config.js — a file
   you edit. It is gitignored so your secrets stay local.
   The rest of this file works automatically.
   ========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/* -----------------------------------------------------------
   1. FIREBASE CONFIGURATION — EDIT firebase-config.js instead
   ----------------------------------------------------------- */
// The browser loads firebase-config.js before this module.
// window.FIREBASE_CONFIG is injected there as:
//   window.FIREBASE_CONFIG = { apiKey: "...", ... };
const firebaseConfig = window.FIREBASE_CONFIG || {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "G-YS48BN78FK",
};

/* -----------------------------------------------------------
   2. Auth switch + database root node — edit firebase-config.js
   ----------------------------------------------------------- */
export const AUTH_ENABLED = window.AUTH_ENABLED === "true";
export const DB_ROOT = window.DB_ROOT || "navratri";

/* -----------------------------------------------------------
   3. Internal — nothing to edit below this line.
   ----------------------------------------------------------- */
const isPlaceholder = (value) => /^(YOUR_|REPLACE_)/i.test(String(value).trim());

export const isFirebaseConfigured = Object.values(firebaseConfig).every(
  (value) => !isPlaceholder(value)
);

let app = null;
let database = null;
let authInstance = null;

if (isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    database = getDatabase(app);
    authInstance = getAuth(app);
  } catch (error) {
    console.error("[Firebase] Initialisation failed:", error);
  }
}

export { app, database as db, authInstance as auth };

/** True when Firebase is ready to accept reads/writes. */
export const firebaseReady = () => Boolean(database);
