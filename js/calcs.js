/* =========================================================
   calcs.js — the financial calculation engine
   -------------------------------------------------------
   Every number shown in the UI is derived from raw records
   here. Nothing is ever stored as a running total.
   ========================================================= */

import { toArray, sumBy, parseDate } from "./utils.js";

/* ------------------------------ Options ------------------------------ */

export const CATEGORIES = [
  "Decoration",
  "Food",
  "Sound System",
  "Lights",
  "Venue",
  "Garba/DJ",
  "Transportation",
  "Prizes",
  "Marketing",
  "Equipment",
  "Miscellaneous",
  "Other",
];

export const PAYMENT_METHODS = ["Cash", "UPI", "Bank Transfer", "Other"];

export const COLLECTION_FILTERS = ["All", "Paid", "Pending", "Cash", "UPI", "Bank Transfer"];
export const PENDING_FILTERS = ["All", "Pending", "Paid"];
export const TX_FILTERS = ["All", "Collections", "Expenses", "Pending"];

/* ------------------------------ Normalisers ------------------------------ */

export const isPaid = (record) =>
  String(record?.paymentStatus ?? "Paid").trim().toLowerCase() === "paid";

export const isPromisePending = (record) =>
  String(record?.status ?? "Pending").trim().toLowerCase() === "pending";

export const categoryColor = (index) => {
  const palette = [
    "#2c3a91", "#12805c", "#c2701c", "#8b5cf6", "#0e7490",
    "#b83280", "#4d7c0f", "#b45309", "#334155", "#be123c",
    "#7c3aed", "#0891b2",
  ];
  return palette[index % palette.length];
};

/* ------------------------------ Summary ------------------------------ */

/**
 * Build every dashboard number from raw Firebase data.
 * @param {{contributors:object, expenses:object, pendingPayments:object}} data
 */
export function calcSummary(data = {}) {
  const contributors = toArray(data.contributors);
  const expenses = toArray(data.expenses);
  const promises = toArray(data.pendingPayments);

  const paidContributors = contributors.filter(isPaid);
  const unpaidContributors = contributors.filter((c) => !isPaid(c));
  const activePromises = promises.filter(isPromisePending);
  const settledPromises = promises.filter((p) => !isPromisePending(p));

  const totalCollected = sumBy(paidContributors, (c) => c.amount);
  const totalExpenses = sumBy(expenses, (e) => e.amount);
  const balance = totalCollected - totalExpenses;

  const pendingFromPromises = sumBy(activePromises, (p) => p.promisedAmount);
  const pendingFromCollections = sumBy(unpaidContributors, (c) => c.amount);
  const pendingAmount = pendingFromPromises + pendingFromCollections;

  const avgContribution = paidContributors.length
    ? totalCollected / paidContributors.length
    : 0;

  const largestContribution = paidContributors.reduce(
    (best, c) => (!best || Number(c.amount) > Number(best.amount) ? c : best),
    null
  );
  const largestExpense = expenses.reduce(
    (best, e) => (!best || Number(e.amount) > Number(best.amount) ? e : best),
    null
  );

  return {
    totalCollected,
    totalExpenses,
    balance,
    pendingAmount,
    pendingFromPromises,
    pendingFromCollections,

    contributorCount: contributors.length,
    paidContributorCount: paidContributors.length,
    unpaidContributorCount: unpaidContributors.length,
    expenseCount: expenses.length,
    promiseCount: promises.length,
    pendingPromiseCount: activePromises.length,

    avgContribution,
    largestContribution,
    largestExpense,

    collectionRate: totalCollected + pendingAmount > 0
      ? (totalCollected / (totalCollected + pendingAmount)) * 100
      : 100,
    spentRatio: totalCollected > 0 ? (totalExpenses / totalCollected) * 100 : 0,
  };
}

/* ------------------------------ Category totals ------------------------------ */

export function expenseByCategory(expenses = []) {
  const list = toArray(expenses);
  const totals = new Map();
  for (const expense of list) {
    const key = expense.category || "Other";
    totals.set(key, (totals.get(key) || 0) + (Number(expense.amount) || 0));
  }
  const grandTotal = [...totals.values()].reduce((a, b) => a + b, 0);
  return [...totals.entries()]
    .map(([category, amount], index) => ({
      category,
      amount,
      color: categoryColor(index),
      pct: grandTotal ? (amount / grandTotal) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/* ------------------------------ Transactions ------------------------------ */

const dateKeyOf = (record) => {
  if (record.date) return record.date;
  if (record.dateAdded) return record.dateAdded;
  if (record.createdAt) {
    const d = new Date(record.createdAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return "";
};

const sortStamp = (record) => {
  const day = parseDate(dateKeyOf(record))?.getTime() || 0;
  const created = Number(record.createdAt) || 0;
  return Math.max(day, created);
};

/**
 * Merge collections, expenses and promises into one chronological feed.
 * direction: 'in' (money received) | 'out' (money spent) | 'wait' (promise)
 */
export function buildTransactions(data = {}) {
  const out = [];

  for (const c of toArray(data.contributors)) {
    const paid = isPaid(c);
    out.push({
      id: c.id,
      type: "collection",
      direction: paid ? "in" : "wait",
      settled: paid,
      title: c.name || "Unnamed contributor",
      subtitle: [c.paymentMethod, c.phone].filter(Boolean).join(" \u00B7 ") || "Collection",
      amount: Number(c.amount) || 0,
      dateKey: dateKeyOf(c),
      stamp: sortStamp(c),
      record: c,
    });
  }

  for (const e of toArray(data.expenses)) {
    out.push({
      id: e.id,
      type: "expense",
      direction: "out",
      title: e.title || "Expense",
      subtitle: [e.category, e.paidBy ? `by ${e.paidBy}` : ""].filter(Boolean).join(" \u00B7 ") || "Expense",
      amount: Number(e.amount) || 0,
      dateKey: dateKeyOf(e),
      stamp: sortStamp(e),
      record: e,
    });
  }

  for (const p of toArray(data.pendingPayments)) {
    const settled = !isPromisePending(p);
    out.push({
      id: p.id,
      type: "pending",
      direction: settled ? "in" : "wait",
      settled,
      title: p.name || "Unnamed person",
      subtitle: settled ? "Pending payment received" : "Promised later",
      amount: Number(p.promisedAmount) || 0,
      dateKey: dateKeyOf(p),
      stamp: sortStamp(p),
      record: p,
    });
  }

  return out.sort((a, b) => b.stamp - a.stamp || String(b.id).localeCompare(String(a.id)));
}

/** Group a sorted transaction list by calendar day, preserving order. */
export function groupByDay(transactions) {
  const groups = [];
  let current = null;
  for (const tx of transactions) {
    const key = tx.dateKey || "undated";
    if (!current || current.key !== key) {
      current = { key, date: tx.dateKey, items: [] };
      groups.push(current);
    }
    current.items.push(tx);
  }
  return groups;
}

/** Net movement for one day: + received, - spent. Money not yet in hand is ignored. */
export function dayNet(items) {
  return items.reduce(
    (total, tx) =>
      total + (tx.direction === "in" ? tx.amount : tx.direction === "out" ? -tx.amount : 0),
    0
  );
}
