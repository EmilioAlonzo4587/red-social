export const SOUND_MUTE_STORAGE_KEY = "chatinit:notifications-muted";

type MuteListener = (muted: boolean) => void;
const muteListeners = new Set<MuteListener>();

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

// Campanita de la muestra aprobada en la issue S4-11 (#125): Mi6 con su octava, que se
// apaga antes. Desde S4-15 es el único sonido, para todas las notificaciones y los mensajes.
function playBellChime(ctx: AudioContext, now: number): void {
  playTone(ctx, 1318.5, now, 0.42, 0.1, "sine");
  playTone(ctx, 2637, now, 0.22, 0.03, "sine");
}

/**
 * Reproduce el sonido de notificación con Web Audio (S4-11, D11), el mismo para todo
 * tipo de aviso (S4-15). Suena con cada aviso, sin espera entre uno y otro (S4-15).
 * Devuelve true si sonó y false si estaba silenciado o bloqueado.
 */
export function playNotificationSound(): boolean {
  if (isNotificationSoundMuted()) return false;

  try {
    const ctx = getAudioContext();
    if (!ctx) return false;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    const startAt = ctx.currentTime;
    playBellChime(ctx, startAt);
    return true;
  } catch {
    return false;
  }
}
