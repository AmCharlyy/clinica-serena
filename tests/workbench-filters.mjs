import assert from "node:assert/strict";
import {
  matchesAppointmentTask,
  matchesCatalogTask,
} from "../frontend/src/workbenchFilters.ts";
import { workspaceFor } from "../frontend/src/workspaces.ts";
const day = "2026-10-03",
  expiry = "2026-11-02";
let passed = 0;
function check(expected, actual) {
  assert.equal(actual, expected);
  passed++;
}
const appointment = {
  id: 1,
  date: day,
  status: "Confirmada",
  checkedInAt: null,
};
check(true, matchesAppointmentTask(appointment, "arrivals", day));
check(
  false,
  matchesAppointmentTask(
    { ...appointment, date: "2026-10-04" },
    "arrivals",
    day,
  ),
);
check(
  false,
  matchesAppointmentTask(
    { ...appointment, status: "Pendiente" },
    "arrivals",
    day,
  ),
);
check(
  false,
  matchesAppointmentTask(
    { ...appointment, checkedInAt: "2026-10-03T16:00Z" },
    "arrivals",
    day,
  ),
);
check(
  true,
  matchesAppointmentTask(
    { ...appointment, checkedInAt: "2026-10-03T16:00Z" },
    "waiting",
    day,
  ),
);
check(false, matchesAppointmentTask(appointment, "waiting", day));
check(
  false,
  matchesAppointmentTask(
    { ...appointment, status: "En curso", checkedInAt: "2026-10-03T16:00Z" },
    "waiting",
    day,
  ),
);
check(true, matchesAppointmentTask(appointment, "desconocido", day));
check(
  true,
  matchesCatalogTask(
    { id: 1, status: "Pagado" },
    "payments",
    "receipts",
    expiry,
  ),
);
check(
  false,
  matchesCatalogTask(
    { id: 1, status: "Pagado" },
    "payments",
    "receipts",
    expiry,
    [{ paymentId: 1 }],
  ),
);
check(
  false,
  matchesCatalogTask(
    { id: 1, status: "Pendiente" },
    "payments",
    "receipts",
    expiry,
  ),
);
check(
  false,
  matchesCatalogTask(
    { id: 1, status: "Anulado" },
    "payments",
    "receipts",
    expiry,
  ),
);
check(
  true,
  matchesCatalogTask(
    { active: true, validUntil: "2026-10-02" },
    "companies",
    "expiring",
    expiry,
  ),
);
check(
  true,
  matchesCatalogTask(
    { active: true, validUntil: expiry },
    "companies",
    "expiring",
    expiry,
  ),
);
check(
  false,
  matchesCatalogTask(
    { active: true, validUntil: "2026-11-03" },
    "companies",
    "expiring",
    expiry,
  ),
);
check(
  false,
  matchesCatalogTask(
    { active: false, validUntil: day },
    "companies",
    "expiring",
    expiry,
  ),
);
check(
  false,
  matchesCatalogTask(
    { active: true, validUntil: null },
    "companies",
    "expiring",
    expiry,
  ),
);
check(
  false,
  matchesCatalogTask(
    { active: true, validUntil: "" },
    "companies",
    "expiring",
    expiry,
  ),
);
check(
  true,
  matchesCatalogTask(
    { active: true, mustChangePassword: true },
    "users",
    "initialPassword",
    expiry,
  ),
);
check(
  false,
  matchesCatalogTask(
    { active: false, mustChangePassword: true },
    "users",
    "initialPassword",
    expiry,
  ),
);
check(
  false,
  matchesCatalogTask(
    { active: true, mustChangePassword: false },
    "users",
    "initialPassword",
    expiry,
  ),
);
check(
  true,
  matchesCatalogTask({ active: true }, "users", "desconocido", expiry),
);
const account = {
  id: 1,
  name: "Demo",
  username: "qa",
  audience: "internal",
  roles: ["Recepción"],
  permissions: [],
  patientId: null,
  doctorId: null,
  companyId: null,
  mustChangePassword: false,
};
check("personal", workspaceFor(account).kind);
check(
  "access",
  workspaceFor({
    ...account,
    roles: ["Rol personalizado"],
    permissions: ["roles.read"],
  }).kind,
);
check(
  "support",
  workspaceFor({ ...account, permissions: ["backups.read"] }).kind,
);
check(
  "reception",
  workspaceFor({
    ...account,
    roles: ["Rol personalizado"],
    permissions: ["appointments.read", "appointments.checkin"],
  }).kind,
);
check(
  "operations",
  workspaceFor({ ...account, permissions: ["staff.read"] }).kind,
);
check("patient", workspaceFor({ ...account, audience: "patient" }).kind);
check(
  "doctor",
  workspaceFor({ ...account, audience: "doctor", doctorId: 1 }).kind,
);
check(
  "company",
  workspaceFor({ ...account, audience: "company", companyId: 1 }).kind,
);
check("blocked", workspaceFor({ ...account, audience: "blocked" }).kind);
console.log(`${passed} comprobaciones de filtros operativos aprobadas.`);
