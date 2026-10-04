import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Check,
  ChevronDown,
  LogOut,
  Settings2,
  ShieldCheck,
  UserRound,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { api, num, txt, dateTime, type Session } from "./api";
import { Avatar, Empty, ErrorBox, Loading } from "./components";
import { useApp, useData } from "./state";
import {
  configureFeedback,
  defaultPreferences,
  parsePreferences,
  playFeedback,
  stopFeedback,
  unlockFeedback,
  type Preferences,
} from "./feedback";
import "./experience.css";

const Experience = createContext<{
  preferences: Preferences;
  update: (change: Partial<Preferences>) => void;
  persisted: boolean;
}>({ preferences: defaultPreferences, update: () => {}, persisted: true });
export const useExperience = () => useContext(Experience);
export function ExperienceProvider({
  userId,
  children,
}: {
  userId: number;
  children: ReactNode;
}) {
  const storageKey = `serena.preferences.v1.${userId}`;
  const [preferences, setPreferences] = useState(() => {
    try {
      return parsePreferences(
        JSON.parse(localStorage.getItem(storageKey) ?? "null"),
      );
    } catch {
      return { ...defaultPreferences };
    }
  });
  const [persisted, setPersisted] = useState(true);
  const update = (change: Partial<Preferences>) => {
    const next = parsePreferences({ ...preferences, ...change });
    configureFeedback(next);
    setPreferences(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setPersisted(true);
    } catch {
      setPersisted(false);
    }
  };
  useEffect(() => {
    configureFeedback(preferences);
    document.documentElement.dataset.motion = preferences.reducedMotion
      ? "reduced"
      : "system";
    const unlock = (event: Event) => {
      if (event.isTrusted) unlockFeedback();
    };
    const hidden = () => {
      if (document.hidden) stopFeedback();
    };
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true });
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
      document.removeEventListener("visibilitychange", hidden);
      configureFeedback({ ...defaultPreferences, sound: false });
      delete document.documentElement.dataset.motion;
    };
  }, [preferences]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) {
        try {
          setPreferences(
            parsePreferences(JSON.parse(event.newValue ?? "null")),
          );
        } catch {}
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [storageKey]);
  return (
    <Experience.Provider value={{ preferences, update, persisted }}>
      {children}
    </Experience.Provider>
  );
}

// One popover at a time; body portal prevents clipping in the navigation rail.
function usePopover(menu = false, above = false) {
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState({ left: 0, top: 0 });
  const trigger = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null),
    id = useId(),
    location = useLocation();
  const close = (restore = false) => {
    setOpen(false);
    if (restore) trigger.current?.focus();
  };
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect(),
        surface = panel.current;
      if (!anchor || !surface) return;
      const width = surface.offsetWidth,
        height = surface.offsetHeight;
      const top = above ? anchor.top - height - 10 : anchor.bottom + 10;
      setPosition({
        left: Math.max(
          12,
          Math.min(anchor.right - width, window.innerWidth - width - 12),
        ),
        top: Math.max(12, Math.min(top, window.innerHeight - height - 12)),
      });
    };
    place();
    const focus = menu
      ? panel.current?.querySelector<HTMLElement>('[role="menuitem"]')
      : panel.current;
    focus?.focus();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, above, menu]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        !panel.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        close();
    };
    const another = (event: Event) => {
      if ((event as CustomEvent).detail !== id) close();
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("serena-popover", another);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("serena-popover", another);
    };
  }, [open, id]);
  const toggle = () => {
    if (!open)
      window.dispatchEvent(new CustomEvent("serena-popover", { detail: id }));
    setOpen(!open);
  };
  const surface = (children: ReactNode, label: string, className = "") =>
    open
      ? createPortal(
          <div
            ref={panel}
            id={id}
            role={menu ? "menu" : "region"}
            aria-label={label}
            tabIndex={-1}
            className={`serena-popover ${className}`}
            style={position}
            onBlur={(event) => {
              if (
                event.relatedTarget &&
                !event.currentTarget.contains(event.relatedTarget as Node) &&
                event.relatedTarget !== trigger.current
              )
                close();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                close(true);
              }
              if (
                !menu ||
                !["ArrowDown", "ArrowUp", "Home", "End", "Tab"].includes(
                  event.key,
                )
              )
                return;
              event.preventDefault();
              if (event.key === "Tab") {
                close(true);
                return;
              }
              const items = [
                  ...(panel.current?.querySelectorAll<HTMLButtonElement>(
                    '[role="menuitem"]:not(:disabled)',
                  ) ?? []),
                ],
                index = items.indexOf(
                  document.activeElement as HTMLButtonElement,
                );
              items[
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : (index +
                        (event.key === "ArrowUp" ? -1 : 1) +
                        items.length) %
                      items.length
              ]?.focus();
            }}
          >
            {children}
          </div>,
          document.body,
        )
      : null;
  return { open, trigger, id, toggle, close, surface };
}

export type AccountSection = "general" | "security" | "preferences";
export function ProfileMenu({
  user,
  sidebar,
  onAccount,
  onLogout,
  busy,
}: {
  user: Session;
  sidebar?: boolean;
  onAccount: (section: AccountSection) => void;
  onLogout: () => void;
  busy: boolean;
}) {
  const menu = usePopover(true, sidebar);
  const select = (section: AccountSection) => {
    menu.close(true);
    onAccount(section);
  };
  return (
    <>
      <button
        ref={menu.trigger}
        type="button"
        className={sidebar ? "profile-button" : "small-profile"}
        aria-label={`Abrir menú de cuenta de ${user.name}`}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={menu.open ? menu.id : undefined}
        onClick={menu.toggle}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!menu.open) menu.toggle();
          }
        }}
      >
        <Avatar name={user.name} />
        {sidebar && (
          <>
            <span>
              {user.name}
              <small>{user.roles[0]}</small>
            </span>
            <ChevronDown
              size={14}
              className={menu.open ? "chevron-open" : ""}
            />
          </>
        )}
      </button>
      {menu.surface(
        <>
          <div className="account-menu-person">
            <Avatar name={user.name} />
            <div>
              <strong>{user.name}</strong>
              <small>@{user.username}</small>
            </div>
          </div>
          <div className="menu-role">{user.roles.join(" · ")}</div>
          <button role="menuitem" onClick={() => select("general")}>
            <UserRound size={17} />
            <span>
              Mi cuenta<small>Tu perfil y acceso personal</small>
            </span>
          </button>
          <button role="menuitem" onClick={() => select("security")}>
            <ShieldCheck size={17} />
            <span>
              Seguridad<small>Contraseña y autenticador</small>
            </span>
          </button>
          <button role="menuitem" onClick={() => select("preferences")}>
            <Settings2 size={17} />
            <span>
              Preferencias<small>Sonidos y movimiento</small>
            </span>
          </button>
          <div className="menu-separator" />
          <button
            role="menuitem"
            className="menu-logout"
            disabled={busy}
            onClick={() => {
              menu.close(true);
              onLogout();
            }}
          >
            <LogOut size={17} />
            {busy ? "Cerrando sesión…" : "Cerrar sesión"}
          </button>
        </>,
        "Opciones de mi cuenta",
        "account-menu",
      )}
    </>
  );
}

export function SoundToggle() {
  const { preferences, update } = useExperience();
  return (
    <button
      className="icon-button sound-toggle"
      aria-label={preferences.sound ? "Silenciar sonidos" : "Activar sonidos"}
      title={preferences.sound ? "Silenciar sonidos" : "Activar sonidos"}
      aria-pressed={preferences.sound}
      onClick={() => {
        update({ sound: !preferences.sound });
        if (!preferences.sound) unlockFeedback();
      }}
    >
      {preferences.sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
    </button>
  );
}

export function NotificationsBell() {
  const data = useData("notifications", true, 30000),
    { notify } = useApp(),
    client = useQueryClient(),
    navigate = useNavigate();
  const popover = usePopover(),
    seen = useRef<Set<number> | null>(null),
    [busy, setBusy] = useState<number>();
  const unread = (data.data ?? []).filter((row) => !row.read);
  useEffect(() => {
    if (!data.data) return;
    const ids = new Set(
      data.data.filter((row) => !row.read).map((row) => num(row, "id")),
    );
    if (seen.current && [...ids].some((id) => !seen.current!.has(id)))
      playFeedback("notification");
    seen.current = new Set(data.data.map((row) => num(row, "id")));
  }, [data.data]);
  const mark = async (id: number) => {
    setBusy(id);
    try {
      await api(`notifications/${id}/read`, "POST");
      await client.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" &&
          (query.queryKey[0] === "notifications" ||
            query.queryKey[0] === "dashboard" ||
            query.queryKey[0].startsWith("workbench")),
      });
    } catch (error) {
      notify((error as Error).message, "error");
    } finally {
      setBusy(undefined);
    }
  };
  return (
    <>
      <button
        ref={popover.trigger}
        className="icon-button notification-trigger"
        aria-label={`Notificaciones${unread.length ? `, ${unread.length} sin leer` : ""}`}
        aria-expanded={popover.open}
        aria-controls={popover.open ? popover.id : undefined}
        onClick={popover.toggle}
      >
        <Bell size={20} />
        {unread.length > 0 && (
          <span className="notification-count" aria-hidden="true">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>
      {popover.surface(
        <>
          <div className="popover-heading">
            <div>
              <h3>Notificaciones</h3>
              <small>
                {unread.length ? `${unread.length} sin leer` : "Estás al día"}
              </small>
            </div>
            <button
              className="icon-button"
              aria-label="Cerrar notificaciones"
              onClick={() => popover.close(true)}
            >
              <X size={18} />
            </button>
          </div>
          <div className="notification-preview">
            {data.isPending ? (
              <Loading />
            ) : data.error ? (
              <ErrorBox
                message="No pudimos cargar tus avisos."
                retry={() => void data.refetch()}
              />
            ) : !data.data?.length ? (
              <Empty
                title="Todo al día"
                description="Aquí verás tus próximos avisos."
              />
            ) : (
              data.data.slice(0, 4).map((row) => (
                <article
                  className={
                    row.read
                      ? "preview-notification"
                      : "preview-notification unread"
                  }
                  key={num(row, "id")}
                >
                  <span className="unread-dot" />
                  <div>
                    <strong>{txt(row, "title")}</strong>
                    <p>{txt(row, "message")}</p>
                    <time>{dateTime(txt(row, "createdAt"))}</time>
                  </div>
                  {!row.read && (
                    <button
                      className="icon-button"
                      disabled={busy !== undefined}
                      aria-label={`Marcar como leído: ${txt(row, "title")}`}
                      onClick={() => void mark(num(row, "id"))}
                    >
                      <Check size={16} />
                    </button>
                  )}
                </article>
              ))
            )}
          </div>
          <button
            className="popover-footer"
            onClick={() => {
              popover.close();
              navigate("/notifications");
            }}
          >
            Ver todas las notificaciones
          </button>
        </>,
        "Tus notificaciones",
        "notification-popover",
      )}
    </>
  );
}
