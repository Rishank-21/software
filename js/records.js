/* =========================================================
   records.js — shared forms, detail views and record actions
   -------------------------------------------------------
   Used by the dashboard quick actions and by every list page,
   so a form or modal behaves identically everywhere.
   ========================================================= */

import { openModal, confirmDialog, toast } from "./ui.js";
import {
  addCollection,
  updateCollection,
  deleteCollection,
  addExpense,
  updateExpense,
  deleteExpense,
  addPendingPayment,
  updatePendingPayment,
  deletePendingPayment,
  markPendingAsPaid,
} from "./db.js";
import { PAYMENT_METHODS, isPaid, isPromisePending } from "./calcs.js";
import {
  esc,
  formatCurrency,
  formatDateLong,
  formatDateTime,
  formatTimestamp,
  toAmount,
  todayISO,
  validators,
  refreshIcons,
} from "./utils.js";

/* ------------------------------ Field builders ------------------------------ */

let formSeq = 0;

const labelFor = (label, required) =>
  `${label}${required ? ' <span class="field-req" aria-hidden="true">*</span>' : ""}`;

function inputField({
  id,
  label,
  type = "text",
  value = "",
  placeholder = "",
  required = false,
  span = false,
  hint = "",
  attrs = "",
  prefix = "",
}) {
  const control = prefix
    ? `<span class="input-affix"><span class="affix" aria-hidden="true">${prefix}</span>
       <input class="input" id="${id}" name="${id}" type="${type}" value="${esc(value)}"
        placeholder="${esc(placeholder)}" ${required ? "required" : ""} ${attrs}></span>`
    : `<input class="input" id="${id}" name="${id}" type="${type}" value="${esc(value)}"
        placeholder="${esc(placeholder)}" ${required ? "required" : ""} ${attrs}>`;

  return `
    <div class="field${span ? " span-2" : ""}">
      <label class="field-label" for="${id}">${labelFor(label, required)}</label>
      ${control}
      ${hint ? `<p class="field-hint">${hint}</p>` : ""}
      <p class="field-err" id="err-${id}"><i data-lucide="alert-triangle"></i><span></span></p>
    </div>`;
}

function selectField({
  id,
  label,
  options,
  value = "",
  required = false,
  span = false,
}) {
  const items = options
    .map((option) => {
      const val = typeof option === "object" ? option.value : option;
      const text = typeof option === "object" ? option.label : option;
      const selected = String(value ?? "") === String(val) ? " selected" : "";
      return `<option value="${esc(val)}"${selected}>${esc(text)}</option>`;
    })
    .join("");

  return `
    <div class="field${span ? " span-2" : ""}">
      <label class="field-label" for="${id}">${labelFor(label, required)}</label>
      <select class="select" id="${id}" name="${id}" ${required ? "required" : ""}>${items}</select>
      <p class="field-err" id="err-${id}"><i data-lucide="alert-triangle"></i><span></span></p>
    </div>`;
}

function textareaField({
  id,
  label,
  value = "",
  placeholder = "",
  span = false,
  hint = "",
}) {
  return `
    <div class="field${span ? " span-2" : ""}">
      <label class="field-label" for="${id}">${labelFor(label, false)}</label>
      <textarea class="textarea" id="${id}" name="${id}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>
      ${hint ? `<p class="field-hint">${hint}</p>` : ""}
      <p class="field-err" id="err-${id}"><i data-lucide="alert-triangle"></i><span></span></p>
    </div>`;
}

function chipsField({ id, label, hint = "" }) {
  return `
    <div class="field span-2">
      <label class="field-label" for="${id}">${labelFor(label, false)}</label>
      <div class="chips-input" id="${id}-box" data-target="${id}">
        <input id="${id}" name="${id}" type="text" placeholder="Type a name, press Enter" autocomplete="off">
      </div>
      ${hint ? `<p class="field-hint">${hint}</p>` : ""}
      <p class="field-err" id="err-${id}"><i data-lucide="alert-triangle"></i><span></span></p>
    </div>`;
}

/* ------------------------------ Validation helper ------------------------------ */

function setError(id, message) {
  const field = document.getElementById(id);
  const box = document.getElementById(`err-${id}`);
  if (!field || !box) return;
  if (message) {
    field.setAttribute("aria-invalid", "true");
    box.classList.add("show");
    box.querySelector("span").textContent = message;
  } else {
    field.removeAttribute("aria-invalid");
    box.classList.remove("show");
    box.querySelector("span").textContent = "";
  }
}

function clearErrors(ids) {
  ids.forEach((id) => setError(id, ""));
}

function focusFirstError(ids) {
  for (const id of ids) {
    const field = document.getElementById(id);
    if (field?.getAttribute("aria-invalid") === "true") {
      field.focus();
      field.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
  }
}

function busy(button, busy, busyLabel = "Saving\u2026") {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader-2"></i> ${busyLabel}`;
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.label || button.innerHTML;
  }
  refreshIcons(button);
}

/* ------------------------------ Modal scaffold ------------------------------ */

function openFormModal({
  title,
  subtitle,
  body,
  confirmLabel,
  onSave,
  formId,
}) {
  const modal = openModal({
    title,
    subtitle,
    body: `<form id="${formId}" novalidate><div class="form-grid">
             <div class="form-alert" id="${formId}-alert" role="alert"></div>
             ${body}
           </div></form>`,
    footer: `
      <button class="btn btn-outline" type="button" data-act="cancel">Cancel</button>
      <button class="btn btn-primary" type="button" data-act="save">
        <i data-lucide="check"></i> ${esc(confirmLabel)}
      </button>`,
  });

  const form = modal.el.querySelector("form");
  const saveBtn = modal.footer.querySelector('[data-act="save"]');

  modal.footer
    .querySelector('[data-act="cancel"]')
    .addEventListener("click", () => modal.close());
  saveBtn.addEventListener("click", () => onSave({ form, modal, saveBtn }));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    onSave({ form, modal, saveBtn });
  });
  form.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      onSave({ form, modal, saveBtn });
    }
  });

  return modal;
}

function showFormAlert(formId, message) {
  const alertBox = document.getElementById(`${formId}-alert`);
  if (!alertBox) return;
  alertBox.innerHTML = `<i data-lucide="alert-triangle"></i><span>${esc(message)}</span>`;
  alertBox.classList.add("show");
  refreshIcons(alertBox);
}

async function runSave({
  formId,
  ids,
  saveBtn,
  modal,
  form,
  action,
  successMessage,
  detail = "",
}) {
  clearErrors(ids);
  document.getElementById(`${formId}-alert`)?.classList.remove("show");

  try {
    busy(saveBtn, true);
    await action();
    form.reset();
    busy(saveBtn, false);
    modal.close();
    toast(successMessage, "success", detail);
  } catch (error) {
    console.error("[Save]", error);
    busy(saveBtn, false);
    showFormAlert(
      formId,
      error.message || "Something went wrong. Please try again.",
    );
  }
}

/* =========================================================
   COLLECTIONS
   ========================================================= */

export function openCollectionForm(record = null) {
  const editing = Boolean(record);
  const prefix = `c${++formSeq}`;
  const value = record || {};
  const ids = ["name", "amount", "phone", "date"].map((k) => `${prefix}-${k}`);

  const modal = openFormModal({
    formId: `${prefix}-form`,
    title: editing ? "Edit Collection" : "Add Collection",
    subtitle: editing
      ? "Update this contribution. Totals recalculate immediately."
      : "Record money received from a contributor.",
    confirmLabel: editing ? "Save Changes" : "Add Collection",
    body: [
      inputField({
        id: `${prefix}-name`,
        label: "Person Name",
        value: value.name,
        placeholder: "Rahul Patel",
        required: true,
      }),
      inputField({
        id: `${prefix}-amount`,
        label: "Amount",
        type: "text",
        inputmode: "numeric",
        value: value.amount ?? "",
        placeholder: "2500",
        required: true,
        prefix: "\u20B9",
      }),
      inputField({
        id: `${prefix}-phone`,
        label: "Phone Number",
        type: "tel",
        value: value.phone,
        placeholder: "98765 43210",
      }),
      selectField({
        id: `${prefix}-method`,
        label: "Payment Method",
        options: PAYMENT_METHODS,
        value: value.paymentMethod || "Cash",
      }),
      selectField({
        id: `${prefix}-status`,
        label: "Payment Status",
        options: [
          { value: "Paid", label: "Paid (money received)" },
          { value: "Pending", label: "Pending (not received yet)" },
        ],
        value: value.paymentStatus || "Paid",
      }),
      inputField({
        id: `${prefix}-date`,
        label: "Date",
        type: "date",
        value: value.date || todayISO(),
      }),
      inputField({
        id: `${prefix}-address`,
        label: "Address",
        value: value.address,
        placeholder: "Optional",
        span: true,
      }),
      textareaField({
        id: `${prefix}-notes`,
        label: "Notes",
        value: value.notes,
        placeholder: "Optional remarks",
        span: true,
      }),
    ].join(""),
    onSave: async ({ form, modal, saveBtn }) => {
      const get = (key) =>
        document.getElementById(`${prefix}-${key}`).value.trim();

      const checks = [
        [`${prefix}-name`, validators.required("Name")(get("name"))],
        [`${prefix}-amount`, validators.amount("Amount")(get("amount"))],
        [`${prefix}-phone`, validators.phone()(get("phone"))],
        [`${prefix}-date`, validators.date("Date")(get("date"))],
      ];
      const failed = checks.filter(([, error]) => error);
      checks.forEach(([id, error]) => setError(id, error));
      if (failed.length) return focusFirstError(ids);

      const payload = {
        name: get("name"),
        amount: toAmount(get("amount")),
        phone: get("phone"),
        address: document.getElementById(`${prefix}-address`).value.trim(),
        paymentMethod: document.getElementById(`${prefix}-method`).value,
        paymentStatus: document.getElementById(`${prefix}-status`).value,
        date: get("date"),
        notes: document.getElementById(`${prefix}-notes`).value.trim(),
      };

      await runSave({
        formId: `${prefix}-form`,
        ids,
        saveBtn,
        modal,
        form,
        action: () =>
          editing
            ? updateCollection(record.id, payload)
            : addCollection(payload),
        successMessage: editing
          ? "Collection updated successfully."
          : "Collection added successfully.",
      });
    },
  });

  return modal;
}

export function openCollectionDetail(record) {
  const paid = isPaid(record);
  const modal = openModal({
    title: esc(record.name || "Contributor"),
    subtitle: paid ? "Contribution received" : "Contribution promised",
    size: "modal-md",
    body: `
      <div class="detail-hero">
        <div>
          <div class="dh-label">Amount Given</div>
          <div class="dh-value">${formatCurrency(record.amount)}</div>
        </div>
        <span class="badge ${paid ? "badge-paid" : "badge-pending"}">
          <i data-lucide="${paid ? "circle-check" : "clock"}"></i>${paid ? "PAID" : "PENDING"}
        </span>
      </div>
      <div class="kv">
        <div class="kv-k">Name</div><div class="kv-v">${esc(record.name || "\u2014")}</div>
        <div class="kv-k">Phone</div><div class="kv-v">${record.phone ? esc(record.phone) : "\u2014"}</div>
        <div class="kv-k">Address</div><div class="kv-v">${record.address ? esc(record.address) : "\u2014"}</div>
        <div class="kv-k">Amount</div><div class="kv-v">${formatCurrency(record.amount)}</div>
        <div class="kv-k">Payment Status</div><div class="kv-v">${paid ? "Paid" : "Pending"}</div>
        <div class="kv-k">Payment Method</div><div class="kv-v">${esc(record.paymentMethod || "\u2014")}</div>
        <div class="kv-k">Date</div><div class="kv-v">${formatDateLong(record.date)}</div>
        ${record.source ? `<div class="kv-k">Source</div><div class="kv-v">${esc(record.source)}</div>` : ""}
        <div class="kv-k">Recorded</div><div class="kv-v">${formatTimestamp(record.createdAt)}</div>
        <div class="kv-k">Notes</div><div class="kv-v">${record.notes ? esc(record.notes) : "\u2014"}</div>
      </div>`,
    footer: `
      <button class="btn btn-outline btn-sm" type="button" data-act="delete">
        <i data-lucide="trash-2"></i> Delete
      </button>
      <button class="btn btn-outline" type="button" data-act="edit">
        <i data-lucide="pencil"></i> Edit
      </button>
      <button class="btn btn-primary" type="button" data-act="close">Done</button>`,
  });

  modal.footer
    .querySelector('[data-act="close"]')
    .addEventListener("click", () => modal.close());
  modal.footer
    .querySelector('[data-act="edit"]')
    .addEventListener("click", () => {
      modal.close();
      openCollectionForm(record);
    });
  modal.footer
    .querySelector('[data-act="delete"]')
    .addEventListener("click", async () => {
      modal.close();
      await removeCollection(record);
    });

  return modal;
}

export async function removeCollection(record) {
  const { ok } = await confirmDialog({
    heading: "Are you sure?",
    message: "This record will be permanently deleted.",
    confirmLabel: "Delete",
    tone: "danger",
    icon: "trash-2",
    extra: `<div class="amount-callout">${formatCurrency(record.amount)}</div>
            <p class="text-muted" style="font-size:13px;margin-top:8px">${esc(record.name || "")}</p>`,
  });
  if (!ok) return false;
  try {
    await deleteCollection(record.id);
    toast("Record deleted successfully.", "success");
    return true;
  } catch (error) {
    toast(error.message, "error");
    return false;
  }
}

/* =========================================================
   EXPENSES
   ========================================================= */

function wireChips(boxId) {
  const box = document.getElementById(boxId);
  if (!box) return { get: () => [] };
  const input = box.querySelector("input");
  let values = [];

  const paint = () => {
    box.querySelectorAll(".chip-tag").forEach((tag) => tag.remove());
    values.forEach((name, index) => {
      const tag = document.createElement("span");
      tag.className = "chip-tag";
      tag.innerHTML = `${esc(name)}<button type="button" aria-label="Remove ${esc(name)}" data-index="${index}"><i data-lucide="x"></i></button>`;
      box.insertBefore(tag, input);
    });
    refreshIcons(box);
  };

  const add = (raw) => {
    const parts = String(raw)
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    parts.forEach((part) => {
      if (!values.some((v) => v.toLowerCase() === part.toLowerCase()))
        values.push(part);
    });
    input.value = "";
    paint();
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(input.value);
    } else if (e.key === "Backspace" && !input.value && values.length) {
      values.pop();
      paint();
    }
  });
  input.addEventListener("blur", () => {
    if (input.value.trim()) add(input.value);
  });
  box.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-index]");
    if (btn) {
      values.splice(Number(btn.dataset.index), 1);
      paint();
      input.focus();
    } else {
      input.focus();
    }
  });

  return {
    set: (list) => {
      values = [...list];
      paint();
    },
    get: () => {
      if (input.value.trim()) add(input.value);
      return [...values];
    },
  };
}

export function openExpenseForm(record = null) {
  const editing = Boolean(record);
  const prefix = `e${++formSeq}`;
  const value = record || {};
  const ids = [
    `${prefix}-title`,
    `${prefix}-category`,
    `${prefix}-amount`,
    `${prefix}-date`,
    `${prefix}-receipt`,
  ];

  const modal = openFormModal({
    formId: `${prefix}-form`,
    title: editing ? "Edit Expense" : "Add Expense",
    subtitle: editing
      ? "Update this expense. Totals recalculate immediately."
      : "Record money spent for the event.",
    confirmLabel: editing ? "Save Changes" : "Add Expense",
    body: [
      inputField({
        id: `${prefix}-title`,
        label: "Expense Title",
        value: value.title,
        placeholder: "Decoration Material",
        required: true,
        span: true,
      }),
      inputField({
        id: `${prefix}-category`,
        label: "Category",
        value: value.category,
        placeholder: "Decoration, Travel, Food...",
        required: true,
      }),
      inputField({
        id: `${prefix}-amount`,
        label: "Amount",
        type: "text",
        inputmode: "numeric",
        value: value.amount ?? "",
        placeholder: "4500",
        required: true,
        prefix: "\u20B9",
      }),
      inputField({
        id: `${prefix}-paidBy`,
        label: "Paid By",
        value: value.paidBy,
        placeholder: "Rishank",
      }),
      inputField({
        id: `${prefix}-date`,
        label: "Date",
        type: "date",
        value: value.date || todayISO(),
      }),
      selectField({
        id: `${prefix}-method`,
        label: "Payment Method",
        options: PAYMENT_METHODS,
        value: value.paymentMethod || "Cash",
      }),
      textareaField({
        id: `${prefix}-description`,
        label: "Purpose / Description",
        value: value.description,
        placeholder: "Flowers and decorative lights for entrance",
        span: true,
      }),
      chipsField({
        id: `${prefix}-people`,
        label: "People Involved / Who Went",
        hint: "Press Enter or comma to add a name.",
      }),
      inputField({
        id: `${prefix}-receipt`,
        label: "Receipt / Bill Reference",
        value: value.receiptUrl,
        placeholder: "https://drive.google.com/... (optional)",
        span: true,
      }),
      textareaField({
        id: `${prefix}-notes`,
        label: "Notes",
        value: value.notes,
        placeholder: "Purchased from local market",
        span: true,
      }),
    ].join(""),
    onSave: async ({ form, modal, saveBtn }) => {
      const get = (key) =>
        document.getElementById(`${prefix}-${key}`).value.trim();
      const receipt = get("receipt");

      const checks = [
        [`${prefix}-title`, validators.required("Expense title")(get("title"))],
        [
          `${prefix}-category`,
          validators.required("Category")(get("category")),
        ],
        [`${prefix}-amount`, validators.amount("Amount")(get("amount"))],
        [`${prefix}-date`, validators.date("Date")(get("date"))],
        [
          `${prefix}-receipt`,
          receipt && !/^(https?:\/\/|\/)/i.test(receipt)
            ? "Enter a valid URL starting with https://"
            : null,
        ],
      ];
      const failed = checks.filter(([, error]) => error);
      checks.forEach(([id, error]) => setError(id, error));
      if (failed.length) return focusFirstError(ids);

      const payload = {
        title: get("title"),
        category: get("category"),
        amount: toAmount(get("amount")),
        paidBy: get("paidBy"),
        peopleInvolved: chips.get(),
        date: get("date"),
        paymentMethod: document.getElementById(`${prefix}-method`).value,
        description: document
          .getElementById(`${prefix}-description`)
          .value.trim(),
        receiptUrl: receipt,
        notes: document.getElementById(`${prefix}-notes`).value.trim(),
      };

      await runSave({
        formId: `${prefix}-form`,
        ids,
        saveBtn,
        modal,
        form,
        action: () =>
          editing ? updateExpense(record.id, payload) : addExpense(payload),
        successMessage: editing
          ? "Expense updated successfully."
          : "Expense recorded successfully.",
      });
    },
  });

  const chips = wireChips(`${prefix}-people-box`);
  chips.set(Array.isArray(value.peopleInvolved) ? value.peopleInvolved : []);
  return modal;
}

export function openExpenseDetail(record) {
  const people = Array.isArray(record.peopleInvolved)
    ? record.peopleInvolved
    : [];
  const modal = openModal({
    title: esc(record.title || "Expense"),
    subtitle: record.category
      ? `${record.category} \u00B7 ${formatDateLong(record.date)}`
      : "",
    size: "modal-md",
    body: `
      <div class="detail-hero">
        <div>
          <div class="dh-label">Amount</div>
          <div class="dh-value">${formatCurrency(record.amount)}</div>
        </div>
        <span class="badge badge-info"><i data-lucide="tag"></i>${esc(record.category || "Other")}</span>
      </div>
      <div class="kv">
        <div class="kv-k">Expense</div><div class="kv-v">${esc(record.title || "\u2014")}</div>
        <div class="kv-k">Category</div><div class="kv-v">${esc(record.category || "Other")}</div>
        <div class="kv-k">Amount</div><div class="kv-v">${formatCurrency(record.amount)}</div>
        <div class="kv-k">Paid By</div><div class="kv-v">${esc(record.paidBy || "\u2014")}</div>
        <div class="kv-k">People Involved</div>
        <div class="kv-v">${
          people.length
            ? `<span class="people-list">${people.map((p) => `<span class="badge">${esc(p)}</span>`).join("")}</span>`
            : "\u2014"
        }</div>
        <div class="kv-k">Purpose</div><div class="kv-v">${esc(record.description || "\u2014")}</div>
        <div class="kv-k">Date</div><div class="kv-v">${formatDateLong(record.date)}</div>
        <div class="kv-k">Payment Method</div><div class="kv-v">${esc(record.paymentMethod || "\u2014")}</div>
        <div class="kv-k">Recorded</div><div class="kv-v">${formatTimestamp(record.createdAt)}</div>
        ${record.receiptUrl ? `<div class="kv-k">Receipt</div><div class="kv-v"><a href="${esc(record.receiptUrl)}" target="_blank" rel="noopener">Open receipt reference</a></div>` : ""}
        <div class="kv-k">Notes</div><div class="kv-v">${record.notes ? esc(record.notes) : "\u2014"}</div>
      </div>`,
    footer: `
      <button class="btn btn-outline btn-sm" type="button" data-act="delete">
        <i data-lucide="trash-2"></i> Delete
      </button>
      <button class="btn btn-outline" type="button" data-act="edit">
        <i data-lucide="pencil"></i> Edit
      </button>
      <button class="btn btn-primary" type="button" data-act="close">Done</button>`,
  });

  modal.footer
    .querySelector('[data-act="close"]')
    .addEventListener("click", () => modal.close());
  modal.footer
    .querySelector('[data-act="edit"]')
    .addEventListener("click", () => {
      modal.close();
      openExpenseForm(record);
    });
  modal.footer
    .querySelector('[data-act="delete"]')
    .addEventListener("click", async () => {
      modal.close();
      await removeExpense(record);
    });
  return modal;
}

export async function removeExpense(record) {
  const { ok } = await confirmDialog({
    heading: "Are you sure?",
    message: "This record will be permanently deleted.",
    confirmLabel: "Delete",
    tone: "danger",
    icon: "trash-2",
    extra: `<div class="amount-callout">${formatCurrency(record.amount)}</div>
            <p class="text-muted" style="font-size:13px;margin-top:8px">${esc(record.title || "")}</p>`,
  });
  if (!ok) return false;
  try {
    await deleteExpense(record.id);
    toast("Record deleted successfully.", "success");
    return true;
  } catch (error) {
    toast(error.message, "error");
    return false;
  }
}

/* =========================================================
   PENDING PAYMENTS
   ========================================================= */

export function openPendingForm(record = null) {
  const editing = Boolean(record);
  const prefix = `p${++formSeq}`;
  const value = record || {};
  const ids = [
    `${prefix}-name`,
    `${prefix}-amount`,
    `${prefix}-expected`,
    `${prefix}-added`,
  ];

  const modal = openFormModal({
    formId: `${prefix}-form`,
    title: editing ? "Edit Pending Payment" : "Add Pending Payment",
    subtitle:
      "Record a promise. It is excluded from Total Collected until it is paid.",
    confirmLabel: editing ? "Save Changes" : "Add Pending Payment",
    body: [
      inputField({
        id: `${prefix}-name`,
        label: "Person Name",
        value: value.name,
        placeholder: "Karan Shah",
        required: true,
      }),
      inputField({
        id: `${prefix}-phone`,
        label: "Phone Number",
        type: "tel",
        value: value.phone,
        placeholder: "98765 43210",
      }),
      inputField({
        id: `${prefix}-amount`,
        label: "Promised Amount",
        type: "text",
        inputmode: "numeric",
        value: value.promisedAmount ?? "",
        placeholder: "5000",
        required: true,
        prefix: "\u20B9",
      }),
      selectField({
        id: `${prefix}-status`,
        label: "Status",
        options: [
          { value: "Pending", label: "Pending" },
          { value: "Paid", label: "Paid" },
        ],
        value: value.status || "Pending",
      }),
      inputField({
        id: `${prefix}-expected`,
        label: "Expected Payment Date",
        type: "date",
        value: value.expectedDate || "",
      }),
      inputField({
        id: `${prefix}-added`,
        label: "Date Added",
        type: "date",
        value: value.dateAdded || todayISO(),
      }),
      textareaField({
        id: `${prefix}-notes`,
        label: "Reason / Notes",
        value: value.notes,
        placeholder: "Will pay after Diwali",
        span: true,
      }),
    ].join(""),
    onSave: async ({ form, modal, saveBtn }) => {
      const get = (key) =>
        document.getElementById(`${prefix}-${key}`).value.trim();

      const checks = [
        [`${prefix}-name`, validators.required("Name")(get("name"))],
        [
          `${prefix}-amount`,
          validators.amount("Promised amount")(get("amount")),
        ],
        [`${prefix}-phone`, validators.phone()(get("phone"))],
        [
          `${prefix}-expected`,
          validators.date("Expected payment date")(get("expected")),
        ],
        [`${prefix}-added`, validators.date("Date added")(get("added"))],
      ];
      const failed = checks.filter(([, error]) => error);
      checks.forEach(([id, error]) => setError(id, error));
      if (failed.length) return focusFirstError(ids);

      const payload = {
        name: get("name"),
        phone: get("phone"),
        promisedAmount: toAmount(get("amount")),
        status: document.getElementById(`${prefix}-status`).value,
        expectedDate: get("expected"),
        dateAdded: get("added"),
        notes: document.getElementById(`${prefix}-notes`).value.trim(),
      };

      await runSave({
        formId: `${prefix}-form`,
        ids,
        saveBtn,
        modal,
        form,
        action: () =>
          editing
            ? updatePendingPayment(record.id, payload)
            : addPendingPayment(payload),
        successMessage: editing
          ? "Pending payment updated."
          : "Pending payment added.",
        detail: "It stays out of Total Collected until it is marked as paid.",
      });
    },
  });

  return modal;
}

export function openPendingDetail(record) {
  const active = isPromisePending(record);
  const modal = openModal({
    title: esc(record.name || "Pending payment"),
    subtitle: active ? "Promised, money not received yet" : "Settled",
    size: "modal-md",
    body: `
      <div class="detail-hero">
        <div>
          <div class="dh-label">Promised Amount</div>
          <div class="dh-value">${formatCurrency(record.promisedAmount)}</div>
        </div>
        <span class="badge ${active ? "badge-pending" : "badge-paid"}">
          <i data-lucide="${active ? "clock" : "circle-check"}"></i>${active ? "PENDING" : "PAID"}
        </span>
      </div>
      <div class="kv">
        <div class="kv-k">Name</div><div class="kv-v">${esc(record.name || "\u2014")}</div>
        <div class="kv-k">Phone</div><div class="kv-v">${record.phone ? esc(record.phone) : "\u2014"}</div>
        <div class="kv-k">Promised Amount</div><div class="kv-v">${formatCurrency(record.promisedAmount)}</div>
        <div class="kv-k">Expected Date</div><div class="kv-v">${record.expectedDate ? formatDateLong(record.expectedDate) : "\u2014"}</div>
        <div class="kv-k">Date Added</div><div class="kv-v">${formatDateLong(record.dateAdded || record.createdAt)}</div>
        <div class="kv-k">Status</div><div class="kv-v">${active ? "Pending" : "Paid"}</div>
        ${record.paidDate ? `<div class="kv-k">Payment Date</div><div class="kv-v">${formatDateTime(record.paidDate)}</div>` : ""}
        <div class="kv-k">Notes</div><div class="kv-v">${record.notes ? esc(record.notes) : "\u2014"}</div>
      </div>`,
    footer: active
      ? `
        <button class="btn btn-outline btn-sm" type="button" data-act="delete"><i data-lucide="trash-2"></i> Delete</button>
        <button class="btn btn-outline" type="button" data-act="edit"><i data-lucide="pencil"></i> Edit</button>
        <button class="btn btn-success" type="button" data-act="paid"><i data-lucide="check"></i> Mark as Paid</button>`
      : `
        <button class="btn btn-outline btn-sm" type="button" data-act="delete"><i data-lucide="trash-2"></i> Delete</button>
        <button class="btn btn-outline" type="button" data-act="edit"><i data-lucide="pencil"></i> Edit</button>
        <button class="btn btn-primary" type="button" data-act="close">Done</button>`,
  });

  modal.footer
    .querySelector('[data-act="close"]')
    ?.addEventListener("click", () => modal.close());
  modal.footer
    .querySelector('[data-act="edit"]')
    ?.addEventListener("click", () => {
      modal.close();
      openPendingForm(record);
    });
  modal.footer
    .querySelector('[data-act="paid"]')
    ?.addEventListener("click", async () => {
      modal.close();
      await markAsPaidFlow(record);
    });
  modal.footer
    .querySelector('[data-act="delete"]')
    ?.addEventListener("click", async () => {
      modal.close();
      await removePending(record);
    });
  return modal;
}

export async function removePending(record) {
  const { ok } = await confirmDialog({
    heading: "Are you sure?",
    message: "This record will be permanently deleted.",
    confirmLabel: "Delete",
    tone: "danger",
    icon: "trash-2",
    extra: `<div class="amount-callout">${formatCurrency(record.promisedAmount)}</div>
            <p class="text-muted" style="font-size:13px;margin-top:8px">${esc(record.name || "")}</p>`,
  });
  if (!ok) return false;
  try {
    await deletePendingPayment(record.id);
    toast("Record deleted successfully.", "success");
    return true;
  } catch (error) {
    toast(error.message, "error");
    return false;
  }
}

/** Confirmation + atomic conversion of a promise into a real collection. */
export async function markAsPaidFlow(record) {
  const result = await confirmDialog({
    heading: "Has this person paid?",
    message:
      "Confirm the money has actually been received. It moves from Pending to Total Collected and a collection record is created.",
    amount: Number(record.promisedAmount) || 0,
    confirmLabel: "Mark as Paid",
    cancelLabel: "Cancel",
    tone: "warn",
    icon: "circle-check",
    extra: `
      <div class="field" style="margin-top:16px;text-align:left">
        <label class="field-label" for="paid-method">Received as</label>
        <select class="select" id="paid-method" name="paymentMethod">
          ${PAYMENT_METHODS.map((m) => `<option value="${esc(m)}"${m === "Cash" ? " selected" : ""}>${esc(m)}</option>`).join("")}
        </select>
      </div>`,
  });

  if (!result.ok) return false;

  try {
    await markPendingAsPaid(record.id, {
      paymentMethod: result.values.paymentMethod || "Cash",
      date: todayISO(),
    });
    toast(
      "Payment recorded and added to total collection.",
      "success",
      "Pending amount updated automatically.",
    );
    return true;
  } catch (error) {
    toast(error.message, "error");
    return false;
  }
}
