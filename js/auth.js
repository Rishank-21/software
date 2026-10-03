/* =========================================================
   auth.js — Firebase Authentication (email / password)
   ========================================================= */

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth, AUTH_ENABLED } from "./firebase.js";
import { AppError } from "./db.js";

let currentUser = null;
let authResolved = false;
const watchers = new Set();

/** Resolves with the first authenticated user (or null) once Firebase answers. */
const firstAuthValue = auth
  ? new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          currentUser = user;
          authResolved = true;
          if (unsubscribe) unsubscribe();
          resolve(user);
          watchers.forEach((cb) => cb(currentUser));
        },
        (error) => {
          console.error("[Auth] Listener error:", error);
          authResolved = true;
          if (unsubscribe) unsubscribe();
          resolve(null);
        }
      );
    })
  : Promise.resolve(null);

/** Live auth state (fires whenever the signed-in user changes). */
export function onAuthChange(callback) {
  watchers.add(callback);
  if (authResolved) callback(currentUser);
  return () => watchers.delete(callback);
}

export const getCurrentUser = () => currentUser;
export const isAuthEnabled = () => Boolean(AUTH_ENABLED && auth);

/**
 * Page guard. Returns false when the visitor must not see the page
 * (and has already been redirected to the login screen).
 */
export async function requireAuth() {
  if (!AUTH_ENABLED) return true;
  if (!auth) return true; // not configured — the setup notice takes over
  const user = await firstAuthValue;
  if (user) return true;
  const params = new URLSearchParams(window.location.search);
  /* keep path + query so deep links (e.g. ?open=id) survive the login round-trip */
  const target = `${window.location.pathname.split("/").pop() || "index.html"}${window.location.search}`;
  params.set("redirect", target);
  window.location.replace(`login.html?${params.toString()}`);
  return false;
}

const LOGIN_ERRORS = {
  "auth/invalid-credential": "Email or password is incorrect.",
  "auth/wrong-password": "Email or password is incorrect.",
  "auth/user-not-found": "Email or password is incorrect.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/missing-password": "Enter your password.",
  "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
  "auth/network-request-failed": "Unable to reach Firebase. Check your internet connection.",
  "auth/user-disabled": "This account has been disabled.",
};

export async function login(email, password) {
  if (!auth) throw new AppError("Firebase is not configured yet. Add your credentials in js/firebase.js.");
  try {
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
    currentUser = credential.user;
    authResolved = true;
    watchers.forEach((cb) => cb(currentUser));
    return currentUser;
  } catch (error) {
    console.error("[Auth] Sign-in failed:", error);
    throw new AppError(LOGIN_ERRORS[error?.code] || "Unable to sign in. Please try again.", error);
  }
}

export async function logout() {
  if (!auth) return;
  try {
    await signOut(auth);
    currentUser = null;
    watchers.forEach((cb) => cb(currentUser));
  } catch (error) {
    console.error("[Auth] Sign-out failed:", error);
    throw new AppError("Unable to log out right now. Please try again.", error);
  }
}
