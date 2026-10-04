import type { Row } from "./api.ts";

export const appointmentStates = [
  "Todas",
  "Pendiente",
  "Confirmada",
  "En curso",
  "Finalizada",
  "Cancelada",
  "Rechazada",
];
export const paymentStates = ["Todos", "Pendiente", "Pagado", "Anulado"];
export const appointmentTasks: Record<string, string> = {
  arrivals: "Llegadas por registrar",
  waiting: "Pacientes en espera",
};
export const catalogTasks: Record<string, Record<string, string>> = {
  payments: { receipts: "Pagos sin comprobante" },
  companies: { expiring: "Convenios vencidos o por vencer en 30 días" },
  users: { initialPassword: "Cambio inicial de contraseña pendiente" },
};

export function matchesAppointmentTask(row: Row, task: string, today: string) {
  if (task === "arrivals")
    return (
      row.date === today && row.status === "Confirmada" && !row.checkedInAt
    );
  if (task === "waiting")
    return (
      row.date === today &&
      row.status === "Confirmada" &&
      Boolean(row.checkedInAt)
    );
  return true;
}

export function matchesCatalogTask(
  row: Row,
  module: string,
  task: string,
  expiry: string,
  invoices: Row[] = [],
) {
  if (module === "payments" && task === "receipts")
    return (
      row.status === "Pagado" && !invoices.some((i) => i.paymentId === row.id)
    );
  if (module === "companies" && task === "expiring")
    return (
      row.active !== false &&
      typeof row.validUntil === "string" &&
      row.validUntil !== "" &&
      row.validUntil <= expiry
    );
  if (module === "users" && task === "initialPassword")
    return row.active !== false && row.mustChangePassword === true;
  return true;
}
