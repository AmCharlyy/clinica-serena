import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  Flower2,
  Activity,
  ClipboardList,
  Monitor,
  ShieldCheck,
  Plus,
  Stethoscope,
  Users,
} from "lucide-react";
import { api, date, money, num, today, txt, type Row } from "../api";
import { addDays, mondayOfWeek, monthGrid, shiftPeriod } from "../calendar";
import { useApp, useData, useLookups, useWrite } from "../state";
import { workspaceFor } from "../workspaces";
import { PatientBooking } from "./PortalPages";
import {
  appointmentStates,
  appointmentTasks,
  matchesAppointmentTask,
} from "../workbenchFilters";
import {
  AddButton,
  Avatar,
  Badge,
  DataForm,
  Empty,
  ErrorBox,
  ExportButton,
  Loading,
  Modal,
  PageHead,
  SearchBox,
  Table,
  ViewButton,
  type Field,
} from "../components";

export function Dashboard() {
  const data = useData<Row>("dashboard"),
    { user } = useApp(),
    navigate = useNavigate();
  const [newAppointment, setNewAppointment] = useState(false);
  if (data.isPending) return <Loading />;
  if (data.error)
    return (
      <ErrorBox message={data.error.message} retry={() => data.refetch()} />
    );
  const d = data.data!,
    upcoming = (d.upcoming ?? []) as Row[];
  const workspace = workspaceFor(user);
  const stats = [
    {
      label: "Citas para hoy",
      value: d.appointmentCount,
      icon: CalendarDays,
      detail: `${num(d, "completed")} consultas finalizadas`,
    },
    {
      label: user.audience === "doctor" ? "Mis pacientes" : "Pacientes activos",
      value: d.patientCount,
      icon: Users,
      detail: "Dentro de tu alcance",
    },
    {
      label: "Equipo médico",
      value: d.doctorCount,
      icon: Stethoscope,
      detail: "Médicos activos",
    },
    {
      label: "Ingresos registrados",
      value: d.income == null ? null : money(num(d, "income")),
      icon: CreditCard,
      detail: "Pagos de hoy · MXN",
    },
    {
      label: "Cuentas registradas",
      value: d.userCount,
      icon: Users,
      detail: "Gestión de acceso",
    },
    {
      label: "Roles configurados",
      value: d.roleCount,
      icon: ShieldCheck,
      detail: "Alcances explícitos",
    },
    {
      label: "Eventos registrados",
      value: d.auditCount,
      icon: ClipboardList,
      detail: "Trazabilidad",
    },
    {
      label: "Respaldos registrados",
      value: d.backupCount,
      icon: ShieldCheck,
      detail: "Historial autorizado",
    },
  ].filter((s) => s.value != null);
  const localeDate = new Date().toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Mexico_City",
  });
  return (
    <>
      <PageHead
        eyebrow={localeDate}
        title={workspace.title}
        description={workspace.description}
        action={
          user.permissions.includes("appointments.write") && (
            <AddButton onClick={() => setNewAppointment(true)}>
              Nueva cita
            </AddButton>
          )
        }
      />
      <div className="stats-grid">
        {stats.map((s) => (
          <div className="card stat-card" key={s.label}>
            <div className="stat-top">
              <span>{s.label}</span>
              <span className="stat-icon">
                <s.icon size={18} />
              </span>
            </div>
            <h2>{String(s.value)}</h2>
            <small>{s.detail}</small>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="card appointments-card">
          <div className="card-heading">
            <div>
              <h2>
                {user.permissions.includes("appointments.read")
                  ? user.audience === "doctor"
                    ? "Mi agenda de hoy"
                    : "Agenda de hoy"
                  : "Mi espacio de trabajo"}
              </h2>
              <p className="muted">
                {user.permissions.includes("appointments.read")
                  ? "Cada encuentro cuenta."
                  : workspace.description}
              </p>
            </div>
            {user.permissions.includes("appointments.read") && (
              <button className="link" onClick={() => navigate("/agenda")}>
                Ver agenda <ArrowRight size={15} />
              </button>
            )}
          </div>
          {upcoming.length ? (
            upcoming.map((a) => (
              <button
                className="upcoming-row"
                key={num(a, "id")}
                onClick={() => navigate("/appointments")}
              >
                <div className="appointment-time">
                  {txt(a, "time").slice(0, 5)}
                  <small>{num(a, "durationMinutes")} min</small>
                </div>
                <Avatar name={txt(a, "patientName")} />
                <div className="upcoming-person">
                  <strong>{txt(a, "patientName")}</strong>
                  <small>
                    {txt(a, "serviceName")} · {txt(a, "doctorName")}
                  </small>
                </div>
                <Badge value={txt(a, "status")} />
                <ChevronRight size={17} />
              </button>
            ))
          ) : (
            <Empty
              title={
                user.permissions.includes("appointments.read")
                  ? "Tu agenda está tranquila"
                  : "Tu espacio de trabajo está listo"
              }
              description={
                user.permissions.includes("appointments.read")
                  ? "No tienes citas para hoy dentro de tu alcance."
                  : "Usa los accesos de abajo para entrar a las herramientas de tu rol. Esta cuenta no consulta la agenda clínica."
              }
            />
          )}
        </section>
        <div className="dashboard-side">
          {user.permissions.includes("appointments.read") ? (
            <section className="card">
              <div className="card-heading">
                <h2>Avance de la jornada</h2>
                <span className="muted">Hoy</span>
              </div>
              <div
                className="progress-ring"
                style={{
                  background: `conic-gradient(var(--accent) ${(num(d, "appointmentCount") ? num(d, "completed") / num(d, "appointmentCount") : 0) * 360}deg,var(--soft) 0deg)`,
                }}
              >
                <div>
                  <strong>{num(d, "completed")}</strong>
                  <small>atenciones</small>
                </div>
              </div>
              <p className="center muted">
                {num(d, "appointmentCount")} citas en agenda
              </p>
            </section>
          ) : (
            <section className="card">
              <div className="card-heading">
                <h2>Tu actividad</h2>
              </div>
              <h2>{num(d, "unread")}</h2>
              <p className="muted">notificaciones sin leer</p>
              <button
                className="link"
                onClick={() => navigate("/notifications")}
              >
                Consultar notificaciones <ArrowRight size={15} />
              </button>
            </section>
          )}
          <section className="care-note">
            <Flower2 size={32} />
            <h3>Un espacio para cuidar.</h3>
            <p>
              Más claridad en la operación.
              <br />
              Más tiempo para las personas.
            </p>
          </section>
        </div>
      </div>
      <div className="quick-grid">
        {[
          {
            p: "patients.read",
            path: "/patients",
            name:
              user.audience === "doctor" ? "Mis pacientes" : "Buscar paciente",
            text: "Directorio y datos de contacto",
            icon: Users,
          },
          {
            p: "appointments.read",
            path: "/agenda",
            name: "Organizar agenda",
            text: "Horarios y próximas citas",
            icon: CalendarDays,
          },
          {
            p: "documents.read",
            path: "/documents",
            name: "Ver documentos",
            text: "Archivos dentro de tu alcance",
            icon: CreditCard,
          },
          ...(!user.permissions.includes("appointments.read")
            ? [
                {
                  p: "users.read",
                  path: "/users",
                  name: "Administrar cuentas",
                  text: "Usuarios y estado de acceso",
                  icon: Users,
                },
                {
                  p: "roles.read",
                  path: "/roles",
                  name: "Roles y permisos",
                  text: "Autoridad y accesos por módulo",
                  icon: ShieldCheck,
                },
                {
                  p: "reports.read",
                  path: "/reports",
                  name: "Consultar reportes",
                  text: "Actividad e indicadores autorizados",
                  icon: Activity,
                },
                {
                  p: "audit.read",
                  path: "/audit",
                  name: "Revisar auditoría",
                  text: "Eventos y acciones del sistema",
                  icon: ClipboardList,
                },
                {
                  p: "system.read",
                  path: "/system",
                  name: "Estado del sistema",
                  text: "Conectividad y almacenamiento",
                  icon: Monitor,
                },
              ]
            : []),
        ]
          .filter((x) => user.permissions.includes(x.p))
          .map((x) => (
            <button
              className="quick-card"
              key={x.path}
              onClick={() => navigate(x.path)}
            >
              <span>
                <x.icon size={21} />
              </span>
              <div>
                <strong>{x.name}</strong>
                <small>{x.text}</small>
              </div>
              <ArrowRight size={17} />
            </button>
          ))}
      </div>
      {newAppointment && (
        <AppointmentForm onClose={() => setNewAppointment(false)} />
      )}
    </>
  );
}
export function AppointmentsPage({
  calendar = false,
  reception = false,
}: {
  calendar?: boolean;
  reception?: boolean;
}) {
  const data = useData("appointments"),
    lookups = useLookups(),
    { user } = useApp();
  const [params, setParams] = useSearchParams();
  const statusParam = params.get("status") ?? "Todas",
    doctorParam = params.get("doctor") ?? "",
    facilityParam = params.get("facility") ?? "",
    viewParam = params.get("view") ?? "Semana";
  const task = params.get("task") ?? "",
    linkedId = params.get("appointment");
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("Todas"),
    [doctor, setDoctor] = useState(""),
    [facility, setFacility] = useState(""),
    [selected, setSelected] = useState<Row | null>(null),
    [edit, setEdit] = useState<Row | null>(null),
    [view, setView] = useState("Semana"),
    [anchor, setAnchor] = useState(today());
  useEffect(() => {
    setStatus(appointmentStates.includes(statusParam) ? statusParam : "Todas");
    setDoctor(doctorParam);
    setFacility(facilityParam);
    setView(
      ["Día", "Semana", "Mes"].includes(viewParam) ? viewParam : "Semana",
    );
  }, [statusParam, doctorParam, facilityParam, viewParam]);
  const linked = data.data?.find((r) => String(r.id) === linkedId);
  const detail = selected ?? linked;
  const closeDetail = () => {
    setSelected(null);
    if (linkedId) {
      const next = new URLSearchParams(params);
      next.delete("appointment");
      setParams(next, { replace: true });
    }
  };
  const can = user.permissions.includes("appointments.write");
  const patient = user.audience === "patient",
    company = user.audience === "company",
    doctorScope = user.audience === "doctor";
  const rows = (data.data ?? [])
    .filter(
      (a) =>
        (txt(a, "patientName") + txt(a, "doctorName") + txt(a, "serviceName"))
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (status === "Todas" || a.status === status) &&
        (!doctor || txt(a, "doctorId") === doctor) &&
        (!facility || txt(a, "facilityId") === facility) &&
        matchesAppointmentTask(a, task, today()) &&
        (!reception || a.date === today()),
    )
    .sort((a, b) =>
      task === "waiting"
        ? txt(a, "checkedInAt").localeCompare(txt(b, "checkedInAt")) ||
          num(a, "id") - num(b, "id")
        : 0,
    );
  return (
    <>
      <PageHead
        eyebrow={
          patient
            ? "MI ATENCIÓN"
            : company
              ? "MI CONVENIO"
              : reception
                ? "RECEPCIÓN"
                : "TIEMPO PARA ATENDER"
        }
        title={
          patient
            ? "Mis citas"
            : company
              ? "Citas cubiertas por mi convenio"
              : doctorScope
                ? calendar
                  ? "Mi agenda"
                  : "Mis citas y consultas"
                : reception
                  ? "La jornada empieza aquí."
                  : calendar
                    ? "Cada cita tiene su espacio."
                    : "Citas y seguimiento"
        }
        description={
          patient
            ? "Solicita, consulta, cancela o reagenda tu atención según las reglas de la clínica."
            : company
              ? "Solo citas con cobertura empresarial explícita. Sin motivos ni notas clínicas."
              : doctorScope
                ? "Atiende tus consultas y da seguimiento a tus pacientes asignados."
                : reception
                  ? "Registra llegadas y coordina la atención de hoy."
                  : "Confirma, reagenda y sigue cada consulta hasta su cierre."
        }
        action={
          can && (
            <AddButton onClick={() => setEdit({})}>
              {patient ? "Solicitar cita" : "Nueva cita"}
            </AddButton>
          )
        }
      />
      {linkedId && !data.isPending && !data.error && !linked && (
        <div className="info-box">
          La cita no está disponible en tu alcance actual.{" "}
          <button className="link" onClick={closeDetail}>
            Cerrar aviso
          </button>
        </div>
      )}
      {appointmentTasks[task] && (
        <div className="info-box">
          Filtro de trabajo: {appointmentTasks[task]} · hoy.{" "}
          <button
            className="link"
            onClick={() => {
              const next = new URLSearchParams(params);
              next.delete("task");
              setParams(next, { replace: true });
            }}
          >
            Quitar filtro de trabajo
          </button>
        </div>
      )}
      <div className="card">
        <div className="list-toolbar">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder={
              patient
                ? "Buscar en mis citas…"
                : company
                  ? "Buscar empleado, médico o servicio…"
                  : "Buscar paciente, médico o servicio…"
            }
          />
          <div className="toolbar-right">
            {lookups.data?.facilities?.length ? (
              <select
                aria-label="Filtrar por consultorio"
                value={facility}
                onChange={(e) => setFacility(e.target.value)}
              >
                <option value="">Todos los consultorios</option>
                {lookups.data.facilities.map((f) => (
                  <option key={num(f, "id")} value={num(f, "id")}>
                    {txt(f, "name")}
                  </option>
                ))}
              </select>
            ) : null}
            {!doctorScope && (
              <select
                aria-label="Filtrar por médico"
                value={doctor}
                onChange={(e) => setDoctor(e.target.value)}
              >
                <option value="">Todos los médicos</option>
                {lookups.data?.doctors?.map((d) => (
                  <option key={num(d, "id")} value={num(d, "id")}>
                    {txt(d, "name")}
                  </option>
                ))}
              </select>
            )}
            <select
              aria-label="Filtrar por estado de cita"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {appointmentStates.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        {data.error ? (
          <ErrorBox message={data.error.message} />
        ) : data.isPending ? (
          <Loading />
        ) : calendar ? (
          <>
            <div className="calendar-toolbar">
              <div className="inline-actions">
                <button
                  className="icon-button"
                  aria-label="Periodo anterior"
                  onClick={() => setAnchor(shiftPeriod(anchor, -1, view))}
                >
                  <ChevronLeft size={19} />
                </button>
                <strong>
                  {view === "Mes"
                    ? new Date(anchor + "T12:00:00").toLocaleDateString(
                        "es-MX",
                        { month: "long", year: "numeric" },
                      )
                    : date(anchor)}
                </strong>
                <button
                  className="icon-button"
                  aria-label="Periodo siguiente"
                  onClick={() => setAnchor(shiftPeriod(anchor, 1, view))}
                >
                  <ChevronRight size={19} />
                </button>
                <button
                  className="btn subtle"
                  onClick={() => setAnchor(today())}
                >
                  Hoy
                </button>
              </div>
              <div className="segmented">
                {["Día", "Semana", "Mes"].map((v) => (
                  <button
                    key={v}
                    className={v === view ? "active" : ""}
                    onClick={() => setView(v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <Calendar
              rows={rows}
              view={view}
              anchor={anchor}
              onSelect={setSelected}
            />
          </>
        ) : (
          <Table
            rows={rows}
            columns={[
              {
                key: "patientName",
                label: "Paciente",
                render: (r: Row) => (
                  <div className="person">
                    <Avatar name={txt(r, "patientName")} />
                    <strong>{txt(r, "patientName")}</strong>
                  </div>
                ),
              },
              {
                key: "date",
                label: "Fecha",
                render: (r: Row) => date(txt(r, "date")),
              },
              {
                key: "time",
                label: "Hora",
                render: (r: Row) => txt(r, "time").slice(0, 5),
              },
              { key: "doctorName", label: "Médico" },
              { key: "serviceName", label: "Servicio" },
              {
                key: "status",
                label: "Estado",
                render: (r: Row) => <Badge value={txt(r, "status")} />,
              },
              {
                key: "checkedInAt",
                label: "Llegada",
                render: (r: Row) =>
                  r.checkedInAt ? <Badge value="En recepción" /> : "—",
              },
            ].filter((column) => !company || column.key !== "checkedInAt")}
            actions={(r) => <ViewButton onClick={() => setSelected(r)} />}
          />
        )}
      </div>
      {detail && (
        <AppointmentDetail
          row={detail}
          onClose={closeDetail}
          onEdit={() => {
            setEdit(detail);
            closeDetail();
          }}
        />
      )}
      {edit && <AppointmentForm row={edit} onClose={() => setEdit(null)} />}
    </>
  );
}
function Calendar({
  rows,
  view,
  anchor,
  onSelect,
}: {
  rows: Row[];
  view: string;
  anchor: string;
  onSelect: (r: Row) => void;
}) {
  const monday = mondayOfWeek(anchor);
  const days =
    view === "Día"
      ? [anchor]
      : view === "Mes"
        ? monthGrid(anchor)
        : Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  if (view === "Mes")
    return (
      <div className="calendar-scroll">
        <div className="month-calendar">
          {["lun", "mar", "mié", "jue", "vie", "sáb", "dom"].map((day) => (
            <div className="month-weekday" key={day}>
              {day}
            </div>
          ))}
          {days.map((day) => (
            <div
              className={
                "month-day " +
                (day === today() ? "today " : "") +
                (day.slice(0, 7) !== anchor.slice(0, 7) ? "other-month" : "")
              }
              key={day}
            >
              <strong>{new Date(day + "T12:00:00").getDate()}</strong>
              {rows
                .filter((r) => r.date === day)
                .map((a) => (
                  <button
                    className="month-event"
                    key={num(a, "id")}
                    onClick={() => onSelect(a)}
                  >
                    {txt(a, "time").slice(0, 5)} {txt(a, "patientName")}
                  </button>
                ))}
            </div>
          ))}
        </div>
      </div>
    );
  return (
    <div className="calendar-scroll">
      <div
        className="week-calendar"
        style={{
          gridTemplateColumns: `64px repeat(${days.length}, minmax(140px,1fr))`,
        }}
      >
        <div className="day-header">Hora</div>
        {days.map((day) => (
          <div
            className={"day-header " + (day === today() ? "today" : "")}
            key={day}
          >
            {new Date(day + "T12:00:00").toLocaleDateString("es-MX", {
              weekday: "short",
            })}
            <strong>{new Date(day + "T12:00:00").getDate()}</strong>
          </div>
        ))}
        {Array.from({ length: 24 }, (_, i) => i)
          .filter((hour) => {
            const visible = rows.filter((a) => days.includes(txt(a, "date")));
            const times = visible.map((a) =>
              Number(txt(a, "time").slice(0, 2)),
            );
            return (
              hour >= Math.min(8, ...times) && hour <= Math.max(18, ...times)
            );
          })
          .map((hour) => (
            <div className="calendar-row" key={hour}>
              <span className="hour-label">{hour}:00</span>
              {days.map((day) => (
                <div className="calendar-slot" key={day}>
                  {rows
                    .filter(
                      (a) =>
                        a.date === day &&
                        Number(txt(a, "time").slice(0, 2)) === hour,
                    )
                    .map((a) => (
                      <button
                        className={
                          "calendar-event " +
                          (["Cancelada", "Rechazada"].includes(txt(a, "status"))
                            ? "cancelled"
                            : "")
                        }
                        key={num(a, "id")}
                        onClick={() => onSelect(a)}
                      >
                        <small>
                          {txt(a, "time").slice(0, 5)} ·{" "}
                          {num(a, "durationMinutes")} min
                        </small>
                        <strong>{txt(a, "patientName")}</strong>
                        <span>{txt(a, "doctorName")}</span>
                      </button>
                    ))}
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
export function AppointmentForm({
  row = {},
  onClose,
}: {
  row?: Row;
  onClose: () => void;
}) {
  const lookups = useLookups(),
    write = useWrite(),
    { user } = useApp();
  const fields: Field[] = [
    {
      key: "patientId",
      label: "Paciente",
      lookup: "patients",
      required: true,
      default: user.patientId ?? undefined,
    },
    {
      key: "doctorId",
      label: "Médico",
      lookup: "doctors",
      required: true,
      default: user.doctorId ?? undefined,
    },
    { key: "serviceId", label: "Servicio", lookup: "services", required: true },
    {
      key: "facilityId",
      label: "Consultorio",
      lookup: "facilities",
      required: true,
    },
    {
      key: "date",
      label: "Fecha",
      type: "date",
      required: true,
      default: addDays(today(), 1),
    },
    {
      key: "time",
      label: "Hora",
      type: "time",
      required: true,
      default: "10:00",
    },
    { key: "reason", label: "Motivo", type: "textarea", required: true },
    ...(user.permissions.includes("appointments.notes.write")
      ? [
          {
            key: "notes",
            label: "Notas internas · no visibles al paciente",
            type: "textarea",
          },
        ]
      : []),
    ...(user.audience === "internal"
      ? [
          {
            key: "instructions",
            label: "Instrucciones publicadas para el paciente",
            type: "textarea",
          },
          {
            key: "companyId",
            label: "Convenio que cubre la cita (opcional)",
            lookup: "companies",
            hint: "Sin convenio seleccionado, la cita es privada frente a empresas.",
          },
        ]
      : []),
  ];
  if (user.audience === "patient")
    return <PatientBooking row={row} onClose={onClose} />;
  return (
    <Modal
      title={row.id ? "Reagendar cita" : "Nueva cita"}
      onClose={onClose}
      wide
    >
      <div className="info-box compact">
        <Clock3 size={16} />
        Se verifican jornada, duración y cruces de paciente, médico y
        consultorio.
      </div>
      {lookups.isPending ? (
        <Loading />
      ) : (
        <DataForm
          fields={fields}
          initial={row}
          draftKey={`appointments:${row.id ?? "new"}`}
          lookups={lookups.data ?? {}}
          onClose={onClose}
          onSubmit={async (input) => {
            await write(
              "appointments" + (row.id ? "/" + row.id : ""),
              row.id ? "PUT" : "POST",
              input,
              row.id ? "Cita reagendada" : "Cita creada",
            );
            onClose();
          }}
          label={row.id ? "Reagendar" : "Crear cita"}
        />
      )}
    </Modal>
  );
}
function AppointmentDetail({
  row,
  onClose,
  onEdit,
}: {
  row: Row;
  onClose: () => void;
  onEdit: () => void;
}) {
  const history = useData(`appointments/${row.id}/history`),
    write = useWrite(),
    { user } = useApp(),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const rules = useData<Row>("dashboard", user.audience === "patient");
  const hours = Number(rules.data?.cancellationHours ?? 24);
  const withinDeadline =
    user.audience !== "patient" ||
    new Date(`${txt(row, "date")}T${txt(row, "time")}-06:00`).getTime() >
      Date.now() + hours * 3600000;
  const portal = user.audience === "patient" || user.audience === "company";
  const can = user.permissions.includes("appointments.write");
  const act = async (status: string, path = "status") => {
    setBusy(true);
    try {
      await write(
        `appointments/${row.id}/${path}`,
        "POST",
        { status, reason, version: row.version },
        "Cita actualizada",
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Detalle de la cita" onClose={onClose} wide>
      <div className="person profile-heading">
        <Avatar name={txt(row, "patientName")} />
        <div>
          <h3>{txt(row, "patientName")}</h3>
          <p>{txt(row, "serviceName")}</p>
        </div>
        <Badge value={txt(row, "status")} />
      </div>
      <div className="detail-grid">
        {[
          ["Fecha", date(txt(row, "date"))],
          ["Hora", txt(row, "time").slice(0, 5)],
          ["Médico", txt(row, "doctorName")],
          ["Duración", num(row, "durationMinutes") + " minutos"],
          ...(user.audience !== "company"
            ? [
                ["Consultorio", txt(row, "facilityName")],
                ["Llegada", row.checkedInAt ? "Registrada" : "Pendiente"],
              ]
            : []),
        ].map(([label, value]) => (
          <div key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {user.audience !== "company" && (
        <div className="info-box">
          <h3>Motivo</h3>
          <p>{txt(row, "reason") || "Sin motivo adicional"}</p>
          {row.instructions ? (
            <p>
              <strong>Indicaciones de la clínica:</strong>{" "}
              {txt(row, "instructions")}
            </p>
          ) : null}
        </div>
      )}
      {user.permissions.includes("appointments.notes.read") && row.notes ? (
        <div className="info-box">
          <h3>Notas internas</h3>
          <p>{txt(row, "notes")}</p>
        </div>
      ) : null}
      {can && (
        <>
          <div className="inline-actions wrap">
            {["Pendiente", "Confirmada"].includes(txt(row, "status")) &&
              withinDeadline && (
                <button className="btn secondary" onClick={onEdit}>
                  Reagendar
                </button>
              )}
            {!portal &&
              user.permissions.includes("appointments.confirm") &&
              row.status === "Pendiente" && (
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => act("Confirmada")}
                >
                  <Check size={16} />
                  Confirmar
                </button>
              )}
            {!portal &&
              user.permissions.includes("appointments.checkin") &&
              row.status === "Confirmada" &&
              !row.checkedInAt && (
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => act("Confirmada", "check-in")}
                >
                  Registrar llegada
                </button>
              )}
            {!portal &&
              user.permissions.includes("records.write") &&
              row.status === "Confirmada" &&
              row.checkedInAt != null && (
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => act("En curso")}
                >
                  Iniciar consulta
                </button>
              )}
            {!portal &&
              user.permissions.includes("records.write") &&
              row.status === "En curso" && (
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => act("Finalizada")}
                >
                  Finalizar consulta
                </button>
              )}
          </div>
          {["Pendiente", "Confirmada"].includes(txt(row, "status")) &&
            withinDeadline && (
              <div className="cancel-section">
                <label>
                  Motivo de cancelación
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Indica por qué se cancela…"
                  />
                </label>
                <div className="inline-actions">
                  <button
                    className="btn danger"
                    disabled={busy || !reason.trim()}
                    onClick={() => act("Cancelada")}
                  >
                    Cancelar cita
                  </button>
                  {!portal &&
                    user.permissions.includes("appointments.confirm") &&
                    row.status === "Pendiente" && (
                      <button
                        className="btn subtle"
                        disabled={busy || !reason.trim()}
                        onClick={() => act("Rechazada")}
                      >
                        Rechazar solicitud
                      </button>
                    )}
                </div>
              </div>
            )}
        </>
      )}
      {error && <ErrorBox message={error} />}
      {user.audience === "patient" &&
        !withinDeadline &&
        ["Pendiente", "Confirmada"].includes(txt(row, "status")) && (
          <div className="info-box">
            El plazo de cambios desde el portal terminó. Contacta a recepción
            para solicitar ayuda.
          </div>
        )}
      <div className="detail-section">
        <h3>Historial de cambios</h3>
        {history.data?.map((h) => (
          <div className="timeline-item" key={num(h, "id")}>
            <strong>{txt(h, "action")}</strong>
            <p>{txt(h, "detail")}</p>
            <small>{date(txt(h, "createdAt"))}</small>
          </div>
        ))}
      </div>
    </Modal>
  );
}
export function RecordsPage() {
  const data = useData("records"),
    lookups = useLookups(),
    write = useWrite(),
    { user, notify } = useApp(),
    [newNote, setNewNote] = useState(false),
    [selected, setSelected] = useState<Row | null>(null),
    [search, setSearch] = useState("");
  const fields: Field[] = [
    { key: "patientId", label: "Paciente", lookup: "patients", required: true },
    {
      key: "doctorId",
      label: "Médico responsable",
      lookup: "doctors",
      required: true,
      default: user.doctorId ?? undefined,
    },
    { key: "history", label: "Antecedentes", type: "textarea" },
    { key: "allergies", label: "Alergias", type: "textarea" },
    {
      key: "content",
      label: "Nota de consulta",
      type: "textarea",
      required: true,
    },
    { key: "diagnosis", label: "Diagnósticos", type: "textarea" },
    { key: "treatment", label: "Tratamiento / indicaciones", type: "textarea" },
  ];
  return (
    <>
      <PageHead
        eyebrow="ATENCIÓN CLÍNICA"
        title="Expedientes y consultas"
        description="Notas, antecedentes y seguimiento de pacientes autorizados."
        action={
          user.permissions.includes("records.write") && (
            <AddButton onClick={() => setNewNote(true)}>
              Nueva consulta
            </AddButton>
          )
        }
      />
      <div className="card">
        <div className="list-toolbar">
          <SearchBox value={search} onChange={setSearch} />
          <Badge value="Acceso restringido" />
        </div>
        {data.isPending ? (
          <Loading />
        ) : data.error ? (
          <ErrorBox message={data.error.message} />
        ) : (
          <Table
            rows={(data.data ?? []).filter((r) =>
              txt(r, "patientName")
                .toLowerCase()
                .includes(search.toLowerCase()),
            )}
            columns={[
              {
                key: "patientName",
                label: "Paciente",
                render: (r) => (
                  <div className="person">
                    <Avatar name={txt(r, "patientName")} />
                    <strong>{txt(r, "patientName")}</strong>
                  </div>
                ),
              },
              { key: "doctorName", label: "Médico" },
              {
                key: "createdAt",
                label: "Consulta",
                render: (r) => date(txt(r, "createdAt")),
              },
              { key: "diagnosis", label: "Diagnóstico" },
              {
                key: "signedAt",
                label: "Estado",
                render: (r) => (
                  <Badge value={r.signedAt ? "Cerrada" : "Borrador"} />
                ),
              },
            ]}
            actions={(r) => <ViewButton onClick={() => setSelected(r)} />}
          />
        )}
      </div>
      {newNote && (
        <Modal
          title="Registrar consulta"
          onClose={() => setNewNote(false)}
          wide
        >
          <DataForm
            fields={fields}
            lookups={lookups.data ?? {}}
            draftKey="records:new"
            onClose={() => setNewNote(false)}
            onSubmit={async (row) => {
              await write("records", "POST", row);
              setNewNote(false);
            }}
          />
        </Modal>
      )}
      {selected && (
        <Modal title="Nota de consulta" onClose={() => setSelected(null)} wide>
          <div className="detail-grid">
            <div>
              <small>Paciente</small>
              <strong>{txt(selected, "patientName")}</strong>
            </div>
            <div>
              <small>Médico</small>
              <strong>{txt(selected, "doctorName")}</strong>
            </div>
          </div>
          {[
            ["history", "Antecedentes"],
            ["allergies", "Alergias"],
            ["content", "Nota clínica"],
            ["diagnosis", "Diagnósticos"],
            ["treatment", "Tratamiento"],
          ].map(([key, label]) => (
            <div className="note-section" key={key}>
              <h3>{label}</h3>
              <p>{txt(selected, key) || "No documentado"}</p>
            </div>
          ))}
          <div className="form-actions">
            <Badge value={selected.signedAt ? "Nota cerrada" : "Borrador"} />
            {!selected.signedAt && num(selected, "authorId") === user.id && (
              <button
                className="btn"
                onClick={async () => {
                  try {
                    await write(
                      "records/" + selected.id + "/sign",
                      "POST",
                      {},
                      "Nota cerrada y conservada en el expediente",
                    );
                    setSelected(null);
                  } catch (e) {
                    notify((e as Error).message, "error");
                  }
                }}
              >
                Cerrar nota definitivamente
              </button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
export function ReportsPage() {
  const { user } = useApp();
  const corporate = user.audience === "company";
  const [from, setFrom] = useState(addDays(today(), -30)),
    [to, setTo] = useState(today()),
    data = useData<Row>(`reports?from=${from}&to=${to}`);
  const d = data.data;
  const rows = (d?.appointments ?? []) as Row[];
  const exportRows = rows.length ? rows : ((d?.byStatus ?? []) as Row[]);
  return (
    <>
      <PageHead
        eyebrow="INFORMACIÓN PARA DECIDIR"
        title={corporate ? "Reportes del convenio" : "Reportes autorizados"}
        description={
          corporate
            ? "Actividad cubierta por tu convenio, sin información clínica privada."
            : "Indicadores agregados. Detalles nominales solo con permiso de citas, sin motivos ni notas."
        }
        action={
          user.permissions.includes("reports.export") && (
            <ExportButton
              rows={exportRows}
              getRows={async () => {
                const report = await api<Row>(
                  `reports?from=${from}&to=${to}&export=true`,
                );
                const appointments = (report.appointments ?? []) as Row[];
                return appointments.length
                  ? appointments
                  : ((report.byStatus ?? []) as Row[]);
              }}
              columns={
                rows.length
                  ? [
                      "id",
                      "date",
                      "time",
                      "status",
                      "patientName",
                      "doctorName",
                      "serviceName",
                    ]
                  : ["name", "count"]
              }
              name={`actividad-${from}-${to}`}
            />
          )
        }
      />
      <div className="card report-filters">
        <label>
          Desde
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Hasta
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <span className="muted">Periodo máximo: un año</span>
      </div>
      {data.isPending ? (
        <Loading />
      ) : data.error ? (
        <ErrorBox message={data.error.message} />
      ) : (
        d && (
          <>
            <div className="stats-grid">
              {[
                ["Citas", num(d, "total")],
                ["Atenciones finalizadas", num(d, "completed")],
                ["Cancelaciones", num(d, "cancellations")],
                ...(d.income != null
                  ? [
                      [
                        corporate ? "Consumos pagados" : "Ingresos",
                        money(num(d, "income")),
                      ],
                    ]
                  : []),
              ].map(([label, value]) => (
                <div className="card stat-card" key={label}>
                  <span className="muted">{label}</span>
                  <h2>{value}</h2>
                  <small>En el periodo seleccionado</small>
                </div>
              ))}
            </div>
            <div className="reports-grid">
              {[
                ["byStatus", "Citas por estado"],
                ["byDoctor", "Citas por médico"],
                ["byService", "Servicios solicitados"],
              ].map(([key, title]) => (
                <div className="card" key={key}>
                  <h2>{title}</h2>
                  <div className="bars-list">
                    {((d[key] ?? []) as Row[]).map((r) => (
                      <div key={txt(r, "name")}>
                        <div className="bar-label">
                          <span>{txt(r, "name")}</span>
                          <strong>{num(r, "count")}</strong>
                        </div>
                        <div className="bar-track">
                          <i
                            style={{
                              width:
                                Math.max(
                                  3,
                                  (num(r, "count") /
                                    Math.max(1, num(d, "total"))) *
                                    100,
                                ) + "%",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )
      )}
    </>
  );
}
