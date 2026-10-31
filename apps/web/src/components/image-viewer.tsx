"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cloudinaryImageUrl } from "@/lib/media";
import { mediaBoxStyle } from "@/lib/media-box";

export interface ViewerImage {
  publicId: string;
  width: number;
  height: number;
  alt: string;
}

const ICONS = {
  close: "M18 6L6 18M6 6l12 12",
  prev: "M15 18l-6-6 6-6",
  next: "M9 18l6-6-6-6",
};

function Icon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
      className="h-6 w-6"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

const CONTROL_CLASS =
  "flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 outline-white";

/**
 * Visor a pantalla completa de las imágenes de una publicación (S4-15). Muestra la
 * imagen entera, sin pasar de su tamaño real. Se cierra con ✕, Escape o un clic fuera
 * de la imagen; con varias, flechas del teclado o botones. Quien lo abre le devuelve el
 * foco a la imagen al cerrarlo.
 */
export function ImageViewer({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: ViewerImage[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const total = images.length;
  const image = images[index];

  // Las teclas leen siempre la versión actual sin volver a registrar el listener
  const latest = useRef({ index, total, onIndexChange, onClose });
  useEffect(() => {
    latest.current = { index, total, onIndexChange, onClose };
  });

  useEffect(() => {
    closeRef.current?.focus();
    // La página de fondo no se desplaza mientras el visor está abierto
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      const { index, total, onIndexChange, onClose } = latest.current;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowLeft" && total > 1) {
        event.preventDefault();
        onIndexChange((index - 1 + total) % total);
      } else if (event.key === "ArrowRight" && total > 1) {
        event.preventDefault();
        onIndexChange((index + 1) % total);
      } else if (event.key === "Tab") {
        // El foco no sale del visor
        const focusable =
          dialogRef.current?.querySelectorAll<HTMLElement>("button");
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (!image) return null;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={
        total > 1 ? `Imagen ${index + 1} de ${total}` : "Imagen ampliada"
      }
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="image-viewer fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
    >
      <div
        className="relative overflow-hidden rounded-lg"
        style={mediaBoxStyle(image, "92vw", "85dvh")}
      >
        <Image
          key={image.publicId}
          src={cloudinaryImageUrl(image.publicId)}
          alt={image.alt}
          fill
          sizes="92vw"
          className="object-contain"
        />
      </div>

      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Cerrar imagen"
        className={`absolute top-4 right-4 ${CONTROL_CLASS}`}
      >
        <Icon path={ICONS.close} />
      </button>

      {total > 1 && (
        <>
          <button
            type="button"
            onClick={() => onIndexChange((index - 1 + total) % total)}
            aria-label="Imagen anterior"
            className={`absolute top-1/2 left-3 -translate-y-1/2 ${CONTROL_CLASS}`}
          >
            <Icon path={ICONS.prev} />
          </button>
          <button
            type="button"
            onClick={() => onIndexChange((index + 1) % total)}
            aria-label="Imagen siguiente"
            className={`absolute top-1/2 right-3 -translate-y-1/2 ${CONTROL_CLASS}`}
          >
            <Icon path={ICONS.next} />
          </button>
          <p
            aria-live="polite"
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm text-white tabular-nums"
          >
            {index + 1} de {total}
          </p>
        </>
      )}
    </div>,
    document.body,
  );
}
