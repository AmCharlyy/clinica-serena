import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import path from "node:path";
const database = new DatabaseSync(path.resolve(process.argv[2]), { readOnly: true });
const tables = ["Patients", "Staff", "Facilities", "Services", "Companies", "Appointments", "AppointmentChanges", "ClinicalNotes", "Documents", "Payments", "Invoices", "Notifications", "Settings", "Backups"];
const result = {};
for (const table of tables) {
  if (!database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) continue;
  const rows = database.prepare(`SELECT * FROM ${table} ORDER BY Id`).all();
  result[table] = { count: rows.length, hash: createHash("sha256").update(JSON.stringify(rows)).digest("hex") };
}
console.log(JSON.stringify(result)); database.close();
