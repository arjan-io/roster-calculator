import { db, transaction } from "../db/connection.js";

export function listPaymentPeriods() {
  const periods = db.prepare(`
    SELECT id, effective_date AS effectiveDate, basic_salary AS basicSalary
    FROM payment_periods ORDER BY effective_date DESC
  `).all();
  const components = db.prepare(`
    SELECT id, payment_period_id AS paymentPeriodId, code, name,
           calculation_type AS calculationType, ratio, amount,
           payment_treatment AS paymentTreatment
    FROM payment_components ORDER BY id
  `).all();

  return periods.map((period) => ({
    ...period,
    components: components.filter((item) => item.paymentPeriodId === period.id)
  }));
}

export function savePaymentPeriod({ id, effectiveDate, basicSalary, components = [] }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(effectiveDate || ""))) {
    throw new Error("Select a valid effective date.");
  }
  const salary = Number(basicSalary);
  if (!Number.isFinite(salary) || salary < 0) throw new Error("Enter a valid basic salary.");

  return transaction(() => {
    let periodId = Number(id);
    if (periodId) {
      db.prepare("UPDATE payment_periods SET effective_date = ?, basic_salary = ? WHERE id = ?")
        .run(effectiveDate, salary, periodId);
      db.prepare("DELETE FROM payment_components WHERE payment_period_id = ?").run(periodId);
    } else {
      const result = db.prepare(
        "INSERT INTO payment_periods (effective_date, basic_salary) VALUES (?, ?)"
      ).run(effectiveDate, salary);
      periodId = Number(result.lastInsertRowid);
    }

    const insert = db.prepare(`
      INSERT INTO payment_components (
        payment_period_id, code, name, calculation_type, ratio, amount, payment_treatment
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const component of components) {
      const type = component.calculationType === "fixed" ? "fixed" : "ratio";
      insert.run(
        periodId,
        slug(component.code || component.name),
        clean(component.name),
        type,
        type === "ratio" ? nullableNumber(component.ratio) : null,
        type === "fixed" ? nullableNumber(component.amount) : null,
        normalizePaymentTreatment(component.paymentTreatment, component.code)
      );
    }
    return listPaymentPeriods().find((period) => period.id === periodId);
  })();
}

export function paymentPeriodDefaults() {
  const latest = listPaymentPeriods()[0];
  if (!latest) return { basicSalary: 0, components: [] };
  return {
    basicSalary: latest.basicSalary,
    components: latest.components.map(({ code, name, calculationType, ratio, amount, paymentTreatment }) => ({
      code, name, calculationType, ratio, amount, paymentTreatment
    }))
  };
}

export function deletePaymentPeriod(id) {
  const result = db.prepare("DELETE FROM payment_periods WHERE id = ?").run(Number(id));
  if (!result.changes) throw new Error("Payment period not found.");
  return { deleted: true };
}

export function listOneOffPayments() {
  return db.prepare(`
    SELECT id, payment_month AS paymentMonth, payment_year AS paymentYear,
           description, amount, tax_treatment AS taxTreatment
    FROM one_off_payments
    ORDER BY payment_year DESC, payment_month DESC, id DESC
  `).all();
}

export function saveOneOffPayment({ id, paymentMonth, paymentYear, month, description, amount, taxTreatment }) {
  const parsed = parsePaymentMonth(month, paymentMonth, paymentYear);
  const paymentAmount = requiredNumber(amount, "Enter a valid amount.");
  const label = clean(description) || "One-off payment";
  const treatment = ["normal", "net"].includes(taxTreatment) ? taxTreatment : "special";

  if (id) {
    const result = db.prepare(`
      UPDATE one_off_payments
      SET payment_month = ?, payment_year = ?, description = ?, amount = ?, tax_treatment = ?
      WHERE id = ?
    `).run(parsed.month, parsed.year, label, paymentAmount, treatment, Number(id));
    if (!result.changes) throw new Error("One-off payment not found.");
  } else {
    db.prepare(`
      INSERT INTO one_off_payments (payment_month, payment_year, description, amount, tax_treatment)
      VALUES (?, ?, ?, ?, ?)
    `).run(parsed.month, parsed.year, label, paymentAmount, treatment);
  }
  return { saved: true };
}

export function deleteOneOffPayment(id) {
  const result = db.prepare("DELETE FROM one_off_payments WHERE id = ?").run(Number(id));
  if (!result.changes) throw new Error("One-off payment not found.");
  return { deleted: true };
}

export function listDeductions() {
  return db.prepare(`
    SELECT id, start_month AS startMonth, end_month AS endMonth,
           payment_stage AS paymentStage, calculation_type AS calculationType, description, amount
    FROM deductions
    WHERE start_month IS NOT NULL
    ORDER BY start_month DESC, id DESC
  `).all();
}

export function saveDeduction({
  id, startMonth, endMonth, paymentStage, calculationType, description, amount
}) {
  validateMonth(startMonth, "Select a valid start month.");
  if (endMonth) validateMonth(endMonth, "Select a valid end month.");
  if (endMonth && endMonth < startMonth) {
    throw new Error("End month cannot be before start month.");
  }
  const stage = paymentStage === "gross" ? "gross" : "net";
  const type = calculationType === "normal_percentage" ? "normal_percentage" : "fixed";
  const label = clean(description);
  if (!label) throw new Error("Enter a deduction name.");
  const deductionAmount = requiredNumber(amount, "Enter a valid deduction amount.");

  if (id) {
    const result = db.prepare(`
      UPDATE deductions
      SET effective_date = ?, start_month = ?, end_month = ?,
          payment_stage = ?, calculation_type = ?, description = ?, amount = ?
      WHERE id = ?
    `).run(
      `${startMonth}-01`, startMonth, endMonth || null,
      stage, type, label, deductionAmount, Number(id)
    );
    if (!result.changes) throw new Error("Deduction not found.");
  } else {
    db.prepare(`
      INSERT INTO deductions (
        effective_date, start_month, end_month, payment_stage, calculation_type, description, amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(`${startMonth}-01`, startMonth, endMonth || null, stage, type, label, deductionAmount);
  }
  return { saved: true };
}

export function deleteDeduction(id) {
  const result = db.prepare("DELETE FROM deductions WHERE id = ?").run(Number(id));
  if (!result.changes) throw new Error("Deduction not found.");
  return { deleted: true };
}

function parsePaymentMonth(value, paymentMonth, paymentYear) {
  if (value) {
    validateMonth(value, "Select a valid payment month.");
    const [year, month] = value.split("-").map(Number);
    return { year, month };
  }
  const month = Number(paymentMonth);
  const year = Number(paymentYear);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
    throw new Error("Select a valid payment month.");
  }
  return { year, month };
}

function validateMonth(value, message) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ""))) throw new Error(message);
}

function requiredNumber(value, message) {
  const number = Number(value);
  if (value === "" || value === null || value === undefined || !Number.isFinite(number)) {
    throw new Error(message);
  }
  return number;
}

function normalizePaymentTreatment(value, code) {
  const allowed = ["normal", "special", "net_reimbursement", "gross_deduction"];
  if (allowed.includes(value)) return value;
  if (code === "loyalty") return "special";
  if (code === "travel") return "net_reimbursement";
  if (code === "pension") return "gross_deduction";
  return "normal";
}

function nullableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("Payment values must be numbers.");
  return number;
}
function clean(value) { return String(value ?? "").trim(); }
function slug(value) {
  const result = clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (!result) throw new Error("Every payment component needs a name.");
  return result;
}
