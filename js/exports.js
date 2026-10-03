/* =========================================================
   exports.js — CSV generation for every record type
   -------------------------------------------------------
   All files are generated in the browser; no backend needed.
   ========================================================= */

import { toArray, downloadCSV } from "./utils.js";
import { getStoreData } from "./db.js";
import { toast } from "./ui.js";

const peopleOf = (value) => (Array.isArray(value) ? value.join("; ") : "");

function download(name, headers, rows, label) {
  if (!rows.length) {
    toast("Nothing to export yet.", "warn", "Add some records first.");
    return false;
  }
  downloadCSV(name, headers, rows);
  toast(`${label} CSV downloaded.`, "success", `${rows.length} record${rows.length === 1 ? "" : "s"} exported.`);
  return true;
}

export function exportCollections() {
  const rows = toArray(getStoreData().contributors);
  return download(
    "navratri-collections.csv",
    ["Name", "Phone", "Amount", "Payment Method", "Status", "Date", "Notes"],
    rows.map((r) => [r.name, r.phone, r.amount, r.paymentMethod, r.paymentStatus, r.date, r.notes]),
    "Collections"
  );
}

export function exportExpenses() {
  const rows = toArray(getStoreData().expenses);
  return download(
    "navratri-expenses.csv",
    ["Expense", "Category", "Amount", "Paid By", "People Involved", "Date", "Payment Method", "Notes"],
    rows.map((r) => [r.title, r.category, r.amount, r.paidBy, peopleOf(r.peopleInvolved), r.date, r.paymentMethod, r.notes]),
    "Expenses"
  );
}

export function exportPending() {
  const rows = toArray(getStoreData().pendingPayments);
  return download(
    "navratri-pending-payments.csv",
    ["Name", "Phone", "Amount", "Expected Date", "Status", "Notes"],
    rows.map((r) => [r.name, r.phone, r.promisedAmount, r.expectedDate, r.status, r.notes]),
    "Pending payments"
  );
}

export function exportTransactions() {
  const data = getStoreData();
  const rows = [];

  for (const c of toArray(data.contributors)) {
    rows.push([c.date, "Collection", c.name, c.paymentMethod, c.paymentStatus, c.amount, c.notes]);
  }
  for (const e of toArray(data.expenses)) {
    rows.push([e.date, "Expense", e.title, e.category, e.paidBy, e.amount, e.notes]);
  }
  for (const p of toArray(data.pendingPayments)) {
    rows.push([p.dateAdded || p.expectedDate, "Pending Payment", p.name, p.phone, p.status, p.promisedAmount, p.notes]);
  }
  rows.sort((a, b) => String(b[0] || "").localeCompare(String(a[0] || "")));

  return download(
    "navratri-transactions.csv",
    ["Date", "Type", "Name / Title", "Detail", "Status / Paid By", "Amount", "Notes"],
    rows,
    "Transactions"
  );
}

/** One combined file: every record, every column, in one sheet. */
export function exportFullReport() {
  const data = getStoreData();
  const rows = [];

  for (const c of toArray(data.contributors)) {
    rows.push(["Collection", c.date, c.name, c.phone || "", "", c.amount, c.paymentMethod || "", c.paymentStatus || "", peopleOf(""), c.notes || ""]);
  }
  for (const e of toArray(data.expenses)) {
    rows.push(["Expense", e.date, e.title, "", e.category || "", e.amount, e.paymentMethod || "", e.paidBy || "", peopleOf(e.peopleInvolved), e.notes || ""]);
  }
  for (const p of toArray(data.pendingPayments)) {
    rows.push(["Pending Payment", p.dateAdded || p.expectedDate || "", p.name, p.phone || "", "", p.promisedAmount, "", p.status || "", "", p.notes || ""]);
  }
  rows.sort((a, b) => String(b[1] || "").localeCompare(String(a[1] || "")));

  return download(
    "navratri-full-report.csv",
    ["Record Type", "Date", "Name / Title", "Phone", "Category", "Amount", "Payment Method", "Status / Paid By", "People Involved", "Notes"],
    rows,
    "Full report"
  );
}
