import assert from "node:assert/strict";
import { totp } from "./security-client.mjs";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const published = path.join(root, "artifacts", "clinica");
assert(
  existsSync(path.join(published, "wwwroot", "index.html")),
  "Ejecuta npm run build primero.",
);
const base = "http://127.0.0.1:5092";
let occupied = false;
try {
  await fetch(base + "/api/health", { signal: AbortSignal.timeout(1500) });
  occupied = true;
} catch {}
assert(
  !occupied,
  "El puerto 5092 está ocupado; no se modificará una API existente.",
);
await mkdir(path.join(root, "data", "tests"), { recursive: true });
const storage = await mkdtemp(path.join(root, "data", "tests", "publish-"));
const portable = path.join(root, ".tools", "dotnet", "dotnet.exe");
const dotnet = existsSync(portable) ? portable : "dotnet";
const server = spawn(
  dotnet,
  [path.join(published, "Clinica.Api.dll"), "--urls", base],
  {
    cwd: published,
    env: {
      ...process.env,
      ASPNETCORE_ENVIRONMENT: "Development",
      Database__Provider: "Sqlite",
      ConnectionStrings__Clinic: `Data Source=${path.join(storage, "published.db")}`,
      Storage__Root: storage,
      Demo__Enabled: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let output = "";
server.stdout.on("data", (d) => (output += d));
server.stderr.on("data", (d) => (output += d));
const cookies = new Map();
async function request(route, init = {}) {
  const response = await fetch(base + route, {
    ...init,
    headers: {
      Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      ...init.headers,
    },
  });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0],
      i = pair.indexOf("=");
    cookies.set(pair.slice(0, i), pair.slice(i + 1));
  }
  return response;
}
try {
  let ready = false;
  for (let i = 0; i < 90; i++) {
    try {
      const health = await fetch(base + "/api/health");
      if (health.ok && (await health.json()).application === "ClinicaSerena") {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert(ready, "La aplicación publicada no inició.");
  const response = await request("/");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert(html.includes("Clínica Serena"));
  for (const asset of [
    ...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g),
  ].map((m) => m[1])) {
    const result = await request(asset);
    assert.equal(result.status, 200, "Recurso publicado: " + asset);
    assert((await result.arrayBuffer()).byteLength > 100);
  }
  const deep = await request("/agenda");
  assert.equal(deep.status, 200);
  assert.equal(
    await deep.text(),
    html,
    "Las rutas React deben devolver la aplicación.",
  );
  assert.equal((await request("/api/dashboard")).status, 401);
  const csrf = await (await request("/api/auth/csrf")).json();
  const login = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": csrf.token },
    body: JSON.stringify({ username: "admin", password: "SerenaDemo!2026" }),
  });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).authStage, "enrollment");
  assert.equal((await request("/api/dashboard")).status, 403);
  let factorCsrf = await (await request("/api/auth/csrf")).json();
  const setup = await request("/api/auth/mfa/enroll", { method: "POST", headers: { "X-CSRF-TOKEN": factorCsrf.token } });
  assert.equal(setup.status, 200);
  const enrollment = await setup.json();
  const activated = await request("/api/auth/mfa/confirm", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": factorCsrf.token }, body: JSON.stringify({ code: totp(enrollment.manualKey) }) });
  assert.equal(activated.status, 200);
  const dashboard = await request("/api/dashboard");
  assert.equal(dashboard.status, 200);
  assert.equal((await dashboard.json()).patientCount, 3);
  const workbench = await request("/api/dashboard/workbench");
  assert.equal(workbench.status, 200);
  const work = await workbench.json();
  assert.equal(work.view, "overview");
  assert(
    work.availableViews.includes("finance") &&
      work.availableViews.includes("reception"),
  );
  assert.equal((await request("/api/no-existe")).status, 404);
  console.log(
    "✓ Aplicación publicada: frontend, recursos locales, rutas profundas, login y API en el mismo origen.",
  );
  console.log("Prueba aislada en Development; no certifica IIS ni SQL Server.");
} catch (error) {
  console.error(error);
  console.error(output.slice(-6000));
  process.exitCode = 1;
} finally {
  server.kill();
}
