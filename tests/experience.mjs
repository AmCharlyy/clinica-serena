import assert from "node:assert/strict";
import { configureFeedback, defaultPreferences, parsePreferences, playFeedback, unlockFeedback } from "../frontend/src/feedback.ts";
import { api, ApiError, dateTime, refreshCsrf } from "../frontend/src/api.ts";

const nodes = [], gains = [];
let opened = 0;
class AudioFixture {
  state = "running"; currentTime = 0; destination = {};
  constructor() { opened++; }
  resume() { return Promise.resolve(); }
  createOscillator() {
    const node = { frequency: {}, type: "", started: false, stopped: false, connect() {}, disconnect() {}, start() { this.started = true; }, stop() { this.stopped = true; this.onended?.(); } };
    nodes.push(node); return node;
  }
  createGain() { return { connect() {}, disconnect() {}, gain: { setValueAtTime(value) { gains.push(value); }, linearRampToValueAtTime(value) { gains.push(value); }, exponentialRampToValueAtTime(value) { gains.push(value); } } }; }
}
globalThis.AudioContext = AudioFixture;
globalThis.window = { AudioContext: AudioFixture };
globalThis.document = { hidden: false };

assert.deepEqual(parsePreferences(null), defaultPreferences);
assert.deepEqual(parsePreferences({ sound: "yes", volume: Infinity, notifications: false, reducedMotion: true, password: "not-a-preference" }), { ...defaultPreferences, notifications: false, reducedMotion: true });
assert.equal(parsePreferences({ volume: -1 }).volume, 0);
assert.equal(parsePreferences({ volume: 120 }).volume, 100);
configureFeedback(defaultPreferences);
assert.equal(playFeedback("notification"), false, "No autoplay before a user gesture");
assert.equal(opened, 0);
unlockFeedback();
assert.equal(playFeedback("success", true), true);
assert.equal(nodes.filter(node => node.started).length, 3);
assert(gains.every(gain => gain >= 0 && gain <= .026001), "Default sound remains quiet");
assert.equal(playFeedback("success"), false, "Rapid duplicate feedback is suppressed");
const initialNodes = nodes.length;
configureFeedback({ ...defaultPreferences, sound: false });
assert(nodes.every(node => node.stopped), "Muting stops the current cue too");
assert.equal(playFeedback("warning", true), false);
assert.equal(nodes.length, initialNodes);
configureFeedback({ ...defaultPreferences, volume: 0 });
assert.equal(playFeedback("success", true), false);
configureFeedback({ ...defaultPreferences, notifications: false });
assert.equal(playFeedback("notification", true), false);
assert.equal(playFeedback("error", true), true);
document.hidden = true;
assert.equal(playFeedback("warning", true), false, "Hidden tabs remain silent");
document.hidden = false;
assert.equal(dateTime("2026-10-04T02:30:00"), dateTime("2026-10-04T02:30:00Z"));
assert.equal(dateTime("invalid"), "—");

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(api("auth/me"), error => error instanceof ApiError && error.status === 0 && error.message.includes("conectar"));
  globalThis.fetch = async () => new Response(JSON.stringify({ token: "test-csrf" }), { headers: { "content-type": "application/json" } });
  await refreshCsrf();
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(api("patients", "POST", {}), error => error.status === 0 && error.message.includes("antes de repetirla"));
  globalThis.fetch = async () => new Response("{}", { status: 401, headers: { "content-type": "application/json" } });
  await assert.rejects(api("auth/me"), error => error.status === 401, "Authentication and connection failures stay distinct");
} finally { globalThis.fetch = originalFetch; }
console.log("✓ Preferencias validadas; audio por interacción, volumen, silencio, avisos y pestañas ocultas; fechas locales y errores de conexión diferenciados.");
