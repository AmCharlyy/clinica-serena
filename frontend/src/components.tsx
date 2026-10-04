import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type InputHTMLAttributes,
} from "react";
import {
  X,
  Search,
  Plus,
  ArrowRight,
  Download,
  LoaderCircle,
  Eye,
  EyeOff,
  CircleAlert,
} from "lucide-react";
import { api, txt, num, date, type Row } from "./api";
import { playFeedback } from "./feedback";
export interface Field {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: string[];
  lookup?: string;
  default?: string | number | boolean;
  min?: number;
  max?: number;
  hint?: string;
}
export function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar">
      {name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((s) => s[0])
        .join("")}
    </span>
  );
}
export function Badge({ value }: { value: string }) {
  return (
    <span
      className={
        "badge " +
        ([
          "Pendiente",
          "En espera",
          "Borrador",
          "Mantenimiento",
          "Fallido",
        ].includes(value)
          ? "amber"
          : [
                "Cancelada",
                "Rechazada",
                "Anulado",
                "Inactivo",
                "Denegado",
              ].includes(value)
            ? "red"
            : ["En curso"].includes(value)
              ? "blue"
              : "")
      }
    >
      {value}
    </span>
  );
}
export function PageHead({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="head-actions">{action}</div>
    </div>
  );
}
export function Empty({
  title = "Todavía no hay registros",
  description = "Los registros aparecerán aquí cuando los agregues.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">✳</span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
export function Loading() {
  return (
    <div className="empty" role="status" aria-live="polite">
      <LoaderCircle className="spin" aria-hidden="true" />
      <p>Cargando información…</p>
    </div>
  );
}
export function ErrorBox({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  useEffect(() => {
    if (message) playFeedback("error");
  }, [message]);
  return (
    <div role="alert" className="error-box">
      <CircleAlert size={18} aria-hidden="true" />
      <span>{message}</span>
      {retry && (
        <button className="link" onClick={retry}>
          Reintentar
        </button>
      )}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current,
      previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal-dialog wide" : "modal-dialog"}
      aria-labelledby={titleId}
      onCancel={onClose}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Cerrar ventana"
        >
          <X size={20} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
export function PasswordInput({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="password-control">
      <input
        {...props}
        aria-label={label}
        type={visible ? "text" : "password"}
      />
      <button
        type="button"
        className="password-reveal"
        aria-label={`${visible ? "Ocultar" : "Mostrar"} ${label.toLocaleLowerCase("es-MX")}`}
        aria-pressed={visible}
        onClick={() => setVisible(!visible)}
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </span>
  );
}
export function DataForm({
  fields,
  initial = {},
  lookups = {},
  onSubmit,
  onClose,
  label = "Guardar cambios",
  readOnly = false,
  onFieldChange,
  draftKey,
}: {
  fields: Field[];
  initial?: Row;
  lookups?: Record<string, Row[]>;
  onSubmit: (row: Row) => Promise<void>;
  onClose: () => void;
  label?: string;
  readOnly?: boolean;
  onFieldChange?: (key: string, value: string) => void;
  draftKey?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [restorable, setRestorable] = useState<Row>(),
    [restored, setRestored] = useState<Row>(),
    [draftStatus, setDraftStatus] = useState("");
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const draftFlight = useRef<Promise<unknown>>(Promise.resolve());
  const draftEnabled = Boolean(
    draftKey && !readOnly && !fields.some((f) => f.type === "password"),
  );
  const values = restored ?? initial;
  const snapshot = (element: HTMLFormElement) => {
    const data = new FormData(element),
      row: Row = { ...initial };
    for (const field of fields) {
      const value = data.get(field.key);
      row[field.key] =
        field.type === "checkbox"
          ? value === "on"
          : field.type === "number" || field.lookup
            ? value === ""
              ? null
              : Number(value)
            : field.type === "time" && String(value).length === 5
              ? String(value) + ":00"
              : String(value ?? "");
    }
    return row;
  };
  useEffect(() => {
    let active = true;
    if (draftEnabled)
      void api<{ data: Row | null }>(
        `auth/drafts/${encodeURIComponent(draftKey!)}`,
      )
        .then((result) => {
          if (!active || !result.data) return;
          if (initial.version && result.data.version !== initial.version)
            setDraftStatus(
              "El registro cambió desde el borrador. No se restaurará información desactualizada.",
            );
          else setRestorable(result.data);
        })
        .catch(() => {});
    return () => {
      active = false;
      clearTimeout(draftTimer.current);
    };
  }, [draftKey, draftEnabled]);
  return (
    <form
      key={restored ? "restored" : "initial"}
      onInput={(e) => {
        if (!draftEnabled || busy) return;
        const row = snapshot(e.currentTarget);
        clearTimeout(draftTimer.current);
        setDraftStatus("Guardando borrador protegido…");
        draftTimer.current = setTimeout(() => {
          draftFlight.current = draftFlight.current
            .catch(() => {})
            .then(() =>
              api(`auth/drafts/${encodeURIComponent(draftKey!)}`, "PUT", row),
            )
            .then(
              () =>
                setDraftStatus(
                  "Borrador cifrado guardado · disponible por 24 horas",
                ),
              () =>
                setDraftStatus(
                  "No se pudo guardar el último cambio del borrador.",
                ),
            );
        }, 700);
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const form = new FormData(e.currentTarget),
          row: Row = { ...initial };
        for (const field of fields) {
          const v = form.get(field.key);
          row[field.key] =
            field.type === "checkbox"
              ? v === "on"
              : field.type === "number" || field.lookup
                ? v === ""
                  ? null
                  : Number(v)
                : field.type === "time"
                  ? String(v).length === 5
                    ? String(v) + ":00"
                    : String(v)
                  : String(v ?? "");
        }
        try {
          clearTimeout(draftTimer.current);
          if (draftEnabled) await draftFlight.current.catch(() => {});
          await onSubmit(row);
          if (draftEnabled)
            await api(
              `auth/drafts/${encodeURIComponent(draftKey!)}`,
              "DELETE",
            ).catch(() => {});
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {restorable && (
        <div className="draft-status">
          Hay un borrador protegido de esta cuenta.
          <button
            type="button"
            className="link"
            onClick={() => {
              setRestored(restorable);
              setRestorable(undefined);
              setDraftStatus(
                "Borrador restaurado. Revisa los datos antes de guardar.",
              );
            }}
          >
            Restaurar
          </button>
          <button
            type="button"
            className="link"
            onClick={() => {
              setRestorable(undefined);
              void api(
                `auth/drafts/${encodeURIComponent(draftKey!)}`,
                "DELETE",
              ).catch(() => {});
            }}
          >
            Descartar
          </button>
        </div>
      )}
      {draftStatus && (
        <div className="draft-status" role="status">
          {draftStatus}
        </div>
      )}
      <fieldset className="form-grid" disabled={readOnly || busy}>
        {fields.map((f) => (
          <label key={f.key} className={f.type === "textarea" ? "full" : ""}>
            <span>
              {f.label}
              {f.required && <b className="required"> *</b>}
            </span>
            {f.type === "checkbox" ? (
              <input
                name={f.key}
                type="checkbox"
                defaultChecked={Boolean(values[f.key] ?? f.default ?? true)}
              />
            ) : f.lookup || f.options ? (
              <select
                name={f.key}
                required={f.required}
                defaultValue={String(values[f.key] ?? f.default ?? "")}
                onChange={(e) => onFieldChange?.(f.key, e.target.value)}
              >
                <option value="">Selecciona…</option>
                {f.options?.map((o) => (
                  <option key={o}>{o}</option>
                ))}
                {(lookups[f.lookup ?? ""] ?? []).map((o) => (
                  <option key={num(o, "id")} value={num(o, "id")}>
                    {txt(o, "name")}
                  </option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                name={f.key}
                required={f.required}
                defaultValue={txt(values, f.key) || String(f.default ?? "")}
                rows={4}
              />
            ) : (
              <input
                name={f.key}
                type={f.type ?? "text"}
                required={f.required}
                min={f.min}
                max={f.max}
                step={f.type === "number" ? "0.01" : undefined}
                defaultValue={String(values[f.key] ?? f.default ?? "").slice(
                  0,
                  f.type === "time" ? 5 : undefined,
                )}
              />
            )}
            {f.hint && <small>{f.hint}</small>}
          </label>
        ))}
      </fieldset>
      {error && <ErrorBox message={error} />}
      <div className="form-actions">
        <button type="button" className="btn secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn" disabled={busy || readOnly}>
          {busy ? <LoaderCircle className="spin" size={16} /> : null}
          {busy ? "Guardando…" : label}
        </button>
      </div>
    </form>
  );
}
export interface Column {
  key: string;
  label: string;
  render?: (row: Row) => ReactNode;
}
export function Table({
  rows,
  columns,
  actions,
  empty = "No hay coincidencias",
}: {
  rows: Row[];
  columns: Column[];
  actions?: (row: Row) => ReactNode;
  empty?: string;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
            {actions && (
              <th>
                <span className="sr-only">Acciones</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={txt(r, "id") || i}>
              {columns.map((c) => (
                <td key={c.key}>
                  {c.render ? c.render(r) : txt(r, c.key) || "—"}
                </td>
              ))}
              {actions && <td className="table-actions">{actions(r)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <Empty title={empty} />}
    </div>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = "Buscar en los registros…",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search-box">
      <Search size={17} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function Person({
  row,
  nameKey = "name",
  detailKey = "folio",
}: {
  row: Row;
  nameKey?: string;
  detailKey?: string;
}) {
  return (
    <div className="person">
      <Avatar name={txt(row, nameKey)} />
      <div>
        <strong>{txt(row, nameKey)}</strong>
        <small>{txt(row, detailKey)}</small>
      </div>
    </div>
  );
}
export function ExportButton({
  rows,
  name,
  columns,
  getRows,
  authorizeDataset,
}: {
  rows: Row[];
  name: string;
  columns?: string[];
  getRows?: () => Promise<Row[]>;
  authorizeDataset?: string;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <button
        className="btn secondary"
        disabled={busy || !rows.length}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            if (authorizeDataset)
              await api("exports/authorize", "POST", {
                dataset: authorizeDataset,
              });
            const safeRows = getRows ? await getRows() : rows;
            if (!safeRows.length) return;
            const keys = (
              columns ?? [
                "name",
                "folio",
                "date",
                "time",
                "status",
                "patientName",
                "doctorName",
                "serviceName",
                "amount",
                "concept",
                "method",
                "count",
                "createdAt",
                "username",
                "action",
                "entity",
                "recordId",
                "ip",
                "result",
              ]
            ).filter(
              (k) => k in safeRows[0] && typeof safeRows[0][k] !== "object",
            );
            const escape = (v: unknown) =>
              '"' +
              String(v ?? "")
                .replaceAll('"', '""')
                .replace(/^[\t\r\n ]*[=+@-]/, "'$&") +
              '"';
            const csv =
              "\ufeff" +
              [
                keys.map(escape).join(","),
                ...safeRows.map((r) => keys.map((k) => escape(r[k])).join(",")),
              ].join("\r\n");
            const url = URL.createObjectURL(
              new Blob([csv], { type: "text/csv;charset=utf-8" }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = name + ".csv";
            a.click();
            URL.revokeObjectURL(url);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Download size={16} /> Exportar CSV
      </button>
      {error && (
        <span role="alert" className="muted">
          {error}
        </span>
      )}
    </>
  );
}
export const AddButton = ({
  onClick,
  children = "Nuevo registro",
}: {
  onClick: () => void;
  children?: ReactNode;
}) => (
  <button className="btn" onClick={onClick}>
    <Plus size={17} />
    {children}
  </button>
);
export const ViewButton = ({ onClick }: { onClick: () => void }) => (
  <button className="link" onClick={onClick}>
    Ver detalle <ArrowRight size={14} />
  </button>
);
export function ActivityDate({ row }: { row: Row }) {
  return <span className="muted">{date(txt(row, "createdAt"))}</span>;
}
export async function mutation(path: string, method: string, row?: unknown) {
  await api(path, method, row);
}
