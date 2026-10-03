/* =========================================================
   summary.js — Financial Summary + printable report
   ========================================================= */

import { boot } from "./ui.js";
import { calcSummary, expenseByCategory, isPromisePending } from "./calcs.js";
import { exportFullReport } from "./exports.js";
import { getStoreData } from "./db.js";
import {
  toArray,
  formatCurrency,
  formatDate,
  formatDateLong,
  todayISO,
  esc,
  refreshIcons,
} from "./utils.js";

/* ------------------------------ Small builders ------------------------------ */

const row = (icon, label, value, cls = "") => `
  <div class="summary-row">
    <span class="sr-label"><i data-lucide="${icon}"></i>${label}</span>
    <span class="sr-value ${cls}">${value}</span>
  </div>`;

const setHTML = (id, html) => {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
};

/* ------------------------------ Printable report ------------------------------ */

function buildPrintReport(data, summary) {
  const settings = data.settings || {};
  const collections = toArray(data.contributors).sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || ""))
  );
  const expenses = toArray(data.expenses).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const promises = toArray(data.pendingPayments).sort((a, b) =>
    String(b.dateAdded || "").localeCompare(String(a.dateAdded || ""))
  );

  const totals = [
    ["Total Collected", formatCurrency(summary.totalCollected)],
    ["Total Expenses", formatCurrency(summary.totalExpenses)],
    ["Remaining Balance", formatCurrency(summary.balance)],
    ["Pending Payments", formatCurrency(summary.pendingAmount)],
    ["Contributors", String(summary.contributorCount)],
    ["Expense Records", String(summary.expenseCount)],
    ["Pending Records", String(summary.pendingPromiseCount)],
  ]
    .map(([label, value]) => `<tr><td>${label}</td><td>${value}</td></tr>`)
    .join("");

  const section = (title, head, rows) => `
    <section class="print-section">
      <h2>${title}</h2>
      <table class="print-table">
        <thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;

  const collectionRows = collections.length
    ? collections
        .map(
          (r) =>
            `<tr><td>${esc(r.name || "")}</td><td>${esc(r.phone || "")}</td><td>${esc(r.paymentMethod || "")}</td>
             <td>${esc(r.paymentStatus || "")}</td><td>${formatDate(r.date)}</td><td>${formatCurrency(r.amount)}</td></tr>`
        )
        .join("")
    : '<tr><td colspan="6">No collections recorded.</td></tr>';

  const expenseRows = expenses.length
    ? expenses
        .map(
          (r) =>
            `<tr><td>${esc(r.title || "")}</td><td>${esc(r.category || "")}</td><td>${esc(r.paidBy || "")}</td>
             <td>${formatDate(r.date)}</td><td>${esc(r.paymentMethod || "")}</td><td>${formatCurrency(r.amount)}</td></tr>`
        )
        .join("")
    : '<tr><td colspan="6">No expenses recorded.</td></tr>';

  const pendingRows = promises.length
    ? promises
        .map(
          (r) =>
            `<tr><td>${esc(r.name || "")}</td><td>${esc(r.phone || "")}</td><td>${formatDate(r.expectedDate)}</td>
             <td>${isPromisePending(r) ? "Pending" : "Paid"}</td><td>${formatCurrency(r.promisedAmount)}</td></tr>`
        )
        .join("")
    : '<tr><td colspan="5">No pending payments.</td></tr>';

  return `
    <div class="print-head">
      <h1>NAVRATRI FINANCIAL REPORT</h1>
      <p><strong>${esc(settings.eventName || "Navratri Mahotsav")}</strong>${
        settings.eventYear ? ` &middot; ${esc(settings.eventYear)}` : ""
      }</p>
      <p>Generated on ${formatDateLong(todayISO())}${
        settings.organizerName ? ` &middot; Organised by ${esc(settings.organizerName)}` : ""
      }</p>
    </div>

    <table class="print-totals">${totals}</table>

    ${section("Collections", ["Name", "Phone", "Method", "Status", "Date", "Amount"], collectionRows)}
    ${section("Expenses", ["Expense", "Category", "Paid By", "Date", "Method", "Amount"], expenseRows)}
    ${section("Pending Payments", ["Name", "Phone", "Expected Date", "Status", "Amount"], pendingRows)}`;
}

/* ------------------------------ Render ------------------------------ */

function render(store) {
  const data = store.data;
  const summary = calcSummary(data);
  const categories = expenseByCategory(data.expenses);
  const settings = data.settings || {};

  /* --- stat cards --- */
  setHTML("sum-collected", formatCurrency(summary.totalCollected));
  setHTML("sum-collected-meta", `${summary.paidContributorCount} paid contributions`);

  setHTML("sum-expenses", formatCurrency(summary.totalExpenses));
  setHTML(
    "sum-expenses-meta",
    summary.totalCollected > 0 ? `${summary.spentRatio.toFixed(1)}% of collection used` : `${summary.expenseCount} records`
  );

  const balanceEl = document.getElementById("sum-balance");
  if (balanceEl) {
    balanceEl.textContent = formatCurrency(summary.balance);
    balanceEl.classList.toggle("negative", summary.balance < 0);
  }
  setHTML(
    "sum-balance-meta",
    summary.balance < 0
      ? '<span class="deficit-note">Deficit &mdash; overspent</span>'
      : "Collected \u2212 Expenses"
  );

  setHTML("sum-pending", formatCurrency(summary.pendingAmount));
  setHTML(
    "sum-pending-meta",
    `${formatCurrency(summary.pendingFromPromises)} promised + ${formatCurrency(summary.pendingFromCollections)} unpaid`
  );

  setHTML(
    "summary-sub",
    `${settings.eventName || "Navratri Mahotsav"}${settings.eventYear ? ` \u00B7 ${settings.eventYear}` : ""} \u2014 everything calculated live from your records.`
  );

  /* --- detailed breakdown --- */
  setHTML(
    "summary-list",
    [
      row("wallet", "Total Collected", formatCurrency(summary.totalCollected), "pos"),
      row("receipt", "Total Expenses", formatCurrency(summary.totalExpenses)),
      row("banknote", "Current Balance", formatCurrency(summary.balance), summary.balance < 0 ? "neg" : ""),
      row("hourglass", "Pending Payments", formatCurrency(summary.pendingAmount), "warn"),
      row("users", "Number of Contributors", String(summary.contributorCount)),
      row("receipt", "Number of Expenses", String(summary.expenseCount)),
      row("clock", "Number of Pending Payments", String(summary.pendingPromiseCount)),
      row("trending-up", "Average Contribution", formatCurrency(summary.avgContribution)),
      row(
        "arrow-down-left",
        "Largest Contribution",
        summary.largestContribution
          ? `${formatCurrency(summary.largestContribution.amount)} <span class="text-muted">\u00B7 ${esc(
              summary.largestContribution.name || ""
            )}</span>`
          : "\u2014"
      ),
      row(
        "arrow-up-right",
        "Largest Expense",
        summary.largestExpense
          ? `${formatCurrency(summary.largestExpense.amount)} <span class="text-muted">\u00B7 ${esc(
              summary.largestExpense.title || ""
            )}</span>`
          : "\u2014"
      ),
    ].join("")
  );

  /* --- category bars --- */
  setHTML(
    "category-bars",
    categories.length
      ? categories
          .map(
            (c) => `
        <div class="cat-bar-row">
          <span class="cat-bar-name">${esc(c.category)}</span>
          <span class="cat-bar-track"><span class="cat-bar-fill" style="width:${c.pct.toFixed(1)}%"></span></span>
          <span class="cat-bar-val">${formatCurrency(c.amount)}</span>
          <span class="cat-bar-pct">${c.pct.toFixed(0)}%</span>
        </div>`
          )
          .join("")
      : '<p class="text-muted">No expenses recorded yet.</p>'
  );

  /* --- record counts --- */
  const promises = toArray(data.pendingPayments);
  const openPromises = promises.filter(isPromisePending).length;
  setHTML(
    "count-list",
    [
      row("users", "Contributors", `${summary.contributorCount}`),
      row("circle-check", "Contributors who paid", `${summary.paidContributorCount}`),
      row("clock", "Contributors yet to pay", `${summary.unpaidContributorCount}`),
      row("receipt", "Expenses recorded", `${summary.expenseCount}`),
      row("hourglass", "Open promises", `${openPromises}`),
      row("badge-check", "Promises settled", `${promises.length - openPromises}`),
    ].join("")
  );

  /* --- printable report --- */
  setHTML("print-report", buildPrintReport(data, summary));

  refreshIcons();
}

/* ------------------------------ Wiring ------------------------------ */

function wire() {
  document.getElementById("btn-print")?.addEventListener("click", () => {
    window.print();
  });
  document.getElementById("btn-export-all")?.addEventListener("click", exportFullReport);
}

wire();
boot({ page: "summary", render });
