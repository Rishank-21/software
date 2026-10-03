/* =========================================================
   ui.js — app shell, page states, toasts, modals, boot
   ========================================================= */

import { isFirebaseConfigured, AUTH_ENABLED } from "./firebase.js";
import { requireAuth, onAuthChange, logout as authLogout, getCurrentUser, isAuthEnabled } from "./auth.js";
import { onStoreChange, startStore, retryStore, getStore } from "./db.js";
import { esc, refreshIcons, debounce, toArray, formatCurrency } from "./utils.js";
import { isPromisePending } from "./calcs.js";

/* ------------------------------ Navigation ------------------------------ */

const NAV_ITEMS = [
  { key: "dashboard", href: "index.html", label: "Dashboard", icon: "layout-dashboard" },
  { key: "collections", href: "collections.html", label: "Collections", icon: "wallet" },
  { key: "expenses", href: "expenses.html", label: "Expenses", icon: "receipt" },
  { key: "pending", href: "pending.html", label: "Pending Payments", icon: "clock", badge: true },
  { key: "transactions", href: "transactions.html", label: "Transactions", icon: "arrow-left-right" },
  { key: "summary", href: "summary.html", label: "Financial Summary", icon: "pie-chart" },
  { key: "settings", href: "settings.html", label: "Settings", icon: "settings" },
];

/* ------------------------------ Theme ------------------------------ */

const THEME_KEY = "navratri.theme";

const readStore = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeStore = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage disabled — ignore */
  }
};

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  writeStore(THEME_KEY, theme);
  const btn = document.getElementById("theme-btn");
  if (btn) {
    btn.innerHTML = `<i data-lucide="${theme === "dark" ? "sun" : "moon"}"></i>`;
    btn.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    refreshIcons(btn);
  }
}

export function initTheme() {
  const saved = readStore(THEME_KEY);
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (prefersDark ? "dark" : "light"));
}

/* ------------------------------ Shell ------------------------------ */

function navHTML(pageKey) {
  return NAV_ITEMS.map(
    (item) => `
      <a class="nav-link${item.key === pageKey ? " active" : ""}" href="${item.href}"
         ${item.key === pageKey ? 'aria-current="page"' : ""}>
        <i data-lucide="${item.icon}"></i>
        <span>${item.label}</span>
        ${item.badge ? '<span class="nav-badge" id="nav-badge-pending" hidden></span>' : ""}
      </a>`
  ).join("");
}

function shellHTML(pageKey, pageTitle) {
  return `
    <aside class="sidebar" id="sidebar" aria-label="Main navigation">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">N</span>
        <span class="brand-text">
          <span class="brand-name" id="brand-name">Navratri Management</span>
          <span class="brand-event" id="brand-event">Collection &amp; Expense Manager</span>
        </span>
      </div>
      <nav class="nav" aria-label="Sections">
        <span class="nav-label">Menu</span>
        ${navHTML(pageKey)}
      </nav>
      <div class="sidebar-foot" id="sidebar-foot" hidden>
        <div class="user-chip">
          <span class="user-avatar" id="user-avatar" aria-hidden="true">?</span>
          <span class="user-meta">
            <span class="user-name" id="user-name">Organizer</span>
            <span class="user-mail" id="user-mail"></span>
          </span>
        </div>
      </div>
    </aside>

    <div class="backdrop-nav" id="nav-backdrop" aria-hidden="true"></div>

    <div class="content">
      <header class="topbar">
        <button class="btn-icon menu-btn" id="menu-btn" type="button"
                aria-label="Open navigation" aria-expanded="false" aria-controls="sidebar">
          <i data-lucide="menu"></i>
        </button>
        <span class="topbar-title" id="topbar-title">${esc(pageTitle)}</span>
        <div class="topbar-spacer"></div>
        <div class="global-search" role="search">
          <i data-lucide="search" class="search-ico"></i>
          <input class="input search-input" id="global-search" type="search" autocomplete="off"
                 placeholder="Search people, expenses&hellip;" aria-label="Search all records"
                 role="combobox" aria-expanded="false" aria-controls="search-results">
          <div class="search-results" id="search-results" role="listbox" aria-label="Search results" hidden></div>
        </div>
        <button class="btn-icon" id="theme-btn" type="button" aria-label="Switch theme"></button>
        <button class="btn-icon" id="logout-btn" type="button" aria-label="Log out" hidden>
          <i data-lucide="log-out"></i>
        </button>
      </header>
    </div>`;
}

/* Global search reads straight from the live store. */
window.__storeData = () => getStore().data;

export function initShell(pageKey, pageTitle = "") {
  const app = document.getElementById("app");
  if (!app) return;
  const title = pageTitle || document.querySelector(".page-title")?.textContent?.trim() || "Dashboard";
  app.className = "app";
  app.innerHTML = shellHTML(pageKey, title);

  const main = document.getElementById("main");
  if (main) app.querySelector(".content").appendChild(main);

  /* mobile navigation */
  const menuBtn = document.getElementById("menu-btn");
  const backdrop = document.getElementById("nav-backdrop");
  const closeNav = () => {
    document.body.classList.remove("nav-open");
    menuBtn?.setAttribute("aria-expanded", "false");
  };
  menuBtn?.addEventListener("click", () => {
    const open = document.body.classList.toggle("nav-open");
    menuBtn.setAttribute("aria-expanded", String(open));
  });
  backdrop?.addEventListener("click", closeNav);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeNav();
  });
  app.querySelectorAll(".nav-link").forEach((link) => link.addEventListener("click", closeNav));

  /* keep the theme button in sync with the applied theme */
  applyTheme(document.documentElement.dataset.theme || "light");

  /* theme toggle */
  document.getElementById("theme-btn")?.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
  });

  /* logout */
  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    const { ok } = await confirmDialog({
      heading: "Log out?",
      message: "You will need to sign in again to view financial data.",
      confirmLabel: "Log out",
      tone: "warn",
      icon: "log-out",
    });
    if (!ok) return;
    try {
      await authLogout();
      window.location.href = "login.html";
    } catch (error) {
      toast(error.message, "error");
    }
  });

  wireGlobalSearch();
  refreshIcons(app);
}

export function setPageTitle(title) {
  const el = document.getElementById("topbar-title");
  if (el) el.textContent = title;
}

/* ------------------------------ Global search ------------------------------ */

const SEARCH_TARGETS = [
  { type: "collection", href: "collections.html", label: "Collection" },
  { type: "expense", href: "expenses.html", label: "Expense" },
  { type: "pending", href: "pending.html", label: "Pending" },
];

function searchAll(query, data) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits = [];
  const matches = (...fields) => fields.some((f) => String(f || "").toLowerCase().includes(q));

  for (const c of toArray(data.contributors)) {
    if (matches(c.name, c.phone, c.address, c.notes)) {
      hits.push({ ...SEARCH_TARGETS[0], id: c.id, name: c.name || "Unnamed", amount: Number(c.amount) || 0, extra: c.phone || "" });
    }
  }
  for (const e of toArray(data.expenses)) {
    if (matches(e.title, e.category, e.paidBy, e.description, e.notes)) {
      hits.push({ ...SEARCH_TARGETS[1], id: e.id, name: e.title || "Expense", amount: Number(e.amount) || 0, extra: e.category || "" });
    }
  }
  for (const p of toArray(data.pendingPayments)) {
    if (matches(p.name, p.phone, p.notes)) {
      hits.push({ ...SEARCH_TARGETS[2], id: p.id, name: p.name || "Unnamed", amount: Number(p.promisedAmount) || 0, extra: p.phone || "" });
    }
  }
  const rank = (h) => (h.name.toLowerCase().startsWith(q) ? 0 : 1);
  return hits.sort((a, b) => rank(a) - rank(b)).slice(0, 8);
}

function wireGlobalSearch() {
  const input = document.getElementById("global-search");
  const panel = document.getElementById("search-results");
  if (!input || !panel) return;

  const close = () => {
    panel.hidden = true;
    input.setAttribute("aria-expanded", "false");
  };

  const render = () => {
    const query = input.value;
    if (!query.trim()) return close();
    const data = window.__storeData?.() || {};
    const results = searchAll(query, data);
    panel.innerHTML = results.length
      ? results
          .map(
            (r, i) => `
          <button class="search-result" type="button" role="option" data-href="${r.href}" data-id="${esc(r.id)}" data-q="${esc(query)}">
            <span class="sr-type">${r.label}</span>
            <span class="sr-name">${esc(r.name)}${
              r.extra && r.extra.toLowerCase() !== r.name.toLowerCase()
                ? ` <span class="text-muted">&middot; ${esc(r.extra)}</span>`
                : ""
            }</span>
            <span class="sr-amt">${formatCurrency(r.amount)}</span>
          </button>`
          )
          .join("")
      : `<div class="search-empty">No matches for &ldquo;${esc(query)}&rdquo;</div>`;
    panel.hidden = false;
    input.setAttribute("aria-expanded", "true");
  };

  input.addEventListener("input", debounce(render, 160));
  input.addEventListener("focus", () => { if (input.value.trim()) render(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { close(); input.blur(); }
    if (e.key === "ArrowDown") { e.preventDefault(); panel.querySelector(".search-result")?.focus(); }
    if (e.key === "Enter") {
      const first = panel.querySelector(".search-result");
      if (first) { e.preventDefault(); first.click(); }
    }
  });
  panel.addEventListener("keydown", (e) => {
    const items = Array.from(panel.querySelectorAll(".search-result"));
    const index = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); items[Math.min(index + 1, items.length - 1)]?.focus(); }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (index <= 0) input.focus();
      else items[index - 1]?.focus();
    }
    if (e.key === "Escape") { close(); input.focus(); }
  });
  panel.addEventListener("click", (e) => {
    const btn = e.target.closest(".search-result");
    if (!btn) return;
    const params = new URLSearchParams({ open: btn.dataset.id, q: btn.dataset.q });
    window.location.href = `${btn.dataset.href}?${params.toString()}`;
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".global-search")) close();
  });
}

/* ------------------------------ Page states ------------------------------ */

const stateEl = () => document.getElementById("page-state");
const contentEl = () => document.getElementById("page-content");

let stateShown = null;

function showState(key, html) {
  const el = stateEl();
  const content = contentEl();
  if (!el) return;
  if (stateShown === key) return;
  stateShown = key;
  el.innerHTML = html;
  el.hidden = false;
  if (content) content.hidden = true;
  refreshIcons(el);
}

export function hideState() {
  const el = stateEl();
  const content = contentEl();
  stateShown = null;
  if (el) { el.hidden = true; el.innerHTML = ""; }
  if (content) content.hidden = false;
}

export function showLoadingState() {
  showState(
    "loading",
    `<div class="state-box">
       <div class="spinner" aria-hidden="true"></div>
       <p class="state-title">Loading financial data&hellip;</p>
       <p class="state-text">Fetching the latest records from Firebase. Totals appear as soon as they arrive.</p>
     </div>`
  );
}

export function showErrorState() {
  showState(
    "error",
    `<div class="state-box">
       <div class="state-ico err"><i data-lucide="alert-triangle"></i></div>
       <p class="state-title">Unable to load data.</p>
       <p class="state-text">Please check your internet connection and try again. Your records are safe.</p>
       <div class="state-actions">
         <button class="btn btn-primary" id="state-retry" type="button">
           <i data-lucide="refresh-cw"></i> Try again
         </button>
       </div>
     </div>`
  );
  document.getElementById("state-retry")?.addEventListener("click", () => {
    stateShown = null;
    showLoadingState();
    retryStore();
  });
}

export function showSetupState() {
  showState(
    "setup",
    `<div class="state-box">
       <div class="state-ico warn"><i data-lucide="shield"></i></div>
       <p class="state-title">Connect your Firebase project</p>
       <p class="state-text">
         This app stores every rupee in Firebase Realtime Database. Add your project
         credentials once and the dashboard will start loading live data.
       </p>
       <ol class="state-steps">
         <li>Create a project at <strong>console.firebase.google.com</strong></li>
         <li>Enable <strong>Realtime Database</strong> and <strong>Authentication &rsaquo; Email/Password</strong></li>
         <li>Copy the web app config into <code>js/firebase.js</code></li>
         <li>Paste the security rules from <code>firebase-rules.json</code></li>
       </ol>
       <div class="state-actions">
         <a class="btn btn-primary" href="https://console.firebase.google.com/" target="_blank" rel="noopener">
           <i data-lucide="external-link"></i> Open Firebase console
         </a>
         <a class="btn btn-outline" href="README.md">Read setup guide</a>
       </div>
     </div>`
  );
}

/* ------------------------------ Toasts ------------------------------ */

const TOAST_ICONS = { success: "circle-check", error: "circle-alert", warn: "alert-triangle", info: "info" };

export function toast(message, type = "success", detail = "") {
  const root = document.getElementById("toast-root");
  if (!root) return;
  while (root.children.length >= 3) root.removeChild(root.firstElementChild);

  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.setAttribute("role", type === "error" ? "alert" : "status");
  el.innerHTML = `
    <span class="toast-ico"><i data-lucide="${TOAST_ICONS[type] || TOAST_ICONS.info}"></i></span>
    <span class="toast-msg">${esc(message)}${detail ? `<small>${esc(detail)}</small>` : ""}</span>
    <button class="toast-close" type="button" aria-label="Dismiss notification">
      <i data-lucide="x" class="lucide-sm"></i>
    </button>`;
  root.appendChild(el);
  refreshIcons(el);

  const remove = () => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 240);
  };
  el.querySelector(".toast-close").addEventListener("click", remove);
  setTimeout(remove, 4200);
}

/* ------------------------------ Modals ------------------------------ */

const modalStack = [];
let modalSeq = 0;

export function openModal({ title = "", subtitle = "", body = "", footer = "", size = "" } = {}) {
  const id = `modal-title-${++modalSeq}`;
  const trigger = document.activeElement;

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="${id}">
      <div class="modal-head">
        <div>
          <h2 class="modal-title" id="${id}">${title}</h2>
          ${subtitle ? `<p class="modal-sub">${subtitle}</p>` : ""}
        </div>
        <button class="icon-btn modal-close" type="button" aria-label="Close dialog">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ""}
    </div>`;

  document.getElementById("modal-root")?.appendChild(backdrop);
  refreshIcons(backdrop);

  const bodyEl = backdrop.querySelector(".modal-body");
  const footEl = backdrop.querySelector(".modal-foot");

  const close = () => {
    const index = modalStack.findIndex((m) => m.backdrop === backdrop);
    if (index === -1) return;
    modalStack.splice(index, 1);
    backdrop.remove();
    if (!modalStack.length) document.body.style.overflow = "";
    if (trigger && typeof trigger.focus === "function") trigger.focus();
  };

  const entry = { backdrop, close };
  modalStack.push(entry);
  document.body.style.overflow = "hidden";

  backdrop.querySelector(".modal-close").addEventListener("click", close);
  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) close();
  });

  const focusable = backdrop.querySelector(
    "input:not([type=hidden]), select, textarea, button:not(.modal-close), [href]"
  );
  (focusable || backdrop.querySelector(".modal")).focus?.();

  return { el: backdrop, body: bodyEl, footer: footEl, close };
}

export function closeTopModal() {
  modalStack[modalStack.length - 1]?.close();
}

export function closeAllModals() {
  [...modalStack].forEach((m) => m.close());
}

document.addEventListener("keydown", (e) => {
  const top = modalStack[modalStack.length - 1];
  if (!top) return;
  if (e.key === "Escape") {
    e.preventDefault();
    top.close();
    return;
  }
  if (e.key === "Tab") {
    const nodes = Array.from(
      top.backdrop.querySelectorAll(
        'a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((n) => n.offsetParent !== null);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!top.backdrop.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  }
});

/**
 * Accessible confirmation dialog.
 * Resolves with { ok: boolean, values: object } where values contains any
 * named inputs inside the dialog (e.g. payment method).
 */
export function confirmDialog({
  heading = "Are you sure?",
  message = "",
  amount = null,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  icon = "alert-triangle",
  extra = "",
} = {}) {
  return new Promise((resolve) => {
    const modal = openModal({
      title: "",
      size: "modal-sm",
      body: `
        <div class="confirm-body">
          <div class="confirm-icon ${tone === "warn" ? "warn" : "danger"}"><i data-lucide="${icon}"></i></div>
          <h3>${esc(heading)}</h3>
          <p>${esc(message)}</p>
          ${amount !== null ? `<div class="amount-callout">${formatCurrency(amount)}</div>` : ""}
          ${extra}
        </div>`,
      footer: `
        <button class="btn btn-outline" type="button" data-act="cancel">${esc(cancelLabel)}</button>
        <button class="btn ${tone === "warn" ? "btn-primary" : "btn-danger"}" type="button" data-act="ok">${esc(confirmLabel)}</button>`,
    });

    const collect = () => {
      const values = {};
      modal.body.querySelectorAll("[name]").forEach((field) => {
        values[field.name] = field.value;
      });
      return values;
    };

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      modal.close();
      resolve(result);
    };

    modal.footer.querySelector('[data-act="cancel"]').addEventListener("click", () => finish({ ok: false, values: {} }));
    modal.footer.querySelector('[data-act="ok"]').addEventListener("click", () => finish({ ok: true, values: collect() }));
    modal.el.addEventListener("click", (e) => {
      if (e.target === modal.el) finish({ ok: false, values: {} });
    });
  });
}

/* ------------------------------ Empty state ------------------------------ */

export function emptyState({ icon = "inbox", title, text, action = "" }) {
  return `
    <div class="empty">
      <div class="empty-ico"><i data-lucide="${icon}"></i></div>
      <p class="empty-title">${esc(title)}</p>
      ${text ? `<p class="empty-text">${esc(text)}</p>` : ""}
      ${action}
    </div>`;
}

/* ------------------------------ Boot ------------------------------ */

/**
 * Standard page start: shell -> auth -> realtime store -> render loop.
 * Returns an unsubscribe function, or null when the page cannot proceed.
 */
export async function boot({ page, render } = {}) {
  const pageKey = page || document.body.dataset.page || "dashboard";
  const pageTitle = document.querySelector(".page-title")?.textContent?.trim() || "";

  initTheme();
  initShell(pageKey, pageTitle);

  const allowed = await requireAuth();
  if (!allowed) return null;

  if (!isFirebaseConfigured) {
    showSetupState();
    return null;
  }

  startStore();
  showLoadingState();

  const unsubscribe = onStoreChange((store) => {
    if (store.status === "loading") {
      showLoadingState();
      return;
    }
    if (store.status === "error") {
      showErrorState();
      return;
    }

    hideState();
    updateShellFromStore(store.data);
    try {
      render(store);
    } catch (error) {
      console.error("[Render] failed:", error);
    }
    refreshIcons();
  });

  onAuthChange((user) => updateAuthUI(user));

  return unsubscribe;
}

/* ------------------------------ Shell live updates ------------------------------ */

function updateAuthUI(user) {
  const foot = document.getElementById("sidebar-foot");
  const logoutBtn = document.getElementById("logout-btn");
  if (!isAuthEnabled()) return;

  if (user) {
    if (foot) {
      foot.hidden = false;
      const email = user.email || "Organizer";
      document.getElementById("user-mail").textContent = email;
      document.getElementById("user-name").textContent = email.split("@")[0];
      document.getElementById("user-avatar").textContent = (email[0] || "?").toUpperCase();
    }
    if (logoutBtn) logoutBtn.hidden = false;
  }
}

function updateShellFromStore(data) {
  const settings = data.settings || {};
  const name = settings.eventName || "Navratri Mahotsav";
  const year = settings.eventYear ? ` \u00B7 ${settings.eventYear}` : "";

  const brandName = document.getElementById("brand-name");
  const brandEvent = document.getElementById("brand-event");
  if (brandName) brandName.textContent = "Navratri Management";
  if (brandEvent) brandEvent.textContent = `${name}${year}`;

  const pendingCount = toArray(data.pendingPayments).filter(isPromisePending).length;
  const badge = document.getElementById("nav-badge-pending");
  if (badge) {
    badge.hidden = pendingCount === 0;
    badge.textContent = String(pendingCount);
  }
}
