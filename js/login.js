/* =========================================================
   login.js — organizer sign-in
   ========================================================= */

import { isFirebaseConfigured, AUTH_ENABLED } from "./firebase.js";
import { login, onAuthChange, isAuthEnabled } from "./auth.js";
import { toast, initTheme } from "./ui.js";
import { refreshIcons } from "./utils.js";

initTheme();
refreshIcons();

/* Only allow redirecting back to a page in this project (query string allowed). */
function safeRedirectTarget() {
  const requested = new URLSearchParams(window.location.search).get("redirect") || "";
  const [file = "", query = ""] = requested.split("?");
  if (!/^[a-z0-9._-]+\.html$/i.test(file)) return "index.html";
  if (query && !/^[a-z0-9._=&-]*$/i.test(query)) return file;
  return query ? `${file}?${query}` : file;
}

const target = safeRedirectTarget();

function setError(fieldId, errorId, message) {
  const field = document.getElementById(fieldId);
  const box = document.getElementById(errorId);
  if (!field || !box) return;
  if (message) {
    field.setAttribute("aria-invalid", "true");
    box.classList.add("show");
    box.querySelector("span").textContent = message;
  } else {
    field.removeAttribute("aria-invalid");
    box.classList.remove("show");
    box.querySelector("span").textContent = "";
  }
}

function showAlert(message) {
  const alertBox = document.getElementById("login-alert");
  if (!alertBox) return;
  alertBox.innerHTML = `<i data-lucide="alert-triangle"></i><span>${message}</span>`;
  alertBox.classList.add("show");
  refreshIcons(alertBox);
}

function showSetupCard() {
  document.getElementById("login-card").hidden = true;
  document.getElementById("setup-card").hidden = false;
  refreshIcons();
}

/* ------------------------------ Guards ------------------------------ */

if (!AUTH_ENABLED) {
  window.location.replace("index.html");
} else if (!isFirebaseConfigured) {
  showSetupCard();
} else {
  /* already signed in? go straight to the dashboard */
  onAuthChange((user) => {
    if (user && !window.__navigating) {
      window.__navigating = true;
      window.location.replace(target);
    }
  });
}

/* ------------------------------ Submit ------------------------------ */

const form = document.getElementById("login-form");
const submit = document.getElementById("login-submit");

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  let error = null;
  if (!email) error = "Email address cannot be empty.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = "Enter a valid email address.";
  setError("login-email", "err-email", error);

  let passwordError = null;
  if (!password) passwordError = "Password cannot be empty.";
  setError("login-password", "err-password", passwordError);

  document.getElementById("login-alert")?.classList.remove("show");

  if (error || passwordError) {
    (error ? document.getElementById("login-email") : document.getElementById("login-password")).focus();
    return;
  }

  const original = submit.innerHTML;
  submit.disabled = true;
  submit.innerHTML = '<i data-lucide="loader-2"></i> Signing in\u2026';
  refreshIcons(submit);

  try {
    window.__navigating = true;
    const user = await login(email, password);
    toast(`Welcome back, ${(user.email || "").split("@")[0]}.`, "success");
    window.location.replace(target);
  } catch (err) {
    console.error("[Login]", err);
    window.__navigating = false;
    submit.disabled = false;
    submit.innerHTML = original;
    refreshIcons(submit);
    showAlert(err.message || "Unable to sign in. Please try again.");
    toast(err.message || "Unable to sign in.", "error");
    document.getElementById("login-password").value = "";
    document.getElementById("login-password").focus();
  }
});

/* Make sure the sign-in button label is restored if auth UI is unavailable. */
if (!isAuthEnabled()) {
  submit?.setAttribute("disabled", "true");
  showAlert("Authentication is not available. Check the Firebase configuration in js/firebase.js.");
}
