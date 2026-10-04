import { createHmac } from "node:crypto";
import assert from "node:assert/strict";

// Independent standards-based OTP client, used only against isolated test databases.
const factors = new Map();
export function totp(secret, timestamp = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.replace(/=+$/, "")) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes = Buffer.from(bits.match(/.{8}/g).map(byte => parseInt(byte, 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(timestamp / 30000)));
  const hash = createHmac("sha1", bytes).update(counter).digest(), offset = hash.at(-1) & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0");
}
export async function completeTestLogin(client, session, password) {
  client.password = password; client.session = session;
  if (session.authStage === "enrollment") {
    const enrollment = await client.call("auth/mfa/enroll", "POST");
    const result = await client.call("auth/mfa/confirm", "POST", { code: totp(enrollment.manualKey) });
    factors.set(session.username, { secret: enrollment.manualKey, codes: result.recoveryCodes }); session = result.session;
  } else if (session.authStage === "mfa") {
    const factor = factors.get(session.username); assert(factor?.codes.length, "El test necesita su factor previamente configurado.");
    session = await client.call("auth/mfa/verify", "POST", { code: factor.codes.shift() });
  }
  client.session = session; client.csrf = (await client.call("auth/csrf")).token; return session;
}
export async function reauthenticateTest(client) {
  const factor = factors.get(client.session?.username);
  assert(!client.session?.mfaEnabled || factor?.codes.length, "El test necesita códigos de recuperación.");
  await client.call("auth/reauth", "POST", { password: client.password, code: factor?.codes.shift() });
}
