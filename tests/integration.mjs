import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { completeTestLogin, reauthenticateTest } from "./security-client.mjs";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = "http://127.0.0.1:5091/api/";
let occupied = false;
try {
  await fetch(base + "health", { signal: AbortSignal.timeout(1500) });
  occupied = true;
} catch {}
assert(
  !occupied,
  "El puerto 5091 está ocupado; no se modificará una API existente.",
);
await mkdir(path.join(root, "data", "tests"), { recursive: true });
const temporary = await mkdtemp(path.join(root, "data", "tests", "run-"));
const portable = path.join(root, ".tools", "dotnet", "dotnet.exe");
const dotnet = existsSync(portable) ? portable : "dotnet";
const processApi = spawn(
  dotnet,
  [
    process.env.CLINICA_TEST_DLL ?? path.join(root, "backend", "bin", "Debug", "net10.0", "Clinica.Api.dll"),
    "--urls",
    "http://127.0.0.1:5091",
  ],
  {
    cwd: path.join(root, "backend"),
    env: {
      ...process.env,
      ASPNETCORE_ENVIRONMENT: "Development",
      ConnectionStrings__Clinic: `Data Source=${path.join(temporary, "test.db")}`,
      Storage__Root: temporary,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let output = "";
processApi.stdout.on("data", (d) => (output += d));
processApi.stderr.on("data", (d) => (output += d));
class Client {
  cookies = new Map();
  csrf = "";
  async call(route, method = "GET", body, expected = 200, csrf = true) {
    const headers = {
      Cookie: [...this.cookies].map(([k, v]) => k + "=" + v).join("; "),
    };
    if (method !== "GET" && csrf) headers["X-CSRF-TOKEN"] = this.csrf;
    if (body !== undefined && !(body instanceof FormData))
      headers["Content-Type"] = "application/json";
    const response = await fetch(base + route, {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0],
        i = pair.indexOf("=");
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    if (response.status === 428 && expected !== 428) { await reauthenticateTest(this); return this.call(route, method, body, expected, csrf); }
    const type = response.headers.get("content-type") ?? "";
    const data = type.includes("json")
      ? await response.json()
      : Buffer.from(await response.arrayBuffer());
    assert.equal(
      response.status,
      expected,
      `${method} ${route}: ${response.status} (se omite el cuerpo por seguridad)`,
    );
    return data;
  }
  async login(username, password = "SerenaDemo!2026") {
    this.csrf = (await this.call("auth/csrf")).token;
    const user = await this.call("auth/login", "POST", { username, password });
    this.csrf = (await this.call("auth/csrf")).token;
    return completeTestLogin(this, user, password);
  }
}
let count = 0;
async function test(name, fn) {
  await fn();
  count++;
  console.log("✓ " + name);
}
try {
  let ready = false;
  for (let i = 0; i < 90; i++) {
    try {
      const res = await fetch(base + "health");
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  assert(ready, "La API de pruebas no inició.");
  const admin = new Client(),
    patient = new Client(),
    company = new Client(),
    doctor = new Client(),
    reception = new Client(),
    auditor = new Client();
  await test("Autenticación, permisos y protección CSRF", async () => {
    await new Client().call("patients", "GET", undefined, 401);
    const user = await admin.login("admin");
    assert(user.permissions.includes("records.write"));
    await admin.call("services", "POST", { name: "Sin token" }, 400, false);
  });
  await patient.login("paciente");
  await company.login("empresa");
  await doctor.login("medico");
  await reception.login("recepcion");
  await auditor.login("auditor");
  await test("Próximas citas: excluye horas pasadas y cancelaciones, conserva citas futuras propias", async () => {
    const fixture = new DatabaseSync(path.join(temporary, "test.db"));
    fixture.exec("PRAGMA busy_timeout=10000");
    const original = fixture.prepare("SELECT Id, Date, Time, Status FROM Appointments WHERE PatientId=1 LIMIT 1").get();
    assert(original);
    try {
      const dashboard = await patient.call("dashboard"), currentDay = dashboard.date;
      fixture.prepare("UPDATE Appointments SET Date=?, Time='00:00:00', Status='Confirmada' WHERE Id=?").run(currentDay, original.Id);
      assert(!(await patient.call("dashboard")).upcoming.some(row => row.id === original.Id));
      const tomorrow = new Date(currentDay + "T12:00:00Z"); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      fixture.prepare("UPDATE Appointments SET Date=? WHERE Id=?").run(tomorrow.toISOString().slice(0, 10), original.Id);
      const future = await patient.call("dashboard");
      assert(future.upcoming.some(row => row.id === original.Id));
      assert(future.upcomingCount >= future.upcoming.length && future.upcoming.length <= 6);
      assert(future.upcoming.every(row => row.patientId === 1));
      fixture.prepare("UPDATE Appointments SET Status='Cancelada' WHERE Id=?").run(original.Id);
      assert(!(await patient.call("dashboard")).upcoming.some(row => row.id === original.Id));
    } finally {
      fixture.prepare("UPDATE Appointments SET Date=?, Time=?, Status=? WHERE Id=?").run(original.Date, original.Time, original.Status, original.Id); fixture.close();
    }
  });
  await test("Alcance del paciente y de la empresa; expedientes protegidos", async () => {
    const ps = await patient.call("patients");
    assert.equal(ps.length, 1);
    assert.equal(ps[0].id, 1);
    await patient.call("patients/2", "GET", undefined, 404);
    const cp = await company.call("patients");
    assert.equal(cp.length, 2);
    assert(!("curp" in cp[0]));
    const corporateAppointments = await company.call("appointments");
    assert(corporateAppointments.every((a) => !a.reason && !a.notes));
    assert(
      (await company.call("dashboard")).upcoming.every(
        (a) => !a.reason && !a.notes,
      ),
    );
    assert(
      (await company.call("reports")).appointments.every(
        (a) => !a.reason && !a.notes,
      ),
    );
    await company.call("records", "GET", undefined, 403);
    await reception.call("records", "GET", undefined, 403);
    await auditor.call("patients", "GET", undefined, 403);
    await reception.call("users", "GET", undefined, 403);
    const dp = await doctor.call("patients");
    assert.equal(dp.length, 1);
  });
  await test("Contacto propio y roles configurables", async () => {
    const p = (await patient.call("patients"))[0];
    await patient.call("profile/contact", "PUT", {
      phone: "5500000222",
      email: "patient@example.invalid",
      address: "Contacto ficticio",
      emergencyContact: "Demo",
      version: p.version,
    });
    assert.equal((await patient.call("patients"))[0].phone, "5500000222");
    const role = await admin.call("roles", "POST", {
      name: "Consulta de pruebas",
      description: "Solo consulta",
      permissions: ["patients.read"],
    });
    assert.equal(role.permissions, "patients.read");
    await admin.call("roles/" + role.id, "PUT", {
      ...role,
      permissions: ["patients.read", "appointments.read"],
    });
    await reception.call(
      "roles/" + role.id,
      "PUT",
      { ...role, permissions: ["users.write"] },
      403,
    );
  });
  await test("Administración de cuentas sin lectura clínica ni escalamiento al rol raíz", async () => {
    await admin.call("users", "POST", {
      username: "delegator",
      name: "Administración de accesos QA",
      email: "qa@example.invalid",
      roles: "Administrador de usuarios",
      active: true,
      password: "TemporalAcceso!2026",
    });
    const accessAdmin = new Client();
    await accessAdmin.login("delegator", "TemporalAcceso!2026");
    await accessAdmin.call("auth/password", "POST", {
      currentPassword: "TemporalAcceso!2026",
      newPassword: "PersonalAcceso!2026",
    });
    await accessAdmin.login("delegator", "PersonalAcceso!2026");
    await accessAdmin.call("users", "POST", {
      username: "receptionqa",
      name: "Recepción QA",
      email: "qa@example.invalid",
      roles: "Recepción",
      active: true,
      password: "TemporalNueva!2026",
    }, 403);
    const receptionUser = await admin.call("users", "POST", {
      username: "receptionqa", name: "Recepción QA", email: "qa@example.invalid", roles: "Recepción", active: true, password: "TemporalNueva!2026",
    });
    assert(receptionUser.id);
    await accessAdmin.call("users", "POST", {
      username: "doctorqa",
      name: "Médico QA",
      email: "qa@example.invalid",
      roles: "Médico",
      doctorId: 2,
      active: true,
      password: "TemporalNueva!2026",
    }, 403);
    await accessAdmin.call(`users/${receptionUser.id}/reset-password`, "POST", {
      password: "OtraTemporal!2026",
    }, 403);
    await accessAdmin.call("roles", "POST", {
      name: "Lectura clínica delegada",
      description: "QA",
      permissions: ["records.read"],
    }, 403);
    await accessAdmin.call(
      "roles",
      "POST",
      {
        name: "Escalamiento indebido",
        description: "QA",
        permissions: ["records.read", "users.write"],
      },
      403,
    );
    await accessAdmin.call("records", "GET", undefined, 403);
    const root = (await accessAdmin.call("users")).find(
      (u) => u.username === "admin",
    );
    await accessAdmin.call(
      `users/${root.id}`,
      "PUT",
      { ...root, roles: "Recepción" },
      403,
    );
    await accessAdmin.call(
      `users/${root.id}/reset-password`,
      "POST",
      { password: "OtraTemporal!2026" },
      403,
    );
    const own = (await accessAdmin.call("users")).find(
      (u) => u.username === "delegator",
    );
    await accessAdmin.call(
      `users/${own.id}`,
      "PUT",
      { ...own, roles: "Administración financiera" },
      400,
    );
  });
  await test("Liquidación de pagos pendientes", async () => {
    const pending = await admin.call("payments", "POST", {
      patientId: 1,
      concept: "Pendiente QA",
      amount: 50,
      method: "Transferencia",
      status: "Pendiente",
    });
    const row = (await admin.call("payments")).find((p) => p.id === pending.id);
    await admin.call(`payments/${pending.id}/settle`, "POST", {
      version: row.version,
      status: "Pagado",
      reason: "",
    });
    assert.equal(
      (await admin.call("payments")).find((p) => p.id === pending.id).status,
      "Pagado",
    );
  });
  let newPatient, newCompany, newService;
  await test("CRUD de empresas, pacientes y servicios; folios y CURP única", async () => {
    newCompany = await admin.call("companies", "POST", {
      name: "Empresa de prueba",
      rfc: "DEM010101BBB",
      contact: "Pruebas",
      email: "qa@example.invalid",
      phone: "5500000099",
      agreement: "Convenio QA",
      active: true,
    });
    newPatient = await admin.call("patients", "POST", {
      name: "Paciente de prueba",
      curp: "TSTX900101HDFABC01",
      birthDate: "1990-01-01",
      sex: "No especificado",
      phone: "5500000999",
      email: "qa@example.invalid",
      address: "Datos ficticios",
      emergencyContact: "Pruebas",
      companyId: newCompany.id,
      active: true,
    });
    assert.match(newPatient.folio, /PAC-/);
    await admin.call("patients", "POST", { ...newPatient, id: 0 }, 409);
    newService = await admin.call("services", "POST", {
      name: "Servicio de prueba",
      specialty: "Medicina general",
      durationMinutes: 30,
      price: 750,
      active: true,
    });
    const edited = await admin.call("patients/" + newPatient.id, "PUT", {
      ...newPatient,
      phone: "5500000998",
    });
    await admin.call(
      "patients/" + newPatient.id,
      "PUT",
      { ...newPatient, phone: "5500000997" },
      409,
    );
    newPatient = edited;
    const scope = await company.call("patients");
    assert(!scope.some((p) => p.id === newPatient.id));
  });
  let future = new Date();
  future.setDate(future.getDate() + 3);
  while ([0, 6].includes(future.getDay())) future.setDate(future.getDate() + 1);
  const appointmentDate = future.toISOString().slice(0, 10);
  let appointment;
  await test("Agenda: crear, detectar solapamiento y conservar recursos por horario", async () => {
    const input = {
      patientId: newPatient.id,
      doctorId: 1,
      facilityId: 1,
      serviceId: newService.id,
      date: appointmentDate,
      time: "10:00:00",
      reason: "Consulta de prueba",
      notes: "",
    };
    const created = await admin.call("appointments", "POST", input);
    await admin.call(
      "appointments",
      "POST",
      { ...input, time: "10:15:00" },
      409,
    );
    appointment = (await admin.call("appointments")).find(
      (a) => a.id === created.id,
    );
    await patient.call("appointments", "POST", input, 403);
    await doctor.call("appointments", "POST", { ...input, doctorId: 2 }, 403);
    await admin.call(`appointments/${appointment.id}/status`, "POST", {
      status: "Confirmada",
      reason: "",
      version: appointment.version,
    });
    appointment = (await admin.call("appointments")).find(
      (a) => a.id === created.id,
    );
    await admin.call(
      `appointments/${appointment.id}/status`,
      "POST",
      { status: "Finalizada", reason: "", version: appointment.version },
      400,
    );
    await admin.call(`appointments/${appointment.id}/status`, "POST", {
      status: "Cancelada",
      reason: "Prueba de liberación",
      version: appointment.version,
    });
    await admin.call("appointments", "POST", input);
    const h = await admin.call(`appointments/${appointment.id}/history`);
    assert(h.length >= 3);
  });
  await test("Recepción: check-in, inicio y finalización de consulta", async () => {
    let a = (await reception.call("appointments")).find((a) => a.id === 1);
    assert(a);
    await reception.call("appointments/1/check-in", "POST", {
      status: "Confirmada",
      reason: "",
      version: a.version,
    });
    a = (await reception.call("appointments")).find((a) => a.id === 1);
    assert(a.checkedInAt);
    await reception.call(
      "appointments/1/status",
      "POST",
      { status: "En curso", reason: "", version: a.version },
      403,
    );
    await doctor.call("appointments/1/status", "POST", {
      status: "En curso",
      reason: "",
      version: a.version,
    });
    a = (await doctor.call("appointments")).find((a) => a.id === 1);
    await doctor.call("appointments/1/status", "POST", {
      status: "Finalizada",
      reason: "",
      version: a.version,
    });
    a = (await doctor.call("appointments")).find((a) => a.id === 1);
    assert.equal(a.status, "Finalizada");
  });
  await test("Nota clínica: autor, cierre y acceso limitado", async () => {
    const note = await doctor.call("records", "POST", {
      patientId: 1,
      doctorId: 1,
      appointmentId: 1,
      history: "Ficticio",
      allergies: "No documentadas",
      content: "Consulta de integración",
      diagnosis: "Demostración",
      treatment: "Seguimiento",
    });
    await admin.call(`records/${note.id}/sign`, "POST", {}, 403);
    await doctor.call(`records/${note.id}/sign`, "POST", {});
    await doctor.call(`records/${note.id}/sign`, "POST", {}, 400);
    const notes = await doctor.call("records");
    assert(notes.find((n) => n.id === note.id).signedAt);
  });
  let doc;
  await test("Documentos: almacenamiento privado, validación y publicación", async () => {
    const f = new FormData();
    f.append("patientId", "1");
    f.append("category", "Estudio");
    f.append("released", "false");
    f.append(
      "file",
      new Blob(["%PDF-1.7\nDocumento ficticio\n%%EOF"], {
        type: "application/pdf",
      }),
      "prueba.pdf",
    );
    doc = await admin.call("documents", "POST", f);
    await patient.call(`documents/${doc.id}/download`, "GET", undefined, 404);
    const row = (await admin.call("documents")).find((d) => d.id === doc.id);
    await admin.call(`documents/${doc.id}/release`, "POST", {
      released: true,
      version: row.version,
    });
    const file = await patient.call(`documents/${doc.id}/download`);
    assert(file.length > 10);
    await company.call(`documents/${doc.id}/download`, "GET", undefined, 404);
    const invalid = new FormData();
    invalid.append("patientId", "1");
    invalid.append("category", "Administrativo");
    invalid.append("file", new Blob(["<script>bad</script>"]), "bad.pdf");
    await reception.call("documents", "POST", invalid, 400);
    assert(!(await admin.call("documents")).some((d) => "storedName" in d));
  });
  await test("Pagos, comprobantes internos y anulación trazable", async () => {
    const payment = await admin.call("payments", "POST", {
      patientId: 1,
      concept: "Consulta QA",
      amount: 850.5,
      method: "Efectivo",
      status: "Pagado",
    });
    const invoice = await admin.call("invoices", "POST", {
      paymentId: payment.id,
    });
    assert(invoice.id);
    await admin.call("invoices", "POST", { paymentId: payment.id }, 409);
    const row = (await admin.call("payments")).find((p) => p.id === payment.id);
    await admin.call(`payments/${payment.id}/cancel`, "POST", {
      version: row.version,
      reason: "Prueba QA",
      status: "Anulado",
    });
    const report = await admin.call("reports");
    assert(report.income < 1500);
    await company.call(
      "payments",
      "POST",
      {
        patientId: 1,
        concept: "No permitido",
        amount: 1,
        method: "Efectivo",
        status: "Pagado",
      },
      403,
    );
  });
  await test("Usuarios: alcance obligatorio, cambio de contraseña y sesiones revocadas", async () => {
    await admin.call(
      "users",
      "POST",
      {
        username: "invalid",
        name: "Inválido",
        email: "",
        roles: "Paciente",
        active: true,
        password: "TemporalDemo!2026",
      },
      400,
    );
    const user = await admin.call("users", "POST", {
      username: "newpatient",
      name: "Paciente QA",
      email: "qa@example.invalid",
      roles: "Paciente",
      active: true,
      patientId: newPatient.id,
      password: "TemporalPaciente!2026",
    });
    assert(!("passwordHash" in user));
    const custom = new Client();
    await custom.login("newpatient", "TemporalPaciente!2026");
    await custom.call("patients", "GET", undefined, 403);
    await custom.call("auth/password", "POST", {
      currentPassword: "TemporalPaciente!2026",
      newPassword: "PersonalNueva!2026",
    });
    await custom.call("auth/me", "GET", undefined, 401);
    const root = (await admin.call("users")).find(
      (u) => u.username === "admin",
    );
    await admin.call(
      `users/${root.id}`,
      "PUT",
      { ...root, active: false },
      400,
    );
  });
  await test("Respaldo real de base y archivos, reportes y auditoría", async () => {
    const b = await admin.call("backups", "POST", {});
    const row = (await admin.call("backups")).find((x) => x.id === b.id);
    assert.equal(row.status, "Completado");
    const archive = await admin.call(`backups/${b.id}/download`);
    assert.equal(archive.subarray(0, 2).toString(), "PK");
    assert(archive.length > 1000);
    const logs = await auditor.call("audit");
    assert(logs.some((x) => x.action === "Crear respaldo"));
    assert(logs.some((x) => x.result === "Denegado"));
    const notices = await patient.call("notifications");
    assert(notices.length >= 2);
  });
  console.log(
    `\n${count} grupos de integración aprobados. Datos aislados: ${temporary}`,
  );
} catch (error) {
  console.error(error);
  console.error(output.slice(-6000));
  process.exitCode = 1;
} finally {
  processApi.kill();
}
