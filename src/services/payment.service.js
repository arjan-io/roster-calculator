import { db, transaction } from "../db/connection.js";

export function listPaymentPeriods() {
  const periods = db.prepare(`
    SELECT id, effective_date AS effectiveDate, basic_salary AS basicSalary,
           normal_tax_rate AS normalTaxRate, special_tax_rate AS specialTaxRate
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

export function savePaymentPeriod({
  id, effectiveDate, basicSalary, normalTaxRate, specialTaxRate, components = []
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(effectiveDate || ""))) {
    throw new Error("Select a valid effective date.");
  }
  const salary = Number(basicSalary);
  if (!Number.isFinite(salary) || salary < 0) throw new Error("Enter a valid basic salary.");
  const normalRate = percentage(normalTaxRate, 43.31, "Enter a valid normal tax rate.");
  const specialRate = percentage(specialTaxRate, 49.5, "Enter a valid special tax rate.");

  return transaction(() => {
    let periodId = Number(id);
    if (periodId) {
      db.prepare(`
        UPDATE payment_periods
        SET effective_date = ?, basic_salary = ?, normal_tax_rate = ?, special_tax_rate = ?
        WHERE id = ?
      `).run(effectiveDate, salary, normalRate, specialRate, periodId);
      db.prepare("DELETE FROM payment_components WHERE payment_period_id = ?").run(periodId);
    } else {
      const result = db.prepare(
        `INSERT INTO payment_periods (
          effective_date, basic_salary, normal_tax_rate, special_tax_rate
        ) VALUES (?, ?, ?, ?)`
      ).run(effectiveDate, salary, normalRate, specialRate);
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
  if (!latest) {
    return { basicSalary: 0, normalTaxRate: 43.31, specialTaxRate: 49.5, components: [] };
  }
  return {
    basicSalary: latest.basicSalary,
    normalTaxRate: latest.normalTaxRate,
    specialTaxRate: latest.specialTaxRate,
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

export function calculatePaymentPreview(paymentMonth) {
  validateMonth(paymentMonth, "Select a valid payment month.");
  const period = db.prepare(`
    SELECT id, effective_date AS effectiveDate, basic_salary AS basicSalary,
           normal_tax_rate AS normalTaxRate, special_tax_rate AS specialTaxRate
    FROM payment_periods
    WHERE effective_date <= ?
    ORDER BY effective_date DESC
    LIMIT 1
  `).get(`${paymentMonth}-31`);
  if (!period) throw new Error("No payment details apply to this month.");

  const components = db.prepare(`
    SELECT code, name, calculation_type AS calculationType, ratio, amount,
           payment_treatment AS paymentTreatment
    FROM payment_components
    WHERE payment_period_id = ?
  `).all(period.id);
  const componentMap = new Map(components.map((component) => [component.code, component]));
  const rosterMonth = previousPaymentMonth(paymentMonth);
  const earnings = [];
  const grossDeductions = [];
  const netAdjustments = [];

  addTaxedLine(earnings, "Salary", period.basicSalary / 12, "normal");

  const loyalty = componentMap.get("loyalty");
  if (loyalty) {
    addTaxedLine(
      earnings,
      loyalty.name || "Loyalty Bonus",
      componentValue(loyalty, period.basicSalary) / 12,
      loyalty.paymentTreatment === "normal" ? "normal" : "special"
    );
  }

  const travel = componentMap.get("travel");
  if (travel) {
    const amount = componentValue(travel, period.basicSalary);
    if (amount) {
      addTaxedLine(earnings, "Gross exchange for travel costs", -amount, "normal");
      netAdjustments.push({ label: "Travel costs reimbursement", amount });
    }
  }

  const sectorRate = componentMap.get("sector");
  const sectorRateValue = componentValue(sectorRate, period.basicSalary);
  const sectorCounts = db.prepare(`
    SELECT
      SUM(CASE WHEN distance_nm <= 399 THEN 1 ELSE 0 END) AS shortCount,
      SUM(CASE WHEN distance_nm BETWEEN 400 AND 1000 THEN 1 ELSE 0 END) AS mediumCount,
      SUM(CASE WHEN distance_nm BETWEEN 1001 AND 1500 THEN 1 ELSE 0 END) AS longCount,
      SUM(CASE WHEN distance_nm > 1500 THEN 1 ELSE 0 END) AS extraLongCount
    FROM flights
    WHERE substr(flight_date, 1, 7) = ?
      AND distance_nm IS NOT NULL
  `).get(rosterMonth);
  const sectorBreakdown = [
    sectorBreakdownRow("Short", Number(sectorCounts.shortCount || 0), 0.8, sectorRateValue),
    sectorBreakdownRow("Medium", Number(sectorCounts.mediumCount || 0), 1.2, sectorRateValue),
    sectorBreakdownRow("Long", Number(sectorCounts.longCount || 0), 1.5, sectorRateValue),
    sectorBreakdownRow("Extra long", Number(sectorCounts.extraLongCount || 0), 2.5, sectorRateValue)
  ];
  const sectorUnits = sectorBreakdown.reduce((total, row) => total + row.nominal, 0);
  if (sectorRate && sectorUnits) {
    addTaxedLine(
      earnings,
      "Sector Pay",
      sectorUnits * sectorRateValue,
      "normal",
      { quantity: sectorUnits }
    );
  }

  const dutyRows = db.prepare(`
    SELECT duty_types.name, duty_types.sector_value AS sectorValue,
           duty_types.is_paid AS isPaid,
           duty_types.tax_treatment AS taxTreatment,
           duty_types.payment_component_code AS paymentComponentCode,
           duty_types.payment_multiplier AS paymentMultiplier,
           COUNT(misc_duties.id) AS quantity
    FROM duty_types
    LEFT JOIN misc_duties
      ON misc_duties.duty_type_id = duty_types.id
     AND substr(misc_duties.duty_date, 1, 7) = ?
    GROUP BY duty_types.id
    ORDER BY duty_types.name
  `).all(rosterMonth);
  const dutyBreakdown = [];

  for (const duty of dutyRows) {
    let unitAmount = 0;
    let rateSource = "Not included in pay";
    if (duty.isPaid && Number(duty.sectorValue)) {
      unitAmount = Number(duty.sectorValue) * sectorRateValue;
      rateSource = `${duty.sectorValue} sector units`;
    } else if (duty.isPaid && duty.paymentComponentCode) {
      unitAmount =
        componentValue(componentMap.get(duty.paymentComponentCode), period.basicSalary) *
        Number(duty.paymentMultiplier || 1);
      rateSource = duty.paymentMultiplier && duty.paymentMultiplier !== 1
        ? `${duty.paymentComponentCode} x ${duty.paymentMultiplier}`
        : duty.paymentComponentCode;
    }
    const amount = Number(duty.quantity) * unitAmount;
    const normal = duty.taxTreatment === "normal" ? amount : 0;
    const special = duty.taxTreatment === "special" ? amount : 0;
    dutyBreakdown.push({
      name: duty.name,
      quantity: Number(duty.quantity),
      rateSource,
      normal,
      special,
      net: duty.taxTreatment === "none" ? amount : 0
    });

    if (!amount) continue;
    if (duty.taxTreatment === "none") {
      netAdjustments.push({ label: duty.name, amount, quantity: duty.quantity });
    } else {
      addTaxedLine(earnings, duty.name, amount, duty.taxTreatment, { quantity: duty.quantity });
    }
  }

  const [year, month] = paymentMonth.split("-").map(Number);
  const oneOffs = db.prepare(`
    SELECT description, amount, tax_treatment AS taxTreatment
    FROM one_off_payments
    WHERE payment_year = ? AND payment_month = ?
    ORDER BY id
  `).all(year, month);
  for (const payment of oneOffs) {
    if (payment.taxTreatment === "net") {
      netAdjustments.push({ label: payment.description, amount: payment.amount });
    } else {
      addTaxedLine(earnings, payment.description, payment.amount, payment.taxTreatment);
    }
  }

  const normalPercentageBasis = earnings.reduce(
    (total, line) => total + Math.max(Number(line.normal || 0), 0),
    0
  );
  const deductionRows = db.prepare(`
    SELECT description, amount, payment_stage AS paymentStage,
           calculation_type AS calculationType
    FROM deductions
    WHERE start_month <= ?
      AND (end_month IS NULL OR end_month = '' OR end_month >= ?)
    ORDER BY id
  `).all(paymentMonth, paymentMonth);

  for (const deduction of deductionRows) {
    const amount = deduction.calculationType === "normal_percentage"
      ? normalPercentageBasis * Number(deduction.amount) / 100
      : Number(deduction.amount);
    const line = { label: deduction.description, amount: -amount };
    if (deduction.paymentStage === "gross") {
      grossDeductions.push(line);
    } else {
      netAdjustments.push(line);
    }
  }

  const normal = earnings.reduce((total, line) => total + Number(line.normal || 0), 0);
  const special = earnings.reduce((total, line) => total + Number(line.special || 0), 0);
  const grossDeductionTotal = grossDeductions.reduce((total, line) => total + line.amount, 0);
  const netAdjustmentTotal = netAdjustments.reduce((total, line) => total + line.amount, 0);
  const taxableNormal = normal + grossDeductionTotal;
  const taxableSpecial = special;
  const normalTax = Math.max(taxableNormal, 0) * Number(period.normalTaxRate) / 100;
  const specialTax = Math.max(taxableSpecial, 0) * Number(period.specialTaxRate) / 100;
  const taxTotal = normalTax + specialTax;

  return {
    paymentMonth,
    rosterMonth,
    paymentPeriod: period,
    sectorBreakdown,
    dutyBreakdown,
    earnings,
    grossDeductions,
    netAdjustments,
    totals: {
      normal,
      special,
      gross: normal + special,
      taxableNormal,
      taxableSpecial,
      taxableBasis: taxableNormal + taxableSpecial,
      normalTax,
      specialTax,
      taxTotal,
      grossDeductions: grossDeductionTotal,
      netAdjustments: netAdjustmentTotal,
      payable: taxableNormal + taxableSpecial - taxTotal + netAdjustmentTotal
    }
  };
}

function sectorBreakdownRow(label, count, weight, sectorRate) {
  const nominal = count * weight;
  return { label, count, weight, nominal, amount: nominal * sectorRate };
}

function addTaxedLine(lines, label, amount, treatment, extra = {}) {
  if (!amount) return;
  lines.push({
    label,
    normal: treatment === "normal" ? amount : 0,
    special: treatment === "special" ? amount : 0,
    ...extra
  });
}

function componentValue(component, basicSalary) {
  if (!component) return 0;
  return component.calculationType === "ratio"
    ? Number(basicSalary) * Number(component.ratio || 0)
    : Number(component.amount || 0);
}

function previousPaymentMonth(value) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
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

function percentage(value, fallback, message) {
  const parsed = value === "" || value === null || value === undefined ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) throw new Error(message);
  return parsed;
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
