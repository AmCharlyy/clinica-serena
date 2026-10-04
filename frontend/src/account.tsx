import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  Clock3,
  LockKeyhole,
  LogOut,
  Play,
  Settings2,
  ShieldCheck,
  UserRound,
  Volume2,
} from "lucide-react";
import { api, dateTime, type Session } from "./api";
import { Avatar, ErrorBox, Modal, PasswordInput } from "./components";
import { useExperience, type AccountSection } from "./experience";
import { playFeedback, unlockFeedback } from "./feedback";
import { OwnSecurity } from "./security";
import { workspaceFor } from "./workspaces";

export function PasswordForm({
  onDone,
  required = false,
}: {
  onDone: () => void;
  required?: boolean;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="password-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const data = new FormData(event.currentTarget);
        setError("");
        if (data.get("new") !== data.get("confirm")) {
          setError("Las contraseñas nuevas no coinciden.");
          return;
        }
        setBusy(true);
        try {
          await api("auth/password", "POST", {
            currentPassword: data.get("current"),
            newPassword: data.get("new"),
          });
          onDone();
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {required && (
        <>
          <LockKeyhole size={30} />
          <h2>Configura tu contraseña</h2>
          <p className="muted">Crea una contraseña propia para continuar.</p>
        </>
      )}
      <label>
        Contraseña actual
        <PasswordInput
          label="Contraseña actual"
          name="current"
          autoComplete="current-password"
          required
          maxLength={128}
          disabled={busy}
        />
      </label>
      <label>
        Nueva contraseña
        <PasswordInput
          label="Nueva contraseña"
          name="new"
          autoComplete="new-password"
          required
          minLength={15}
          maxLength={128}
          disabled={busy}
        />
        <small>
          De 15 a 128 caracteres, con mayúscula, minúscula y número. Puedes usar
          una frase larga.
        </small>
      </label>
      <label>
        Confirmar nueva contraseña
        <PasswordInput
          label="Confirmar nueva contraseña"
          name="confirm"
          autoComplete="new-password"
          required
          minLength={15}
          maxLength={128}
          disabled={busy}
        />
      </label>
      {error && <ErrorBox message={error} />}
      <p className="muted">
        Después del cambio volverás a iniciar sesión en tus dispositivos.
      </p>
      <button className="btn" disabled={busy}>
        {busy ? "Actualizando contraseña…" : "Actualizar contraseña"}
      </button>
    </form>
  );
}

export function AccountDialog({
  user,
  initialSection,
  onClose,
  onPasswordChanged,
  onSession,
  onLogout,
  logoutBusy,
}: {
  user: Session;
  initialSection: AccountSection;
  onClose: () => void;
  onPasswordChanged: () => void;
  onSession: (user: Session, codes?: string[]) => void;
  onLogout: () => void;
  logoutBusy: boolean;
}) {
  const [section, setSection] = useState(initialSection),
    [preview, setPreview] = useState("");
  const { preferences, update, persisted } = useExperience(),
    navigate = useNavigate(),
    tabs = useRef<HTMLDivElement>(null);
  const sections = [
    { id: "general", label: "Mi perfil", icon: UserRound },
    { id: "security", label: "Seguridad", icon: ShieldCheck },
    { id: "preferences", label: "Preferencias", icon: Settings2 },
  ] as const;
  const workspace = workspaceFor(user);
  return (
    <Modal title="Mi cuenta" onClose={onClose} wide>
      <div className="account-identity">
        <Avatar name={user.name} />
        <div>
          <h2>{user.name}</h2>
          <p>
            @{user.username} <span>· {workspace.name}</span>
          </p>
        </div>
        <span
          className={`account-status ${user.mfaEnabled ? "protected" : ""}`}
        >
          <ShieldCheck size={14} />
          {user.mfaEnabled ? "Doble factor activo" : "Cuenta personal"}
        </span>
      </div>
      <div
        ref={tabs}
        className="account-tabs"
        role="tablist"
        aria-label="Secciones de mi cuenta"
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const current = sections.findIndex((item) => item.id === section);
          const index =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? 2
                : (current + (event.key === "ArrowLeft" ? -1 : 1) + 3) % 3;
          setSection(sections[index].id);
          tabs.current
            ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
            [index]?.focus();
        }}
      >
        {sections.map((item) => (
          <button
            key={item.id}
            id={`account-tab-${item.id}`}
            role="tab"
            aria-selected={section === item.id}
            aria-controls={`account-panel-${item.id}`}
            tabIndex={section === item.id ? 0 : -1}
            onClick={() => setSection(item.id)}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        ))}
      </div>
      <section
        className="account-panel"
        id={`account-panel-${section}`}
        role="tabpanel"
        aria-labelledby={`account-tab-${section}`}
        tabIndex={0}
      >
        {section === "general" && (
          <>
            <div className="account-section-heading">
              <h3>Tu espacio, a tu medida</h3>
              <p>Estos son los datos de tu cuenta en Clínica Serena.</p>
            </div>
            <dl className="account-details">
              <div>
                <dt>Nombre</dt>
                <dd>{user.name}</dd>
              </div>
              <div>
                <dt>Usuario</dt>
                <dd>{user.username}</dd>
              </div>
              <div className="account-detail-wide">
                <dt>
                  {user.audience === "patient" || user.audience === "company"
                    ? "Tipo de cuenta"
                    : "Funciones asignadas"}
                </dt>
                <dd className="account-role-list">
                  {user.roles.map((role) => (
                    <span className="chip" key={role}>
                      {role}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
            <div className="account-session-card">
              <Clock3 size={20} />
              <div>
                <strong>Sesión actual</strong>
                <p>Se cierra automáticamente tras un periodo sin actividad.</p>
                {user.absoluteExpiresAt && (
                  <small>
                    Límite de esta sesión: {dateTime(user.absoluteExpiresAt)} ·
                    Ciudad de México
                  </small>
                )}
              </div>
            </div>
            {user.audience === "patient" &&
              user.permissions.includes("patients.read") && (
                <button
                  className="btn secondary"
                  onClick={() => {
                    onClose();
                    navigate("/profile");
                  }}
                >
                  Ver mis datos de contacto
                  <ArrowUpRight size={16} />
                </button>
              )}
            {user.audience === "company" &&
              user.permissions.includes("companies.read") && (
                <button
                  className="btn secondary"
                  onClick={() => {
                    onClose();
                    navigate("/companies");
                  }}
                >
                  Consultar mi convenio
                  <ArrowUpRight size={16} />
                </button>
              )}
            <p className="account-help">
              {user.audience === "patient" || user.audience === "company"
                ? "Para corregir tu nombre o usuario, contacta con administración."
                : "Para corregir tu nombre de cuenta o las funciones asignadas, contacta con administración."}
            </p>
          </>
        )}
        {section === "security" && (
          <>
            <div className="account-section-heading">
              <h3>Acceso y protección</h3>
              <p>
                Administra cómo entras a tu cuenta y cómo recuperas el acceso.
              </p>
            </div>
            <OwnSecurity user={user} onSession={onSession} />
            <details className="password-disclosure">
              <summary>
                <LockKeyhole size={18} />
                <span>
                  Cambiar contraseña
                  <small>Actualiza la contraseña de tu cuenta</small>
                </span>
              </summary>
              <PasswordForm onDone={onPasswordChanged} />
            </details>
          </>
        )}
        {section === "preferences" && (
          <>
            <div className="account-section-heading">
              <h3>Una experiencia más tranquila</h3>
              <p>
                Preferencias personales para este navegador. Se guardan al
                cambiarlas.
              </p>
            </div>
            <label className="preference-row">
              <span>
                <strong>Sonidos de la aplicación</strong>
                <small>Confirmaciones suaves y avisos breves.</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={preferences.sound}
                onChange={(event) => {
                  update({ sound: event.target.checked });
                  if (event.target.checked) unlockFeedback();
                }}
              />
            </label>
            <div
              className={`sound-settings ${preferences.sound ? "" : "muted-settings"}`}
            >
              <label className="volume-label" htmlFor="feedback-volume">
                <Volume2 size={17} /> Volumen<span>{preferences.volume}%</span>
              </label>
              <input
                id="feedback-volume"
                type="range"
                min={0}
                max={100}
                step={5}
                value={preferences.volume}
                disabled={!preferences.sound}
                onChange={(event) =>
                  update({ volume: Number(event.target.value) })
                }
              />
              <div className="sound-preview-actions">
                {(["success", "notification", "warning"] as const).map(
                  (tone, i) => (
                    <button
                      key={tone}
                      className="btn secondary"
                      disabled={
                        !preferences.sound ||
                        preferences.volume === 0 ||
                        (tone === "notification" && !preferences.notifications)
                      }
                      onClick={() => {
                        unlockFeedback();
                        const played = playFeedback(tone, true);
                        setPreview(
                          played
                            ? `Reproduciendo: ${["confirmación", "nuevo aviso", "aviso de sesión"][i]}.`
                            : "Pulsa otra vez para escuchar la muestra.",
                        );
                      }}
                    >
                      <Play size={13} />
                      {["Confirmación", "Notificación", "Sesión"][i]}
                    </button>
                  ),
                )}
              </div>
              <span className="preference-status" role="status">
                {preview}
              </span>
            </div>
            <label className="preference-row">
              <span>
                <strong>Sonido de nuevas notificaciones</strong>
                <small>
                  Solo cuando llega un aviso nuevo mientras usas el sistema.
                </small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={preferences.notifications}
                disabled={!preferences.sound}
                onChange={(event) =>
                  update({ notifications: event.target.checked })
                }
              />
            </label>
            <label className="preference-row">
              <span>
                <strong>Reducir movimiento</strong>
                <small>
                  Transiciones más sencillas para trabajar con comodidad.
                </small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={preferences.reducedMotion}
                onChange={(event) =>
                  update({ reducedMotion: event.target.checked })
                }
              />
            </label>
            <p className="account-help">
              Los avisos siempre se muestran en pantalla, también con el sonido
              desactivado. Se respeta la preferencia de movimiento reducido de
              tu equipo.
            </p>
            {!persisted && (
              <ErrorBox message="El navegador no permite guardar preferencias. Se aplicarán durante esta sesión." />
            )}
          </>
        )}
      </section>
      <div className="account-footer">
        <span>
          <ShieldCheck size={14} /> Acceso personal y protegido
        </span>
        <button
          className="link account-signout"
          disabled={logoutBusy}
          onClick={onLogout}
        >
          <LogOut size={15} />
          {logoutBusy ? "Cerrando sesión…" : "Cerrar sesión"}
        </button>
      </div>
    </Modal>
  );
}
