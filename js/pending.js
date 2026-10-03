/* =========================================================
   pending.js — Pending Payments page
   ========================================================= */

import { boot, emptyState } from "./ui.js";
import {
  openPendingForm,
  openPendingDetail,
  removePending,
  markAsPaidFlow,
} from "./records.js";
import { exportPending } from "./exports.js";
import { PENDING_FILTERS, isPromisePending, calcSummary } from "./calcs.js";
import { getStoreData } from "./db.js";
import { toArray, formatCurrency, formatDate, esc, refreshIcons, debounce, todayISO } from "./utils.js";

/* ------------------------------ State ------------------------------ */

const filters = { q: "", status: "All" };
let records = [];
let pendingOpenId = null;

const matchesStatus = (record, status) =>
  status === "All" ||
  (status === "Pending" ? isPromisePending(record) : !isPromisePending(record));

function visibleRecords() {
  const q = filters.q.trim().toLowerCase();
  return records.filter((record) => {
    if (q && !`${record.name || ""} ${record.phone || ""} ${record.notes || ""}`.toLowerCase().includes(q)) return false;
    return matchesStatus(record, filters.status);
  });
}

/* ------------------------------ Stat cards ------------------------------ */

function renderStats() {
  const data = getStoreData();
  const summary = calcSummary(data);
  const promises = toArray(data.pendingPayments);
  const active = promises.filter(isPromisePending);
  const settled = promises.filter((p) => !isPromisePending(p));
  const today = todayISO();
  const overdue = active.filter((p) => p.expectedDate && p.expectedDate < today);

  const activeTotal = active.reduce((t, p) => t + (Number(p.promisedAmount) || 0), 0);
  const settledTotal = settled.reduce((t, p) => t + (Number(p.promisedAmount) || 0), 0);

  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  set("pend-total", formatCurrency(activeTotal));
  set(
    "pend-total-meta",
    active.length
      ? `${active.length} open ${active.length === 1 ? "promise" : "promises"} \u00B7 excluded from Total Collected`
      : "No open promises"
  );
  set("pend-received", formatCurrency(settledTotal));
  set("pend-received-meta", `${settled.length} ${settled.length === 1 ? "promise" : "promises"} converted to collection`);
  set("pend-count", String(active.length));
  set("pend-count-meta", overdue.length
    ? `${overdue.length} overdue \u00B7 ${formatCurrency(summary.pendingFromCollections)} unpaid collections elsewhere`
    : `${formatCurrency(summary.pendingFromCollections)} unpaid collections elsewhere`);
}

/* ------------------------------ Table ------------------------------ */

function statusBadge(record) {
  const active = isPromisePending(record);
  return `<span class="badge ${active ? "badge-pending" : "badge-paid"}">
            <i data-lucide="${active ? "clock" : "circle-check"}"></i>${active ? "Pending" : "Paid"}
          </span>`;
}

function rowHTML(record) {
  const active = isPromisePending(record);
  const overdue = active && record.expectedDate && record.expectedDate < todayISO();
  return `
    <tr data-id="${esc(record.id)}">
      <td data-label="Name" class="cell-main row-link">${esc(record.name || "\u2014")}</td>
      <td data-label="Phone">${record.phone ? esc(record.phone) : "\u2014"}</td>
      <td data-label="Promised Amount" class="num">${formatCurrency(record.promisedAmount)}</td>
      <td data-label="Expected Date" class="nowrap">${
        record.expectedDate
          ? `${formatDate(record.expectedDate)}${overdue ? '<span class="cell-sub text-danger">Overdue</span>' : ""}`
          : "\u2014"
      }</td>
      <td data-label="Status">${statusBadge(record)}</td>
      <td data-label="Notes">${record.notes ? esc(record.notes) : "\u2014"}</td>
      <td data-label="Actions" class="num no-label">
        <span class="actions">
          ${
            active
              ? `<button class="btn-icon ok" type="button" data-action="paid" aria-label="Mark ${esc(record.name)} as paid" title="Mark as Paid">
                   <i data-lucide="check"></i>
                 </button>`
              : ""
          }
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
      icon: "clock",
      title: "No pending payments.",
      text: 'When someone says "I will pay later", record the promise here.',
      action: '<button class="btn btn-primary" type="button" data-action="add"><i data-lucide="plus"></i> Add Pending Payment</button>',
    });
  }
  return emptyState({
    icon: "search",
    title: "No records match this filter.",
    text: "Switch the filter or clear the search to see all promises.",
    action: '<button class="btn btn-outline" type="button" data-action="clear">Clear filters</button>',
  });
}

function render() {
  const data = getStoreData();
  records = toArray(data.pendingPayments).sort((a, b) => {
    const activeDiff = Number(isPromisePending(b)) - Number(isPromisePending(a));
    if (activeDiff) return activeDiff;
    return String(a.expectedDate || "9999").localeCompare(String(b.expectedDate || "9999")) ||
      (b.createdAt || 0) - (a.createdAt || 0);
  });

  if (pendingOpenId) {
    const target = records.find((r) => r.id === pendingOpenId);
    pendingOpenId = null;
    if (target) openPendingDetail(target);
  }

  renderStats();

  const box = document.getElementById("filters");
  if (box) {
    box.innerHTML = PENDING_FILTERS.map((status) => {
      const count = records.filter((r) => matchesStatus(r, status)).length;
      return `<button class="chip${filters.status === status ? " active" : ""}" type="button" data-status="${status}"
                aria-pressed="${filters.status === status}">${status}<span class="chip-count">${count}</span></button>`;
    }).join("");
  }

  const visible = visibleRecords();
  const body = document.getElementById("pending-body");
  const table = document.getElementById("pending-table");
  const emptyBox = document.getElementById("pending-empty");
  const foot = document.getElementById("pending-foot");
  const resultCount = document.getElementById("result-count");
  if (resultCount) resultCount.textContent = records.length ? `${visible.length} of ${records.length} records` : "";

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

  const hasFilters = Boolean(filters.q || filters.status !== "All");
  document.getElementById("foot-count").textContent = `${visible.length} record${visible.length === 1 ? "" : "s"}${
    hasFilters ? " (filtered)" : ""
  }`;
  document.getElementById("foot-sum").textContent = formatCurrency(
    visible.reduce((total, r) => total + (Number(r.promisedAmount) || 0), 0)
  );
  refreshIcons(body);
}

/* ------------------------------ Wiring ------------------------------ */

const findById = (id) => records.find((r) => r.id === id);

function wire() {
  document.getElementById("btn-add")?.addEventListener("click", () => openPendingForm());
  document.getElementById("btn-export")?.addEventListener("click", exportPending);

  const search = document.getElementById("search");
  search?.addEventListener(
    "input",
    debounce(() => {
      filters.q = search.value;
      render();
    }, 180)
  );

  document.getElementById("filters")?.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-status]");
    if (!chip) return;
    filters.status = chip.dataset.status;
    render();
  });

  const clearFilters = () => {
    filters.q = "";
    filters.status = "All";
    if (search) search.value = "";
    render();
  };

  document.getElementById("page-content")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    const row = event.target.closest("tr[data-id]");
    const record = button && row ? findById(row.dataset.id) : null;

    if (button?.dataset.action === "clear") return clearFilters();
    if (button?.dataset.action === "add") return openPendingForm();
    if (record) {
      const action = button?.dataset.action || "view";
      if (action === "view") openPendingDetail(record);
      if (action === "edit") openPendingForm(record);
      if (action === "delete") removePending(record);
      if (action === "paid") markAsPaidFlow(record);
      return;
    }
    if (row) openPendingDetail(findById(row.dataset.id));
  });
}

/* ------------------------------ Boot ------------------------------ */

wire();

boot({ page: "pending", render }).then((unsubscribe) => {
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
