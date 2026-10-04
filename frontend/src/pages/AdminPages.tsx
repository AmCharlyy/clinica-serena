import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Check,
  Download,
  FileText,
  ShieldCheck,
  Pencil,
  Printer,
  Upload,
  DatabaseBackup,
  RefreshCw,
} from "lucide-react";
import {
  api,
  date,
  dateTime,
  money,
  num,
  today,
  txt,
  secureDownload,
  type Row,
} from "../api";
import { addDays } from "../calendar";
import {
  paymentStates,
  catalogTasks,
  matchesCatalogTask,
} from "../workbenchFilters";
import { useApp, useData, useLookups, useWrite } from "../state";
import { modules } from "../modules";
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
  type Column,
} from "../components";

export function CatalogPage({ moduleKey }: { moduleKey: string }) {
  const m = modules[moduleKey],
    data = useData(moduleKey),
    lookups = useLookups(),
    write = useWrite(),
    { user, notify } = useApp(),
    [params, setParams] = useSearchParams();
  const task = params.get("task") ?? "",
    linkedId = params.get("record");
  const needsInvoices = moduleKey === "payments" && task === "receipts";
  const invoices = useData("invoices", needsInvoices);
  const [search, setSearch] = useState(params.get("q") ?? ""),
    [filter, setFilter] = useState("Todos"),
    [edit, setEdit] = useState<Row | null>(null),
    [manualDetail, setManualDetail] = useState<Row | null>(null),
    [page, setPage] = useState(1),
    [sort, setSort] = useState("name");
  const linked = data.data?.find((r) => String(r.id) === linkedId);
  const detail = manualDetail ?? linked;
  function setDetail(row: Row | null) {
    setManualDetail(row);
    if (linkedId) {
      const next = new URLSearchParams(params);
      next.delete("record");
      setParams(next, { replace: true });
    }
  }
  const [accountRole, setAccountRole] = useState<string | null>(null);
  const selectedRole = accountRole ?? txt(edit ?? {}, "roles");
  const assignedAudience = txt(
    lookups.data?.roles?.find((r) => txt(r, "name") === selectedRole) ?? {},
    "audience",
  );
  const can =
    user.permissions.includes(m.permission + ".write") &&
    user.audience === "internal";
  const query = params.get("q") ?? "";
  const stateParam =
    params.get(moduleKey === "payments" ? "status" : "state") ?? "Todos";
  useEffect(() => {
    setSearch(query);
    setPage(1);
  }, [query]);
  useEffect(() => {
    const states =
      moduleKey === "payments"
        ? paymentStates
        : ["Todos", "Activos", "Inactivos"];
    setFilter(states.includes(stateParam) ? stateParam : "Todos");
    setPage(1);
  }, [stateParam, moduleKey, task]);
  const effectiveSearch = search;
  const all = (data.data ?? [])
    .filter(
      (r) =>
        Object.values(r).some((v) =>
          String(v ?? "")
            .toLowerCase()
            .includes(effectiveSearch.toLowerCase()),
        ) &&
        (filter === "Todos" ||
          (moduleKey === "payments"
            ? r.status === filter
            : filter === "Activos"
              ? r.active !== false
              : r.active === false)) &&
        matchesCatalogTask(
          r,
          moduleKey,
          task,
          addDays(today(), 30),
          invoices.data ?? [],
        ),
    )
    .sort((a, b) => txt(a, sort).localeCompare(txt(b, sort)));
  const minimalPatient =
    moduleKey === "patients" &&
    user.audience === "internal" &&
    !user.permissions.includes("patients.write") &&
    !user.permissions.includes("records.read");
  const columns: Column[] = m.columns
    .filter(
      (c) => !minimalPatient || ["name", "folio", "active"].includes(c.key),
    )
    .map((c) => ({
      ...c,
      render:
        c.key === "name"
          ? (r) => (
              <div className="person">
                <Avatar name={txt(r, "name")} />
                <div>
                  <strong>{txt(r, "name")}</strong>
                  <small>
                    {txt(r, "folio") || txt(r, "email") || txt(r, "specialty")}
                  </small>
                </div>
              </div>
            )
          : c.key === "active"
            ? (r) => (
                <Badge value={r.active === false ? "Inactivo" : "Activo"} />
              )
            : ["price", "amount"].includes(c.key)
              ? (r) => <strong>{money(num(r, c.key))}</strong>
              : ["birthDate", "validUntil", "lastAccess"].includes(c.key)
                ? (r) => date(txt(r, c.key))
                : c.key === "status"
                  ? (r) => <Badge value={txt(r, "status")} />
                  : undefined,
    }));
  return (
    <div key={moduleKey}>
      <PageHead
        eyebrow={moduleKey === "patients" ? "ATENCIÓN CERCANA" : "ORGANIZACIÓN"}
        title={
          moduleKey === "patients" && user.audience === "doctor"
            ? "Mis pacientes"
            : m.title
        }
        description={
          minimalPatient
            ? "Identidad mínima para las tareas autorizadas, sin contacto personal ni expediente."
            : moduleKey === "patients" && user.audience === "doctor"
              ? "Pacientes con citas no canceladas asignadas a ti; acceso para continuidad asistencial."
              : m.description
        }
        action={
          can && (
            <AddButton
              onClick={() => {
                setAccountRole(null);
                setEdit({});
              }}
            >
              {moduleKey === "payments"
                ? "Registrar pago"
                : `Añadir ${m.singular}`}
            </AddButton>
          )
        }
      />
      {linkedId && !data.isPending && !data.error && !linked && (
        <div className="info-box">
          El registro no está disponible en tu alcance actual.{" "}
          <button className="link" onClick={() => setDetail(null)}>
            Cerrar aviso
          </button>
        </div>
      )}
      {catalogTasks[moduleKey]?.[task] && (
        <div className="info-box">
          Filtro de trabajo: {catalogTasks[moduleKey][task]}.{" "}
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
            value={effectiveSearch}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
          <div className="toolbar-right">
            {
              <select
                aria-label="Filtrar por estado"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(1);
                }}
              >
                {(moduleKey === "payments"
                  ? paymentStates
                  : ["Todos", "Activos", "Inactivos"]
                ).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            }
            <select
              aria-label="Ordenar registros"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              {m.columns.map((c) => (
                <option value={c.key} key={c.key}>
                  Orden: {c.label}
                </option>
              ))}
            </select>
            {user.permissions.includes("reports.export") && (
              <ExportButton
                rows={all}
                authorizeDataset={m.key}
                columns={columns.map((c) => c.key)}
                name={m.key}
              />
            )}
          </div>
        </div>
        {data.isPending || (needsInvoices && invoices.isPending) ? (
          <Loading />
        ) : data.error ? (
          <ErrorBox message={data.error.message} retry={() => data.refetch()} />
        ) : needsInvoices && invoices.error ? (
          <ErrorBox
            message={invoices.error.message}
            retry={() => invoices.refetch()}
          />
        ) : (
          <Table
            rows={all.slice((page - 1) * 10, page * 10)}
            columns={columns}
            actions={(r) => <ViewButton onClick={() => setDetail(r)} />}
          />
        )}
        <div className="pagination">
          <span>
            {all.length} registros · Página {page}
          </span>
          <div>
            <button
              className="btn subtle"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </button>
            <button
              className="btn subtle"
              disabled={page * 10 >= all.length}
              onClick={() => setPage(page + 1)}
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
      {edit && !edit._reset && !edit._cancel && !edit._contact && (
        <Modal
          title={`${edit.id ? "Editar" : "Añadir"} ${m.singular}`}
          onClose={() => setEdit(null)}
          wide
        >
          <DataForm
            draftKey={
              ["patients", "payments"].includes(moduleKey)
                ? `${moduleKey}:${edit.id ?? "new"}`
                : undefined
            }
            fields={m.fields
              .filter((f) => !(f.key === "password" && edit.id))
              .filter(
                (f) =>
                  moduleKey !== "users" ||
                  !["patientId", "doctorId", "companyId"].includes(f.key) ||
                  f.key ===
                    (
                      {
                        patient: "patientId",
                        doctor: "doctorId",
                        company: "companyId",
                      } as Record<string, string>
                    )[assignedAudience],
              )
              .map((f) =>
                moduleKey === "users" &&
                ["patientId", "doctorId", "companyId"].includes(f.key)
                  ? { ...f, required: true }
                  : f,
              )
              .map((f) =>
                f.key === "roles"
                  ? {
                      ...f,
                      options:
                        lookups.data?.roles
                          ?.filter((r) => r.assignable !== false)
                          .map((r) => txt(r, "name")) ?? f.options,
                    }
                  : f,
              )}
            initial={edit}
            onFieldChange={(key, value) => {
              if (moduleKey === "users" && key === "roles")
                setAccountRole(value);
            }}
            lookups={lookups.data ?? {}}
            onClose={() => setEdit(null)}
            onSubmit={async (row) => {
              if (moduleKey === "users") {
                row.patientId =
                  assignedAudience === "patient" ? row.patientId : null;
                row.doctorId =
                  assignedAudience === "doctor" ? row.doctorId : null;
                row.companyId =
                  assignedAudience === "company" ? row.companyId : null;
              }
              if (moduleKey === "companies" && row.validUntil === "")
                row.validUntil = null;
              await write(
                moduleKey + (edit.id ? "/" + edit.id : ""),
                edit.id ? "PUT" : "POST",
                row,
              );
              setEdit(null);
            }}
          />
        </Modal>
      )}
      {detail && (
        <Modal
          title={txt(detail, "name") || txt(detail, "folio") || "Detalle"}
          onClose={() => setDetail(null)}
          wide
        >
          <div className="detail-grid">
            {m.columns
              .filter((c) => c.key !== "name")
              .map((c) => (
                <div key={c.key}>
                  <small>{c.label}</small>
                  <strong>
                    {c.render ? c.render(detail) : txt(detail, c.key) || "—"}
                  </strong>
                </div>
              ))}
          </div>
          {moduleKey === "patients" && !minimalPatient && (
            <PatientDetails patient={detail} />
          )}{" "}
          {moduleKey === "patients" && user.audience === "patient" && (
            <div className="form-actions">
              <button
                className="btn"
                onClick={() => {
                  setDetail(null);
                  setEdit({ ...detail, _contact: true });
                }}
              >
                Actualizar mi contacto
              </button>
            </div>
          )}
          {moduleKey === "companies" && (
            <div className="info-box">
              <h3>Convenio</h3>
              <p>
                {txt(detail, "agreement") || "Sin condiciones registradas."}
              </p>
            </div>
          )}
          {can && (
            <div className="form-actions">
              {moduleKey === "users" && (
                <button
                  className="btn secondary"
                  onClick={() => {
                    setDetail(null);
                    setEdit({ ...detail, _reset: true });
                  }}
                >
                  Restablecer contraseña
                </button>
              )}
              {moduleKey === "payments" ? (
                <>
                  {detail.status === "Pendiente" && (
                    <button
                      className="btn"
                      onClick={async () => {
                        try {
                          await write(
                            `payments/${detail.id}/settle`,
                            "POST",
                            {
                              version: detail.version,
                              status: "Pagado",
                              reason: "",
                            },
                            "Pago liquidado",
                          );
                          setDetail(null);
                        } catch (e) {
                          notify((e as Error).message, "error");
                        }
                      }}
                    >
                      Registrar liquidación
                    </button>
                  )}
                  {txt(detail, "status") === "Pagado" && (
                    <button
                      className="btn"
                      onClick={async () => {
                        try {
                          await write(
                            "invoices",
                            "POST",
                            { paymentId: detail.id },
                            "Comprobante interno generado",
                          );
                          setDetail(null);
                        } catch (e) {
                          notify((e as Error).message, "error");
                        }
                      }}
                    >
                      <FileText size={16} />
                      Emitir comprobante
                    </button>
                  )}
                  {txt(detail, "status") !== "Anulado" && (
                    <button
                      className="btn danger"
                      onClick={() => {
                        setDetail(null);
                        setEdit({ ...detail, _cancel: true });
                      }}
                    >
                      Anular pago
                    </button>
                  )}
                </>
              ) : (
                <button
                  className="btn"
                  onClick={() => {
                    setDetail(null);
                    setAccountRole(null);
                    setEdit(detail);
                  }}
                >
                  <Pencil size={16} />
                  Editar datos
                </button>
              )}
            </div>
          )}
        </Modal>
      )}
      {edit?._reset === true && (
        <Modal title="Contraseña temporal" onClose={() => setEdit(null)}>
          <DataForm
            fields={[
              {
                key: "password",
                label: "Nueva contraseña temporal",
                type: "password",
                required: true,
                hint: "La cuenta deberá cambiarla en el próximo inicio de sesión.",
              },
            ]}
            onClose={() => setEdit(null)}
            onSubmit={async (row) => {
              await write(`users/${edit.id}/reset-password`, "POST", row);
              setEdit(null);
            }}
          />
        </Modal>
      )}
      {edit?._contact === true && (
        <Modal title="Actualizar mi contacto" onClose={() => setEdit(null)}>
          <DataForm
            fields={m.fields.filter((f) =>
              ["phone", "email", "address", "emergencyContact"].includes(f.key),
            )}
            initial={edit}
            onClose={() => setEdit(null)}
            onSubmit={async (row) => {
              await write("profile/contact", "PUT", row);
              setEdit(null);
            }}
          />
        </Modal>
      )}
      {edit?._cancel === true && (
        <Modal title="Anular pago" onClose={() => setEdit(null)}>
          <p className="muted">
            El pago se conservará en el historial como anulado.
          </p>
          <DataForm
            fields={[
              {
                key: "reason",
                label: "Motivo de anulación",
                type: "textarea",
                required: true,
              },
            ]}
            initial={edit}
            onClose={() => setEdit(null)}
            onSubmit={async (row) => {
              await write(`payments/${edit.id}/cancel`, "POST", {
                ...row,
                status: "Anulado",
              });
              setEdit(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
function PatientDetails({ patient }: { patient: Row }) {
  const { user } = useApp();
  const notes = useData(
      `records?patientId=${patient.id}`,
      user.permissions.includes("records.read"),
    ),
    docs = useData(
      `documents?patientId=${patient.id}`,
      user.permissions.includes("documents.read"),
    );
  return (
    <>
      <div className="info-box">
        <h3>Información de contacto</h3>
        <p>
          {txt(patient, "address") || "Domicilio no registrado"}
          <br />
          Contacto de emergencia:{" "}
          {txt(patient, "emergencyContact") || "Sin registrar"}
        </p>
      </div>
      {user.permissions.includes("records.read") && (
        <div className="detail-section">
          <h3>Historial clínico</h3>
          {notes.data?.length ? (
            notes.data.map((n) => (
              <div className="timeline-item" key={num(n, "id")}>
                <small>
                  {date(txt(n, "createdAt"))} · {txt(n, "doctorName")}
                </small>
                <p>{txt(n, "content")}</p>
                <span className="muted">{txt(n, "diagnosis")}</span>
              </div>
            ))
          ) : (
            <p className="muted">Sin consultas registradas.</p>
          )}
        </div>
      )}
      {user.permissions.includes("documents.read") && (
        <div className="detail-section">
          <h3>Documentos autorizados</h3>
          {docs.data?.map((d) => (
            <a
              className="document-row"
              key={num(d, "id")}
              href={`/api/documents/${d.id}/download`}
            >
              <FileText size={18} />
              {txt(d, "name")}
              <Download size={16} />
            </a>
          ))}
          {!docs.data?.length && (
            <p className="muted">Sin documentos disponibles.</p>
          )}
        </div>
      )}
    </>
  );
}
export function RolesPage() {
  const roles = useData("roles"),
    permissions = useData<string[]>("permissions"),
    audiences = useData<Record<string, string[]>>("role-audiences"),
    { user } = useApp(),
    write = useWrite();
  const [selected, setSelected] = useState<Row | null>(null),
    [create, setCreate] = useState(false),
    [checked, setChecked] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [params, setParams] = useSearchParams();
  const linkedId = params.get("role");
  const linked = roles.data?.find((r) => String(r.id) === linkedId);
  const closeRole = () => {
    setSelected(null);
    if (linkedId) {
      const next = new URLSearchParams(params);
      next.delete("role");
      setParams(next, { replace: true });
    }
  };
  useEffect(() => {
    if (linked) {
      setSelected(linked);
      setChecked(txt(linked, "permissions").split(",").filter(Boolean));
      setError("");
    }
    // Initialize once per linked ID; closing the dialog must not reopen it
    // while URL navigation is settling, or reset unsaved changes on a refresh.
  }, [linked?.id]);
  return (
    <>
      <PageHead
        eyebrow="ACCESO Y RESPONSABILIDAD"
        title="Roles y permisos"
        description="Cada persona tiene las herramientas y el alcance que necesita."
        action={
          user.permissions.includes("roles.write") && (
            <AddButton onClick={() => setCreate(true)}>Nuevo rol</AddButton>
          )
        }
      />
      {linkedId && !roles.isPending && !roles.error && !linked && (
        <div className="info-box">
          El rol ya no está disponible.{" "}
          <button className="link" onClick={closeRole}>
            Cerrar aviso
          </button>
        </div>
      )}
      {create && (
        <Modal title="Crear rol" onClose={() => setCreate(false)}>
          <DataForm
            fields={[
              { key: "name", label: "Nombre del rol", required: true },
              { key: "description", label: "Descripción", type: "textarea" },
              {
                key: "audience",
                label: "Tipo de acceso y alcance",
                options: [
                  "Personal interno",
                  "Médico · pacientes asignados",
                  "Paciente · datos propios",
                  "Empresa · convenio propio",
                ],
                default: "Personal interno",
                required: true,
                hint: "El alcance es independiente del nombre del rol y no puede cambiarse después.",
              },
            ]}
            onClose={() => setCreate(false)}
            onSubmit={async (row) => {
              await write(
                "roles",
                "POST",
                {
                  ...row,
                  audience: (
                    {
                      "Personal interno": "internal",
                      "Médico · pacientes asignados": "doctor",
                      "Paciente · datos propios": "patient",
                      "Empresa · convenio propio": "company",
                    } as Record<string, string>
                  )[txt(row, "audience")],
                  permissions: [],
                },
                "Rol creado. Abre su tarjeta para asignar permisos.",
              );
              setCreate(false);
            }}
          />
        </Modal>
      )}
      <div className="roles-grid">
        {roles.data?.map((r) => (
          <button
            className="card role-card"
            key={num(r, "id")}
            onClick={() => {
              if (linkedId) {
                const next = new URLSearchParams(params);
                next.delete("role");
                setParams(next, { replace: true });
              }
              setSelected(r);
              setChecked(txt(r, "permissions").split(",").filter(Boolean));
              setError("");
            }}
          >
            <span className="role-icon">
              <ShieldCheck size={23} />
            </span>
            <h3>{txt(r, "name")}</h3>
            <p>{txt(r, "description")}</p>
            <p className="muted">
              Alcance:{" "}
              {
                (
                  {
                    internal: "Personal interno",
                    doctor: "Pacientes asignados",
                    patient: "Datos propios",
                    company: "Convenio propio",
                  } as Record<string, string>
                )[txt(r, "audience")]
              }
            </p>
            <small>
              {txt(r, "permissions").split(",").filter(Boolean).length} permisos
              asignados →
            </small>
          </button>
        ))}
      </div>
      {roles.isPending && <Loading />}
      {roles.error && <ErrorBox message={roles.error.message} />}
      {selected && (
        <Modal title={txt(selected, "name")} onClose={closeRole} wide>
          <p className="muted">
            El tipo de acceso ({txt(selected, "audience")}) se aplica en el
            servidor. Solo se ofrecen permisos compatibles con ese alcance,
            también para roles personalizados.
          </p>
          <div className="permissions-grid">
            {permissions.data
              ?.filter((p) =>
                audiences.data?.[txt(selected, "audience")]?.includes(p),
              )
              .map((p) => (
                <label key={p} className="permission-option">
                  <input
                    type="checkbox"
                    checked={checked.includes(p)}
                    disabled={
                      !user.permissions.includes("roles.write") ||
                      !user.permissions.includes(p) ||
                      selected.name === "Superadministrador"
                    }
                    onChange={(e) =>
                      setChecked(
                        e.target.checked
                          ? [...checked, p]
                          : checked.filter((x) => x !== p),
                      )
                    }
                  />
                  <span>
                    {p}
                    <small>
                      {p.endsWith(".write")
                        ? "Crear y modificar"
                        : p.endsWith(".read")
                          ? "Consultar"
                          : "Acción específica"}
                    </small>
                  </span>
                </label>
              ))}
          </div>
          {error && <ErrorBox message={error} />}
          <div className="form-actions">
            <button className="btn secondary" onClick={closeRole}>
              Cerrar
            </button>
            {user.permissions.includes("roles.write") &&
              selected.name !== "Superadministrador" && (
                <button
                  className="btn"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await write("roles/" + selected.id, "PUT", {
                        ...selected,
                        permissions: checked,
                      });
                      closeRole();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Guardar permisos
                </button>
              )}
          </div>
        </Modal>
      )}
    </>
  );
}
export function DocumentsPage() {
  const data = useData("documents"),
    lookups = useLookups(),
    write = useWrite(),
    { user, notify } = useApp(),
    [upload, setUpload] = useState(false),
    [documentCategory, setDocumentCategory] = useState("Administrativo"),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const can =
    user.permissions.includes("documents.write") &&
    (user.audience === "internal" || user.audience === "doctor");
  const personal = user.audience === "patient",
    corporate = user.audience === "company";
  return (
    <>
      <PageHead
        eyebrow={
          personal
            ? "MI ATENCIÓN"
            : corporate
              ? "MI CONVENIO"
              : "ARCHIVOS PRIVADOS"
        }
        title={
          personal
            ? "Mis documentos"
            : corporate
              ? "Documentos del convenio"
              : "Documentos"
        }
        description={
          personal
            ? "Archivos que la clínica publicó para ti."
            : corporate
              ? "Comprobantes publicados y compartidos expresamente con tu empresa."
              : "Estudios y archivos con acceso autorizado por paciente."
        }
        action={
          can && (
            <AddButton
              onClick={() => {
                setUpload(true);
                setDocumentCategory("Administrativo");
                setError("");
              }}
            >
              Subir documento
            </AddButton>
          )
        }
      />
      <div className="card">
        <div className="list-toolbar">
          <SearchBox value={search} onChange={setSearch} />
          <span className="muted">PDF, PNG y JPEG · Máximo 10 MB</span>
        </div>
        {data.isPending ? (
          <Loading />
        ) : (
          <Table
            rows={(data.data ?? []).filter((r) =>
              (txt(r, "name") + txt(r, "patientName"))
                .toLowerCase()
                .includes(search.toLowerCase()),
            )}
            columns={[
              {
                key: "name",
                label: "Documento",
                render: (r: Row) => (
                  <div className="person">
                    <span className="file-icon">
                      <FileText size={20} />
                    </span>
                    <strong>{txt(r, "name")}</strong>
                  </div>
                ),
              },
              { key: "patientName", label: "Paciente" },
              { key: "category", label: "Categoría" },
              {
                key: "size",
                label: "Tamaño",
                render: (r: Row) => (num(r, "size") / 1024).toFixed(1) + " KB",
              },
              {
                key: "released",
                label: "Portal",
                render: (r: Row) => (
                  <Badge value={r.released ? "Publicado" : "Privado"} />
                ),
              },
            ].filter(
              (c) =>
                !(personal && c.key === "patientName") &&
                !((personal || corporate) && c.key === "released"),
            )}
            actions={(r) => (
              <div className="inline-actions">
                <a className="link" href={`/api/documents/${r.id}/download`}>
                  <Download size={17} />
                  Descargar
                </a>
                {user.permissions.includes("documents.publish") && (
                  <button
                    className="link"
                    onClick={async () => {
                      try {
                        await write(`documents/${r.id}/release`, "POST", {
                          released: !r.released,
                          version: r.version,
                        });
                      } catch (e) {
                        notify((e as Error).message, "error");
                      }
                    }}
                  >
                    {r.released ? "Retirar del portal" : "Publicar"}
                  </button>
                )}
              </div>
            )}
          />
        )}
      </div>
      {data.error && <ErrorBox message={data.error.message} />}{" "}
      {upload && (
        <Modal title="Subir documento" onClose={() => setUpload(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await write(
                  "documents",
                  "POST",
                  new FormData(e.currentTarget),
                  "Documento almacenado correctamente",
                );
                setUpload(false);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Paciente
              <select name="patientId" required>
                <option value="">Selecciona un paciente</option>
                {lookups.data?.patients?.map((p) => (
                  <option key={num(p, "id")} value={num(p, "id")}>
                    {txt(p, "name")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Categoría
              <select
                name="category"
                value={documentCategory}
                onChange={(e) => setDocumentCategory(e.target.value)}
              >
                {(user.permissions.includes("records.write")
                  ? [
                      "Administrativo",
                      "Comprobante",
                      "Estudio",
                      "Receta",
                      "Resultado",
                    ]
                  : ["Administrativo", "Comprobante"]
                ).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            {user.audience === "internal" &&
              documentCategory === "Comprobante" && (
                <label>
                  Compartir comprobante con convenio (opcional)
                  <select name="companyId">
                    <option value="">No compartir con empresas</option>
                    {lookups.data?.companies?.map((co) => (
                      <option key={num(co, "id")} value={num(co, "id")}>
                        {txt(co, "name")}
                      </option>
                    ))}
                  </select>
                  <small>
                    Solo para comprobantes; el empleado debe estar asociado.
                  </small>
                </label>
              )}
            <label className="upload-zone">
              <Upload size={30} />
              <strong>Selecciona un archivo</strong>
              <input
                name="file"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                required
              />
            </label>
            <label>
              Disponibilidad
              <select name="released">
                <option value="false">
                  Privado · solo personal autorizado
                </option>
                {user.permissions.includes("documents.publish") && (
                  <option value="true">
                    Publicado · disponible para el paciente
                  </option>
                )}
              </select>
            </label>
            {error && <ErrorBox message={error} />}
            <div className="form-actions">
              <button
                className="btn secondary"
                type="button"
                onClick={() => setUpload(false)}
              >
                Cancelar
              </button>
              <button className="btn" disabled={busy}>
                Subir documento
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function SettingsPage() {
  const data = useData<Row>("settings"),
    write = useWrite(),
    { user } = useApp();
  return (
    <>
      <PageHead
        eyebrow="IDENTIDAD Y REGLAS"
        title="Configuración de la clínica"
        description="Datos generales y políticas de la operación diaria."
      />
      <div className="card settings-card">
        {data.isPending ? (
          <Loading />
        ) : data.data ? (
          <DataForm
            fields={[
              { key: "name", label: "Nombre de la clínica", required: true },
              { key: "phone", label: "Teléfono" },
              { key: "email", label: "Correo", type: "email" },
              { key: "address", label: "Domicilio", type: "textarea" },
              {
                key: "openingHour",
                label: "Hora de apertura (0–23)",
                type: "number",
                min: 0,
                max: 23,
                required: true,
              },
              {
                key: "closingHour",
                label: "Hora de cierre (1–24)",
                type: "number",
                min: 1,
                max: 24,
                required: true,
              },
              {
                key: "cancellationHours",
                label: "Anticipación para cancelar (horas)",
                type: "number",
                min: 0,
                max: 168,
                required: true,
              },
            ]}
            initial={data.data}
            readOnly={!user.permissions.includes("settings.write")}
            onClose={() => data.refetch()}
            onSubmit={async (row) => {
              if (!user.permissions.includes("settings.write"))
                throw new Error("Tu cuenta tiene acceso de consulta.");
              await write("settings", "PUT", row);
            }}
            label={
              user.permissions.includes("settings.write")
                ? "Guardar configuración"
                : "Solo lectura"
            }
          />
        ) : null}
        {data.error && <ErrorBox message={data.error.message} />}
        <p className="muted">
          Zona horaria de operación: Ciudad de México. La gestión del servidor
          se realiza fuera de esta pantalla.
        </p>
      </div>
    </>
  );
}
export function NotificationsPage() {
  const data = useData("notifications", true, 30000),
    write = useWrite();
  const [onlyUnread, setOnlyUnread] = useState(false),
    [busy, setBusy] = useState<number>(),
    [error, setError] = useState("");
  const all = data.data ?? [],
    unread = all.filter((row) => !row.read),
    rows = onlyUnread ? unread : all;
  const markRead = async (id: number) => {
    if (busy !== undefined) return;
    setBusy(id);
    setError("");
    try {
      await write(
        `notifications/${id}/read`,
        "POST",
        undefined,
        "Notificación marcada como leída",
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(undefined);
    }
  };
  return (
    <>
      <PageHead
        eyebrow="TU ACTIVIDAD"
        title="Notificaciones"
        description="Tus avisos de citas, documentos y actividad. Se muestran los 100 más recientes."
      />
      <div className="notification-filters" aria-label="Filtrar notificaciones">
        <button aria-pressed={!onlyUnread} onClick={() => setOnlyUnread(false)}>
          Todas ({all.length})
        </button>
        <button aria-pressed={onlyUnread} onClick={() => setOnlyUnread(true)}>
          Sin leer ({unread.length})
        </button>
      </div>
      <div className="card">
        {error && <ErrorBox message={error} />}
        {data.error ? (
          <ErrorBox
            message="No pudimos cargar tus notificaciones."
            retry={() => void data.refetch()}
          />
        ) : data.isPending ? (
          <Loading />
        ) : rows.length ? (
          rows.map((n) => (
            <div
              className={`notification-row ${n.read ? "" : "is-unread"}`}
              key={num(n, "id")}
            >
              <span className="role-icon">
                <FileText size={20} />
              </span>
              <div>
                <strong>{txt(n, "title")}</strong>
                <p>{txt(n, "message")}</p>
                <small>
                  {dateTime(txt(n, "createdAt"))} · Ciudad de México
                </small>
              </div>
              {n.read ? (
                <Badge value="Leído" />
              ) : (
                <button
                  className="link"
                  disabled={busy !== undefined}
                  onClick={() => void markRead(num(n, "id"))}
                >
                  <Check size={16} />
                  {busy === num(n, "id")
                    ? "Actualizando…"
                    : "Marcar como leído"}
                </button>
              )}
            </div>
          ))
        ) : (
          <Empty
            title={onlyUnread ? "No tienes avisos pendientes" : "Todo al día"}
            description="Los próximos avisos de tu cuenta aparecerán aquí."
          />
        )}
      </div>
    </>
  );
}
export function AuditPage() {
  const { user } = useApp();
  const [params, setParams] = useSearchParams();
  const task = params.get("task"),
    event = params.get("event"),
    days = params.get("days") === "7" ? "7" : "1";
  const filter = new URLSearchParams();
  if (event) filter.set("event", event);
  else if (task) {
    filter.set("task", task);
    filter.set("days", days);
  }
  const data = useData("audit" + (filter.size ? "?" + filter : "")),
    [search, setSearch] = useState("");
  const labels: Record<string, string> = {
    denied: "Accesos denegados",
    failedLogin: "Ingresos fallidos",
    failures: "Resultados fallidos o denegados",
    access: "Cambios de cuentas y permisos",
  };
  const rows = (data.data ?? []).filter((r) =>
    [r.username, r.action, r.entity, r.result]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHead
        eyebrow="TRAZABILIDAD"
        title="Auditoría"
        description={
          event
            ? "Evento solicitado, sujeto a tu permiso de auditoría."
            : task
              ? `${labels[task] ?? "Filtro de revisión"} · ${days === "7" ? "últimos 7 días" : "últimas 24 horas"} · hasta 500 eventos.`
              : "Últimos 500 eventos: accesos, consultas y modificaciones."
        }
        action={
          user.permissions.includes("reports.export") && (
            <ExportButton
              rows={rows}
              name="auditoria"
              authorizeDataset="audit"
            />
          )
        }
      />
      <div className="card">
        <div className="list-toolbar">
          <SearchBox value={search} onChange={setSearch} />
          {(task || event) && (
            <button
              className="btn secondary"
              onClick={() => {
                setParams({}, { replace: true });
                setSearch("");
              }}
            >
              Ver actividad completa
            </button>
          )}
        </div>
        {data.isPending ? (
          <Loading />
        ) : data.error ? (
          <ErrorBox message={data.error.message} retry={() => data.refetch()} />
        ) : (
          <Table
            rows={rows}
            columns={[
              {
                key: "createdAt",
                label: "Fecha",
                render: (r) =>
                  date(txt(r, "createdAt")) +
                  " " +
                  new Date(txt(r, "createdAt")).toLocaleTimeString("es-MX"),
              },
              { key: "username", label: "Usuario" },
              { key: "action", label: "Acción" },
              { key: "entity", label: "Registro" },
              { key: "recordId", label: "ID" },
              { key: "ip", label: "IP" },
              { key: "integrity", label: "Integridad" },
              {
                key: "result",
                label: "Resultado",
                render: (r) => <Badge value={txt(r, "result")} />,
              },
            ]}
          />
        )}
      </div>
    </>
  );
}
export function InvoicesPage() {
  const data = useData("invoices"),
    [selected, setSelected] = useState<Row | null>(null);
  const { user } = useApp();
  return (
    <>
      <PageHead
        eyebrow={
          user.audience === "company" ? "MI CONVENIO" : "CONTROL INTERNO"
        }
        title="Comprobantes"
        description="Comprobantes de pago para el proyecto. Sin validez fiscal."
      />
      <div className="card">
        {data.isPending ? (
          <Loading />
        ) : (
          <Table
            rows={data.data ?? []}
            columns={[
              { key: "folio", label: "Folio" },
              { key: "patientName", label: "Paciente" },
              { key: "concept", label: "Concepto" },
              {
                key: "amount",
                label: "Importe",
                render: (r) => money(num(r, "amount")),
              },
              {
                key: "status",
                label: "Pago",
                render: (r) => <Badge value={txt(r, "status")} />,
              },
            ]}
            actions={(r) => <ViewButton onClick={() => setSelected(r)} />}
          />
        )}
      </div>
      {selected && (
        <Modal title="Comprobante interno" onClose={() => setSelected(null)}>
          <div className="receipt">
            <h2>Clínica Serena</h2>
            <small>COMPROBANTE INTERNO · SIN VALIDEZ FISCAL</small>
            <hr />
            <p>
              Folio: <strong>{txt(selected, "folio")}</strong>
              <br />
              Fecha: {date(txt(selected, "createdAt"))}
              <br />
              Paciente: {txt(selected, "patientName")}
            </p>
            <p>{txt(selected, "concept")}</p>
            <h1>{money(num(selected, "amount"))}</h1>
            <Badge value={txt(selected, "status")} />
          </div>
          <div className="form-actions">
            <button className="btn" onClick={() => window.print()}>
              <Printer size={16} />
              Imprimir / guardar PDF
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function SystemPage() {
  const data = useData<Row>("system");
  return (
    <>
      <PageHead
        eyebrow="DIAGNÓSTICO"
        title="Estado del sistema"
        description="Información de la aplicación y su conexión con la base de datos."
        action={
          <button className="btn secondary" onClick={() => data.refetch()}>
            <RefreshCw size={16} />
            Actualizar
          </button>
        }
      />
      {data.isPending ? (
        <Loading />
      ) : data.data ? (
        <div className="roles-grid">
          {[
            ["Base de datos", txt(data.data, "database")],
            [
              "Conectividad",
              data.data.connected ? "Conectada" : "No disponible",
            ],
            ["Entorno", txt(data.data, "environment")],
            ["Runtime .NET", txt(data.data, "runtime")],
            ["Espacio libre", txt(data.data, "freeSpaceGb") + " GB"],
            [
              "Tiempo activo",
              Math.round(num(data.data, "uptimeMinutes")) + " minutos",
            ],
          ].map(([title, value]) => (
            <div className="card" key={title}>
              <span className="eyebrow">{title}</span>
              <h2 style={{ marginTop: 15 }}>{value}</h2>
            </div>
          ))}
        </div>
      ) : (
        <ErrorBox message={data.error?.message ?? "Sin información"} />
      )}
      <div className="info-box">
        Esta vista consulta el estado de la aplicación. IIS, RDP y servicios de
        Windows se administran desde el servidor.
      </div>
    </>
  );
}
export function BackupsPage() {
  const data = useData("backups"),
    write = useWrite(),
    { user } = useApp(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <PageHead
        eyebrow="CONTINUIDAD"
        title="Respaldos"
        description="Copias manuales de la base de datos y los documentos privados."
        action={
          user.permissions.includes("backups.write") && (
            <button
              className="btn"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await write("backups", "POST", {}, "Respaldo completado");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <DatabaseBackup size={17} />
              {busy ? "Creando respaldo…" : "Crear respaldo"}
            </button>
          )
        }
      />
      {error && <ErrorBox message={error} />}
      <div className="card">
        <Table
          rows={data.data ?? []}
          columns={[
            { key: "name", label: "Archivo" },
            {
              key: "createdAt",
              label: "Fecha",
              render: (r) => date(txt(r, "createdAt")),
            },
            { key: "provider", label: "Motor" },
            {
              key: "size",
              label: "Tamaño",
              render: (r) => (num(r, "size") / 1024 / 1024).toFixed(2) + " MB",
            },
            {
              key: "status",
              label: "Estado",
              render: (r) => <Badge value={txt(r, "status")} />,
            },
          ]}
          actions={(r) =>
            txt(r, "status") === "Completado" &&
            user.permissions.includes("backups.download") ? (
              <button
                className="link"
                onClick={() =>
                  void secureDownload(
                    `backups/${r.id}/download`,
                    txt(r, "name"),
                  ).catch((e) => setError(e.message))
                }
              >
                <Download size={16} />
                Descargar
              </button>
            ) : (
              <span className="muted">{txt(r, "detail")}</span>
            )
          }
        />
      </div>
      <div className="info-box">
        La copia descargada contiene la base y los archivos. Conserva una copia
        fuera de este equipo. La restauración se realiza con el procedimiento de
        mantenimiento documentado.
      </div>
    </>
  );
}
