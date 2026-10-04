import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Flower2, ShieldCheck, Clock, LockKeyhole } from "lucide-react";
import {
  api,
  ApiError,
  setReauthentication,
  txt,
  type Row,
  type Session,
} from "./api";
import {
  ErrorBox,
  Loading,
  Modal,
  PageHead,
  PasswordInput,
  Table,
} from "./components";
import { useApp, useData, useWrite } from "./state";
import { playFeedback } from "./feedback";
import "./security.css";

type Enrollment = { manualKey: string; qr: string; expiresAt: string };
type Activation = { session: Session; recoveryCodes: string[] };
type SecurityState = { mfaEnabled: boolean; remainingRecoveryCodes: number };

export function RecoveryCodes({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <section className="security-card">
      <ShieldCheck size={32} />
      <h2>Guarda tus códigos de recuperación</h2>
      <p>
        Se muestran una sola vez. Cada código permite recuperar el acceso y se
        puede usar solo una vez. Guárdalos en un gestor de contraseñas o en un
        lugar físico seguro, separado de tu equipo.
      </p>
      <div className="recovery-grid">
        {codes.map((code) => (
          <code key={code}>{code}</code>
        ))}
      </div>
      <label className="security-check">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
        />{" "}
        Ya guardé mis códigos en un lugar seguro.
      </label>
      <button className="btn" disabled={!acknowledged} onClick={onDone}>
        Continuar
      </button>
    </section>
  );
}
function FactorForm({
  submit,
  enrollment,
}: {
  submit: (code: string) => Promise<void>;
  enrollment?: Enrollment;
}) {
  const [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await submit(code.trim());
          setCode("");
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {enrollment && (
        <>
          <p>
            En Google Authenticator, Microsoft Authenticator, 2FAS u otra
            aplicación TOTP, añade una cuenta escaneando este QR. Los códigos
            funcionan sin internet.
          </p>
          <img
            className="totp-qr"
            src={enrollment.qr}
            alt="QR privado para configurar tu autenticador"
          />
          <details>
            <summary>Introducir la clave manualmente</summary>
            <code className="manual-key">{enrollment.manualKey}</code>
          </details>
          <p className="muted">
            No compartas el QR ni esta clave. La configuración caduca en 10
            minutos.
          </p>
        </>
      )}
      <label className="security-field">
        {enrollment
          ? "Código de 6 dígitos"
          : "Código del autenticador o de recuperación"}
        <input
          autoFocus
          autoComplete="one-time-code"
          inputMode={enrollment ? "numeric" : "text"}
          required
          maxLength={80}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </label>
      {!enrollment && (
        <p className="muted">
          Si ya utilizaste el código actual, espera al siguiente. También puedes
          introducir un código de recuperación.
        </p>
      )}
      {error && <ErrorBox message={error} />}
      <button className="btn" disabled={busy}>
        {busy
          ? "Verificando…"
          : enrollment
            ? "Activar autenticador"
            : "Verificar e ingresar"}
      </button>
    </form>
  );
}
export function MfaGate({
  user,
  onComplete,
  onLogout,
}: {
  user: Session;
  onComplete: (user: Session, codes?: string[]) => void;
  onLogout: () => Promise<void>;
}) {
  const [enrollment, setEnrollment] = useState<Enrollment>(),
    [error, setError] = useState(""),
    [logoutError, setLogoutError] = useState(""),
    [logoutBusy, setLogoutBusy] = useState(false);
  const loadEnrollment = () => {
    setError("");
    setEnrollment(undefined);
    return api<Enrollment>("auth/mfa/enroll", "POST")
      .then(setEnrollment)
      .catch((cause) => setError((cause as Error).message));
  };
  useEffect(() => {
    if (user.authStage === "enrollment") void loadEnrollment();
  }, [user.authStage, user.sessionId]);
  return (
    <div className="security-screen">
      <section className="security-card">
        <div className="brand security-brand">
          <Flower2 />
          <span>
            clínica. <small>SERENA</small>
          </span>
        </div>
        <LockKeyhole size={30} />
        <h1>
          {user.authStage === "enrollment"
            ? "Protege tu cuenta"
            : "Confirma que eres tú"}
        </h1>
        <p>
          {user.name} · {user.username}
        </p>
        <p className="muted">
          Tu acceso a los módulos permanece bloqueado hasta completar este paso.
        </p>
        {error ? (
          <ErrorBox
            message={error}
            retry={
              user.authStage === "enrollment"
                ? () => void loadEnrollment()
                : undefined
            }
          />
        ) : user.authStage === "enrollment" && !enrollment ? (
          <Loading />
        ) : (
          <FactorForm
            enrollment={enrollment}
            submit={async (code) => {
              if (enrollment) {
                const result = await api<Activation>(
                  "auth/mfa/confirm",
                  "POST",
                  { code },
                );
                onComplete(result.session, result.recoveryCodes);
              } else
                onComplete(
                  await api<Session>("auth/mfa/verify", "POST", { code }),
                );
            }}
          />
        )}
        {logoutError && <ErrorBox message={logoutError} />}
        <button
          className="link"
          disabled={logoutBusy}
          onClick={async () => {
            if (logoutBusy) return;
            setLogoutBusy(true);
            setLogoutError("");
            try {
              await onLogout();
            } catch (cause) {
              setLogoutError((cause as Error).message);
            } finally {
              setLogoutBusy(false);
            }
          }}
        >
          {logoutBusy
            ? "Cerrando sesión…"
            : "Salir y volver al inicio de sesión"}
        </button>
      </section>
    </div>
  );
}

export function SessionGuard({ user }: { user: Session }) {
  const client = useQueryClient();
  const [now, setNow] = useState(Date.now()),
    [reauth, setReauth] = useState(false),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<{
    promise: Promise<void>;
    resolve: () => void;
    reject: (error: Error) => void;
  } | null>(null);
  const clockOffset = useRef(0);
  const lastActivitySent = useRef(0);
  useEffect(() => {
    if (user.serverNow)
      clockOffset.current = Date.parse(user.serverNow) - Date.now();
  }, [user.serverNow]);
  useEffect(() => {
    setReauthentication(() => {
      if (pending.current) return pending.current.promise;
      let resolve!: () => void, reject!: (error: Error) => void;
      const promise = new Promise<void>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      pending.current = { promise, resolve, reject };
      setError("");
      setReauth(true);
      return promise;
    });
    return () => {
      setReauthentication();
      pending.current?.reject(
        new Error("La sesión cambió. Vuelve a intentarlo."),
      );
      pending.current = null;
    };
  }, [user.sessionId]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const activity = (event: Event) => {
      if (
        !event.isTrusted ||
        Date.now() - lastActivitySent.current < 30000 ||
        document.hidden
      )
        return;
      lastActivitySent.current = Date.now();
      void api<Session>("auth/activity", "POST")
        .then((session) => client.setQueryData(["auth/me"], session))
        .catch(() => {});
    };
    for (const event of ["pointerdown", "keydown", "wheel", "touchstart"])
      window.addEventListener(event, activity, { passive: true });
    return () => {
      clearInterval(timer);
      for (const event of ["pointerdown", "keydown", "wheel", "touchstart"])
        window.removeEventListener(event, activity);
    };
  }, [client, user.sessionId]);
  const clientNow = now + clockOffset.current,
    idleRemaining = Date.parse(user.idleExpiresAt ?? "") - clientNow,
    absoluteRemaining = Date.parse(user.absoluteExpiresAt ?? "") - clientNow,
    remaining = Math.min(idleRemaining, absoluteRemaining),
    reachesAbsoluteLimit = absoluteRemaining <= idleRemaining;
  const warned = useRef(false);
  useEffect(() => {
    if (remaining > 60000) warned.current = false;
    else if (remaining > 0 && !warned.current) {
      warned.current = true;
      playFeedback("warning");
    }
  }, [remaining]);
  useEffect(() => {
    if (remaining <= 0)
      void api<Session>("auth/me")
        .then((session) => client.setQueryData(["auth/me"], session))
        .catch((cause) => {
          // A network interruption must not be presented as a logout. Only the
          // server can confirm that the authenticated session actually ended.
          if (cause instanceof ApiError && cause.status === 401)
            window.dispatchEvent(new Event("session-expired"));
        });
  }, [remaining <= 0]);
  const cancel = () => {
    pending.current?.reject(
      new Error("La acción se canceló: no se confirmó la identidad."),
    );
    pending.current = null;
    setReauth(false);
    setPassword("");
    setCode("");
  };
  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("auth/reauth", "POST", { password, code });
      pending.current?.resolve();
      pending.current = null;
      setReauth(false);
      setPassword("");
      setCode("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {remaining > 0 && remaining <= 60000 && (
        <div className="session-warning" role="alert">
          <Clock size={18} />
          <span>
            {reachesAbsoluteLimit
              ? `Tu sesión alcanzará su límite de seguridad en ${Math.ceil(remaining / 1000)} s. Guarda tu trabajo; después deberás iniciar sesión de nuevo.`
              : `Tu sesión termina por inactividad en ${Math.ceil(remaining / 1000)} s. Los borradores guardados permanecerán protegidos.`}
          </span>
          {!reachesAbsoluteLimit && (
            <button
              className="btn secondary"
              onClick={async () => {
                try {
                  client.setQueryData(
                    ["auth/me"],
                    await api<Session>("auth/activity", "POST"),
                  );
                } catch {}
              }}
            >
              Continuar trabajando
            </button>
          )}
        </div>
      )}
      {reauth && (
        <Modal title="Confirmar acción sensible" onClose={cancel}>
          <p>
            Confirma tu identidad para continuar. Esta autorización dura 3
            minutos.
          </p>
          <form onSubmit={confirm}>
            <label className="security-field">
              Contraseña actual
              <PasswordInput
                label="Contraseña actual"
                autoComplete="current-password"
                required
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
            </label>
            {user.mfaEnabled && (
              <label className="security-field">
                Código del autenticador o de recuperación
                <input
                  autoComplete="one-time-code"
                  required
                  maxLength={80}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={busy}
                />
              </label>
            )}
            {error && <ErrorBox message={error} />}
            <div className="form-actions">
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={cancel}
              >
                Cancelar
              </button>
              <button className="btn" disabled={busy}>
                {busy ? "Verificando…" : "Confirmar identidad"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export function OwnSecurity({
  user,
  onSession,
}: {
  user: Session;
  onSession: (user: Session, codes?: string[]) => void;
}) {
  const [state, setState] = useState<SecurityState>(),
    [error, setError] = useState(""),
    [codes, setCodes] = useState<string[]>(),
    [enrollment, setEnrollment] = useState<Enrollment>(),
    [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<"codes" | "replace">();
  const load = () => {
    setError("");
    return api<SecurityState>("auth/security")
      .then(setState)
      .catch((e) => setError(e.message));
  };
  useEffect(() => {
    void load();
  }, [user.sessionId, user.mfaEnabled]);
  const action = async (name: string) => {
    setBusy(true);
    setError("");
    try {
      if (name === "enable")
        setEnrollment(await api<Enrollment>("auth/mfa/enroll", "POST"));
      if (name === "codes")
        setCodes(
          (
            await api<{ recoveryCodes: string[] }>(
              "auth/mfa/recovery-codes",
              "POST",
            )
          ).recoveryCodes,
        );
      if (name === "replace")
        onSession(await api<Session>("auth/mfa/replace", "POST"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="account-security">
      <h3>
        <ShieldCheck size={18} /> Verificación en dos pasos
      </h3>
      {!state ? (
        error ? (
          <ErrorBox message={error} retry={() => void load()} />
        ) : (
          <Loading />
        )
      ) : (
        <>
          <p>
            {state.mfaEnabled
              ? "Tu autenticador está activado."
              : user.mfaRequired
                ? "Tu cuenta requiere un autenticador."
                : "Añade una capa de protección a tu cuenta con una aplicación de autenticación."}{" "}
            {state.mfaEnabled &&
              `${state.remainingRecoveryCodes} códigos de recuperación disponibles.`}
          </p>
          {state.mfaEnabled && state.remainingRecoveryCodes <= 2 && !codes && (
            <p className="recovery-warning">
              Te quedan pocos códigos de recuperación. Renueva el juego y
              guárdalo en un lugar seguro.
            </p>
          )}
          {enrollment ? (
            <FactorForm
              enrollment={enrollment}
              submit={async (code) => {
                const result = await api<Activation>(
                  "auth/mfa/confirm",
                  "POST",
                  { code },
                );
                onSession(result.session, result.recoveryCodes);
              }}
            />
          ) : codes ? (
            <RecoveryCodes
              codes={codes}
              onDone={() => {
                setCodes(undefined);
                void load();
              }}
            />
          ) : (
            <div className="security-actions">
              {state.mfaEnabled ? (
                <>
                  <button
                    className="btn secondary"
                    disabled={busy}
                    onClick={() => setConfirmation("codes")}
                  >
                    Renovar códigos
                  </button>
                  <button
                    className="btn secondary"
                    disabled={busy}
                    onClick={() => setConfirmation("replace")}
                  >
                    Sustituir autenticador
                  </button>
                </>
              ) : (
                <button
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => void action("enable")}
                >
                  Activar autenticador
                </button>
              )}
            </div>
          )}
          {error && <ErrorBox message={error} />}
          {state.mfaEnabled && (
            <p className="muted">
              Guarda los códigos de recuperación para poder entrar si pierdes el
              teléfono.
            </p>
          )}
        </>
      )}
      {confirmation && (
        <Modal
          title={
            confirmation === "codes"
              ? "Renovar códigos de recuperación"
              : "Sustituir tu autenticador"
          }
          onClose={() => setConfirmation(undefined)}
        >
          <p>
            {confirmation === "codes"
              ? "Los códigos anteriores dejarán de funcionar. Recibirás un nuevo juego que deberás guardar antes de continuar."
              : "Necesitarás configurar de nuevo la aplicación de autenticación. Tu clave anterior y tus códigos dejarán de funcionar, y se cerrarán las demás sesiones."}
          </p>
          <div className="form-actions">
            <button
              className="btn secondary"
              onClick={() => setConfirmation(undefined)}
            >
              Cancelar
            </button>
            <button
              className="btn"
              onClick={() => {
                const choice = confirmation;
                setConfirmation(undefined);
                void action(choice);
              }}
            >
              {confirmation === "codes"
                ? "Renovar códigos"
                : "Continuar con el cambio"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

export function SecurityAdmin() {
  const { user } = useApp(),
    write = useWrite();
  const users = useData("users"),
    sessions = useData(
      "security/sessions",
      user.permissions.includes("sessions.read"),
    );
  const [selected, setSelected] = useState<Row>(),
    [operation, setOperation] = useState(""),
    [reason, setReason] = useState(""),
    [verified, setVerified] = useState(false),
    [expiry, setExpiry] = useState(""),
    [active, setActive] = useState(true),
    [shared, setShared] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const open = (row: Row, name: string) => {
    setSelected(row);
    setOperation(name);
    setReason("");
    setVerified(false);
    setExpiry(txt(row, "accessExpiresAt").slice(0, 10));
    setActive(Boolean(row.active));
    setShared(Boolean(row.sharedWorkstation));
    setError("");
  };
  const run = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const endpoint =
        operation === "session"
          ? `security/sessions/${selected.id}/revoke`
          : `security/users/${selected.id}/${operation}`;
      await write(
        endpoint,
        "POST",
        {
          reason,
          identityVerified: verified,
          ...(operation === "lifecycle"
            ? {
                active,
                sharedWorkstation: shared,
                accessExpiresAt: expiry
                  ? new Date(expiry + "T23:59:59").toISOString()
                  : null,
                version: selected.version,
              }
            : {}),
        },
        "Control de acceso actualizado",
      );
      setSelected(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHead
        eyebrow="ACCESO PROTEGIDO"
        title="Seguridad y sesiones"
        description="Cuentas individuales, vigencia, revisión trimestral y revocación. Solo puedes gestionar permisos que tú también posees."
      />
      <div className="card">
        <h3>Cuentas y revisión de acceso</h3>
        {users.error ? (
          <ErrorBox message={users.error.message} />
        ) : (
          <Table
            rows={users.data ?? []}
            columns={[
              { key: "name", label: "Persona" },
              { key: "roles", label: "Función" },
              {
                key: "mfaEnabled",
                label: "TOTP",
                render: (r) => (r.mfaEnabled ? "Activado" : "Sin configurar"),
              },
              {
                key: "accessExpiresAt",
                label: "Vigencia",
                render: (r) =>
                  r.accessExpiresAt
                    ? new Date(txt(r, "accessExpiresAt")).toLocaleDateString(
                        "es-MX",
                      )
                    : "Sin caducidad",
              },
              {
                key: "reviewDue",
                label: "Revisión",
                render: (r) => (r.reviewDue ? "Pendiente" : "Al día"),
              },
            ]}
            actions={(r) =>
              r.manageable === false ? (
                <span className="muted">
                  Requiere autoridad del superadministrador
                </span>
              ) : (
                <div className="security-actions">
                  {user.permissions.includes("users.write") && (
                    <>
                      <button
                        className="link"
                        onClick={() => open(r, "review")}
                      >
                        Revisar
                      </button>
                      <button
                        className="link"
                        onClick={() => open(r, "lifecycle")}
                      >
                        Vigencia / baja
                      </button>
                    </>
                  )}
                  {user.permissions.includes("sessions.revoke") && (
                    <button
                      className="link"
                      onClick={() => open(r, "revoke-all")}
                    >
                      Cerrar sesiones
                    </button>
                  )}
                  {user.permissions.includes("security.manage") &&
                    r.id !== user.id && (
                      <button
                        className="link"
                        onClick={() => open(r, "reset-mfa")}
                      >
                        Recuperar TOTP
                      </button>
                    )}
                </div>
              )
            }
          />
        )}
      </div>
      {user.permissions.includes("sessions.read") && (
        <div className="card">
          <h3>Sesiones no revocadas dentro de su duración máxima</h3>
          <p className="muted">
            Las sesiones inactivas se rechazan en su siguiente solicitud. La
            revocación se comprueba en cada petición.
          </p>
          {sessions.error ? (
            <ErrorBox message={sessions.error.message} />
          ) : (
            <Table
              rows={sessions.data ?? []}
              columns={[
                { key: "name", label: "Persona" },
                { key: "stage", label: "Etapa" },
                { key: "ip", label: "IP" },
                {
                  key: "lastActivityAt",
                  label: "Actividad",
                  render: (r) =>
                    new Date(
                      txt(r, "lastActivityAt") +
                        (txt(r, "lastActivityAt").endsWith("Z") ? "" : "Z"),
                    ).toLocaleString("es-MX"),
                },
                {
                  key: "current",
                  label: "Sesión",
                  render: (r) => (r.current ? "Esta sesión" : "Otro acceso"),
                },
              ]}
              actions={(r) =>
                user.permissions.includes("sessions.revoke") && (
                  <button className="link" onClick={() => open(r, "session")}>
                    Revocar
                  </button>
                )
              }
            />
          )}
        </div>
      )}
      {selected && (
        <Modal
          title={
            operation === "reset-mfa"
              ? "Recuperación supervisada de TOTP"
              : "Confirmar control de acceso"
          }
          onClose={() => setSelected(undefined)}
        >
          <p>
            {txt(selected, "name")}. La acción queda auditada y puede cerrar
            sesiones inmediatamente.
          </p>
          <form onSubmit={run}>
            <label className="security-field">
              Motivo administrativo (sin datos clínicos)
              <textarea
                required
                minLength={8}
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {operation === "lifecycle" && (
              <>
                <label className="security-field">
                  Último día de acceso (opcional)
                  <input
                    type="date"
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                  />
                </label>
                <label className="security-check">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                  />{" "}
                  Cuenta activa
                </label>
                <label className="security-check">
                  <input
                    type="checkbox"
                    checked={shared}
                    onChange={(e) => setShared(e.target.checked)}
                  />{" "}
                  Equipo compartido: sesión de 5 minutos
                </label>
              </>
            )}
            {operation === "reset-mfa" && (
              <>
                <p>
                  No basta recibir un correo. Verifica personalmente la
                  identidad y la autorización del solicitante antes de eliminar
                  el factor. Todas sus sesiones y códigos se invalidarán.
                </p>
                <label className="security-check">
                  <input
                    type="checkbox"
                    required
                    checked={verified}
                    onChange={(e) => setVerified(e.target.checked)}
                  />{" "}
                  Verifiqué presencialmente la identidad y documenté el
                  procedimiento.
                </label>
              </>
            )}
            {error && <ErrorBox message={error} />}
            <div className="form-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => setSelected(undefined)}
              >
                Cancelar
              </button>
              <button className="btn" disabled={busy}>
                {busy ? "Procesando…" : "Aplicar"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
