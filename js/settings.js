/* =========================================================
   settings.js — Event settings, exports and system info
   ========================================================= */

import { boot, toast } from "./ui.js";
import { saveSettings, getStoreData } from "./db.js";
import { exportCollections, exportExpenses, exportPending } from "./exports.js";
import { isFirebaseConfigured, AUTH_ENABLED, DB_ROOT } from "./firebase.js";
import { isAuthEnabled, getCurrentUser } from "./auth.js";
import { toArray, validators, esc, formatDateTime, refreshIcons, plural } from "./utils.js";

/* ------------------------------ Form state ------------------------------ */

let formTouched = false;
let loadedOnce = false;

function setError(id, message) {
  const field = document.getElementById(id);
  const box = document.getElementById(`err-${id}`);
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

function fillForm(settings) {
  if (loadedOnce || formTouched) return;
  loadedOnce = true;
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value || "";
  };
  set("eventName", settings.eventName || "Navratri Mahotsav");
  set("eventYear", settings.eventYear || new Date().getFullYear());
  set("organizerName", settings.organizerName || "");
}

async function submitSettings(event) {
  event.preventDefault();

  const nameEl = document.getElementById("eventName");
  const yearEl = document.getElementById("eventYear");
  const organizerEl = document.getElementById("organizerName");

  const nameError = validators.required("Event name")(nameEl.value);
  let yearError = validators.required("Event year")(yearEl.value);
  if (!yearError) {
    const year = Number(yearEl.value);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      yearError = "Enter a year between 2000 and 2100.";
    }
  }

  setError("eventName", nameError);
  setError("eventYear", yearError);

  if (nameError || yearError) {
    (nameError ? nameEl : yearEl).focus();
    return;
  }

  const button = event.submitter;
  const original = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.innerHTML = '<i data-lucide="loader-2"></i> Saving\u2026';
    refreshIcons(button);
  }

  try {
    await saveSettings({
      eventName: nameEl.value.trim(),
      eventYear: Number(yearEl.value),
      organizerName: organizerEl.value.trim(),
    });
    toast("Settings saved.", "success", "Shown across the dashboard and printed report.");
    const hint = document.getElementById("settings-saved");
    if (hint) hint.textContent = `Saved ${formatDateTime(Date.now())}`;
    document.getElementById("settings-alert")?.classList.remove("show");
  } catch (error) {
    console.error("[Settings]", error);
    const alertBox = document.getElementById("settings-alert");
    if (alertBox) {
      alertBox.innerHTML = `<i data-lucide="alert-triangle"></i><span>${esc(error.message)}</span>`;
      alertBox.classList.add("show");
      refreshIcons(alertBox);
    }
    toast(error.message, "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = original;
      refreshIcons(button);
    }
  }
}

/* ------------------------------ System info ------------------------------ */

function renderSystemInfo() {
  const data = getStoreData();
  const counts = {
    contributors: toArray(data.contributors).length,
    expenses: toArray(data.expenses).length,
    pending: toArray(data.pendingPayments).length,
  };

  const info = document.getElementById("system-info");
  if (info) {
    const user = getCurrentUser();
    info.innerHTML = `
      <div class="info-row"><span class="k">Firebase</span><span class="v">${
        isFirebaseConfigured ? "Connected" : "Not configured"
      }</span></div>
      <div class="info-row"><span class="k">Database path</span><span class="v"><code>${esc(DB_ROOT)}/</code></span></div>
      <div class="info-row"><span class="k">Authentication</span><span class="v">${
        isAuthEnabled() ? "Email / password" : AUTH_ENABLED ? "Not available" : "Disabled by config"
      }</span></div>
      <div class="info-row"><span class="k">Signed in as</span><span class="v">${esc(user?.email || "\u2014")}</span></div>
      <div class="info-row"><span class="k">Live updates</span><span class="v">Realtime listener active</span></div>
      <div class="info-row"><span class="k">Total records</span><span class="v">${plural(
        counts.contributors + counts.expenses + counts.pending,
        "record"
      )}</span></div>`;
  }

  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  set("count-collections", plural(counts.contributors, "record"));
  set("count-expenses", plural(counts.expenses, "record"));
  set("count-pending", plural(counts.pending, "record"));

  refreshIcons(info || document);
}

/* ------------------------------ Render / boot ------------------------------ */

function render(store) {
  fillForm(store.data.settings || {});
  renderSystemInfo();
}

function wire() {
  const form = document.getElementById("settings-form");
  form?.addEventListener("submit", submitSettings);
  form?.addEventListener("input", () => {
    formTouched = true;
    const hint = document.getElementById("settings-saved");
    if (hint) hint.textContent = "Unsaved changes";
  });

  const exporters = { collections: exportCollections, expenses: exportExpenses, pending: exportPending };
  document.getElementById("page-content")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-export]");
    if (!button) return;
    exporters[button.dataset.export]?.();
  });
}

wire();
boot({ page: "settings", render });
