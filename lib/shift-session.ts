/**
 * The kitchen tablet's shift, as this one device remembers it.
 *
 * A shift is not an entity in the database and deliberately so: it says
 * nothing about the restaurant, only about THIS screen — that someone tapped
 * it, so the browser now lets us play the alarm and keep the display awake.
 * Two tablets in the same kitchen have two independent shifts.
 *
 * What the owner asked for is that the shift survives leaving the board:
 * before this, "Начало на смяната" was component state, so a trip to Табло and
 * back silently dropped the shift and the tablet went quiet. Hence localStorage
 * for the flag and a module-level `AudioContext` for the sound.
 *
 * The module scope matters. A client-side navigation inside the admin panel
 * never reloads the document, so the context created by the tap keeps living
 * here while the board unmounts and remounts — the browser's audio permission
 * travels with it. Only a real page reload (F5, or the tablet waking up on a
 * dead tab) starts over, and that case is handled in the board: the stored
 * shift comes back, the context does not, and the staff get a loud prompt to
 * tap once more.
 *
 * Client-only — every entry point guards `typeof window` so importing it from
 * a component that also renders on the server is safe.
 */
import { toSofiaDateString } from "./report-period";

const STORAGE_KEY = "pp-shift";

/** What we keep between visits. The day is what expires it. */
interface StoredShift {
  /** ISO instant of the tap that started it. */
  startedAt: string;
  /** Sofia calendar day of that tap, "YYYY-MM-DD". */
  day: string;
}

/**
 * A shift never legitimately crosses midnight — the settings validator rejects
 * opening hours with `from >= to`, so no day's window runs into the next one.
 * That makes "started on another calendar day" a safe way to drop a shift the
 * tablet was left in when it was switched off mid-evening, without waiting for
 * a poll to notice the shop is closed.
 */
function isStale(shift: StoredShift, now: Date): boolean {
  return shift.day !== toSofiaDateString(now);
}

/** The stored shift if it is still today's, else null (and it is cleared). */
export function readStoredShift(now: Date = new Date()): StoredShift | null {
  if (typeof window === "undefined") return null;

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private mode / storage disabled — the shift simply does not persist.
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredShift>;
    if (typeof parsed?.startedAt !== "string" || typeof parsed?.day !== "string") {
      clearStoredShift();
      return null;
    }
    const shift: StoredShift = { startedAt: parsed.startedAt, day: parsed.day };
    if (isStale(shift, now)) {
      clearStoredShift();
      return null;
    }
    return shift;
  } catch {
    clearStoredShift();
    return null;
  }
}

/** Remembers that the shift is on. Returns what was stored. */
export function storeShift(now: Date = new Date()): StoredShift {
  const shift: StoredShift = { startedAt: now.toISOString(), day: toSofiaDateString(now) };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(shift));
  } catch {
    // Not fatal: the shift still runs, it just will not survive a reload.
  }
  return shift;
}

export function clearStoredShift(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — a shift we cannot forget is better than a crash.
  }
}

// ── The alarm's audio permission ────────────────────────────────────────────

/**
 * One context per document, kept outside React so remounting the board does
 * not throw away the permission the staff already granted.
 */
let audioContext: AudioContext | null = null;

type AudioCtor = typeof AudioContext;

function audioCtor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext ??
    null
  );
}

/**
 * Creates or resumes the context. MUST be called from a real user gesture the
 * first time — that is the whole reason the start button exists. Calling it
 * again later (e.g. from the "звукът е спрян" prompt) is harmless.
 */
export function unlockAudio(): AudioContext | null {
  const Ctor = audioCtor();
  if (!Ctor) return null;

  if (!audioContext || audioContext.state === "closed") {
    try {
      audioContext = new Ctor();
    } catch {
      return null;
    }
  }
  void audioContext.resume().catch(() => {});
  return audioContext;
}

/** The live context, or null when nobody has unlocked audio yet. */
export function getAudioContext(): AudioContext | null {
  return audioContext && audioContext.state !== "closed" ? audioContext : null;
}

/** True only when a sound started right now would actually be heard. */
export function isAudioRunning(): boolean {
  return audioContext?.state === "running";
}

/** Ends the shift's hold on the speaker. Safe to call twice. */
export function releaseAudio(): void {
  const ctx = audioContext;
  audioContext = null;
  if (!ctx || ctx.state === "closed") return;
  void ctx.close().catch(() => {});
}
