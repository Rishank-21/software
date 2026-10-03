/* =========================================================
   collections.js — Collections page
   ========================================================= */

import { boot, emptyState } from "./ui.js";
import { openCollectionForm, openCollectionDetail, removeCollection } from "./records.js";
import { exportCollections } from "./exports.js";
import { COLLECTION_FILTERS, isPaid } from "./calcs.js";
import { getStoreData } from "./db.js";
import { toArray, formatCurrency, formatDate, esc, refreshIcons, debounce } from "./utils.js";

/* ------------------------------ State ------------------------------ */

const filters = { q: "", flag: "All", from: "", to: "" };
let records = [];
let pendingOpenId = null;

const matchesFlag = (record, flag) => {
  if (flag === "All") return true;
  if (flag === "Paid" || flag === "Pending") return isPaid(record) === (flag === "Paid");
  return String(record.paymentMethod || "") === flag;
};

function visibleRecords() {
  const q = filters.q.trim().toLowerCase();
  return records.filter((record) => {
    if (q) {
      const haystack = `${record.name || ""} ${record.phone || ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (!matchesFlag(record, filters.flag)) return false;
    if (filters.from && (!record.date || record.date < filters.from)) return false;
    if (filters.to && (!record.date || record.date > filters.to)) return false;
    return true;
  });
}

/* ------------------------------ Filters UI ------------------------------ */

function renderChips() {
  const box = document.getElementById("filters");
  if (!box) return;
  box.innerHTML = COLLECTION_FILTERS.map((flag) => {
    const count = records.filter((r) => matchesFlag(r, flag)).length;
    return `<button class="chip${filters.flag === flag ? " active" : ""}" type="button" data-flag="${flag}"
              aria-pressed="${filters.flag === flag}">${flag}<span class="chip-count">${count}</span></button>`;
  }).join("");
}

/* ------------------------------ Table ------------------------------ */

function statusBadge(record) {
  const paid = isPaid(record);
  return `<span class="badge ${paid ? "badge-paid" : "badge-pending"}">
            <i data-lucide="${paid ? "circle-check" : "clock"}"></i>${paid ? "Paid" : "Pending"}
          </span>`;
}

function rowHTML(record) {
  return `
    <tr data-id="${esc(record.id)}">
      <td data-label="Name" class="cell-main row-link">${esc(record.name || "\u2014")}</td>
      <td data-label="Phone">${record.phone ? esc(record.phone) : "\u2014"}</td>
      <td data-label="Amount" class="num">${formatCurrency(record.amount)}</td>
      <td data-label="Payment Method">${esc(record.paymentMethod || "\u2014")}</td>
      <td data-label="Status">${statusBadge(record)}</td>
      <td data-label="Date" class="nowrap">${record.date ? formatDate(record.date) : "\u2014"}</td>
      <td data-label="Actions" class="num no-label">
        <span class="actions">
          <button class="btn-icon" type="button" data-action="view" aria-label="View ${esc(record.name)}" title="View">
            <i data-lucide="eye"></i>
          </button>
          <button class="btn-icon" type="button" data-action="edit" aria-label="Edit ${esc(record.name)}" title="Edit">
            <i data-lucide="pencil"></i>
          </button>
          <button class="btn-icon danger" type="button" data-action="delete" aria-label="Delete ${esc(record.name)}" title="Delete">
            <i data-lucide="trash-2"></i>
          </button>
        </span>
      </td>
    </tr>`;
}

function emptyHTML() {
  if (!records.length) {
    return emptyState({
      icon: "wallet",
      title: "No collections recorded yet.",
      text: "Start by adding your first collection.",
      action: '<button class="btn btn-primary" type="button" data-action="add"><i data-lucide="plus"></i> Add Collection</button>',
    });
  }
  return emptyState({
    icon: "search",
    title: "No records match your filters.",
    text: "Try a different search term, status or date range.",
    action: '<button class="btn btn-outline" type="button" data-action="clear">Clear filters</button>',
  });
}

function render() {
  const data = getStoreData();
  records = toArray(data.contributors).sort(
    (a, b) => String(b.date || "").localeCompare(String(a.date || "")) || (b.createdAt || 0) - (a.createdAt || 0)
  );

  if (pendingOpenId) {
    const target = records.find((r) => r.id === pendingOpenId);
    pendingOpenId = null;
    if (target) openCollectionDetail(target);
  }

  renderChips();

  const visible = visibleRecords();
  const body = document.getElementById("collections-body");
  const table = document.getElementById("collections-table");
  const emptyBox = document.getElementById("collections-empty");
  const foot = document.getElementById("collections-foot");

  const hasFilters = Boolean(filters.q || filters.flag !== "All" || filters.from || filters.to);
  const resultCount = document.getElementById("result-count");
  if (resultCount) {
    resultCount.textContent = records.length
      ? `${visible.length} of ${records.length} records`
      : "";
  }

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

  document.getElementById("foot-count").textContent = `${visible.length} record${visible.length === 1 ? "" : "s"}${
    hasFilters ? " (filtered)" : ""
  }`;
  document.getElementById("foot-sum").textContent = formatCurrency(
    visible.reduce((total, r) => total + (Number(r.amount) || 0), 0)
  );
  refreshIcons(body);
}

/* ------------------------------ Wiring ------------------------------ */

function findById(id) {
  return records.find((r) => r.id === id);
}

function wire() {
  document.getElementById("btn-add")?.addEventListener("click", () => openCollectionForm());
  document.getElementById("btn-export")?.addEventListener("click", exportCollections);

  const search = document.getElementById("search");
  search?.addEventListener(
    "input",
    debounce(() => {
      filters.q = search.value;
      render();
    }, 180)
  );

  document.getElementById("filters")?.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-flag]");
    if (!chip) return;
    filters.flag = chip.dataset.flag;
    render();
  });

  const from = document.getElementById("date-from");
  const to = document.getElementById("date-to");
  from?.addEventListener("change", () => { filters.from = from.value; render(); });
  to?.addEventListener("change", () => { filters.to = to.value; render(); });
  document.getElementById("date-clear")?.addEventListener("click", () => {
    filters.from = "";
    filters.to = "";
    if (from) from.value = "";
    if (to) to.value = "";
    render();
  });

  const clearFilters = () => {
    filters.q = "";
    filters.flag = "All";
    filters.from = "";
    filters.to = "";
    if (search) search.value = "";
    if (from) from.value = "";
    if (to) to.value = "";
    render();
  };

  document.getElementById("page-content")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    const row = event.target.closest("tr[data-id]");
    const record = button && row ? findById(row.dataset.id) : null;

    if (button?.dataset.action === "clear") return clearFilters();
    if (button?.dataset.action === "add") return openCollectionForm();
    if (record) {
      const action = button?.dataset.action || "view";
      if (action === "view") openCollectionDetail(record);
      if (action === "edit") openCollectionForm(record);
      if (action === "delete") removeCollection(record);
      return;
    }
    if (row) openCollectionDetail(findById(row.dataset.id));
  });
}

/* ------------------------------ Boot ------------------------------ */

wire();

boot({ page: "collections", render }).then((unsubscribe) => {
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
