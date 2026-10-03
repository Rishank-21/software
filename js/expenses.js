/* =========================================================
   expenses.js — Expenses page
   ========================================================= */

import { boot, emptyState } from "./ui.js";
import {
  openExpenseForm,
  openExpenseDetail,
  removeExpense,
} from "./records.js";
import { exportExpenses } from "./exports.js";
import { CATEGORIES } from "./calcs.js";
import { getStoreData } from "./db.js";
import {
  toArray,
  formatCurrency,
  formatDate,
  esc,
  refreshIcons,
  debounce,
} from "./utils.js";

/* ------------------------------ State ------------------------------ */

const filters = { q: "", category: "All", from: "", to: "" };
let records = [];
let pendingOpenId = null;

const matchesCategory = (record, category) =>
  category === "All" || String(record.category || "Other") === category;

function visibleRecords() {
  const q = filters.q.trim().toLowerCase();
  return records.filter((record) => {
    if (q) {
      const haystack = [
        record.title,
        record.category,
        record.paidBy,
        record.description,
        record.notes,
        ...(Array.isArray(record.peopleInvolved) ? record.peopleInvolved : []),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (!matchesCategory(record, filters.category)) return false;
    if (filters.from && (!record.date || record.date < filters.from))
      return false;
    if (filters.to && (!record.date || record.date > filters.to)) return false;
    return true;
  });
}

/* ------------------------------ Filters UI ------------------------------ */

function renderChips() {
  const box = document.getElementById("filters");
  if (!box) return;
  const customCategories = records
    .map((record) => String(record.category || "Other").trim())
    .filter((category) => category && !CATEGORIES.includes(category));
  const options = ["All", ...CATEGORIES, ...new Set(customCategories)];
  box.innerHTML = options
    .map((category) => {
      const count = records.filter((r) => matchesCategory(r, category)).length;
      return `<button class="chip${filters.category === category ? " active" : ""}" type="button"
                data-category="${esc(category)}" aria-pressed="${filters.category === category}">
                ${esc(category)}<span class="chip-count">${count}</span></button>`;
    })
    .join("");
}

/* ------------------------------ Table ------------------------------ */

function peopleCell(people) {
  if (!people.length) return '<span class="text-muted">\u2014</span>';
  const shown = people
    .slice(0, 2)
    .map((p) => `<span class="badge">${esc(p)}</span>`)
    .join(" ");
  const extra =
    people.length > 2
      ? ` <span class="text-muted">+${people.length - 2}</span>`
      : "";
  return `<span class="row">${shown}${extra}</span>`;
}

function rowHTML(record) {
  const people = Array.isArray(record.peopleInvolved)
    ? record.peopleInvolved
    : [];
  return `
    <tr data-id="${esc(record.id)}">
      <td data-label="Expense" class="cell-main row-link">${esc(record.title || "\u2014")}${
        record.description
          ? `<span class="cell-sub">${esc(record.description)}</span>`
          : ""
      }</td>
      <td data-label="Category"><span class="badge badge-info"><i data-lucide="tag"></i>${esc(record.category || "Other")}</span></td>
      <td data-label="Amount" class="num">${formatCurrency(record.amount)}</td>
      <td data-label="Paid By">${esc(record.paidBy || "\u2014")}</td>
      <td data-label="People Involved">${peopleCell(people)}</td>
      <td data-label="Date" class="nowrap">${record.date ? formatDate(record.date) : "\u2014"}</td>
      <td data-label="Actions" class="num no-label">
        <span class="actions">
          <button class="btn-icon" type="button" data-action="view" aria-label="View ${esc(record.title)}" title="View">
            <i data-lucide="eye"></i>
          </button>
          <button class="btn-icon" type="button" data-action="edit" aria-label="Edit ${esc(record.title)}" title="Edit">
            <i data-lucide="pencil"></i>
          </button>
          <button class="btn-icon danger" type="button" data-action="delete" aria-label="Delete ${esc(record.title)}" title="Delete">
            <i data-lucide="trash-2"></i>
          </button>
        </span>
      </td>
    </tr>`;
}

function emptyHTML() {
  if (!records.length) {
    return emptyState({
      icon: "receipt",
      title: "No expenses recorded yet.",
      text: "Record your first expense to see where the money is going.",
      action:
        '<button class="btn btn-primary" type="button" data-action="add"><i data-lucide="plus"></i> Add Expense</button>',
    });
  }
  return emptyState({
    icon: "search",
    title: "No expenses match your filters.",
    text: "Try another category, search term or date range.",
    action:
      '<button class="btn btn-outline" type="button" data-action="clear">Clear filters</button>',
  });
}

function render() {
  const data = getStoreData();
  records = toArray(data.expenses).sort(
    (a, b) =>
      String(b.date || "").localeCompare(String(a.date || "")) ||
      (b.createdAt || 0) - (a.createdAt || 0),
  );

  if (pendingOpenId) {
    const target = records.find((r) => r.id === pendingOpenId);
    pendingOpenId = null;
    if (target) openExpenseDetail(target);
  }

  renderChips();

  const visible = visibleRecords();
  const body = document.getElementById("expenses-body");
  const table = document.getElementById("expenses-table");
  const emptyBox = document.getElementById("expenses-empty");
  const foot = document.getElementById("expenses-foot");

  const hasFilters = Boolean(
    filters.q || filters.category !== "All" || filters.from || filters.to,
  );
  const resultCount = document.getElementById("result-count");
  if (resultCount)
    resultCount.textContent = records.length
      ? `${visible.length} of ${records.length} records`
      : "";

  if (!visible.length) {
    body.innerHTML = "";
    table.parentElement.hidden = true;
    emptyBox.hidden = false;
    emptyBox.innerHTML = emptyHTML();
    foot.hidden = true;
    refreshIcons(emptyBox);
    return;
  }

  table.parentElement.hidden = false;
  emptyBox.hidden = true;
  foot.hidden = false;
  body.innerHTML = visible.map(rowHTML).join("");

  document.getElementById("foot-count").textContent =
    `${visible.length} expense${visible.length === 1 ? "" : "s"}${
      hasFilters ? " (filtered)" : ""
    }`;
  document.getElementById("foot-sum").textContent = formatCurrency(
    visible.reduce((total, r) => total + (Number(r.amount) || 0), 0),
  );
  refreshIcons(body);
}

/* ------------------------------ Wiring ------------------------------ */

const findById = (id) => records.find((r) => r.id === id);

function wire() {
  document
    .getElementById("btn-add")
    ?.addEventListener("click", () => openExpenseForm());
  document
    .getElementById("btn-export")
    ?.addEventListener("click", exportExpenses);

  const search = document.getElementById("search");
  search?.addEventListener(
    "input",
    debounce(() => {
      filters.q = search.value;
      render();
    }, 180),
  );

  document.getElementById("filters")?.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-category]");
    if (!chip) return;
    filters.category = chip.dataset.category;
    render();
  });

  const from = document.getElementById("date-from");
  const to = document.getElementById("date-to");
  from?.addEventListener("change", () => {
    filters.from = from.value;
    render();
  });
  to?.addEventListener("change", () => {
    filters.to = to.value;
    render();
  });
  document.getElementById("date-clear")?.addEventListener("click", () => {
    filters.from = "";
    filters.to = "";
    if (from) from.value = "";
    if (to) to.value = "";
    render();
  });

  const clearFilters = () => {
    filters.q = "";
    filters.category = "All";
    filters.from = "";
    filters.to = "";
    if (search) search.value = "";
    if (from) from.value = "";
    if (to) to.value = "";
    render();
  };

  document
    .getElementById("page-content")
    ?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      const row = event.target.closest("tr[data-id]");
      const record = button && row ? findById(row.dataset.id) : null;

      if (button?.dataset.action === "clear") return clearFilters();
      if (button?.dataset.action === "add") return openExpenseForm();
      if (record) {
        const action = button?.dataset.action || "view";
        if (action === "view") openExpenseDetail(record);
        if (action === "edit") openExpenseForm(record);
        if (action === "delete") removeExpense(record);
        return;
      }
      if (row) openExpenseDetail(findById(row.dataset.id));
    });
}

/* ------------------------------ Boot ------------------------------ */

wire();

boot({ page: "expenses", render }).then((unsubscribe) => {
  if (!unsubscribe) return;

  const params = new URLSearchParams(window.location.search);
  const query = params.get("q");
  const openId = params.get("open");

  if (query) {
    const search = document.getElementById("search");
    if (search) {
      search.value = query;
      filters.q = query;
      render();
    }
  }
  if (openId) pendingOpenId = openId;
});
