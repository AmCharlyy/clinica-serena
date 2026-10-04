import assert from "node:assert/strict";
import { completeTestLogin, reauthenticateTest } from "./security-client.mjs";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = "http://127.0.0.1:5093/api/";
let occupied = false;
try {
  await fetch(base + "health", { signal: AbortSignal.timeout(1000) });
  occupied = true;
} catch {}
assert(!occupied, "El puerto 5093 está ocupado. No se tocará otro servidor.");
await mkdir(path.join(root, "data/tests"), { recursive: true });
const temporary = await mkdtemp(path.join(root, "data/tests/roles-"));
const processApi = spawn(
  path.join(root, ".tools/dotnet/dotnet.exe"),
  [
    process.env.CLINICA_TEST_DLL ?? path.join(root, "backend/bin/Debug/net10.0/Clinica.Api.dll"),
    "--urls",
    "http://127.0.0.1:5093",
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
let output = "",
  passed = 0;
processApi.stdout.on("data", (d) => (output += d));
processApi.stderr.on("data", (d) => (output += d));
const loginTimes = [];
class Client {
  cookies = new Map();
  csrf = "";
  session;
  async call(route, method = "GET", body, expected = 200) {
    const headers = {
      Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
    };
    if (method !== "GET") headers["X-CSRF-TOKEN"] = this.csrf;
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
    if (response.status === 428 && expected !== 428) { await reauthenticateTest(this); return this.call(route, method, body, expected); }
    const data = response.headers.get("content-type")?.includes("json")
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
    while (loginTimes.length && Date.now() - loginTimes[0] >= 61000)
      loginTimes.shift();
    if (loginTimes.length >= 9) {
      console.log("Respetando el límite de inicio de sesión…");
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(1, 61000 - (Date.now() - loginTimes[0]))),
      );
      loginTimes.length = 0;
    }
    this.csrf = (await this.call("auth/csrf")).token;
    this.session = await this.call("auth/login", "POST", {
      username,
      password,
    });
    loginTimes.push(Date.now());
    this.csrf = (await this.call("auth/csrf")).token;
    return completeTestLogin(this, this.session, password);
  }
}
async function test(name, fn) {
  await fn();
  passed++;
  console.log("✓ " + name);
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      if ((await fetch(base + "health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert(ready, "La API de roles no inició.");
  const clients = {};
  for (const [username, audience] of [
    ["admin", "internal"],
    ["general", "internal"],
    ["accesos", "internal"],
    ["coordinacion", "internal"],
    ["recepcion", "internal"],
    ["medico", "doctor"],
    ["paciente", "patient"],
    ["empresa", "company"],
    ["finanzas", "internal"],
    ["auditor", "internal"],
    ["soporte", "internal"],
  ]) {
    await test(`Rol ${username}: sesión y alcance explícito`, async () => {
      const client = (clients[username] = new Client());
      const session = await client.login(username);
      assert.equal(session.audience, audience);
      const me = await client.call("auth/me");
      assert.equal(me.audience, audience);
      await client.call("dashboard");
    });
  }
  const admin = clients.admin,
    patient = clients.paciente,
    doctor = clients.medico,
    company = clients.empresa;
  await test("Paciente: catálogos públicos sin personal no médico, contactos, horarios ni instalaciones", async () => {
    const catalog = await patient.call("catalog/public");
    assert(catalog.doctors.length === 3);
    for (const d of catalog.doctors)
      assert.deepEqual(
        Object.keys(d).sort(),
        ["id", "name", "specialty", "license"].sort(),
      );
    for (const s of catalog.services)
      assert(!("active" in s) && !("version" in s));
    for (const route of [
      "staff",
      "services",
      "facilities",
      "users",
      "roles",
      "reports",
      "records",
      "audit",
      "payments",
      "backups",
    ])
      await patient.call(route, "GET", undefined, 403);
    const lookups = await patient.call("lookups");
    assert.equal(lookups.facilities, null);
    assert.equal(lookups.companies, null);
    assert.equal(lookups.patients.length, 1);
    const dashboard = await patient.call("dashboard");
    assert.equal(dashboard.patientCount, null);
    assert.equal(dashboard.doctorCount, null);
  });
  await test("Administración de usuarios: selectores mínimos, sin directorio ni expedientes", async () => {
    const access = clients.accesos,
      lookups = await access.call("lookups");
    for (const key of ["patients", "doctors", "companies"]) {
      assert(lookups[key].length);
      assert(
        lookups[key].every((row) =>
          Object.keys(row).every((k) => ["id", "name"].includes(k)),
        ),
      );
    }
    await access.call("patients", "GET", undefined, 403);
    await access.call("records", "GET", undefined, 403);
    for (const [role, association] of [
      ["Paciente", { patientId: 2 }],
      ["Médico", { doctorId: 2 }],
      ["Empresa", { companyId: 1 }],
    ]) {
      const input = {
        username: `scope-${role === "Médico" ? "doctor" : role.toLowerCase()}`,
        name: "Cuenta QA",
        email: "qa@example.invalid",
        roles: role,
        active: true,
        password: "TemporalRoles!2026",
        ...association,
      };
      await access.call("users", "POST", input, 403);
      const created = await clients.admin.call("users", "POST", input);
      assert(created.id);
    }
  });
  let day = new Date();
  day.setDate(day.getDate() + 4);
  while ([0, 6].includes(day.getDay())) day.setDate(day.getDate() + 1);
  const bookingDate = day.toISOString().slice(0, 10);
  let internalAppointment;
  await test("Administración clínica: citas completas, notas internas e instrucciones separadas", async () => {
    const lookups = await clients.coordinacion.call("lookups");
    assert(
      lookups.services.length &&
        lookups.doctors.length &&
        lookups.facilities.length,
    );
    const created = await clients.coordinacion.call("appointments", "POST", {
      patientId: 1,
      doctorId: 1,
      serviceId: 1,
      facilityId: 1,
      date: bookingDate,
      time: "11:30:00",
      reason: "Mensaje público QA",
      notes: "SOLO-INTERNO-QA",
      instructions: "Llegar diez minutos antes",
      companyId: 1,
    });
    internalAppointment = (await admin.call("appointments")).find(
      (a) => a.id === created.id,
    );
    assert.equal(internalAppointment.notes, "SOLO-INTERNO-QA");
    assert.equal(internalAppointment.instructions, "Llegar diez minutos antes");
  });
  await test("Paciente: notas omitidas, historial público y protección frente a escritura maliciosa", async () => {
    const a = (await patient.call("appointments")).find(
      (a) => a.id === internalAppointment.id,
    );
    assert(a);
    assert(!("notes" in a));
    assert.equal(a.instructions, "Llegar diez minutos antes");
    const history = await patient.call(`appointments/${a.id}/history`);
    assert(history.every((h) => !("detail" in h) && !("userId" in h)));
    const request = {
      patientId: 1,
      doctorId: 1,
      facilityId: 0,
      serviceId: 1,
      date: bookingDate,
      time: "12:15:00",
      reason: "Mi mensaje actualizado",
      version: a.version,
    };
    await patient.call(
      `appointments/${a.id}`,
      "PUT",
      { ...request, notes: "Intento de sobrescribir" },
      403,
    );
    await patient.call(
      `appointments/${a.id}`,
      "PUT",
      { ...request, instructions: "Intento de editar instrucciones" },
      403,
    );
    await patient.call(`appointments/${a.id}`, "PUT", request);
    const stored = (await admin.call("appointments")).find(
      (x) => x.id === a.id,
    );
    assert.equal(stored.notes, "SOLO-INTERNO-QA");
    assert.equal(stored.instructions, "Llegar diez minutos antes");
    assert.equal(stored.companyId, 1);
    const slots = await patient.call(
      `appointments/availability?doctorId=1&serviceId=1&date=${bookingDate}`,
    );
    assert(slots.length && slots.every((s) => typeof s === "string"));
    assert(!slots.includes("12:15:00"));
    const created = await patient.call("appointments", "POST", {
      patientId: 1,
      doctorId: 1,
      facilityId: 999,
      serviceId: 1,
      date: bookingDate,
      time: slots.at(-1),
      reason: "Solicitud privada QA",
    });
    const booked = (await admin.call("appointments")).find(
      (x) => x.id === created.id,
    );
    assert(booked.facilityId !== 999);
    assert.equal(booked.companyId, null);
    await patient.call(
      `appointments/${a.id}/check-in`,
      "POST",
      { status: "Confirmada", reason: "", version: stored.version },
      403,
    );
  });
  await test("Finanzas y auditor: reportes agregados sin detalles, motivos ni notas", async () => {
    for (const client of [clients.finanzas, clients.auditor]) {
      await client.call("appointments", "GET", undefined, 403);
      const report = await client.call(
        `reports?from=${bookingDate}&to=${bookingDate}`,
      );
      assert.equal(report.appointments.length, 0);
      assert(!JSON.stringify(report).includes("SOLO-INTERNO-QA"));
    }
    const report = await admin.call(
      `reports?from=${bookingDate}&to=${bookingDate}&export=true`,
    );
    assert(report.appointments.length);
    for (const a of report.appointments)
      assert.deepEqual(
        Object.keys(a).sort(),
        [
          "id",
          "date",
          "time",
          "status",
          "patientName",
          "doctorName",
          "serviceName",
        ].sort(),
      );
    const directory = await clients.finanzas.call("patients");
    assert(
      directory.every(
        (p) => !("curp" in p) && !("phone" in p) && !("birthDate" in p),
      ),
    );
  });
  await test("Empresa: solo cobertura explícita en citas, pagos, reportes y comprobantes", async () => {
    const own = await company.call("appointments");
    assert(own.some((a) => a.id === internalAppointment.id));
    assert(
      own.every(
        (a) => !("reason" in a) && !("notes" in a) && !("instructions" in a),
      ),
    );
    await admin.call("payments", "POST", {
      patientId: 1,
      concept: "Consumo privado QA",
      amount: 17,
      method: "Efectivo",
      status: "Pagado",
    });
    const payment = await admin.call("payments", "POST", {
      patientId: 1,
      companyId: 1,
      concept: "Consumo cubierto QA",
      amount: 23,
      method: "Convenio",
      status: "Pagado",
    });
    const payments = await company.call("payments");
    assert(payments.some((p) => p.id === payment.id));
    assert(!payments.some((p) => p.concept === "Consumo privado QA"));
    const invoice = await admin.call("invoices", "POST", {
      paymentId: payment.id,
    });
    assert((await company.call("invoices")).some((i) => i.id === invoice.id));
    await admin.call(
      "payments",
      "POST",
      {
        patientId: 3,
        companyId: 1,
        concept: "Cruce QA",
        amount: 1,
        method: "Convenio",
        status: "Pagado",
      },
      400,
    );
    const report = await company.call(
      `reports?from=${bookingDate}&to=${bookingDate}`,
    );
    assert(
      report.appointments.every((a) => !("reason" in a) && !("notes" in a)),
    );
    for (const corporate of [false, true]) {
      const form = new FormData();
      form.append("patientId", "1");
      form.append("category", "Comprobante");
      form.append("released", "true");
      if (corporate) form.append("companyId", "1");
      form.append(
        "file",
        new Blob(["%PDF-1.7\nComprobante ficticio\n%%EOF"], {
          type: "application/pdf",
        }),
        corporate ? "cubierto.pdf" : "privado.pdf",
      );
      const doc = await admin.call("documents", "POST", form);
      await company.call(
        `documents/${doc.id}/download`,
        "GET",
        undefined,
        corporate ? 200 : 404,
      );
    }
    const corporateDocuments = await company.call("documents");
    assert(corporateDocuments.some((d) => d.name === "cubierto.pdf"));
    assert(!corporateDocuments.some((d) => d.name === "privado.pdf"));
  });
  await test("Médico: sin confirmación ni check-in; cita cancelada no crea relación asistencial", async () => {
    assert(!doctor.session.permissions.includes("appointments.checkin"));
    assert(!doctor.session.permissions.includes("appointments.confirm"));
    const created = await admin.call("appointments", "POST", {
      patientId: 3,
      doctorId: 1,
      facilityId: 1,
      serviceId: 1,
      date: bookingDate,
      time: "09:30:00",
      reason: "Relación cancelada QA",
      notes: "",
    });
    const a = (await admin.call("appointments")).find(
      (a) => a.id === created.id,
    );
    await admin.call(`appointments/${a.id}/status`, "POST", {
      status: "Cancelada",
      reason: "QA",
      version: a.version,
    });
    await doctor.call("patients/3", "GET", undefined, 404);
    const own = (await doctor.call("appointments")).find(
      (a) => a.id === internalAppointment.id,
    );
    await doctor.call(
      `appointments/${own.id}/check-in`,
      "POST",
      { status: "Confirmada", reason: "", version: own.version },
      403,
    );
    await doctor.call(
      `appointments/${own.id}/status`,
      "POST",
      { status: "Confirmada", reason: "", version: own.version },
      403,
    );
  });
  await test("Roles personalizados: alcance independiente del nombre, asociaciones obligatorias y sin mezcla", async () => {
    const role = await admin.call("roles", "POST", {
      name: "Profesional personalizado QA",
      description: "Doctor acotado",
      audience: "doctor",
      permissions: ["patients.read", "appointments.read", "records.read"],
    });
    await admin.call("users", "POST", {
      username: "customdoctor",
      name: "Profesional QA",
      email: "qa@example.invalid",
      roles: role.name,
      doctorId: 1,
      active: true,
      password: "TemporalRoles!2026",
    });
    const custom = new Client();
    await custom.login("customdoctor", "TemporalRoles!2026");
    await custom.call("auth/password", "POST", {
      currentPassword: "TemporalRoles!2026",
      newPassword: "PersonalRoles!2026",
    });
    await custom.login("customdoctor", "PersonalRoles!2026");
    assert.equal(custom.session.audience, "doctor");
    assert((await custom.call("appointments")).every((a) => a.doctorId === 1));
    await custom.call("patients/3", "GET", undefined, 404);
    await admin.call(
      "users",
      "POST",
      {
        username: "mixedqa",
        name: "Mezcla QA",
        email: "qa@example.invalid",
        roles: role.name + ",Administrador general",
        doctorId: 1,
        active: true,
        password: "TemporalRoles!2026",
      },
      400,
    );
    await admin.call(
      "roles",
      "POST",
      {
        name: "Paciente peligroso QA",
        description: "QA",
        audience: "patient",
        permissions: ["records.read"],
      },
      400,
    );
    await admin.call(
      `roles/${role.id}`,
      "PUT",
      { ...role, audience: "internal", permissions: ["patients.read"] },
      400,
    );
    await admin.call(
      "users",
      "POST",
      {
        username: "internaldoctor",
        name: "Asociación inválida QA",
        email: "qa@example.invalid",
        roles: "Administrador general",
        doctorId: 1,
        active: true,
        password: "TemporalRoles!2026",
      },
      400,
    );
  });
  await test("Permisos específicos: exportar, publicar y descargar respaldos se verifican en servidor", async () => {
    const role = await admin.call("roles", "POST", {
      name: "Reporte sin exportación QA",
      description: "QA",
      audience: "internal",
      permissions: [
        "reports.read",
        "documents.read",
        "documents.write",
        "patients.read",
        "backups.read",
      ],
    });
    const user = await admin.call("users", "POST", {
      username: "readreport",
      name: "Lectura QA",
      email: "qa@example.invalid",
      roles: role.name,
      active: true,
      password: "TemporalRoles!2026",
    });
    assert(user.id);
    const read = new Client();
    await read.login("readreport", "TemporalRoles!2026");
    await read.call("auth/password", "POST", {
      currentPassword: "TemporalRoles!2026",
      newPassword: "PersonalRoles!2026",
    });
    await read.login("readreport", "PersonalRoles!2026");
    await read.call("reports");
    await read.call("reports?export=true", "GET", undefined, 403);
    const doc = (await read.call("documents"))[0];
    assert(doc);
    await read.call(
      `documents/${doc.id}/release`,
      "POST",
      { released: true, version: doc.version },
      403,
    );
    await read.call("backups/1/download", "GET", undefined, 403);
    await clients.accesos.call(
      "roles",
      "POST",
      {
        name: "Respaldo indebido QA",
        description: "QA",
        audience: "internal",
        permissions: ["backups.download"],
      },
      403,
    );
  });
  console.log(
    `\n${passed} grupos de roles aprobados. Datos aislados: ${temporary}`,
  );
} catch (error) {
  console.error(error);
  console.error(output.slice(-6000));
  process.exitCode = 1;
} finally {
  processApi.kill();
}
