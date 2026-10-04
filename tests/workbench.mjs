import assert from "node:assert/strict";
import { completeTestLogin, reauthenticateTest } from "./security-client.mjs";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = "http://127.0.0.1:5094/api/";
let occupied = false;
try {
  await fetch(base + "health", { signal: AbortSignal.timeout(1000) });
  occupied = true;
} catch {}
assert(!occupied, "El puerto 5094 está ocupado; no se tocará otro servidor.");
await mkdir(path.join(root, "data/tests"), { recursive: true });
const temporary = await mkdtemp(path.join(root, "data/tests/workbench-"));
const processApi = spawn(
  path.join(root, ".tools/dotnet/dotnet.exe"),
  [
    process.env.CLINICA_TEST_DLL ?? path.join(root, "backend/bin/Debug/net10.0/Clinica.Api.dll"),
    "--urls",
    "http://127.0.0.1:5094",
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
  async call(route, method = "GET", body, expected = 200) {
    const headers = {
      Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
    };
    if (method !== "GET") headers["X-CSRF-TOKEN"] = this.csrf;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(base + route, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
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
  async login(username, password = "SerenaDemo!2026", expected = 200) {
    while (loginTimes.length && Date.now() - loginTimes[0] >= 61000)
      loginTimes.shift();
    if (loginTimes.length >= 9) {
      console.log("Respetando el límite de inicio de sesión…");
      await new Promise((r) =>
        setTimeout(r, Math.max(1, 61000 - (Date.now() - loginTimes[0]))),
      );
      loginTimes.length = 0;
    }
    this.csrf = (await this.call("auth/csrf")).token;
    const session = await this.call(
      "auth/login",
      "POST",
      { username, password },
      expected,
    );
    loginTimes.push(Date.now());
    this.csrf = (await this.call("auth/csrf")).token;
    return expected === 200 ? completeTestLogin(this, session, password) : session;
  }
}
async function test(name, fn) {
  await fn();
  passed++;
  console.log("✓ " + name);
}
function contract(w) {
  assert.deepEqual(
    Object.keys(w).sort(),
    [
      "view",
      "defaultView",
      "availableViews",
      "date",
      "asOf",
      "metrics",
      "panels",
      "alerts",
    ].sort(),
  );
  for (const panel of w.panels) {
    assert(panel.items.length <= 6 && panel.total >= panel.items.length);
    for (const item of panel.items) {
      assert.deepEqual(
        Object.keys(item).sort(),
        [
          "key",
          "title",
          "subtitle",
          "state",
          "href",
          "action",
          "tone",
          "at",
          "amount",
        ].sort(),
      );
      if (item.at)
        assert(
          item.at.endsWith("Z"),
          "Los instantes almacenados en UTC deben incluir su zona.",
        );
    }
  }
  for (const metric of w.metrics) assert(Number.isFinite(metric.value));
  for (const href of [
    ...w.metrics,
    ...w.alerts,
    ...w.panels,
    ...w.panels.flatMap((p) => p.items),
  ]
    .map((i) => i.href)
    .filter(Boolean))
    assert(href.startsWith("/") && !href.startsWith("//"));
  const text = JSON.stringify(w);
  for (const secret of [
    "passwordHash",
    "storedName",
    "securityStamp",
    "PRIVATE_WORKBENCH_NOTE",
    "PRIVATE_PATIENT_REASON",
    temporary,
  ])
    assert(!text.includes(secret), `Dato privado en resumen: ${secret}`);
}
const metric = (w, key) => w.metrics.find((m) => m.key === key)?.value;
const panel = (w, key) => w.panels.find((p) => p.key === key);
try {
  let ready = false;
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(base + "health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  assert(ready, "La API aislada no inició.");
  const anonymous = new Client();
  await test("Inicio operativo requiere sesión", () =>
    anonymous.call("dashboard/workbench", "GET", undefined, 401));
  const clients = {};
  const defaults = {
    admin: "overview",
    general: "coordination",
    accesos: "access",
    coordinacion: "coordination",
    recepcion: "reception",
    finanzas: "finance",
    auditor: "audit",
    soporte: "support",
  };
  for (const username of [
    ...Object.keys(defaults),
    "medico",
    "paciente",
    "empresa",
  ]) {
    await test(`Inicio ${username}: área y alcance`, async () => {
      const client = (clients[username] = new Client());
      await client.login(username);
      if (!defaults[username]) {
        await client.call("dashboard/workbench", "GET", undefined, 403);
        return;
      }
      const w = await client.call("dashboard/workbench");
      contract(w);
      assert.equal(w.view, defaults[username]);
      assert.equal(w.defaultView, defaults[username]);
      for (const view of w.availableViews) {
        const chosen = await client.call(`dashboard/workbench?view=${view}`);
        contract(chosen);
        assert.equal(chosen.view, view);
      }
    });
  }
  const admin = clients.admin;
  await test("Cambiar la URL no concede otra área ni transforma portales en personal interno", async () => {
    for (const [username, view] of [
      ["recepcion", "finance"],
      ["finanzas", "reception"],
      ["accesos", "support"],
      ["auditor", "access"],
      ["soporte", "coordination"],
      ["medico", "overview"],
      ["paciente", "reception"],
      ["empresa", "finance"],
    ])
      await clients[username].call(
        `dashboard/workbench?view=${view}`,
        "GET",
        undefined,
        403,
      );
    await admin.call(
      "dashboard/workbench?view=no-existe",
      "GET",
      undefined,
      400,
    );
  });
  await test("Recepción: llegada cambia la cola; solo el personal clínico inicia la consulta", async () => {
    const before = await clients.recepcion.call("dashboard/workbench");
    const appointments = await admin.call("appointments");
    const row = appointments.find(
      (a) =>
        a.date === before.date && a.status === "Confirmada" && !a.checkedInAt,
    );
    assert(row, "Se esperaba una cita confirmada de demo para hoy.");
    const future = new Date(before.date + "T12:00:00Z");
    do {
      future.setUTCDate(future.getUTCDate() + 1);
    } while ([0, 6].includes(future.getUTCDay()));
    const futureDate = future.toISOString().slice(0, 10);
    await admin.call("appointments", "POST", {
      patientId: 1,
      doctorId: 1,
      facilityId: 1,
      serviceId: 1,
      date: futureDate,
      time: "09:00:00",
      reason: "PRIVATE_PATIENT_REASON",
      notes: "PRIVATE_WORKBENCH_NOTE",
      instructions: "Instrucción pública QA",
    });
    const current = (await admin.call("appointments")).find(
      (a) => a.id === row.id,
    );
    const second = appointments.find(
      (a) =>
        a.date === before.date &&
        a.status === "Confirmada" &&
        !a.checkedInAt &&
        a.id !== row.id,
    );
    assert(second);
    await clients.recepcion.call(`appointments/${second.id}/check-in`, "POST", {
      version: second.version,
      status: "Confirmada",
      reason: "",
    });
    await clients.recepcion.call(`appointments/${row.id}/check-in`, "POST", {
      version: current.version,
      status: "Confirmada",
      reason: "",
    });
    const after = await clients.recepcion.call("dashboard/workbench");
    contract(after);
    assert.equal(metric(after, "arrivals"), metric(before, "arrivals") - 2);
    assert.equal(metric(after, "waiting"), metric(before, "waiting") + 2);
    assert.deepEqual(
      panel(after, "waiting")
        .items.slice(0, 2)
        .map((i) => i.key),
      [`appointment:${second.id}`, `appointment:${row.id}`],
    );
    assert(
      panel(after, "waiting").items.some(
        (i) => i.key === `appointment:${row.id}` && i.at,
      ),
    );
    const arrived = (await admin.call("appointments")).find(
      (a) => a.id === row.id,
    );
    await clients.recepcion.call(
      `appointments/${row.id}/status`,
      "POST",
      { version: arrived.version, status: "En curso", reason: "" },
      403,
    );
    await clients.medico.call(`appointments/${row.id}/status`, "POST", {
      version: arrived.version,
      status: "En curso",
      reason: "",
    });
    const started = await clients.recepcion.call("dashboard/workbench");
    assert.equal(metric(started, "waiting"), metric(before, "waiting") + 1);
    assert(
      panel(started, "current").items.some(
        (i) => i.key === `appointment:${row.id}`,
      ),
    );
  });
  await test("Finanzas: liquidación y comprobante actualizan pendientes sin duplicar reglas", async () => {
    const before = await clients.finanzas.call("dashboard/workbench");
    const saved = await admin.call("payments", "POST", {
      patientId: 1,
      concept: "Cobro aislado QA",
      amount: 321.5,
      method: "Efectivo",
      status: "Pendiente",
    });
    let w = await clients.finanzas.call("dashboard/workbench");
    contract(w);
    assert.equal(
      metric(w, "pendingAmount"),
      metric(before, "pendingAmount") + 321.5,
    );
    assert.equal(metric(w, "pending"), metric(before, "pending") + 1);
    const p = (await clients.finanzas.call("payments")).find(
      (p) => p.id === saved.id,
    );
    await clients.finanzas.call(`payments/${p.id}/settle`, "POST", {
      version: p.version,
      status: "Pagado",
      reason: "",
    });
    w = await clients.finanzas.call("dashboard/workbench");
    assert.equal(metric(w, "pending"), metric(before, "pending"));
    assert(
      panel(w, "receipts").items.some((i) => i.key === `payment:${saved.id}`),
    );
    await clients.finanzas.call("invoices", "POST", { paymentId: saved.id });
    w = await clients.finanzas.call("dashboard/workbench");
    assert(
      !panel(w, "receipts").items.some((i) => i.key === `payment:${saved.id}`),
    );
    const co = (await admin.call("companies"))[0];
    await admin.call(`companies/${co.id}`, "PUT", {
      ...co,
      validUntil: w.date,
    });
    w = await clients.finanzas.call("dashboard/workbench");
    assert(
      panel(w, "agreements").items.some((i) => i.key === `company:${co.id}`),
    );
  });
  await test("Accesos: cuentas temporales y cambios de permisos, sin secretos", async () => {
    const before = await clients.accesos.call("dashboard/workbench");
    const user = await admin.call("users", "POST", {
      name: "Cuenta temporal QA",
      username: "workbenchqa",
      email: "qa@example.invalid",
      roles: "Recepción",
      active: true,
      password: "TemporalWork!2026",
    });
    const w = await clients.accesos.call("dashboard/workbench");
    contract(w);
    assert.equal(
      metric(w, "initialPassword"),
      metric(before, "initialPassword") + 1,
    );
    assert(panel(w, "accounts").items.some((i) => i.key === `user:${user.id}`));
    assert(
      panel(w, "roles").items.every(
        (i) => !i.subtitle.includes("patients.read"),
      ),
    );
  });
  await test("Auditoría: ingresos fallidos reales, cambios y filtros autorizados", async () => {
    const wrong = new Client();
    await wrong.login("usuario-inexistente-qa", "IncorrectaWork!2026", 401);
    const w = await clients.auditor.call("dashboard/workbench");
    contract(w);
    assert(metric(w, "denied") > 0);
    assert(metric(w, "failedLogin") > 0);
    assert(panel(w, "changes").total > 0);
    const failed = await clients.auditor.call("audit?task=failedLogin&days=1");
    assert(
      failed.length &&
        failed.every((a) => a.action === "Login" && a.result !== "Correcto"),
    );
    const changes = await clients.auditor.call("audit?task=access&days=7");
    assert(
      changes.length &&
        changes.every(
          (a) =>
            ["Usuario", "Rol"].includes(a.entity) &&
            !["Login", "Logout"].includes(a.action),
        ),
    );
    const item = panel(w, "failures").items[0];
    const result = await clients.auditor.call(
      "audit?event=" + item.key.split(":")[1],
    );
    assert.equal(result.length, 1);
    await clients.recepcion.call("audit?task=failures", "GET", undefined, 403);
    await clients.auditor.call("audit?task=no-existe", "GET", undefined, 400);
    await clients.auditor.call(
      "audit?task=access&days=99",
      "GET",
      undefined,
      400,
    );
  });
  await test("Soporte: diagnósticos delimitados y alerta de respaldo, sin datos de pacientes", async () => {
    const w = await clients.soporte.call("dashboard/workbench");
    contract(w);
    assert(
      panel(w, "diagnostics").items.some(
        (i) => i.key === "database" && i.state === "Conectada",
      ),
    );
    assert(metric(w, "uptime") >= 0);
    assert(w.alerts.some((a) => a.key === "backupAge"));
    assert(!JSON.stringify(w).includes("Mariana"));
  });
  for (const [username, name, permissions, area, panels, absent] of [
    [
      "general",
      "Solo recursos QA",
      ["staff.read"],
      "coordination",
      ["doctors"],
      ["scheduled", "completed", "rooms"],
    ],
    [
      "accesos",
      "Solo roles QA",
      ["roles.read"],
      "access",
      ["roles"],
      ["activeUsers", "initialPassword", "locked"],
    ],
    [
      "soporte",
      "Solo respaldos QA",
      ["backups.read"],
      "support",
      ["backups"],
      ["uptime", "freeDisk"],
    ],
    [
      "coordinacion",
      "Solo agenda QA",
      ["appointments.read"],
      "coordination",
      [],
      ["onDuty", "rooms"],
    ],
    [
      "auditor",
      "Sin módulos QA",
      [],
      "personal",
      [],
      ["events", "activeUsers", "income"],
    ],
  ]) {
    await test(`Rol personalizado: ${name}, sin heredar áreas por nombre`, async () => {
      const role = await admin.call("roles", "POST", {
        name,
        description: "Prueba de mínimo acceso",
        audience: "internal",
        permissions,
      });
      const account = (await admin.call("users")).find(
        (u) => u.username === username,
      );
      await admin.call(`users/${account.id}`, "PUT", {
        ...account,
        roles: role.name,
      });
      const client = new Client();
      await client.login(username);
      const w = await client.call("dashboard/workbench");
      contract(w);
      assert.equal(w.view, area);
      assert.deepEqual(w.availableViews, [area]);
      assert.deepEqual(
        w.panels.map((p) => p.key),
        panels,
      );
      for (const key of absent) assert.equal(metric(w, key), undefined);
      for (const other of [
        "reception",
        "finance",
        "access",
        "support",
        "audit",
      ].filter((v) => v !== area))
        await client.call(
          `dashboard/workbench?view=${other}`,
          "GET",
          undefined,
          403,
        );
    });
  }
  console.log(
    `\n${passed} grupos de inicios operativos aprobados. Datos aislados: ${temporary}`,
  );
} catch (error) {
  console.error(error);
  console.error(output.slice(-5500));
  process.exitCode = 1;
} finally {
  processApi.kill();
}
