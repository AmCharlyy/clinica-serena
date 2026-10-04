export interface Session {
  id: number;
  name: string;
  username: string;
  roles: string[];
  permissions: string[];
  audience: "internal" | "doctor" | "patient" | "company" | "blocked";
  patientId: number | null;
  doctorId: number | null;
  companyId: number | null;
  mustChangePassword: boolean;
  authStage?: "full" | "mfa" | "enrollment" | "password";
  mfaEnabled?: boolean;
  mfaRequired?: boolean;
  sessionId?: string;
  serverNow?: string;
  idleExpiresAt?: string;
  absoluteExpiresAt?: string;
}
export type Row = Record<string, unknown>;
export const accessKey = (user: Session | null) =>
  user
    ? JSON.stringify([
        user.id,
        user.authStage,
        user.audience,
        user.patientId,
        user.doctorId,
        user.companyId,
        [...user.roles].sort(),
        [...user.permissions].sort(),
      ])
    : "anonymous";
export const txt = (row: Row, key: string): string => String(row[key] ?? "");
export const num = (row: Row, key: string): number => Number(row[key] ?? 0);
export const money = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    n,
  );
export const date = (s: string) =>
  s
    ? new Date(s.length === 10 ? s + "T12:00:00" : s).toLocaleDateString(
        "es-MX",
        { day: "numeric", month: "short", year: "numeric" },
      )
    : "—";
export const dateTime = (value: string) => {
  if (!value) return "—";
  const timestamp = new Date(
    /[zZ]$|[+-]\d{2}:\d{2}$/.test(value) ? value : value + "Z",
  );
  return Number.isNaN(timestamp.getTime())
    ? "—"
    : new Intl.DateTimeFormat("es-MX", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Mexico_City",
      }).format(timestamp);
};
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
let csrf = "";
let reauthenticate: (() => Promise<void>) | undefined;
export function setReauthentication(handler?: () => Promise<void>) {
  reauthenticate = handler;
}
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
async function request(url: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch {
    throw new ApiError(
      options.method && options.method !== "GET"
        ? "No se pudo confirmar la operación por un problema de conexión. Revisa el registro antes de repetirla."
        : "No se pudo conectar con el servidor. Comprueba tu conexión con la clínica.",
      0,
    );
  }
}
export async function refreshCsrf() {
  const response = await request("/api/auth/csrf", {
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("No se pudo conectar con la API.");
  csrf = (await response.json()).token;
}
export async function api<T = Row[]>(
  path: string,
  method = "GET",
  data?: unknown,
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {};
  const body =
    data instanceof FormData
      ? data
      : data === undefined
        ? undefined
        : JSON.stringify(data);
  if (data !== undefined && !(data instanceof FormData))
    headers["Content-Type"] = "application/json";
  if (method !== "GET") {
    if (!csrf) await refreshCsrf();
    headers["X-CSRF-TOKEN"] = csrf;
  }
  const response = await request("/api/" + path, {
    method,
    headers,
    body,
    credentials: "same-origin",
  });
  if (response.status === 428 && retry && reauthenticate) {
    await reauthenticate();
    return api<T>(path, method, data, false);
  }
  if (response.status === 401 && path !== "auth/login" && path !== "auth/me")
    window.dispatchEvent(new Event("session-expired"));
  const text = await response.text();
  let result: unknown;
  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    result = null;
  }
  if (!response.ok) {
    const error = result as { message?: string; detail?: string } | null;
    throw new ApiError(
      error?.message ??
        error?.detail ??
        (response.status === 403
          ? "Tu cuenta no tiene permiso para esta acción."
          : response.status === 429
            ? "Demasiados intentos. Espera un momento."
            : "No se pudo completar la operación."),
      response.status,
    );
  }
  return result as T;
}
export async function secureDownload(
  path: string,
  filename: string,
  retry = true,
): Promise<void> {
  const response = await request("/api/" + path, {
    credentials: "same-origin",
  });
  if (response.status === 428 && retry && reauthenticate) {
    await reauthenticate();
    return secureDownload(path, filename, false);
  }
  if (response.status === 401)
    window.dispatchEvent(new Event("session-expired"));
  if (!response.ok)
    throw new Error(
      "No fue posible descargar el archivo o confirmar el acceso.",
    );
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.replace(/[\\/:*?"<>|]/g, "_");
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
