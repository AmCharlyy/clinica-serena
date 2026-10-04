const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function addDays(day: string, count: number) {
  const d = new Date(day + "T12:00:00");
  d.setDate(d.getDate() + count);
  return isoDay(d);
}
export function mondayOfWeek(day: string) {
  return addDays(day, -((new Date(day + "T12:00:00").getDay() + 6) % 7));
}
export function shiftPeriod(day: string, direction: number, view: string) {
  if (view !== "Mes") return addDays(day, direction * (view === "Día" ? 1 : 7));
  const d = new Date(day + "T12:00:00");
  d.setDate(1);
  d.setMonth(d.getMonth() + direction);
  return isoDay(d);
}
export function monthGrid(day: string) {
  const first = day.slice(0, 7) + "-01";
  const start = mondayOfWeek(first);
  const d = new Date(first + "T12:00:00");
  const count = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const offset = (d.getDay() + 6) % 7;
  const length = Math.ceil((offset + count) / 7) * 7;
  return Array.from({ length }, (_, i) => addDays(start, i));
}
