import { useLayoutEffect, useRef } from "react";

type TextField = HTMLInputElement | HTMLTextAreaElement;

/**
 * Inserta un emoji en la posición del cursor de un input o textarea controlado
 * (S4-10): reemplaza lo seleccionado y deja el cursor justo después del emoji. El
 * campo conserva su selección aunque el foco esté en el panel de emojis.
 *
 * `insert` devuelve false (sin cambiar nada) si el texto pasaría de `maxLength`,
 * contado como String.length: igual que el `maxLength` del campo y la api.
 */
export function useEmojiInsert<T extends TextField>(
  value: string,
  setValue: (next: string) => void,
  maxLength: number,
) {
  const ref = useRef<T | null>(null);
  const pendingCaretRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const caret = pendingCaretRef.current;
    if (caret === null) return;
    pendingCaretRef.current = null;
    ref.current?.setSelectionRange(caret, caret);
  }, [value]);

  function insert(emoji: string): boolean {
    const field = ref.current;
    const start = field?.selectionStart ?? value.length;
    const end = field?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    if (next.length > maxLength) return false;
    pendingCaretRef.current = start + emoji.length;
    setValue(next);
    return true;
  }

  return { ref, insert };
}
