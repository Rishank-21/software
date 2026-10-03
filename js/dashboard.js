/* =========================================================
   dashboard.js — live financial dashboard
   ========================================================= */

import { boot, emptyState } from "./ui.js";
import { calcSummary, buildTransactions, expenseByCategory, isPromisePending } from "./calcs.js";
import {
  openCollectionForm,
  openExpenseForm,
  openPendingForm,
  openCollectionDetail,
  openExpenseDetail,
  openPendingDetail,
} from "./records.js";
import { getStoreData } from "./db.js";
import {
  toArray,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatSignedCurrency,
  esc,
  refreshIcons,
  initials,
  plural,
} from "./utils.js";

/* ------------------------------ Helpers ------------------------------ */

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const timeLabel = (tx) => {
  if (tx.record.createdAt) return formatDateTime(tx.record.createdAt);
  if (tx.dateKey) return formatDate(tx.dateKey);
  return "";
};

function statValue(el, text, negative = false) {
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("negative", negative);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/* ------------------------------ Charts ------------------------------ */

let barChart = null;
let pieChart = null;

function renderCharts(summary, categories) {
  const barFallback = document.getElementById("chart-bar-fallback");
  const pieFallback = document.getElementById("chart-pie-fallback");

  if (typeof window.Chart === "undefined") {
    if (barFallback) {
      barFallback.hidden = false;
      barFallback.textContent = "Charts could not load (offline). The totals above are still live.";
    }
    if (pieFallback) {
      pieFallback.hidden = false;
      pieFallback.textContent = "Charts could not load (offline).";
    }
    return;
  }

  window.Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  window.Chart.defaults.color = cssVar("--muted") || "#8794a8";

  const textColor = cssVar("--text-soft") || "#475467";
  const gridColor = cssVar("--border") || "#e6eaf2";
  const tooltipBg = document.documentElement.dataset.theme === "dark" ? "#050817" : "#101828";

  /* --- Collection vs Expense --- */
  const barData = {
    labels: ["Collected", "Expenses", "Remaining"],
    datasets: [
      {
        label: "Amount",
        data: [summary.totalCollected, summary.totalExpenses, summary.balance],
        backgroundColor: [cssVar("--green") || "#12805c", cssVar("--red") || "#cf2f2f", cssVar("--primary") || "#1f2a63"],
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 78,
      },
    ],
  };

  if (barChart) {
    barChart.data = barData;
    barChart.update();
  } else {
    barChart = new window.Chart(document.getElementById("chart-bar"), {
      type: "bar",
      data: barData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 550 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: tooltipBg,
            padding: 10,
            cornerRadius: 8,
            displayColors: false,
            callbacks: { label: (ctx) => formatCurrency(ctx.parsed.y) },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: textColor, font: { weight: 600, size: 12 } }, border: { display: false } },
          y: {
            beginAtZero: true,
            grid: { color: gridColor },
            border: { display: false },
            ticks: { color: textColor, font: { size: 11 }, callback: (value) => formatCurrency(value) },
          },
        },
      },
    });
  }

  /* --- Expense categories --- */
  const hasExpenses = categories.length > 0;
  if (pieFallback) {
    pieFallback.hidden = hasExpenses;
    if (!hasExpenses) pieFallback.textContent = "No expenses recorded yet.";
  }

  const pieData = {
    labels: categories.map((c) => c.category),
    datasets: [
      {
        data: categories.map((c) => c.amount),
        backgroundColor: categories.map((c) => c.color),
        borderColor: cssVar("--surface") || "#fff",
        borderWidth: 2,
        hoverOffset: 6,
      },
    ],
  };

  if (pieChart) {
    pieChart.data = pieData;
    pieChart.update();
  } else {
    pieChart = new window.Chart(document.getElementById("chart-pie"), {
      type: "doughnut",
      data: pieData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "64%",
        animation: { duration: 550 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: tooltipBg,
            padding: 10,
            cornerRadius: 8,
            callbacks: { label: (ctx) => ` ${ctx.label}: ${formatCurrency(ctx.parsed)}` },
          },
        },
      },
    });
  }

  /* --- category legend --- */
  const legend = document.getElementById("cat-legend");
  if (legend) {
    legend.innerHTML = hasExpenses
      ? categories
          .slice(0, 6)
          .map(
            (c) => `
        <div class="legend-item">
          <span class="legend-dot" style="background:${c.color}"></span>
          <span class="legend-name">${esc(c.category)}</span>
          <span class="legend-val">${formatCurrency(c.amount)}</span>
          <span class="legend-pct">${c.pct.toFixed(0)}%</span>
        </div>`
          )
          .join("")
      : '<div class="legend-item"><span class="legend-name text-muted">Add an expense to see the breakdown.</span></div>';
  }
}

/* ------------------------------ Render ------------------------------ */

let lastStore = null;

function render(store) {
  lastStore = store;
  const data = store.data;
  const summary = calcSummary(data);
  const categories = expenseByCategory(data.expenses);
  const transactions = buildTransactions(data);
  const settings = data.settings || {};

  /* header */
  setText("dash-event", settings.eventName || "Navratri Mahotsav");
  setText("dash-year", settings.eventYear ? `\u00B7 ${settings.eventYear}` : `\u00B7 ${new Date().getFullYear()}`);

  /* stat cards */
  statValue(document.getElementById("stat-collected"), formatCurrency(summary.totalCollected));
  setText(
    "stat-collected-meta",
    `${plural(summary.paidContributorCount, "contributor")} paid \u00B7 ${formatCurrency(summary.avgContribution)} average`
  );

  statValue(document.getElementById("stat-expenses"), formatCurrency(summary.totalExpenses));
  setText("stat-expenses-meta", `${plural(summary.expenseCount, "expense record")} \u00B7 ${summary.spentRatio.toFixed(0)}% of collection used`);

  statValue(document.getElementById("stat-balance"), formatCurrency(summary.balance), summary.balance < 0);
  const balanceMeta = document.getElementById("stat-balance-meta");
  if (balanceMeta) {
    balanceMeta.innerHTML =
      summary.balance < 0
        ? '<span class="deficit-note"><i data-lucide="alert-triangle"></i> Deficit &mdash; spending exceeds collection</span>'
        : "Collected \u2212 Expenses";
  }

  statValue(document.getElementById("stat-pending"), formatCurrency(summary.pendingAmount));
  setText(
    "stat-pending-meta",
    `${summary.pendingPromiseCount} promises + ${summary.unpaidContributorCount} unpaid collections`
  );

  /* charts */
  renderCharts(summary, categories);

  /* recent activity */
  const activityBox = document.getElementById("recent-activity");
  if (activityBox) {
    if (!transactions.length) {
      activityBox.innerHTML = emptyState({
        icon: "activity",
        title: "No activity yet.",
        text: "Collections and expenses will appear here as soon as you add them.",
      });
    } else {
      activityBox.innerHTML = transactions
        .slice(0, 8)
        .map((tx) => {
          const wait = tx.direction === "wait";
          const dirClass = tx.direction === "in" ? "in" : tx.direction === "out" ? "out" : "wait";
          const icon = tx.direction === "in" ? "arrow-down-left" : tx.direction === "out" ? "arrow-up-right" : "hourglass";
          const label = wait
            ? tx.type === "collection"
              ? "Pending collection"
              : "Promise"
            : tx.type === "collection"
              ? "Collection"
              : "Expense";
          const amount = wait
            ? formatCurrency(tx.amount)
            : formatSignedCurrency(tx.amount, tx.direction === "in");

          return `
            <button class="activity-item" type="button" data-open="${tx.type}:${esc(tx.id)}">
              <span class="activity-ico ${dirClass}"><i data-lucide="${icon}"></i></span>
              <span class="activity-main">
                <span class="activity-title">${esc(tx.title)}</span>
                <span class="activity-meta">${label} <span aria-hidden="true">&middot;</span> ${timeLabel(tx)}</span>
              </span>
              <span class="activity-amt ${dirClass}">${amount}</span>
            </button>`;
        })
        .join("");
    }
  }

  /* pending payments */
  const pendingBox = document.getElementById("dash-pending");
  if (pendingBox) {
    const active = toArray(data.pendingPayments)
      .filter(isPromisePending)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    pendingBox.innerHTML = active.length
      ? active
          .slice(0, 5)
          .map(
            (p) => `
          <button class="pend-item" type="button" data-open="pending:${esc(p.id)}">
            <span class="pend-avatar" aria-hidden="true">${esc(initials(p.name))}</span>
            <span class="pend-main">
              <span class="pend-name">${esc(p.name || "Unnamed")}</span>
              <span class="pend-sub">${
                p.expectedDate ? `Expected ${formatDate(p.expectedDate)}` : "No expected date"
              }${p.phone ? ` \u00B7 ${esc(p.phone)}` : ""}</span>
            </span>
            <span class="pend-amt">${formatCurrency(p.promisedAmount)}</span>
          </button>`
          )
          .join("")
      : emptyState({ icon: "circle-check", title: "No pending payments.", text: "Every promise has been settled." });
  }

  refreshIcons();
}

/* ------------------------------ Interactions ------------------------------ */

function openRecord(type, id) {
  const data = getStoreData();
  const map = {
    collection: [data.contributors, openCollectionDetail],
    expense: [data.expenses, openExpenseDetail],
    pending: [data.pendingPayments, openPendingDetail],
  };
  const [source, opener] = map[type] || [];
  if (!source || !opener) return;
  const record = toArray(source).find((item) => item.id === id);
  if (record) opener(record);
}

function wireActions() {
  const content = document.getElementById("page-content");
  content?.addEventListener("click", (event) => {
    const openTarget = event.target.closest("[data-open]");
    if (openTarget) {
      const [type, id] = openTarget.dataset.open.split(":");
      openRecord(type, id);
      return;
    }

    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "add-collection") openCollectionForm();
    else if (action === "add-expense") openExpenseForm();
    else if (action === "add-pending") openPendingForm();
    else if (action === "transactions") window.location.href = "transactions.html";
  });
}

/* ------------------------------ Boot ------------------------------ */

wireActions();

boot({ page: "dashboard", render }).then((unsubscribe) => {
  if (!unsubscribe) return;

  /* re-draw charts when the colour theme changes */
  new MutationObserver(() => {
    if (lastStore) render(lastStore);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
});
