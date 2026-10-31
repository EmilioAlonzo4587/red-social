import type { KeyboardEvent } from "react";

/**
 * Enter envía el formulario del cuadro de texto y Shift+Enter hace un salto de línea
 * (S4-16). No envía mientras un método de entrada (IME) está componiendo un carácter: ahí
 * Enter confirma la composición. requestSubmit pasa por el onSubmit del formulario, que ya
 * descarta un comentario vacío o un envío en curso.
 */
export function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>): void {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
    return;
  }
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}
