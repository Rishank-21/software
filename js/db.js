/* =========================================================
   db.js — Firebase Realtime Database store + CRUD operations
   -------------------------------------------------------
   One realtime listener powers the whole app: every page
   subscribes to the same in-memory store, so a change made
   on any device refreshes every screen automatically.
   ========================================================= */

import { ref, onValue, push, set, update, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { db, DB_ROOT } from "./firebase.js";
import { toArray, todayISO } from "./utils.js";

/* ------------------------------ Errors ------------------------------ */

export const MESSAGES = {
  save: "Unable to save record. Please try again.",
  delete: "Unable to delete record. Please try again.",
  load: "Unable to load data. Please check your internet connection.",
  notConfigured: "Firebase is not configured yet. Add your credentials in js/firebase.js.",
};

export class AppError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "AppError";
    this.cause = cause;
  }
}

/* ------------------------------ Store ------------------------------ */

const emptyData = () => ({
  contributors: null,
  expenses: null,
  pendingPayments: null,
  settings: null,
});

let state = { status: "loading", data: emptyData(), error: null };
const listeners = new Set();
let detachListener = null;

function commit(next) {
  state = next;
  listeners.forEach((cb) => {
    try {
      cb(state);
    } catch (err) {
      console.error("[Store] subscriber failed:", err);
    }
  });
}

/** Subscribe to the store. The callback fires immediately with the current state. */
export function onStoreChange(callback) {
  listeners.add(callback);
  callback(state);
  return () => listeners.delete(callback);
}

export const getStore = () => state;
export const getStoreData = () => state.data;

/** Start (or restart) the realtime listener. Safe to call more than once. */
export function startStore() {
  if (!db) {
    commit({ status: "error", data: emptyData(), error: "config" });
    return;
  }

  if (typeof detachListener === "function") {
    detachListener();
    detachListener = null;
  }

  if (state.status !== "ready") {
    commit({ status: "loading", data: emptyData(), error: null });
  }

  detachListener = onValue(
    ref(db, DB_ROOT),
    (snapshot) => {
      const value = snapshot.val() || {};
      commit({
        status: "ready",
        data: {
          contributors: value.contributors || null,
          expenses: value.expenses || null,
          pendingPayments: value.pendingPayments || null,
          settings: value.settings || null,
        },
        error: null,
      });
    },
    (error) => {
      console.error("[Firebase] Failed to load data:", error);
      detachListener = null;
      commit({ status: "error", data: emptyData(), error: "load" });
    }
  );
}

/** Force a fresh read (used by the Retry button). */
export function retryStore() {
  startStore();
}

/* ------------------------------ Write helper ------------------------------ */

async function write(mutate, kind) {
  if (!db) throw new AppError(MESSAGES.notConfigured);
  try {
    await mutate();
  } catch (error) {
    console.error(`[Firebase] ${kind} operation failed:`, error);
    throw new AppError(kind === "delete" ? MESSAGES.delete : MESSAGES.save, error);
  }
}

const now = () => Date.now();

/* ------------------------------ Collections ------------------------------ */

export async function addCollection(input) {
  const key = push(ref(db, `${DB_ROOT}/contributors`)).key;
  const record = { id: key, ...input, createdAt: now() };
  await write(() => set(ref(db, `${DB_ROOT}/contributors/${key}`), record), "save");
  return record;
}

export async function updateCollection(id, input) {
  await write(
    () => update(ref(db, `${DB_ROOT}/contributors/${id}`), { ...input, id, updatedAt: now() }),
    "save"
  );
}

export async function deleteCollection(id) {
  await write(() => remove(ref(db, `${DB_ROOT}/contributors/${id}`)), "delete");
}

/* ------------------------------ Expenses ------------------------------ */

export async function addExpense(input) {
  const key = push(ref(db, `${DB_ROOT}/expenses`)).key;
  const record = { id: key, ...input, createdAt: now() };
  await write(() => set(ref(db, `${DB_ROOT}/expenses/${key}`), record), "save");
  return record;
}

export async function updateExpense(id, input) {
  await write(
    () => update(ref(db, `${DB_ROOT}/expenses/${id}`), { ...input, id, updatedAt: now() }),
    "save"
  );
}

export async function deleteExpense(id) {
  await write(() => remove(ref(db, `${DB_ROOT}/expenses/${id}`)), "delete");
}

/* ------------------------------ Pending payments ------------------------------ */

export async function addPendingPayment(input) {
  const key = push(ref(db, `${DB_ROOT}/pendingPayments`)).key;
  const record = { id: key, ...input, createdAt: now() };
  await write(() => set(ref(db, `${DB_ROOT}/pendingPayments/${key}`), record), "save");
  return record;
}

export async function updatePendingPayment(id, input) {
  await write(
    () => update(ref(db, `${DB_ROOT}/pendingPayments/${id}`), { ...input, id, updatedAt: now() }),
    "save"
  );
}

export async function deletePendingPayment(id) {
  await write(() => remove(ref(db, `${DB_ROOT}/pendingPayments/${id}`)), "delete");
}

/**
 * Mark a promise as paid:
 *  - status becomes "Paid" (leaves the pending total)
 *  - a matching collection record is created (enters the collected total)
 * Both writes happen as one atomic multi-path update.
 */
export async function markPendingAsPaid(id, { paymentMethod = "Cash", date = todayISO() } = {}) {
  const promise = toArray(getStoreData().pendingPayments).find((p) => p.id === id);
  if (!promise) throw new AppError("This pending payment no longer exists.");

  const key = push(ref(db, `${DB_ROOT}/contributors`)).key;
  const paidAt = now();

  const contributor = {
    id: key,
    name: promise.name || "",
    phone: promise.phone || "",
    address: "",
    amount: Number(promise.promisedAmount) || 0,
    paymentStatus: "Paid",
    paymentMethod,
    date,
    notes: promise.notes || "",
    source: "Pending Payment",
    pendingId: id,
    createdAt: paidAt,
  };

  const updates = {};
  updates[`${DB_ROOT}/pendingPayments/${id}/status`] = "Paid";
  updates[`${DB_ROOT}/pendingPayments/${id}/paidDate`] = paidAt;
  updates[`${DB_ROOT}/pendingPayments/${id}/paidCollectionId`] = key;
  updates[`${DB_ROOT}/contributors/${key}`] = contributor;

  await write(() => update(ref(db), updates), "save");
  return contributor;
}

/* ------------------------------ Settings ------------------------------ */

export async function saveSettings(values) {
  await write(() => set(ref(db, `${DB_ROOT}/settings`), { ...values, updatedAt: now() }), "save");
}
