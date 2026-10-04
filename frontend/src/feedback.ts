export type FeedbackTone = "success" | "error" | "notification" | "warning";
export type Preferences = {
  sound: boolean;
  volume: number;
  notifications: boolean;
  reducedMotion: boolean;
};
export const defaultPreferences: Preferences = {
  sound: true,
  volume: 20,
  notifications: true,
  reducedMotion: false,
};

export function parsePreferences(value: unknown): Preferences {
  const p =
    value && typeof value === "object" ? (value as Partial<Preferences>) : {};
  return {
    sound: typeof p.sound === "boolean" ? p.sound : defaultPreferences.sound,
    volume:
      typeof p.volume === "number" && Number.isFinite(p.volume)
        ? Math.max(0, Math.min(100, p.volume))
        : defaultPreferences.volume,
    notifications:
      typeof p.notifications === "boolean"
        ? p.notifications
        : defaultPreferences.notifications,
    reducedMotion:
      typeof p.reducedMotion === "boolean"
        ? p.reducedMotion
        : defaultPreferences.reducedMotion,
  };
}

let preferences = { ...defaultPreferences, sound: false };
let context: AudioContext | undefined;
let lastPlayed = 0;
const active = new Set<OscillatorNode>();
export function configureFeedback(value: Preferences) {
  preferences = value;
  if (!value.sound || value.volume === 0) stopFeedback();
}
export function stopFeedback() {
  active.forEach((node) => {
    try {
      node.stop();
    } catch {
      /* Already ended. */
    }
  });
  active.clear();
}
export function unlockFeedback() {
  if (
    !preferences.sound ||
    typeof window === "undefined" ||
    !window.AudioContext
  )
    return;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume().catch(() => {});
  } catch {
    /* Audio is optional; the visual feedback remains available. */
  }
}
export function playFeedback(tone: FeedbackTone, preview = false): boolean {
  if (
    !preferences.sound ||
    !preferences.volume ||
    typeof document === "undefined" ||
    document.hidden ||
    (tone === "notification" && !preferences.notifications)
  )
    return false;
  if (preview) unlockFeedback();
  if (
    !context ||
    context.state !== "running" ||
    (!preview && Date.now() - lastPlayed < 900)
  )
    return false;
  lastPlayed = Date.now();
  try {
    // Soft sine tones with short attacks and long fades, generated entirely offline.
    const notes: Record<FeedbackTone, [number, number][]> = {
      success: [
        [523.25, 0],
        [659.25, 0.09],
        [783.99, 0.17],
      ],
      notification: [
        [659.25, 0],
        [880, 0.13],
      ],
      error: [
        [392, 0],
        [329.63, 0.13],
      ],
      warning: [
        [440, 0],
        [523.25, 0.16],
      ],
    };
    for (const [frequency, delay] of notes[tone]) {
      const start = context.currentTime + delay,
        oscillator = context.createOscillator(),
        gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(
        (preferences.volume / 100) * 0.13,
        start + 0.016,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.26);
      gain.gain.setValueAtTime(0, start + 0.28);
      oscillator.connect(gain);
      gain.connect(context.destination);
      active.add(oscillator);
      oscillator.onended = () => {
        active.delete(oscillator);
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(start + 0.29);
    }
    return true;
  } catch {
    return false;
  }
}
