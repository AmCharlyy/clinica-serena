import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useLocation,
} from "react-router-dom";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CircleHelp,
  CreditCard,
  FileHeart,
  FileText,
  Flower2,
  HeartPulse,
  Home,
  LayoutGrid,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Stethoscope,
  Users,
  Building2,
  ClipboardList,
  DatabaseBackup,
  Monitor,
  LockKeyhole,
  CheckCircle2,
  CircleAlert,
  X,
} from "lucide-react";
import { accessKey, api, ApiError, refreshCsrf, type Session } from "./api";
import { AppContext } from "./state";
import { workspaceFor } from "./workspaces";
import {
  MfaGate,
  RecoveryCodes,
  SecurityAdmin,
  SessionGuard,
} from "./security";
import { AccountDialog, PasswordForm } from "./account";
import {
  ExperienceProvider,
  NotificationsBell,
  ProfileMenu,
  SoundToggle,
  type AccountSection,
} from "./experience";
import { playFeedback, type FeedbackTone } from "./feedback";
import { WorkbenchDashboard } from "./pages/WorkbenchDashboard";
import {
  CompanyEmployees,
  CompanyPayments,
  CompanyProfile,
  PatientProfile,
  PortalDashboard,
  PublicCatalog,
} from "./pages/PortalPages";
import { ErrorBox, Loading, PasswordInput } from "./components";
import {
  CatalogPage,
  RolesPage,
  DocumentsPage,
  SettingsPage,
  NotificationsPage,
  AuditPage,
  InvoicesPage,
  SystemPage,
  BackupsPage,
} from "./pages/AdminPages";
import {
  Dashboard,
  AppointmentsPage,
  RecordsPage,
  ReportsPage,
} from "./pages/ClinicalPages";
const navigation = [
  {
    section: "MI CLÍNICA",
    items: [
      { key: "dashboard", label: "Inicio", icon: Home },
      {
        key: "reception",
        label: "Recepción",
        icon: ClipboardList,
        permission: "appointments.write",
        internal: true,
      },
      {
        key: "agenda",
        label: "Agenda",
        icon: CalendarDays,
        permission: "appointments.read",
      },
      {
        key: "appointments",
        label: "Citas",
        icon: CalendarDays,
        permission: "appointments.read",
      },
      {
        key: "patients",
        label: "Pacientes",
        icon: Users,
        permission: "patients.read",
      },
      {
        key: "staff",
        label: "Equipo médico",
        icon: Stethoscope,
        permission: "staff.read",
      },
      {
        key: "facilities",
        label: "Espacios",
        icon: LayoutGrid,
        permission: "infrastructure.read",
      },
    ],
  },
  {
    section: "ATENCIÓN",
    items: [
      {
        key: "records",
        label: "Expedientes clínicos",
        icon: FileHeart,
        permission: "records.read",
      },
      {
        key: "documents",
        label: "Documentos",
        icon: FileText,
        permission: "documents.read",
      },
    ],
  },
  {
    section: "ADMINISTRACIÓN",
    items: [
      {
        key: "services",
        label: "Servicios",
        icon: HeartPulse,
        permission: "services.read",
      },
      {
        key: "payments",
        label: "Pagos",
        icon: CreditCard,
        permission: "payments.read",
      },
      {
        key: "invoices",
        label: "Comprobantes",
        icon: FileText,
        permission: "payments.read",
      },
      {
        key: "companies",
        label: "Empresas",
        icon: Building2,
        permission: "companies.read",
      },
      {
        key: "reports",
        label: "Reportes",
        icon: Activity,
        permission: "reports.read",
      },
    ],
  },
  {
    section: "CONTROL",
    items: [
      {
        key: "security",
        label: "Seguridad y sesiones",
        icon: LockKeyhole,
        permission: "users.read",
      },
      {
        key: "users",
        label: "Usuarios",
        icon: Users,
        permission: "users.read",
      },
      {
        key: "roles",
        label: "Roles y permisos",
        icon: ShieldCheck,
        permission: "roles.read",
      },
      {
        key: "audit",
        label: "Auditoría",
        icon: ClipboardList,
        permission: "audit.read",
      },
      {
        key: "settings",
        label: "Configuración",
        icon: Settings,
        permission: "settings.read",
      },
      {
        key: "backups",
        label: "Respaldos",
        icon: DatabaseBackup,
        permission: "backups.read",
      },
      {
        key: "system",
        label: "Estado del sistema",
        icon: Monitor,
        permission: "system.read",
      },
    ],
  },
];
const patientNavigation = [
  {
    section: "MI SALUD",
    items: [
      { key: "dashboard", label: "Mi inicio", icon: Home },
      {
        key: "appointments",
        label: "Mis citas",
        icon: CalendarDays,
        permission: "appointments.read",
      },
      {
        key: "documents",
        label: "Mis documentos",
        icon: FileText,
        permission: "documents.read",
      },
      {
        key: "profile",
        label: "Mi perfil",
        icon: Users,
        permission: "patients.read",
      },
    ],
  },
  {
    section: "ATENCIÓN",
    items: [
      {
        key: "services",
        label: "Servicios y especialistas",
        icon: HeartPulse,
        permission: "catalog.read",
      },
    ],
  },
];
const companyNavigation = [
  {
    section: "MI CONVENIO",
    items: [
      { key: "dashboard", label: "Resumen del convenio", icon: Home },
      {
        key: "employees",
        label: "Empleados asociados",
        icon: Users,
        permission: "patients.read",
      },
      {
        key: "appointments",
        label: "Citas cubiertas",
        icon: CalendarDays,
        permission: "appointments.read",
      },
      {
        key: "payments",
        label: "Consumos del convenio",
        icon: CreditCard,
        permission: "payments.read",
      },
      {
        key: "invoices",
        label: "Comprobantes",
        icon: FileText,
        permission: "payments.read",
      },
      {
        key: "documents",
        label: "Documentos del convenio",
        icon: FileText,
        permission: "documents.read",
      },
      {
        key: "companies",
        label: "Mi convenio",
        icon: Building2,
        permission: "companies.read",
      },
      {
        key: "reports",
        label: "Reportes del convenio",
        icon: Activity,
        permission: "reports.read",
      },
    ],
  },
];
const doctorNavigation = [
  {
    section: "MI ATENCIÓN",
    items: [
      { key: "dashboard", label: "Mi jornada", icon: Home },
      {
        key: "agenda",
        label: "Mi agenda",
        icon: CalendarDays,
        permission: "appointments.read",
      },
      {
        key: "appointments",
        label: "Mis citas",
        icon: CalendarDays,
        permission: "appointments.read",
      },
      {
        key: "patients",
        label: "Mis pacientes",
        icon: Users,
        permission: "patients.read",
      },
      {
        key: "records",
        label: "Expedientes autorizados",
        icon: FileHeart,
        permission: "records.read",
      },
      {
        key: "documents",
        label: "Documentos de atención",
        icon: FileText,
        permission: "documents.read",
      },
      {
        key: "services",
        label: "Servicios disponibles",
        icon: HeartPulse,
        permission: "catalog.read",
      },
    ],
  },
];
export function App() {
  const client = useQueryClient(),
    navigate = useNavigate();
  const location = useLocation();
  const [toast, setToast] = useState<{
      id: number;
      message: string;
      tone: FeedbackTone;
    }>(),
    [mobile, setMobile] = useState(false),
    [profile, setProfile] = useState<AccountSection | null>(null),
    [global, setGlobal] = useState("");
  const [logoutBusy, setLogoutBusy] = useState(false),
    [loginNotice, setLoginNotice] = useState("");
  const noticeId = useRef(0),
    sidebarRef = useRef<HTMLElement>(null),
    mobileTrigger = useRef<HTMLButtonElement>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>();
  const me = useQuery<Session | null>({
    queryKey: ["auth/me"],
    queryFn: async () => {
      try {
        return await api<Session>("auth/me");
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
    refetchInterval: 60000,
  });
  const health = useQuery<{ status: string }>({
    queryKey: ["health"],
    queryFn: () => api("health"),
    enabled: me.data?.authStage === "full",
    refetchInterval: 30000,
    retry: false,
  });
  const notify = (message: string, tone: FeedbackTone = "success") => {
    setToast({ id: ++noticeId.current, message, tone });
    playFeedback(tone);
  };
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(
      () => setToast(undefined),
      toast.tone === "error" ? 9000 : 5000,
    );
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const expired = () => {
      setRecoveryCodes(undefined);
      setProfile(null);
      setMobile(false);
      setGlobal("");
      setToast(undefined);
      setLoginNotice(
        "Tu sesión terminó. Inicia sesión de nuevo para continuar.",
      );
      client.clear();
      client.setQueryData(["auth/me"], null);
    };
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, [client]);
  useEffect(() => {
    if (me.data && !me.data.audience)
      void client.invalidateQueries({ queryKey: ["auth/me"] });
  }, [client, me.data]);
  useEffect(() => {
    if (!me.data) setRecoveryCodes(undefined);
  }, [me.data]);
  useEffect(() => {
    setMobile(false);
    setGlobal("");
  }, [location.pathname]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 800px)");
    const resize = () => {
      if (!media.matches) setMobile(false);
    };
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);
  useEffect(() => {
    if (!mobile) return;
    // Defer until the browser has applied the visible state. Timers also work
    // in background or automated tabs where animation frames may be throttled.
    const focusTimer = window.setTimeout(
      () =>
        sidebarRef.current
          ?.querySelector<HTMLElement>("a")
          ?.focus({ preventScroll: true }),
      30,
    );
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobile(false);
        mobileTrigger.current?.focus();
      }
      if (event.key === "Tab") {
        const items = [
          ...(sidebarRef.current?.querySelectorAll<HTMLElement>(
            "a, button:not(:disabled)",
          ) ?? []),
        ];
        if (
          !sidebarRef.current?.contains(document.activeElement) &&
          !document.querySelector(".serena-popover")
        ) {
          event.preventDefault();
          items[0]?.focus();
        } else if (event.shiftKey && document.activeElement === items[0]) {
          event.preventDefault();
          items.at(-1)?.focus();
        } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
          event.preventDefault();
          items[0]?.focus();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", key);
      requestAnimationFrame(() => {
        if (!document.querySelector("dialog[open]"))
          mobileTrigger.current?.focus();
      });
    };
  }, [mobile]);
  if (me.isPending) return <Loading />;
  if (me.isError && !me.data)
    return (
      <div className="security-screen">
        <section className="security-card">
          <CircleAlert size={30} />
          <h1>No pudimos conectar</h1>
          <p>Comprueba tu conexión con la clínica e inténtalo de nuevo.</p>
          <ErrorBox
            message="El servidor no respondió. No se pudo comprobar tu sesión."
            retry={() => void me.refetch()}
          />
        </section>
      </div>
    );
  if (me.data && !me.data.audience) return <Loading />;
  if (!me.data)
    return (
      <Login
        notice={loginNotice}
        onLogin={async (user) => {
          setRecoveryCodes(undefined);
          setProfile(null);
          setToast(undefined);
          setLoginNotice("");
          setMobile(false);
          setGlobal("");
          client.clear();
          client.setQueryData(["auth/me"], user);
          await refreshCsrf();
          navigate("/dashboard");
        }}
      />
    );
  const user = me.data;
  const securityCompleted = (session: Session, codes?: string[]) => {
    setProfile(null);
    setRecoveryCodes(codes);
    client.clear();
    client.setQueryData(["auth/me"], session);
    void refreshCsrf();
  };
  if (recoveryCodes)
    return (
      <div className="security-screen">
        <RecoveryCodes
          codes={recoveryCodes}
          onDone={() => setRecoveryCodes(undefined)}
        />
      </div>
    );
  if (user.authStage === "mfa" || user.authStage === "enrollment")
    return (
      <MfaGate
        user={user}
        onComplete={securityCompleted}
        onLogout={async () => {
          await api("auth/logout", "POST");
          client.clear();
          client.setQueryData(["auth/me"], null);
        }}
      />
    );
  const can = (p?: string) => !p || user.permissions.includes(p);
  const patient = user.audience === "patient",
    company = user.audience === "company",
    doctor = user.audience === "doctor";
  const portal = patient || company;
  const workspace = workspaceFor(user);
  const workspaceNavigation = patient
    ? patientNavigation
    : company
      ? companyNavigation
      : doctor
        ? doctorNavigation
        : navigation;
  const visibleNavigation = workspaceNavigation.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        can("permission" in item ? item.permission : undefined) &&
        !(item.key === "reception" && !can("appointments.checkin")),
    ),
  }));
  const visibleKeys = new Set(
    visibleNavigation.flatMap((group) => group.items.map((item) => item.key)),
  );
  const logout = async () => {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      await api("auth/logout", "POST");
      setProfile(null);
      setToast(undefined);
      setLoginNotice("Cerraste tu sesión correctamente.");
      setMobile(false);
      setGlobal("");
      client.clear();
      client.setQueryData(["auth/me"], null);
      navigate("/");
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setLogoutBusy(false);
    }
  };
  const passwordChanged = () => {
    setProfile(null);
    setToast(undefined);
    setLoginNotice(
      "Tu contraseña se actualizó. Inicia sesión con la nueva contraseña.",
    );
    client.clear();
    client.setQueryData(["auth/me"], null);
    navigate("/");
  };
  return (
    <AppContext.Provider key={accessKey(user)} value={{ user, notify }}>
      <ExperienceProvider key={user.id} userId={user.id}>
        {user.authStage === "full" && <SessionGuard user={user} />}
        {user.mustChangePassword ? (
          <div className="password-screen">
            <PasswordForm required onDone={passwordChanged} />
          </div>
        ) : (
          <div className="app-shell">
            <a className="skip-link" href="#main-content">
              Saltar al contenido
            </a>
            {mobile && (
              <button
                className="sidebar-scrim"
                aria-label="Cerrar navegación"
                onClick={() => {
                  setMobile(false);
                  mobileTrigger.current?.focus();
                }}
              />
            )}
            <aside
              ref={sidebarRef}
              id="main-navigation"
              aria-label="Navegación principal"
              role={mobile ? "dialog" : undefined}
              aria-modal={mobile || undefined}
              className={mobile ? "sidebar open" : "sidebar"}
            >
              <NavLink to="/dashboard" className="brand">
                <Flower2 size={30} />
                <span>
                  clínica<span className="brand-dot">.</span>
                  <small>SERENA</small>
                </span>
              </NavLink>
              {mobile && (
                <button
                  className="icon-button mobile-nav-close"
                  aria-label="Cerrar menú de navegación"
                  onClick={() => setMobile(false)}
                >
                  <X size={20} />
                </button>
              )}
              <div className="workspace">
                <span className="workspace-icon">
                  <Building2 size={17} />
                </span>
                <div>
                  Clínica Serena<small>{workspace.name}</small>
                </div>
              </div>
              <nav>
                {visibleNavigation.map((group) => {
                  const items = group.items;
                  return items.length ? (
                    <div className="nav-group" key={group.section}>
                      <span className="nav-label">{group.section}</span>
                      {items.map((item) => (
                        <NavLink
                          key={item.key}
                          to={"/" + item.key}
                          onClick={() => setMobile(false)}
                        >
                          <item.icon size={18} />
                          <span>{item.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  ) : null;
                })}
              </nav>
              <div className="sidebar-bottom">
                <ProfileMenu
                  user={user}
                  sidebar
                  onAccount={(section) => {
                    setMobile(false);
                    setProfile(section);
                  }}
                  onLogout={() => void logout()}
                  busy={logoutBusy}
                />
              </div>
            </aside>
            <div className="main-shell" inert={mobile}>
              <header className="topbar">
                <button
                  ref={mobileTrigger}
                  className="icon-button mobile-menu"
                  aria-label={mobile ? "Cerrar navegación" : "Abrir navegación"}
                  aria-controls="main-navigation"
                  aria-expanded={mobile}
                  onClick={() => setMobile(!mobile)}
                >
                  <Menu />
                </button>
                {!portal && can("patients.read") ? (
                  <form
                    className="global-search"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (can("patients.read"))
                        navigate("/patients?q=" + encodeURIComponent(global));
                    }}
                  >
                    <Search size={18} />
                    <input
                      aria-label="Buscar pacientes"
                      placeholder={
                        can("patients.read")
                          ? "Buscar un paciente…"
                          : "Espacio de trabajo"
                      }
                      value={global}
                      onChange={(e) => setGlobal(e.target.value)}
                      disabled={!can("patients.read")}
                    />
                    <kbd>↵</kbd>
                  </form>
                ) : (
                  <div className="workspace-heading">
                    <ShieldCheck size={18} />
                    <span>{workspace.name}</span>
                    <small>Acceso privado</small>
                  </div>
                )}
                <div className="top-right">
                  <span
                    className={health.isError ? "online offline" : "online"}
                    role="status"
                  >
                    <i />{" "}
                    {health.isError
                      ? "Sin conexión con el servidor"
                      : health.data
                        ? "Sistema conectado"
                        : "Comprobando conexión…"}
                  </span>
                  <SoundToggle />
                  <NotificationsBell />
                  <ProfileMenu
                    user={user}
                    onAccount={setProfile}
                    onLogout={() => void logout()}
                    busy={logoutBusy}
                  />
                </div>
              </header>
              <main className="main-content" id="main-content" tabIndex={-1}>
                <Routes>
                  {can("users.read") && user.audience === "internal" && (
                    <Route path="/security" element={<SecurityAdmin />} />
                  )}
                  <Route
                    path="/"
                    element={<Navigate to="/dashboard" replace />}
                  />
                  <Route
                    path="/dashboard"
                    element={
                      portal ? (
                        <PortalDashboard />
                      ) : user.audience === "internal" ? (
                        <WorkbenchDashboard />
                      ) : (
                        <Dashboard />
                      )
                    }
                  />
                  <Route
                    path="/notifications"
                    element={<NotificationsPage />}
                  />
                  {visibleKeys.has("appointments") && (
                    <>
                      {visibleKeys.has("agenda") && (
                        <Route
                          path="/agenda"
                          element={<AppointmentsPage calendar />}
                        />
                      )}
                      <Route
                        path="/appointments"
                        element={<AppointmentsPage />}
                      />
                      {visibleKeys.has("reception") && !portal && !doctor && (
                        <Route
                          path="/reception"
                          element={<AppointmentsPage reception />}
                        />
                      )}
                    </>
                  )}
                  {patient && can("patients.read") && (
                    <>
                      <Route path="/profile" element={<PatientProfile />} />
                      <Route
                        path="/patients"
                        element={<Navigate to="/profile" replace />}
                      />
                    </>
                  )}
                  {company && can("patients.read") && (
                    <>
                      <Route path="/employees" element={<CompanyEmployees />} />
                      <Route
                        path="/patients"
                        element={<Navigate to="/employees" replace />}
                      />
                    </>
                  )}
                  {(patient || doctor) && can("catalog.read") && (
                    <Route path="/services" element={<PublicCatalog />} />
                  )}
                  {company && can("companies.read") && (
                    <Route path="/companies" element={<CompanyProfile />} />
                  )}
                  {company && can("payments.read") && (
                    <Route path="/payments" element={<CompanyPayments />} />
                  )}
                  {[
                    "patients",
                    "staff",
                    "facilities",
                    "services",
                    "payments",
                    "companies",
                    "users",
                  ].map((key) => {
                    const permission =
                      key === "facilities" ? "infrastructure" : key;
                    return visibleKeys.has(key) &&
                      can(permission + ".read") &&
                      !portal &&
                      !(doctor && key === "services") ? (
                      <Route
                        key={key}
                        path={"/" + key}
                        element={<CatalogPage key={key} moduleKey={key} />}
                      />
                    ) : null;
                  })}
                  {visibleKeys.has("records") && (
                    <Route path="/records" element={<RecordsPage />} />
                  )}{" "}
                  {visibleKeys.has("documents") && (
                    <Route path="/documents" element={<DocumentsPage />} />
                  )}{" "}
                  {visibleKeys.has("roles") && (
                    <Route path="/roles" element={<RolesPage />} />
                  )}{" "}
                  {visibleKeys.has("settings") && (
                    <Route path="/settings" element={<SettingsPage />} />
                  )}{" "}
                  {visibleKeys.has("audit") && (
                    <Route path="/audit" element={<AuditPage />} />
                  )}{" "}
                  {visibleKeys.has("invoices") && (
                    <Route path="/invoices" element={<InvoicesPage />} />
                  )}{" "}
                  {visibleKeys.has("reports") && (
                    <Route path="/reports" element={<ReportsPage />} />
                  )}{" "}
                  {visibleKeys.has("system") && (
                    <Route path="/system" element={<SystemPage />} />
                  )}{" "}
                  {visibleKeys.has("backups") && (
                    <Route path="/backups" element={<BackupsPage />} />
                  )}
                  <Route
                    path="*"
                    element={
                      <div className="card">
                        <ShieldCheck size={28} />
                        <h2>Esta sección no pertenece a tu espacio</h2>
                        <p className="muted">
                          Tu cuenta tiene acceso únicamente a las herramientas y
                          datos autorizados para tu función.
                        </p>
                        <NavLink className="btn secondary" to="/dashboard">
                          Volver a mi inicio
                        </NavLink>
                      </div>
                    }
                  />
                </Routes>
                <footer className="app-footer">
                  <span>
                    <Flower2 size={13} /> Clínica Serena · Salud serena
                  </span>
                  <span>
                    {import.meta.env.DEV
                      ? "Desarrollo · Datos ficticios"
                      : "Sistema clínico"}{" "}
                    · {user.roles[0]}
                  </span>
                </footer>
              </main>
            </div>
          </div>
        )}
        {profile && (
          <AccountDialog
            user={user}
            initialSection={profile}
            onClose={() => setProfile(null)}
            onPasswordChanged={passwordChanged}
            onSession={securityCompleted}
            onLogout={() => void logout()}
            logoutBusy={logoutBusy}
          />
        )}
        {toast && (
          <div
            className={`toast toast-${toast.tone}`}
            role={toast.tone === "error" ? "alert" : "status"}
            key={toast.id}
          >
            {toast.tone === "error" ? (
              <CircleAlert size={19} />
            ) : (
              <CheckCircle2 size={19} />
            )}
            <span>{toast.message}</span>
            <button
              className="icon-button"
              aria-label="Cerrar aviso"
              onClick={() => setToast(undefined)}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </ExperienceProvider>
    </AppContext.Provider>
  );
}
function Login({
  onLogin,
  notice,
}: {
  onLogin: (user: Session) => Promise<void>;
  notice: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await refreshCsrf();
      const user = await api<Session>("auth/login", "POST", {
        username,
        password,
      });
      await onLogin(user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login-screen">
      <section className="login-art">
        <div className="brand">
          <Flower2 size={34} />
          <span>
            clínica<span className="brand-dot">.</span>
            <small>SERENA</small>
          </span>
        </div>
        <div className="art-orbits">
          <span />
          <span />
          <span />
          <Flower2 />
        </div>
        <div className="login-copy">
          <span className="eyebrow">UN ESPACIO PARA CUIDAR</span>
          <h1>
            La salud empieza
            <br />
            con una buena
            <br />
            <em>conexión.</em>
          </h1>
          <p>
            Personas, atención y administración.
            <br />
            Todo en un mismo lugar, con tranquilidad.
          </p>
          <div className="login-trust">
            <ShieldCheck size={18} /> Acceso privado · Información protegida
          </div>
        </div>
        <span className="art-caption">Diseñado alrededor de las personas.</span>
      </section>
      <section className="login-form-area">
        <div className="login-form">
          <div className="login-mark">
            <Flower2 size={28} />
          </div>
          <div className="eyebrow">BIENVENIDO DE NUEVO</div>
          <h2>Tu clínica, más cerca.</h2>
          <p className="muted">
            Inicia sesión para entrar a tu espacio de trabajo.
          </p>
          <form onSubmit={submit}>
            {notice && (
              <div className="login-notice" role="status">
                <ShieldCheck size={17} />
                <span>{notice}</span>
              </div>
            )}
            <label>
              Usuario
              <input
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Tu nombre de usuario"
                required
                disabled={busy}
              />
            </label>
            <label>
              Contraseña
              <PasswordInput
                label="Contraseña"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tu contraseña"
                required
                disabled={busy}
              />
            </label>
            {error && <ErrorBox message={error} />}
            <button className="btn login-submit" disabled={busy}>
              {busy ? "Iniciando sesión…" : "Entrar a mi espacio"}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="help-line">
            <CircleHelp size={15} /> Si necesitas acceso, contacta al
            administrador.
          </p>
          {import.meta.env.DEV && (
            <details className="demo-access">
              <summary>Explorar con una cuenta de demostración</summary>
              <p>
                Contraseña: <code>SerenaDemo!2026</code>
              </p>
              <div>
                {[
                  "admin",
                  "general",
                  "accesos",
                  "coordinacion",
                  "recepcion",
                  "medico",
                  "paciente",
                  "empresa",
                  "finanzas",
                  "auditor",
                  "soporte",
                ].map((u) => (
                  <button
                    key={u}
                    type="button"
                    className="chip"
                    onClick={() => {
                      setUsername(u);
                      setPassword("SerenaDemo!2026");
                    }}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>
        <div className="login-footer">
          Clínica Serena · Acceso por roles y permisos
        </div>
      </section>
    </div>
  );
}
