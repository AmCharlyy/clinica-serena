import assert from "node:assert/strict";
import {
  addDays,
  mondayOfWeek,
  monthGrid,
  shiftPeriod,
} from "../frontend/src/calendar.ts";
assert.equal(addDays("2026-12-31", 1), "2027-01-01");
assert.equal(mondayOfWeek("2026-10-04"), "2026-09-28");
assert.equal(shiftPeriod("2026-01-31", 1, "Mes"), "2026-02-01");
assert.equal(shiftPeriod("2026-01-31", -1, "Mes"), "2025-12-01");
assert.equal(shiftPeriod("2026-10-02", 1, "Semana"), "2026-10-09");
assert.equal(monthGrid("2026-03-31").length, 42);
assert.equal(monthGrid("2026-03-31")[0], "2026-02-23");
assert(monthGrid("2024-02-20").includes("2024-02-29"));
assert(!monthGrid("2026-02-20").includes("2026-02-29"));
console.log(
  "✓ Calendario: meses completos, seis semanas, año bisiesto y cambios de mes/año.",
);
