import { db } from "../db/connection.js";

export function listDutyTypes() {
  return db.prepare(`
    SELECT id, code, name, sector_value AS sectorValue, is_paid AS isPaid
    FROM duty_types ORDER BY name
  `).all();
}

export function saveDutyType({ id, code, name, sectorValue, isPaid }) {
  const dutyCode = String(code || name || "").trim();
  const dutyName = String(name || code || "").trim();
  if (!dutyCode || !dutyName) throw new Error("Enter a duty code and name.");
  const value = Number(sectorValue || 0);
  if (!Number.isFinite(value)) throw new Error("Sector value must be a number.");

  try {
    if (id) {
      const result = db.prepare(`
        UPDATE duty_types
        SET code = ?, name = ?, sector_value = ?, is_paid = ?
        WHERE id = ?
      `).run(dutyCode, dutyName, value, toBoolean(isPaid), Number(id));
      if (!result.changes) throw new Error("Duty type not found.");
    } else {
      db.prepare(`
        INSERT INTO duty_types (code, name, sector_value, is_paid)
        VALUES (?, ?, ?, ?)
      `).run(dutyCode, dutyName, value, toBoolean(isPaid));
    }
  } catch (error) {
    if (String(error.message).includes("UNIQUE constraint failed")) {
      throw new Error("That duty code already exists.");
    }
    throw error;
  }
  return { saved: true };
}

export function deleteDutyType(id) {
  const references = db.prepare(
    "SELECT COUNT(*) AS count FROM misc_duties WHERE duty_type_id = ?"
  ).get(Number(id)).count;
  if (references) {
    throw new Error(`This duty type is used by ${references} roster duties and cannot be deleted.`);
  }
  const result = db.prepare("DELETE FROM duty_types WHERE id = ?").run(Number(id));
  if (!result.changes) throw new Error("Duty type not found.");
  return { deleted: true };
}

export function listMiscDuties() {
  return db.prepare(`
    SELECT m.id, m.duty_date AS dutyDate, m.duty_type_id AS dutyTypeId,
           d.code AS dutyCode, d.name AS dutyName, m.paid, m.notes
    FROM misc_duties m
    JOIN duty_types d ON d.id = m.duty_type_id
    ORDER BY m.duty_date DESC, m.id DESC
  `).all();
}

export function saveMiscDuty({ id, dutyDate, dutyTypeId, paid }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dutyDate || ""))) {
    throw new Error("Select a valid duty date.");
  }
  if (!db.prepare("SELECT 1 FROM duty_types WHERE id = ?").get(Number(dutyTypeId))) {
    throw new Error("Select a duty type.");
  }

  if (id) {
    const result = db.prepare(`
      UPDATE misc_duties SET duty_date = ?, duty_type_id = ?, paid = ? WHERE id = ?
    `).run(dutyDate, Number(dutyTypeId), toBoolean(paid), Number(id));
    if (!result.changes) throw new Error("Duty not found.");
  } else {
    db.prepare(`
      INSERT INTO misc_duties (duty_date, duty_type_id, paid) VALUES (?, ?, ?)
    `).run(dutyDate, Number(dutyTypeId), toBoolean(paid));
  }
  return { saved: true };
}

export function markMiscDutyPaid(id) {
  const result = db.prepare("UPDATE misc_duties SET paid = 1 WHERE id = ?").run(Number(id));
  if (!result.changes) throw new Error("Duty not found.");
  return { paid: true };
}

export function deleteMiscDuty(id) {
  const result = db.prepare("DELETE FROM misc_duties WHERE id = ?").run(Number(id));
  if (!result.changes) throw new Error("Duty not found.");
  return { deleted: true };
}

function toBoolean(value) {
  return value === true || value === 1 || value === "1" || value === "true" ? 1 : 0;
}
