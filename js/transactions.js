/* =========================================================
   transactions.js — combined chronological transaction history
   ========================================================= */

import { boot, emptyState } from "./ui.js";
import { openCollectionDetail, openExpenseDetail, openPendingDetail } from "./records.js";
import { exportTransactions } from "./exports.js";
import { buildTransactions, groupByDay, dayNet, TX_FILTERS, calcSummary } from "./calcs.js";
import { getStoreData } from "./db.js";
import {
  toArray,
  formatCurrency,
  formatSignedCurrency,
  formatDate,
  formatDateTime,
  esc,
  refreshIcons,
  debounce,
} from "./utils.js";

/* ------------------------------ State ------------------------------ */

const filters = { q: "", type: "All" };
let transactions = [];

const matchesType = (tx) =>
  filters.type === "All" ||
  (filters.type === "Collections" && tx.type === "collection") ||
  (filters.type === "Expenses" && tx.type === "expense") ||
  (filters.type === "Pending" && tx.type === "pending");

function visibleTransactions() {
  const q = filters.q.trim().toLowerCase();
  if (!q) return transactions.filter(matchesType);
  return transactions.filter(
    (tx) =>
      matchesType(tx) &&
      `${tx.title} ${tx.subtitle} ${tx.record?.phone || ""} ${tx.record?.notes || ""}`.toLowerCase().includes(q)
  );
}

/* ------------------------------ Stats ------------------------------ */

function renderStats() {
  const summary = calcSummary(getStoreData());
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  const net = summary.totalCollected - summary.totalExpenses;

  set("tx-in", formatCurrency(summary.totalCollected));
  set("tx-in-meta", `${summary.paidContributorCount} collection records`);
  set("tx-out", formatCurrency(summary.totalExpenses));
  set("tx-out-meta", `${summary.expenseCount} expense records`);
  set("tx-net", formatCurrency(net));
  const netEl = document.getElementById("tx-net");
  if (netEl) netEl.classList.toggle("negative", net < 0);
  set("tx-net-meta", net < 0 ? "Spending exceeds collections" : "In minus out");
}

/* ------------------------------ Rows ------------------------------ */

function txRow(tx) {
  const wait = tx.direction === "wait";
  const dirClass = tx.direction === "in" ? "in" : tx.direction === "out" ? "out" : "wait";
  const icon = tx.direction === "in" ? "arrow-down-left" : tx.direction === "out" ? "arrow-up-right" : "hourglass";
  const typeLabel =
    tx.type === "collection"
      ? wait
        ? "Pending collection"
        : "Collection"
      : tx.type === "expense"
        ? "Expense"
        : tx.settled
          ? "Pending received"
          : "Promise";
  const time = tx.record.createdAt ? formatDateTime(tx.record.createdAt) : tx.dateKey ? formatDate(tx.dateKey) : "";
  const amount = wait ? formatCurrency(tx.amount) : formatSignedCurrency(tx.amount, tx.direction === "in");

  return `
    <button class="tx-row" type="button" data-open="${tx.type}:${esc(tx.id)}">
      <span class="tx-sign ${dirClass}"><i data-lucide="${icon}"></i></span>
      <span class="tx-main">
        <span class="tx-title">${esc(tx.title)}</span>
        <span class="tx-sub">${typeLabel}<span aria-hidden="true">&middot;</span>${esc(tx.subtitle)}</span>
      </span>
      <span class="tx-time">${esc(time)}</span>
      <span class="tx-amt ${dirClass}">${amount}</span>
    </button>`;
}

function renderList() {
  const visible = visibleTransactions();
  const list = document.getElementById("tx-list");
  const resultCount = document.getElementById("result-count");
  if (resultCount) resultCount.textContent = transactions.length ? `${visible.length} of ${transactions.length} entries` : "";

  if (!list) return;

  if (!visible.length) {
    list.innerHTML = emptyState({
      icon: transactions.length ? "search" : "arrow-left-right",
      title: transactions.length ? "No transactions match this filter." : "No transactions yet.",
      text: transactions.length
        ? "Change the filter or clear the search."
        : "Collections and expenses appear here the moment they are recorded.",
      action: transactions.length
        ? '<button class="btn btn-outline" type="button" data-action="clear">Clear filters</button>'
        : "",
    });
    refreshIcons(list);
    return;
  }

  const groups = groupByDay(visible);
  list.innerHTML = groups
    .map((group) => {
      const net = dayNet(group.items);
      const heading = group.date ? formatDate(group.date) : "Undated";
      return `
        <section class="tx-group">
          <h2 class="tx-date">
            <span>${esc(heading)}</span>
            <span class="tx-day-total">Net ${
              net === 0 ? formatCurrency(0) : formatSignedCurrency(net, net > 0)
            }</span>
          </h2>
          <div class="tx-card">${group.items.map(txRow).join("")}</div>
        </section>`;
    })
    .join("");
  refreshIcons(list);
}

function render() {
  const data = getStoreData();
  transactions = buildTransactions(data);

  const box = document.getElementById("filters");
  if (box) {
    box.innerHTML = TX_FILTERS.map((type) => {
      const count = transactions.filter((tx) =>
        type === "All"
          ? true
          : type === "Collections"
            ? tx.type === "collection"
            : type === "Expenses"
              ? tx.type === "expense"
              : tx.type === "pending"
      ).length;
      return `<button class="chip${filters.type === type ? " active" : ""}" type="button" data-type="${type}"
                aria-pressed="${filters.type === type}">${type}<span class="chip-count">${count}</span></button>`;
    }).join("");
  }

  renderStats();
  renderList();
}

/* ------------------------------ Wiring ------------------------------ */

function openTransaction(type, id) {
  const data = getStoreData();
  const map = {
    collection: [data.contributors, openCollectionDetail],
    expense: [data.expenses, openExpenseDetail],
    pending: [data.pendingPayments, openPendingDetail],
  };
  const [source, opener] = map[type] || [];
  const record = source ? toArray(source).find((r) => r.id === id) : null;
  if (record) opener(record);
}

function wire() {
  document.getElementById("btn-export")?.addEventListener("click", exportTransactions);

  const search = document.getElementById("search");
  search?.addEventListener(
    "input",
    debounce(() => {
      filters.q = search.value;
      renderList();
    }, 180)
  );

  document.getElementById("filters")?.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-type]");
    if (!chip) return;
    filters.type = chip.dataset.type;
    renderList();
  });

  document.getElementById("page-content")?.addEventListener("click", (event) => {
    const clear = event.target.closest('[data-action="clear"]');
    if (clear) {
      filters.q = "";
      filters.type = "All";
      if (search) search.value = "";
      render();
      return;
    }
    const target = event.target.closest("[data-open]");
    if (!target) return;
    const [type, id] = target.dataset.open.split(":");
    openTransaction(type, id);
  });
}

/* ------------------------------ Boot ------------------------------ */

wire();

boot({ page: "transactions", render });
