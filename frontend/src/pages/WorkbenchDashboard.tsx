import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardList,
  Clock3,
  CreditCard,
  DatabaseBackup,
  DoorOpen,
  Flower2,
  LayoutDashboard,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  Users,
  type LucideIcon,
} from "lucide-react";
import { money } from "../api";
import { useApp, useData } from "../state";
import { ErrorBox, Loading, PageHead } from "../components";

type Metric = {
  key: string;
  label: string;
  value: number;
  detail: string;
  format: string;
  href: string | null;
};
type Item = {
  key: string;
  title: string;
  subtitle: string;
  state: string;
  href: string | null;
  action: string;
  tone: string;
  at: string | null;
  amount: number | null;
};
type Panel = {
  key: string;
  title: string;
  description: string;
  emptyMessage: string;
  total: number;
  items: Item[];
  href: string | null;
};
type Alert = {
  key: string;
  title: string;
  description: string;
  tone: string;
  href: string | null;
};
type Workbench = {
  view: string;
  defaultView: string;
  availableViews: string[];
  date: string;
  asOf: string;
  metrics: Metric[];
  panels: Panel[];
  alerts: Alert[];
};

const areas: Record<
  string,
  { name: string; title: string; description: string; icon: LucideIcon }
> = {
  overview: {
    name: "Resumen",
    title: "Una clínica conectada y bajo control.",
    description: "Prioridades por área y accesos al trabajo de cada equipo.",
    icon: LayoutDashboard,
  },
  reception: {
    name: "Recepción",
    title: "La jornada empieza contigo.",
    description:
      "Confirmaciones, llegadas y sala de espera. Cada pendiente tiene su siguiente paso.",
    icon: ClipboardList,
  },
  finance: {
    name: "Finanzas",
    title: "Las cuentas claras, la atención tranquila.",
    description:
      "Cobros pendientes, comprobantes internos y convenios que requieren seguimiento.",
    icon: CreditCard,
  },
  coordination: {
    name: "Coordinación",
    title: "Un buen día para coordinar.",
    description:
      "Jornadas médicas, estado de consultorios y reservas de la agenda de hoy.",
    icon: Stethoscope,
  },
  access: {
    name: "Gestión de accesos",
    title: "El acceso correcto para cada persona.",
    description:
      "Cuentas pendientes, alcances de roles y cambios de acceso. Sin expedientes clínicos.",
    icon: Users,
  },
  audit: {
    name: "Auditoría",
    title: "Trazabilidad sin acceso innecesario.",
    description:
      "Eventos que requieren revisión y cambios de permisos, sin detalles clínicos en el resumen.",
    icon: ShieldCheck,
  },
  support: {
    name: "Soporte",
    title: "Un sistema disponible para cuidar.",
    description:
      "Comprobaciones de la aplicación, almacenamiento e historial de respaldos.",
    icon: Monitor,
  },
  personal: {
    name: "Mi trabajo",
    title: "Tu espacio de trabajo está listo.",
    description: "Tus avisos y las herramientas autorizadas para esta cuenta.",
    icon: Flower2,
  },
};
const panelIcons: Record<string, LucideIcon> = {
  confirmations: CalendarDays,
  waiting: Clock3,
  arrivals: DoorOpen,
  current: Stethoscope,
  pendingPayments: CreditCard,
  receipts: ClipboardList,
  agreements: Users,
  doctors: Stethoscope,
  facilities: DoorOpen,
  accounts: Users,
  roles: ShieldCheck,
  accessChanges: ShieldCheck,
  failures: Activity,
  changes: ShieldCheck,
  recentEvents: ClipboardList,
  diagnostics: Monitor,
  backups: DatabaseBackup,
};
const timestamp = (value: string) =>
  new Date(value).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  });

export function WorkbenchDashboard() {
  const { user } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requested = params.get("work");
  const query = requested ? `?view=${encodeURIComponent(requested)}` : "";
  const data = useData<Workbench>(`dashboard/workbench${query}`, true, 30000);
  if (data.isPending) return <Loading />;
  if (data.error)
    return (
      <>
        <PageHead
          eyebrow="MI ESPACIO DE TRABAJO"
          title="No se pudo abrir esta área."
          description="Una vista no concede permisos adicionales. Puedes volver al inicio autorizado o reintentar la consulta."
        />
        <ErrorBox message={data.error.message} retry={() => data.refetch()} />
        <button
          className="btn secondary"
          onClick={() => setParams({}, { replace: true })}
        >
          Volver a mi inicio
        </button>
      </>
    );
  const work = data.data!;
  const area = areas[work.view] ?? areas.personal;
  const Icon = area.icon;
  const go = (href: string | null) => {
    if (href?.startsWith("/") && !href.startsWith("//")) navigate(href);
  };
  const selectArea = (view: string) => {
    setParams(view === work.defaultView ? {} : { work: view });
  };
  const dateLabel = new Date(work.date + "T12:00:00-06:00").toLocaleDateString(
    "es-MX",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "America/Mexico_City",
    },
  );
  return (
    <div className="workbench" data-workspace={work.view}>
      <PageHead
        eyebrow={`MI TRABAJO · ${dateLabel}`}
        title={area.title}
        description={area.description}
        action={
          <button
            className="btn secondary"
            disabled={data.isFetching}
            onClick={() => void data.refetch()}
          >
            <RefreshCw size={16} className={data.isFetching ? "spin" : ""} />{" "}
            Actualizar
          </button>
        }
      />
      <div className="workbench-toolbar">
        <div className="workbench-context">
          <span className="workbench-area-icon">
            <Icon size={20} />
          </span>
          <div>
            <strong>{area.name}</strong>
            <small>{user.name} · trabajo autorizado</small>
          </div>
        </div>
        <span className="workbench-updated" role="status">
          Actualizado {timestamp(work.asOf)}
          <small>Se actualiza cada 30 segundos</small>
        </span>
      </div>
      {work.availableViews.length > 1 && (
        <nav className="workbench-tabs" aria-label="Áreas de trabajo">
          {work.availableViews.map((view) => {
            const option = areas[view];
            const AreaIcon = option.icon;
            return (
              <button
                key={view}
                className={work.view === view ? "active" : ""}
                aria-current={work.view === view ? "page" : undefined}
                onClick={() => selectArea(view)}
              >
                <AreaIcon size={16} />
                {option.name}
              </button>
            );
          })}
        </nav>
      )}
      {work.alerts.length > 0 && (
        <section
          className="workbench-alerts"
          aria-label="Prioridades de mi área"
        >
          {work.alerts.map((alert) => (
            <div className={`workbench-alert ${alert.tone}`} key={alert.key}>
              <ShieldCheck size={20} />
              <div>
                <strong>{alert.title}</strong>
                <p>{alert.description}</p>
              </div>
              {alert.href && (
                <button className="link" onClick={() => go(alert.href)}>
                  Revisar <ArrowRight size={16} />
                </button>
              )}
            </div>
          ))}
        </section>
      )}
      <div className="workbench-metrics">
        {work.metrics.map((metric) => (
          <button
            className="card workbench-metric"
            key={metric.key}
            onClick={() => go(metric.href)}
            disabled={!metric.href}
          >
            <div>
              <span>{metric.label}</span>
              <ArrowRight size={16} />
            </div>
            <strong>
              {metric.format === "money"
                ? money(metric.value)
                : new Intl.NumberFormat("es-MX", {
                    maximumFractionDigits: metric.format === "decimal" ? 1 : 0,
                  }).format(metric.value)}
            </strong>
            <small>{metric.detail}</small>
          </button>
        ))}
      </div>
      {work.view === "overview" && (
        <section aria-labelledby="workbench-areas-title">
          <div className="workbench-section-heading">
            <div>
              <h2 id="workbench-areas-title">
                El siguiente paso, en su lugar.
              </h2>
              <p>
                Entra al área correspondiente para revisar pendientes y actuar.
              </p>
            </div>
          </div>
          <div className="workbench-areas">
            {work.availableViews
              .filter((view) => view !== "overview")
              .map((view) => {
                const option = areas[view];
                const AreaIcon = option.icon;
                return (
                  <button
                    className="card workbench-area-card"
                    key={view}
                    onClick={() => selectArea(view)}
                  >
                    <span className="workbench-area-icon">
                      <AreaIcon size={23} />
                    </span>
                    <h3>{option.name}</h3>
                    <p>{option.description}</p>
                    <span className="link">
                      Entrar al área <ArrowRight size={16} />
                    </span>
                  </button>
                );
              })}
          </div>
        </section>
      )}
      {work.panels.length > 0 && (
        <div className="workbench-grid">
          {work.panels.map((panel) => {
            const PanelIcon = panelIcons[panel.key] ?? ClipboardList;
            return (
              <section
                className="card workbench-panel"
                key={panel.key}
                aria-labelledby={`panel-${panel.key}`}
              >
                <div className="workbench-panel-heading">
                  <span className="workbench-area-icon">
                    <PanelIcon size={19} />
                  </span>
                  <div>
                    <h2 id={`panel-${panel.key}`}>{panel.title}</h2>
                    <p>{panel.description}</p>
                  </div>
                  <span
                    className="workbench-total"
                    aria-label={`${panel.total} registros`}
                  >
                    {panel.total}
                  </span>
                </div>
                {panel.items.length ? (
                  <ul className="workbench-list">
                    {panel.items.map((item) => (
                      <li key={item.key}>
                        <div className="workbench-item-content">
                          <strong>{item.title}</strong>
                          <p>{item.subtitle}</p>
                          <div className="workbench-item-meta">
                            <span className={`workbench-state ${item.tone}`}>
                              {item.state}
                            </span>
                            {item.at && <small>{timestamp(item.at)}</small>}
                            {item.amount !== null && (
                              <strong>{money(item.amount)}</strong>
                            )}
                          </div>
                        </div>
                        {item.href && (
                          <button
                            className="workbench-item-action"
                            onClick={() => go(item.href)}
                            aria-label={`${item.action}: ${item.title}`}
                          >
                            {item.action}
                            <ArrowRight size={15} />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="workbench-empty">
                    <span>
                      <Check size={22} />
                    </span>
                    <p>{panel.emptyMessage}</p>
                    <small>Información del alcance y periodo indicados.</small>
                  </div>
                )}
                {panel.href && (
                  <div className="workbench-panel-footer">
                    <span>
                      {panel.items.length < panel.total
                        ? `Mostrando ${panel.items.length} de ${panel.total}`
                        : `${panel.total} registros`}
                    </span>
                    <button className="link" onClick={() => go(panel.href)}>
                      Ver todos <ArrowRight size={15} />
                    </button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
      <p className="workbench-permission-note">
        <ShieldCheck size={15} /> Las áreas, cifras y acciones se limitan a tus
        permisos. Abrir una vista no amplía tu acceso.
      </p>
    </div>
  );
}
