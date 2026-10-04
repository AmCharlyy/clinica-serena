import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  FileText,
  Flower2,
  HeartPulse,
  ShieldCheck,
  Users,
} from "lucide-react";
import { date, money, num, today, txt, type Row } from "../api";
import { addDays } from "../calendar";
import { useApp, useData, useWrite } from "../state";
import {
  Avatar,
  Badge,
  DataForm,
  Empty,
  ErrorBox,
  Loading,
  Modal,
  PageHead,
  SearchBox,
  Table,
} from "../components";
import { workspaceFor } from "../workspaces";

export function PortalDashboard() {
  const { user } = useApp(),
    navigate = useNavigate(),
    data = useData<Row>("dashboard", true, 30000);
  const [booking, setBooking] = useState(false);
  if (data.isPending) return <Loading />;
  if (data.error)
    return (
      <ErrorBox message={data.error.message} retry={() => data.refetch()} />
    );
  const d = data.data!,
    patient = user.audience === "patient",
    workspace = workspaceFor(user);
  const upcoming = (d.upcoming ?? []) as Row[];
  return (
    <>
      <PageHead
        eyebrow={patient ? "MI SALUD · MI ESPACIO" : "MI EMPRESA · MI CONVENIO"}
        title={
          patient
            ? `Hola, ${user.name.split(" ")[0]}. Cuidamos de ti.`
            : workspace.title
        }
        description={workspace.description}
        action={
          patient &&
          user.permissions.includes("appointments.write") && (
            <button className="btn" onClick={() => setBooking(true)}>
              <CalendarDays size={18} /> Solicitar cita
            </button>
          )
        }
      />
      <div className="portal-welcome">
        <Flower2 size={36} />
        <div>
          <h2>
            {patient
              ? "Tu próxima atención empieza aquí."
              : "Atención cubierta, información protegida."}
          </h2>
          <p>
            {patient
              ? `Puedes cancelar o reagendar con ${num(d, "cancellationHours")} horas de anticipación. Para cambios fuera de plazo, contacta a recepción.`
              : "Solo se muestran citas, pagos y comprobantes identificados expresamente con tu convenio."}
          </p>
        </div>
        <ShieldCheck size={26} />
      </div>
      <div className="stats-grid portal-stats-grid">
        {(patient
          ? [
              ["Próximas citas", num(d, "upcomingCount")],
              ["Mis documentos", num(d, "documentCount")],
              ["Avisos pendientes", num(d, "unread")],
            ]
          : [
              ["Empleados activos", num(d, "patientCount")],
              ["Citas cubiertas hoy", num(d, "appointmentCount")],
              ["Consumos pagados hoy", money(num(d, "income"))],
            ]
        ).map(([label, value]) => (
          <div className="card stat-card" key={label}>
            <span className="muted">{label}</span>
            <h2>{value}</h2>
            <small>
              {patient ? "En tu espacio personal" : "Dentro de tu convenio"}
            </small>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="card appointments-card">
          <div className="card-heading">
            <div>
              <h2>
                {patient ? "Mis próximas citas" : "Citas cubiertas de hoy"}
              </h2>
              <p className="muted">
                {patient
                  ? "Tus siguientes citas. Consulta la lista completa en Mis citas."
                  : "Sin motivos de consulta ni notas clínicas."}
              </p>
            </div>
            <button className="link" onClick={() => navigate("/appointments")}>
              Ver todas <ArrowRight size={16} />
            </button>
          </div>
          {upcoming.length ? (
            upcoming.map((a) => (
              <button
                key={num(a, "id")}
                className="upcoming-row"
                onClick={() =>
                  navigate(`/appointments?appointment=${num(a, "id")}`)
                }
              >
                <div className="appointment-time">
                  {txt(a, "time").slice(0, 5)}
                  <small>{date(txt(a, "date"))}</small>
                </div>
                <Avatar name={txt(a, patient ? "doctorName" : "patientName")} />
                <div className="upcoming-person">
                  <strong>
                    {txt(a, patient ? "doctorName" : "patientName")}
                  </strong>
                  <small>{txt(a, "serviceName")}</small>
                </div>
                <Badge value={txt(a, "status")} />
              </button>
            ))
          ) : (
            <Empty
              title={
                patient
                  ? "Aún no tienes una próxima cita"
                  : "No hay citas cubiertas para hoy"
              }
              description={
                patient
                  ? "Cuando solicites una cita, aparecerá aquí."
                  : "La actividad privada del empleado no se incluye en este portal."
              }
            />
          )}
        </section>
        <section className="care-note">
          <Flower2 size={32} />
          <h3>
            {patient
              ? "A tu ritmo, con tranquilidad."
              : "Un convenio que cuida."}
          </h3>
          <p>
            {patient
              ? "Consulta servicios y especialistas antes de solicitar tu atención."
              : "Consulta las condiciones, la vigencia y los consumos autorizados."}
          </p>
          <button
            className="btn secondary"
            onClick={() => navigate(patient ? "/services" : "/companies")}
          >
            {patient ? "Explorar servicios" : "Ver mi convenio"}
            <ArrowRight size={16} />
          </button>
        </section>
      </div>
      <div className="quick-grid">
        {(patient
          ? [
              {
                path: "/profile",
                name: "Mi perfil",
                text: "Mis datos y contacto",
                icon: Users,
              },
              {
                path: "/documents",
                name: "Mis documentos",
                text: "Archivos publicados para mí",
                icon: FileText,
              },
              {
                path: "/notifications",
                name: "Mis notificaciones",
                text: "Avisos de mi atención",
                icon: HeartPulse,
              },
            ]
          : [
              {
                path: "/employees",
                name: "Empleados asociados",
                text: "Identidad y estado, no expedientes",
                icon: Users,
              },
              {
                path: "/payments",
                name: "Consumos del convenio",
                text: "Pagos con cobertura explícita",
                icon: HeartPulse,
              },
              {
                path: "/reports",
                name: "Reportes del convenio",
                text: "Actividad autorizada por periodo",
                icon: FileText,
              },
            ]
        )
          .filter((x) => {
            const permission = {
              "/profile": "patients.read",
              "/documents": "documents.read",
              "/employees": "patients.read",
              "/payments": "payments.read",
              "/reports": "reports.read",
            }[x.path];
            return !permission || user.permissions.includes(permission);
          })
          .map((x) => (
            <button
              className="quick-card"
              key={x.path}
              onClick={() => navigate(x.path)}
            >
              <span>
                <x.icon size={22} />
              </span>
              <div>
                <strong>{x.name}</strong>
                <small>{x.text}</small>
              </div>
              <ArrowRight size={17} />
            </button>
          ))}
      </div>
      {booking && <PatientBooking onClose={() => setBooking(false)} />}
    </>
  );
}

export function PublicCatalog() {
  const data = useData<Record<string, Row[]>>("catalog/public"),
    [search, setSearch] = useState(""),
    [booking, setBooking] = useState(false),
    { user } = useApp();
  return (
    <>
      <PageHead
        eyebrow="ATENCIÓN A TU MEDIDA"
        title="Servicios y especialistas"
        description="Conoce las opciones de atención disponibles. Precios en pesos mexicanos."
        action={
          user.audience === "patient" &&
          user.permissions.includes("appointments.write") && (
            <button className="btn" onClick={() => setBooking(true)}>
              Solicitar cita <ArrowRight size={16} />
            </button>
          )
        }
      />
      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder="Buscar servicio o especialista…"
      />
      {data.isPending ? (
        <Loading />
      ) : data.error ? (
        <ErrorBox message={data.error.message} />
      ) : (
        <>
          <h2 className="portal-section-title">Nuestros servicios</h2>
          <div className="portal-catalog-grid">
            {data.data?.services
              .filter((s) =>
                (txt(s, "name") + txt(s, "specialty"))
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((s) => (
                <article className="card portal-service" key={num(s, "id")}>
                  <span className="stat-icon">
                    <HeartPulse size={22} />
                  </span>
                  <p className="eyebrow">{txt(s, "specialty")}</p>
                  <h3>{txt(s, "name")}</h3>
                  <p className="muted">
                    <Clock3 size={15} /> {num(s, "durationMinutes")} minutos
                  </p>
                  <strong className="service-price">
                    {money(num(s, "price"))}
                  </strong>
                </article>
              ))}
          </div>
          <h2 className="portal-section-title">Especialistas disponibles</h2>
          <div className="portal-catalog-grid">
            {data.data?.doctors
              .filter((s) =>
                (txt(s, "name") + txt(s, "specialty"))
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((s) => (
                <article className="card portal-specialist" key={num(s, "id")}>
                  <Avatar name={txt(s, "name")} />
                  <h3>{txt(s, "name")}</h3>
                  <p className="muted">{txt(s, "specialty")}</p>
                  {Boolean(s.license) && (
                    <small>Cédula: {txt(s, "license")}</small>
                  )}
                </article>
              ))}
          </div>
        </>
      )}
      {booking && <PatientBooking onClose={() => setBooking(false)} />}
    </>
  );
}

export function PatientBooking({
  row = {},
  onClose,
}: {
  row?: Row;
  onClose: () => void;
}) {
  const { user } = useApp(),
    catalog = useData<Record<string, Row[]>>("catalog/public"),
    write = useWrite();
  const [doctor, setDoctor] = useState(txt(row, "doctorId")),
    [service, setService] = useState(txt(row, "serviceId")),
    [day, setDay] = useState(txt(row, "date") || addDays(today(), 1)),
    [time, setTime] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const availability = useData<string[]>(
    `appointments/availability?doctorId=${doctor}&serviceId=${service}&date=${day}${row.id ? `&excludeId=${row.id}` : ""}`,
    Boolean(doctor && service && day),
  );
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!time) {
      setError("Elige un horario disponible.");
      return;
    }
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      await write(
        `appointments${row.id ? `/${row.id}` : ""}`,
        row.id ? "PUT" : "POST",
        {
          patientId: user.patientId,
          doctorId: Number(doctor),
          serviceId: Number(service),
          facilityId: 0,
          date: day,
          time,
          reason: form.get("reason"),
          version: row.version,
        },
        row.id ? "Tu cita fue reagendada" : "Solicitud de cita enviada",
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setTime("");
      await availability.refetch();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={row.id ? "Reagendar mi cita" : "Solicitar una cita"}
      wide
      onClose={onClose}
    >
      <p className="muted">
        Selecciona tu atención y un horario disponible. La clínica asignará el
        consultorio y confirmará tu solicitud.
      </p>
      {catalog.isPending ? (
        <Loading />
      ) : catalog.error ? (
        <ErrorBox message={catalog.error.message} />
      ) : (
        <form onSubmit={submit}>
          <fieldset className="form-grid" disabled={busy}>
            <label>
              Servicio
              <select
                required
                value={service}
                onChange={(e) => {
                  setService(e.target.value);
                  setTime("");
                }}
              >
                <option value="">Selecciona un servicio…</option>
                {catalog.data?.services.map((s) => (
                  <option key={num(s, "id")} value={num(s, "id")}>
                    {txt(s, "name")} · {money(num(s, "price"))}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Especialista
              <select
                required
                value={doctor}
                onChange={(e) => {
                  setDoctor(e.target.value);
                  setTime("");
                }}
              >
                <option value="">Selecciona un especialista…</option>
                {catalog.data?.doctors.map((s) => (
                  <option key={num(s, "id")} value={num(s, "id")}>
                    {txt(s, "name")} · {txt(s, "specialty")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fecha
              <input
                required
                type="date"
                min={today()}
                max={addDays(today(), 180)}
                value={day}
                onChange={(e) => {
                  setDay(e.target.value);
                  setTime("");
                }}
              />
            </label>
            <div className="full">
              <h3>Horarios disponibles</h3>
              {!doctor || !service ? (
                <p className="muted">
                  Selecciona un servicio y un especialista.
                </p>
              ) : availability.isPending ? (
                <Loading />
              ) : availability.error ? (
                <ErrorBox message={availability.error.message} />
              ) : availability.data?.length ? (
                <div className="booking-slots">
                  {availability.data.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      className={slot === time ? "chip selected" : "chip"}
                      aria-pressed={slot === time}
                      onClick={() => setTime(slot)}
                    >
                      {slot.slice(0, 5)}
                    </button>
                  ))}
                </div>
              ) : (
                <Empty
                  title="No hay horarios disponibles para esa fecha"
                  description="Prueba con otra fecha o especialista."
                />
              )}
            </div>
            <label className="full">
              Motivo o mensaje para la clínica
              <textarea
                name="reason"
                required
                maxLength={1000}
                defaultValue={txt(row, "reason")}
                rows={3}
              />
            </label>
          </fieldset>
          {error && <ErrorBox message={error} />}
          <div className="form-actions">
            <button type="button" className="btn secondary" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn" disabled={busy || !time}>
              {busy
                ? "Enviando…"
                : row.id
                  ? "Reagendar mi cita"
                  : "Solicitar cita"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function PatientProfile() {
  const { user } = useApp(),
    data = useData<Row>(`patients/${user.patientId}`),
    write = useWrite(),
    [edit, setEdit] = useState(false);
  if (data.isPending) return <Loading />;
  if (data.error) return <ErrorBox message={data.error.message} />;
  const p = data.data!;
  return (
    <>
      <PageHead
        eyebrow="MIS DATOS"
        title="Mi perfil"
        description="Revisa tu información y mantén actualizado tu contacto."
      />
      <section className="card">
        <div className="person profile-heading">
          <Avatar name={txt(p, "name")} />
          <div>
            <h2>{txt(p, "name")}</h2>
            <p className="muted">{txt(p, "folio")}</p>
          </div>
        </div>
        <div className="detail-grid">
          {[
            ["Fecha de nacimiento", date(txt(p, "birthDate"))],
            ["CURP", txt(p, "curp")],
            ["Teléfono", txt(p, "phone")],
            ["Correo", txt(p, "email")],
            ["Domicilio", txt(p, "address")],
            ["Contacto de emergencia", txt(p, "emergencyContact")],
          ].map(([label, value]) => (
            <div key={label}>
              <small>{label}</small>
              <strong>{value || "Sin registrar"}</strong>
            </div>
          ))}
        </div>
        <div className="form-actions">
          <button className="btn" onClick={() => setEdit(true)}>
            Actualizar mi contacto
          </button>
        </div>
        <p className="muted">
          Para corregir tu nombre o identidad, contacta a recepción.
        </p>
      </section>
      {edit && (
        <Modal title="Actualizar mi contacto" onClose={() => setEdit(false)}>
          <DataForm
            fields={[
              { key: "phone", label: "Teléfono", required: true },
              { key: "email", label: "Correo", type: "email" },
              { key: "address", label: "Domicilio" },
              { key: "emergencyContact", label: "Contacto de emergencia" },
            ]}
            initial={p}
            onClose={() => setEdit(false)}
            onSubmit={async (input) => {
              await write("profile/contact", "PUT", {
                phone: input.phone,
                email: input.email,
                address: input.address,
                emergencyContact: input.emergencyContact,
                version: p.version,
              });
              setEdit(false);
            }}
          />
        </Modal>
      )}
    </>
  );
}

export function CompanyEmployees() {
  const data = useData("patients"),
    [search, setSearch] = useState("");
  return (
    <>
      <PageHead
        eyebrow="MI CONVENIO"
        title="Empleados asociados"
        description="Identidad y estado de los empleados. Este espacio no muestra expedientes, contacto personal ni datos clínicos."
      />
      <section className="card">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Buscar empleado…"
        />
        {data.isPending ? (
          <Loading />
        ) : data.error ? (
          <ErrorBox message={data.error.message} />
        ) : (
          <Table
            rows={(data.data ?? []).filter((p) =>
              txt(p, "name").toLowerCase().includes(search.toLowerCase()),
            )}
            columns={[
              { key: "name", label: "Empleado" },
              { key: "folio", label: "Identificador" },
              {
                key: "active",
                label: "Asociación",
                render: (p) => (
                  <Badge value={p.active ? "Activo" : "Inactivo"} />
                ),
              },
            ]}
          />
        )}
      </section>
    </>
  );
}

export function CompanyProfile() {
  const data = useData("companies");
  if (data.isPending) return <Loading />;
  if (data.error) return <ErrorBox message={data.error.message} />;
  const company = data.data?.[0];
  return (
    <>
      <PageHead
        eyebrow="MI EMPRESA"
        title="Mi convenio"
        description="Condiciones y contacto de tu convenio con la clínica."
      />
      {company ? (
        <section className="card">
          <h2>{txt(company, "name")}</h2>
          <div className="detail-grid">
            {[
              ["RFC", txt(company, "rfc")],
              ["Vigencia", date(txt(company, "validUntil"))],
              ["Contacto empresarial", txt(company, "contact")],
              ["Correo", txt(company, "email")],
            ].map(([key, value]) => (
              <div key={key}>
                <small>{key}</small>
                <strong>{value || "Sin registrar"}</strong>
              </div>
            ))}
          </div>
          <div className="info-box">
            <h3>Servicios y condiciones</h3>
            <p>
              {txt(company, "agreement") ||
                "Contacta a la clínica para revisar las condiciones."}
            </p>
          </div>
        </section>
      ) : (
        <Empty title="Convenio no disponible" />
      )}
    </>
  );
}

export function CompanyPayments() {
  const data = useData("payments");
  return (
    <>
      <PageHead
        eyebrow="CONSUMOS AUTORIZADOS"
        title="Consumos del convenio"
        description="Solo pagos identificados con cobertura empresarial, no cobros privados de los empleados."
      />
      <section className="card">
        {data.isPending ? (
          <Loading />
        ) : data.error ? (
          <ErrorBox message={data.error.message} />
        ) : (
          <Table
            rows={data.data ?? []}
            columns={[
              { key: "folio", label: "Folio" },
              { key: "patientName", label: "Empleado" },
              { key: "concept", label: "Concepto" },
              {
                key: "amount",
                label: "Importe",
                render: (p) => money(num(p, "amount")),
              },
              {
                key: "status",
                label: "Estado",
                render: (p) => <Badge value={txt(p, "status")} />,
              },
            ]}
          />
        )}
      </section>
    </>
  );
}
