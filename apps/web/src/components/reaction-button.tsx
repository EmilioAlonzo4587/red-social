"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactionType } from "@red/api-types";
import { REACTIONS, reactionInfo } from "@/lib/reactions";

const HOVER_OPEN_MS = 350;
const HOVER_CLOSE_MS = 250;
const LONG_PRESS_MS = 450;

// Un clic da Me gusta o quita la reacción. Pasar el mouse o mantener presionado en el
// celular abre las 6; con teclado se abren desde "Elegir reacción", que aparece al enfocarlo.
export function ReactionButton({
  myReaction,
  onSelect,
  onRemove,
}: {
  myReaction: ReactionType | null;
  onSelect: (reaction: ReactionType) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // El clic que llega al soltar un toque largo no debe contar como reacción
  const skipClickRef = useRef(false);

  function clearTimer() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function schedule(callback: () => void, ms: number) {
    clearTimer();
    timerRef.current = setTimeout(callback, ms);
  }

  useEffect(() => clearTimer, []);

  // En el celular no hay "quitar el mouse": un toque afuera lo cierra
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function handleMainClick() {
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }
    clearTimer();
    setOpen(false);
    if (myReaction) onRemove();
    else onSelect("like");
  }

  function choose(reaction: ReactionType) {
    clearTimer();
    setOpen(false);
    if (reaction === myReaction) onRemove();
    else onSelect(reaction);
    openerRef.current?.focus();
  }

  const current = reactionInfo(myReaction ?? "like");

  return (
    <div
      ref={containerRef}
      className="relative flex items-center"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") {
          schedule(() => setOpen(true), HOVER_OPEN_MS);
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") {
          schedule(() => setOpen(false), HOVER_CLOSE_MS);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          openerRef.current?.focus();
        }
      }}
    >
      {open && (
        <div
          role="group"
          aria-label="Reacciones"
          className="absolute bottom-full left-0 z-10 mb-2 flex gap-1 rounded-full border border-border bg-background px-2 py-1.5 shadow-lg"
        >
          {REACTIONS.map((reaction) => (
            <button
              key={reaction.type}
              type="button"
              onClick={() => choose(reaction.type)}
              aria-label={reaction.label}
              aria-pressed={reaction.type === myReaction}
              title={reaction.label}
              className={`flex h-9 w-9 items-center justify-center rounded-full text-xl motion-safe:transition-transform motion-safe:hover:scale-125 ${
                reaction.type === myReaction ? "bg-surface" : ""
              }`}
            >
              <span aria-hidden="true">{reaction.emoji}</span>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={handleMainClick}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse") return;
          skipClickRef.current = false;
          schedule(() => {
            skipClickRef.current = true;
            setOpen(true);
          }, LONG_PRESS_MS);
        }}
        onPointerUp={(event) => {
          if (event.pointerType !== "mouse") clearTimer();
        }}
        onPointerCancel={clearTimer}
        onContextMenu={(event) => {
          // Android abre el menú del navegador al mantener presionado
          if (skipClickRef.current || open) event.preventDefault();
        }}
        aria-pressed={myReaction !== null}
        aria-label={
          myReaction
            ? `Quitar tu reacción: ${current.label}`
            : "Reaccionar con Me gusta"
        }
        className={`tap-area touch-manipulation select-none ${
          myReaction
            ? "font-semibold text-primary"
            : "text-muted hover:text-primary"
        }`}
      >
        <span aria-hidden="true">{current.emoji}</span> {current.label}
      </button>

      <button
        ref={openerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        // Solo para teclado: se ve con focus-visible (Tab), no con focus. El código le
        // devuelve el foco al elegir una reacción, y con focus el texto aparecía tras
        // tocar con el dedo o el mouse.
        className="sr-only focus-visible:not-sr-only focus-visible:ml-2 focus-visible:text-primary focus-visible:underline"
      >
        Elegir reacción
      </button>
    </div>
  );
}
