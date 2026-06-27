import { db, transaction } from "../db/connection.js";

export function listPaymentPeriods() {
  const periods = db.prepare(`
    SELECT id, effective_date AS effectiveDate, basic_salary AS basicSalary
    FROM payment_periods ORDER BY effective_date DESC
  `).all();
  const components = db.prepare(`
    SELECT id, payment_period_id AS paymentPeriodId, code, name,
           calculation_type AS calculationType, ratio, amount
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
        payment_period_id, code, name, calculation_type, ratio, amount
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const component of components) {
      const type = component.calculationType === "fixed" ? "fixed" : "ratio";
      insert.run(
        periodId,
        slug(component.code || component.name),
        clean(component.name),
        type,
        type === "ratio" ? nullableNumber(component.ratio) : null,
        type === "fixed" ? nullableNumber(component.amount) : null
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
    components: latest.components.map(({ code, name, calculationType, ratio, amount }) => ({
      code, name, calculationType, ratio, amount
    }))
  };
}

export function deletePaymentPeriod(id) {
  const result = db.prepare("DELETE FROM payment_periods WHERE id = ?").run(Number(id));
  if (!result.changes) throw new Error("Payment period not found.");
  return { deleted: true };
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
