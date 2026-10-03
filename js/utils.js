/* =========================================================
   utils.js — formatting, validation, CSV, small helpers
   ========================================================= */

/* ------------------------------ Currency ------------------------------ */

const numberFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** ₹1,25,000 — Indian digit grouping. Negative values render as -₹5,000. */
export function formatCurrency(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "\u20B90";
  const rounded = Math.round(value);
  const formatted = "\u20B9" + numberFormat.format(Math.abs(rounded));
  return rounded < 0 ? `-${formatted}` : formatted;
}

/** 1,25,000 — without the currency symbol (for inputs). */
export function formatNumber(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "0";
  return numberFormat.format(Math.round(value));
}

/** "+ ₹5,000" / "- ₹1,200" */
export function formatSignedCurrency(amount, isPositive) {
  const sign = isPositive ? "+" : "-";
  return `${sign} ${formatCurrency(Math.abs(amount))}`;
}

/* ------------------------------ Dates ------------------------------ */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const pad = (n) => String(n).padStart(2, "0");

/** Parse 'YYYY-MM-DD' into a local date (no timezone shifting). */
export function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const str = String(value);
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 03 Oct 2026 */
export function formatDate(value) {
  const d = parseDate(value);
  if (!d) return "\u2014";
  return `${pad(d.getDate())} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** 03 October 2026 */
export function formatDateLong(value) {
  const d = parseDate(value);
  if (!d) return "\u2014";
  return `${pad(d.getDate())} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** 6:15 PM — locale independent, identical in every browser. */
function timeOfDay(d) {
  const hour = d.getHours();
  return `${(hour % 12) || 12}:${pad(d.getMinutes())} ${hour < 12 ? "AM" : "PM"}`;
}

/** Today, 10:30 AM / Yesterday, 6:15 PM / 02 Oct 2026, 6:15 PM */
export function formatDateTime(timestamp) {
  if (!timestamp) return "\u2014";
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "\u2014";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 86400000;
  const time = timeOfDay(d);
  const day = d.getTime();
  if (day >= startOfToday && day < startOfToday + dayMs) return `Today, ${time}`;
  if (day >= startOfToday - dayMs && day < startOfToday) return `Yesterday, ${time}`;
  return `${formatDate(d)}, ${time}`;
}

/** 03 Oct 2026, 10:30 AM (from a timestamp) */
export function formatTimestamp(timestamp) {
  if (!timestamp) return "\u2014";
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "\u2014";
  return `${formatDate(d)}, ${timeOfDay(d)}`;
}

/** 'YYYY-MM-DD' for today (for <input type="date"> defaults). */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isValidDateString(value) {
  if (!value) return false;
  const d = parseDate(value);
  if (!d) return false;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  return d.getFullYear() === Number(match[1]) && d.getMonth() === Number(match[2]) - 1 && d.getDate() === Number(match[3]);
}

/* ------------------------------ Validation ------------------------------ */

/** Returns an error message string, or null when valid. */
export const validators = {
  required: (label) => (value) =>
    String(value ?? "").trim() ? null : `${label} cannot be empty.`,

  amount: (label = "Amount") => (value) => {
    if (String(value ?? "").trim() === "") return `${label} is required.`;
    const n = Number(String(value).replace(/[, ]/g, ""));
    if (!Number.isFinite(n)) return `${label} must be a number.`;
    if (n <= 0) return `${label} must be greater than 0.`;
    return null;
  },

  /** Accepts optional Indian mobile numbers: 9876543210, +91 98765 43210, 09876543210 */
  phone: () => (value) => {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    if (!/^[+\d][\d\s\-()]{5,18}$/.test(raw)) return "Enter a valid phone number.";
    let digits = raw.replace(/\D/g, "");
    if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
    if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
    if (digits.length !== 10) return "Enter a valid 10-digit Indian phone number.";
    if (!/^[6-9]\d{9}$/.test(digits)) return "Enter a valid 10-digit Indian phone number.";
    return null;
  },

  date: (label = "Date") => (value) => {
    if (!value) return null;
    return isValidDateString(value) ? null : `${label} must be a valid date.`;
  },
};

/** Parse an amount input into a positive number, or NaN. */
export function toAmount(value) {
  const n = Number(String(value ?? "").replace(/[, \u20B9]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

/* ------------------------------ DOM helpers ------------------------------ */

export const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function debounce(fn, wait = 200) {
  let timer;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

/** Re-run lucide.createIcons() after injecting markup. */
export function refreshIcons(root = document) {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    try {
      window.lucide.createIcons({ attrs: { "aria-hidden": "true" } });
    } catch (error) {
      console.warn("[Icons]", error);
    }
  }
}

export const plural = (count, singular, pluralWord = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralWord}`;

export const initials = (name) =>
  String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ? part[0].toUpperCase() : "")
    .join("") || "?";

/* ------------------------------ CSV export ------------------------------ */

function csvCell(value) {
  const str = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function toCSV(headers, rows) {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return lines.join("\r\n");
}

export function downloadCSV(filename, headers, rows) {
  const csv = toCSV(headers, rows);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ------------------------------ List helpers ------------------------------ */

/** Convert an RTDB object map into an array of records with their keys. */
export function toArray(map) {
  if (!map) return [];
  if (Array.isArray(map)) return map.filter(Boolean);
  return Object.entries(map)
    .filter(([, value]) => value && typeof value === "object")
    .map(([key, value]) => ({ ...value, id: value.id || key }));
}

export function sumBy(list, selector) {
  return list.reduce((total, item) => total + (Number(selector(item)) || 0), 0);
}
