import type { NotificationDto } from "@red/api-types";

export const SOUND_MUTE_STORAGE_KEY = "chatinit:notifications-muted";
export const SOUND_THROTTLE_MS = 2000;

type MuteListener = (muted: boolean) => void;
const muteListeners = new Set<MuteListener>();

let lastSoundAt = -Infinity;
let sharedAudioContext: AudioContext | null = null;

export function isNotificationSoundMuted(): boolean {
  try {
    return window.localStorage.getItem(SOUND_MUTE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setNotificationSoundMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(SOUND_MUTE_STORAGE_KEY, muted ? "1" : "0");
  } catch {
    // Si localStorage está bloqueado, igual avisa a los componentes en memoria.
  }
  for (const listener of muteListeners) {
    listener(muted);
  }
}

export function subscribeSoundMuted(listener: MuteListener): () => void {
  muteListeners.add(listener);
  return () => {
    muteListeners.delete(listener);
  };
}

export function resetNotificationSoundState(): void {
  lastSoundAt = -Infinity;
  sharedAudioContext = null;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (sharedAudioContext) return sharedAudioContext;
  const AudioCtx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;
  sharedAudioContext = new AudioCtx();
  return sharedAudioContext;
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  peakGain: number,
  type: OscillatorType = "sine",
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

// Campanita: me gusta y seguidores
function playBellChime(ctx: AudioContext, now: number): void {
  playTone(ctx, 880, now, 0.35, 0.14, "sine");
  playTone(ctx, 1760, now, 0.25, 0.06, "triangle");
}

// Doble nota ascendente: comentarios y mensajes
function playDoubleNote(ctx: AudioContext, now: number): void {
  playTone(ctx, 587.33, now, 0.12, 0.12, "sine");
  playTone(ctx, 880, now + 0.11, 0.22, 0.14, "sine");
}

/**
 * Reproduce el sonido de la notificación con Web Audio (S4-11, D11):
 * - Campanita para like y follow
 * - Doble nota para comment y message
 * Máximo uno cada 2 s. Devuelve true si sonó y false si estaba silenciado, bloqueado o en espera.
 */
export function playNotificationSound(
  type: NotificationDto["type"],
  now = Date.now(),
): boolean {
  if (isNotificationSoundMuted()) return false;
  if (now - lastSoundAt < SOUND_THROTTLE_MS) return false;

  try {
    const ctx = getAudioContext();
    if (!ctx) return false;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    const startAt = ctx.currentTime;
    if (type === "like" || type === "follow") {
      playBellChime(ctx, startAt);
    } else {
      playDoubleNote(ctx, startAt);
    }
    lastSoundAt = now;
    return true;
  } catch {
    return false;
  }
}
