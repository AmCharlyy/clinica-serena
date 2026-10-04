import assert from "node:assert/strict";
import { accessKey } from "../frontend/src/api.ts";

const session = {
  id: 1, name: "Demo", username: "demo", audience: "doctor",
  patientId: null, doctorId: 1, companyId: null, mustChangePassword: false,
  roles: ["Médico"], permissions: ["records.read", "patients.read"],
};
const original = structuredClone(session);
assert.equal(accessKey(null), "anonymous");
assert.equal(accessKey(session), accessKey(structuredClone(session)));
assert.equal(accessKey(session), accessKey({ ...session, permissions: [...session.permissions].reverse() }));
assert.deepEqual(session, original, "No se deben ordenar ni mutar los permisos de la sesión original");
for (const patch of [
  { id: 2 },
  { audience: "blocked" },
  { patientId: 1 },
  { doctorId: 2 },
  { companyId: 1 },
  { roles: ["Otro rol médico"] },
  { permissions: ["patients.read"] },
]) assert.notEqual(accessKey(session), accessKey({ ...session, ...patch }), "El cambio de autorización debe cambiar la caché y el espacio: " + JSON.stringify(patch));
assert.equal(accessKey({ ...session, roles: ["A", "B"] }), accessKey({ ...session, roles: ["B", "A"] }));
console.log("✓ Contexto de acceso: caché separada por identidad, tipo, asociaciones, roles y permisos; orden estable y sin mutaciones.");
