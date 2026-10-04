import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { totp } from "./security-client.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = "http://127.0.0.1:5096/api/";
try { await fetch(base + "health", { signal: AbortSignal.timeout(1000) }); throw new Error("Puerto 5096 ocupado: no se tocará otra API."); } catch (error) { if (error.message.startsWith("Puerto")) throw error; }
await mkdir(path.join(root, "data/tests"), { recursive: true });
const temporary = await mkdtemp(path.join(root, "data/tests/security-"));
const databasePath = path.join(temporary, "test.db");
const server = spawn(path.join(root, ".tools/dotnet/dotnet.exe"), [process.env.CLINICA_TEST_DLL ?? path.join(root, "backend/bin/Debug/net10.0/Clinica.Api.dll"), "--urls", "http://127.0.0.1:5096"], {
  cwd: path.join(root, "backend"), env: { ...process.env, ASPNETCORE_ENVIRONMENT: "Development", Storage__Root: temporary, ConnectionStrings__Clinic: `Data Source=${databasePath}` }, stdio: ["ignore", "pipe", "pipe"],
});
let output = "", passed = 0, database;
server.stdout.on("data", chunk => output += chunk); server.stderr.on("data", chunk => output += chunk);
const logins = [];
class Client {
  cookies = new Map(); csrf = ""; session; secret; codes = []; password = "SerenaDemo!2026";
  async call(route, method = "GET", body, expected = 200, csrf = true) {
    if (route === "auth/login") {
      while (logins.length && Date.now() - logins[0] > 61000) logins.shift();
      if (logins.length >= 9) { console.log("Respetando el límite de login…"); await new Promise(resolve => setTimeout(resolve, Math.max(1, 61000 - (Date.now() - logins[0])))); logins.length = 0; }
      logins.push(Date.now());
    }
    const headers = { Cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ") };
    if (method !== "GET" && csrf) headers["X-CSRF-TOKEN"] = this.csrf;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(base + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0], index = pair.indexOf("="); this.cookies.set(pair.slice(0, index), pair.slice(index + 1)); }
    const result = response.headers.get("content-type")?.includes("json") ? await response.json() : null;
    assert.equal(response.status, expected, `${method} ${route}: ${response.status}; cuerpo omitido para no revelar secretos`); return result;
  }
  async csrfToken() { this.csrf = (await this.call("auth/csrf")).token; }
  async login(username, password = this.password) {
    await this.csrfToken(); this.password = password; this.session = await this.call("auth/login", "POST", { username, password }); await this.csrfToken(); return this.session;
  }
  async enroll() {
    const setup = await this.call("auth/mfa/enroll", "POST"); this.secret = setup.manualKey;
    this.enrollmentCode = totp(this.secret);
    const result = await this.call("auth/mfa/confirm", "POST", { code: this.enrollmentCode }); this.session = result.session; this.codes = result.recoveryCodes; await this.csrfToken(); return setup;
  }
  async verify(code = this.codes.shift()) { this.session = await this.call("auth/mfa/verify", "POST", { code }); await this.csrfToken(); return this.session; }
  async reauth(code = this.codes.shift()) { return this.call("auth/reauth", "POST", { password: this.password, code }); }
}
async function test(name, fn) { await fn(); passed++; console.log("✓ " + name); }
const timestamp = (date = new Date()) => date.toISOString().replace("T", " ").replace("Z", "");
const old = (minutes) => timestamp(new Date(Date.now() - minutes * 60000));
function sessionUpdate(client, field, value) { assert(["LastActivityAt", "AbsoluteExpiresAt", "ReauthenticatedAt", "EnrollmentExpiresAt"].includes(field)); database.prepare(`UPDATE AuthSessions SET ${field} = ? WHERE SessionId = ?`).run(value, client.session.sessionId.toUpperCase()); }
try {
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) { try { if ((await fetch(base + "health")).ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 300)); }
  assert(ready, "La API de pruebas no inició. " + output.slice(-2000));
  database = new DatabaseSync(databasePath); database.exec("PRAGMA busy_timeout=10000");
  const admin = new Client(), stranger = new Client(), patient = new Client();
  await test("Sin cuenta: API privada y CSRF bloqueados", async () => { await stranger.call("dashboard", "GET", undefined, 401); await stranger.call("auth/login", "POST", { username: "admin", password: admin.password }, 400, false); });
  await test("Errores de login no revelan si existe una cuenta", async () => { await stranger.csrfToken(); const unknown = await stranger.call("auth/login", "POST", { username: "no-such-user", password: "ClaveIncorrecta!2026" }, 401); const existing = await stranger.call("auth/login", "POST", { username: "admin", password: "ClaveIncorrecta!2026" }, 401); assert.equal(unknown.message, existing.message); });
  await test("Primer factor no concede roles ni permisos", async () => { const user = await admin.login("admin"); assert.equal(user.authStage, "enrollment"); assert.deepEqual(user.permissions, []); assert.deepEqual(user.roles, []); assert(!("mfaSecret" in user)); });
  await test("Sesión incompleta no accede a módulos ni endpoints auxiliares", async () => {
    for (const route of ["dashboard", "lookups", "notifications", "patients", "auth/security", "auth/drafts/patients:new"]) await admin.call(route, "GET", undefined, 403);
    await admin.call("auth/activity", "POST", {}, 403); await admin.call("auth/reauth", "POST", { password: admin.password }, 403);
  });
  await test("TOTP interoperable, QR local y recuperación de un solo uso", async () => { const setup = await admin.enroll(); assert(setup.qr.startsWith("data:image/png;base64,")); assert.equal(setup.manualKey.length, 32); assert.equal(admin.session.authStage, "full"); assert.equal(admin.codes.length, 10); assert.equal(new Set(admin.codes).size, 10); await admin.call("dashboard"); });
  await test("Semilla cifrada y códigos almacenados solo como hash", async () => {
    const user = database.prepare("SELECT MfaSecret, PasswordHash FROM Users WHERE Username = 'admin'").get(); assert(user.MfaSecret && !user.MfaSecret.includes(admin.secret)); assert(!user.PasswordHash.includes(admin.password));
    const hashes = database.prepare("SELECT Hash FROM RecoveryCodes WHERE UserId = ?").all(admin.session.id); assert.equal(hashes.length, 10); assert(hashes.every(row => row.Hash.length === 64 && !admin.codes.includes(row.Hash)));
  });
  await test("Límites del superadministrador: 5 minutos y máximo 8 horas", async () => { const view = await admin.call("auth/me"); const now = Date.parse(view.serverNow); assert(Math.abs(Date.parse(view.idleExpiresAt) - now - 5 * 60000) < 3000); assert(Math.abs(Date.parse(view.absoluteExpiresAt) - now - 8 * 3600000) < 3000); });
  await test("Acción sensible exige confirmación incluso con URL alternativa", async () => { await admin.call("reports?export=true", "GET", undefined, 428); await admin.call("REPORTS/?export=True", "GET", undefined, 428); await admin.call("settings/", "PUT", {}, 428); await admin.call("settings", "PUT", {}, 400, false); });
  await test("El TOTP usado para enrolar no sirve nuevamente para confirmar", async () => { await admin.call("auth/reauth", "POST", { password: admin.password, code: admin.enrollmentCode }, 400); });
  let consumed;
  await test("Confirmación con contraseña y recuperación: código consumido atómicamente", async () => { consumed = admin.codes.shift(); await admin.reauth(consumed); await admin.call("auth/reauth", "POST", { password: admin.password, code: consumed }, 400); await admin.call("reports?export=true"); });
  await test("Confirmación sensible caduca en servidor", async () => { sessionUpdate(admin, "ReauthenticatedAt", old(4)); await admin.call("reports?export=true", "GET", undefined, 428); await admin.reauth(); });
  await test("Actividad y confirmación simultáneas no generan conflictos", async () => { const code = admin.codes.shift(); await Promise.all([admin.call("auth/activity", "POST", {}), admin.reauth(code)]); await admin.call("reports?export=true"); });
  const second = new Client();
  await test("Otra sesión debe superar su propio segundo factor y confirmación", async () => { const view = await second.login("admin"); assert.equal(view.authStage, "mfa"); await second.call("dashboard", "GET", undefined, 403); second.codes = admin.codes; await second.verify(); await second.call("reports?export=true", "GET", undefined, 428); });
  await test("Revocación administrativa invalida una cookie existente", async () => { const rows = await admin.call("security/sessions"), row = rows.find(x => x.sessionId === second.session.sessionId); assert(row); await admin.call(`security/sessions/${row.id}/revoke`, "POST", { reason: "Cierre de sesión de prueba" }); await second.call("dashboard", "GET", undefined, 401); });
  await test("Exportaciones de tablas: confirmación y permiso en servidor", async () => { await patient.login("paciente"); await patient.call("exports/authorize", "POST", { dataset: "patients" }, 403); sessionUpdate(admin, "ReauthenticatedAt", old(4)); await admin.call("exports/authorize", "POST", { dataset: "patients" }, 428); await admin.reauth(); await admin.call("exports/authorize", "POST", { dataset: "patients" }); await admin.call("exports/authorize", "POST", { dataset: "unknown" }, 403); const own = (await admin.call("security/sessions")).find(x => x.sessionId === admin.session.sessionId); assert.equal(own.current, true); });
  await test("Borrador clínico cifrado, no incluido en auditoría", async () => { const draft = { name: "Persona ficticia confidencial", curp: "QA1234567890123456" }; await admin.call("auth/drafts/patients:new", "PUT", draft); const raw = database.prepare("SELECT Ciphertext FROM SecureDrafts WHERE UserId = ?").get(admin.session.id); assert(!raw.Ciphertext.includes(draft.name)); assert.deepEqual((await admin.call("auth/drafts/patients:new")).data, draft); const audits = await admin.call("audit"); assert(!JSON.stringify(audits).includes(draft.name)); });
  await test("Borradores: aislamiento por usuario y sin contraseñas", async () => { await patient.login("paciente"); assert.equal(patient.session.authStage, "full"); await patient.call("auth/drafts/patients:new", "GET", undefined, 403); await admin.call("auth/drafts/patients:new", "PUT", { password: "no-guardar" }, 400); });
  await test("Pacientes conservan su portal; TOTP opcional sin desactivación laboral", async () => { await patient.call("dashboard"); await patient.call("security/sessions", "GET", undefined, 403); await patient.call("auth/mfa/enroll", "POST", {}, 428); await patient.reauth(); await patient.enroll(); assert(patient.session.mfaEnabled); });
  const access = new Client();
  await test("Administración de accesos no puede delegarse datos clínicos o financieros", async () => { await access.login("accesos"); await access.enroll(); await access.reauth(); await access.call("roles", "POST", { name: "Escalamiento QA", audience: "internal", description: "QA", permissions: ["records.read"] }, 403); await access.call("users", "POST", { username: "finanzasqa", name: "Persona QA", email: "qa@example.invalid", roles: "Administración financiera", active: true, password: "NuevaTemporal!2026" }, 403); await access.call(`security/users/${admin.session.id}/reset-mfa`, "POST", { reason: "Restablecer factor de prueba", identityVerified: true }, 403); });
  await test("Auditoría sellada detecta alteración y no revela factores", async () => { const rows = await admin.call("audit"); assert(rows.every(x => x.integrity === "Verificado")); assert(!JSON.stringify(rows).includes(admin.secret)); assert(!JSON.stringify(rows).includes(consumed)); const record = rows.find(x => x.action === "Confirmar identidad"); database.prepare("UPDATE AuditLogs SET Detail = 'Alteración QA' WHERE Id = ?").run(record.id); const changed = await admin.call(`audit?event=${record.id}`); assert.equal(changed[0].integrity, "Alterado"); await admin.call(`audit/${record.id}`, "DELETE", {}, 404); });
  await test("Cerrar todas las sesiones revoca los accesos de una cuenta", async () => { await admin.call(`security/users/${access.session.id}/revoke-all`, "POST", { reason: "Fin de turno administrativo" }); await access.call("users", "GET", undefined, 401); });
  const doctor = new Client();
  await test("Otros puestos tienen 15 minutos, sin extenderse por consultar me", async () => { await doctor.login("medico"); await doctor.enroll(); const first = await doctor.call("auth/me"), again = await doctor.call("auth/me"); assert.equal(first.idleExpiresAt, again.idleExpiresAt); assert(Math.abs(Date.parse(first.idleExpiresAt) - Date.parse(first.serverNow) - 15 * 60000) < 3000); });
  await test("Caducidad simultánea rechaza todas las peticiones y registra un solo cierre", async () => { sessionUpdate(doctor, "LastActivityAt", old(16)); await Promise.all(Array.from({ length: 8 }, () => doctor.call("appointments", "GET", undefined, 401))); const count = database.prepare("SELECT COUNT(*) AS count FROM AuditLogs WHERE Action = 'Sesión finalizada' AND RecordId = ?").get(doctor.session.sessionId); assert.equal(count.count, 1); });
  const company = new Client();
  await test("Empresa: MFA obligatorio y máximo absoluto aunque haya actividad", async () => { await company.login("empresa"); await company.enroll(); sessionUpdate(company, "AbsoluteExpiresAt", old(1)); await company.call("auth/activity", "POST", {}, 401); });
  await test("Recuperación privilegiada no usa correo ni permite restablecerse a sí mismo", async () => { await admin.call(`security/users/${admin.session.id}/reset-mfa`, "POST", { reason: "Intento de recuperación propia", identityVerified: true }, 400); await admin.call(`security/users/${doctor.session.id}/reset-mfa`, "POST", { reason: "Falta comprobación de identidad" }, 400); });
  await test("Recuperación supervisada revoca factores anteriores y obliga a enrolar", async () => { await admin.call(`security/users/${doctor.session.id}/reset-mfa`, "POST", { reason: "Identidad verificada presencialmente QA", identityVerified: true }); const view = await doctor.login("medico"); assert.equal(view.authStage, "enrollment"); await doctor.call("dashboard", "GET", undefined, 403); });
  await test("Vigencia laboral y revisión de permisos auditadas", async () => { let user = (await admin.call("users")).find(x => x.username === "empresa"); await admin.call(`security/users/${user.id}/review`, "POST", { reason: "Revisión trimestral de convenio" }); user = (await admin.call("users")).find(x => x.id === user.id); assert.equal(user.reviewDue, false); await admin.call(`security/users/${user.id}/lifecycle`, "POST", { active: true, accessExpiresAt: new Date(Date.now() - 60000).toISOString(), version: user.version, reason: "Convenio finalizado en prueba" }); await company.csrfToken(); await company.call("auth/login", "POST", { username: "empresa", password: company.password }, 401); });
  await test("Equipos compartidos reciben límite de 5 minutos configurable por administración", async () => { let user = (await admin.call("users")).find(x => x.username === "medico"); await admin.call(`security/users/${user.id}/lifecycle`, "POST", { active: true, accessExpiresAt: null, sharedWorkstation: true, version: user.version, reason: "Puesto clínico compartido QA" }); await doctor.login("medico"); await doctor.enroll(); const view = await doctor.call("auth/me"); assert(Math.abs(Date.parse(view.idleExpiresAt) - Date.parse(view.serverNow) - 5 * 60000) < 3000); });
  await test("Fallos del segundo factor bloquean la cuenta sin saltárselo con otro login", async () => { const reception = new Client(); await reception.login("recepcion"); const setup = await reception.call("auth/mfa/enroll", "POST"); const wrong = totp(setup.manualKey) === "000000" ? "111111" : "000000"; for (let i = 0; i < 5; i++) await reception.call("auth/mfa/confirm", "POST", { code: wrong }, 400); assert(database.prepare("SELECT LockedUntil FROM Users WHERE Username = 'recepcion'").get().LockedUntil); await reception.call("auth/login", "POST", { username: "recepcion", password: reception.password }, 401); });
  await test("Cambiar permisos invalida el acceso a borradores antiguos", async () => { const user = (await admin.call("users")).find(x => x.username === "medico"); const draft = { patientId: 1, content: "Borrador ficticio" }; await doctor.call("auth/drafts/records:new", "PUT", draft); const role = await admin.call("roles", "POST", { name: "Médico QA solo lectura", audience: "doctor", description: "QA", permissions: ["patients.read", "appointments.read"] }); await admin.call(`users/${user.id}`, "PUT", { ...user, roles: role.name }); await doctor.call("auth/drafts/records:new", "GET", undefined, 401); const view = await doctor.login("medico"); assert.equal(view.authStage, "mfa"); await doctor.verify(); await doctor.call("auth/drafts/records:new", "GET", undefined, 403); });
  console.log(`\n${passed} grupos de seguridad aprobados. Base aislada: ${temporary}`);
} catch (error) { console.error(error); console.error(output.slice(-3000)); process.exitCode = 1; }
finally { database?.close(); server.kill(); }
