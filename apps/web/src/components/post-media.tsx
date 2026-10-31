"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import type { MediaDto } from "@red/api-types";
import { ImageViewer } from "@/components/image-viewer";
import { cloudinaryImageUrl } from "@/lib/media";
import { mediaBoxStyle } from "@/lib/media-box";

// Una sola imagen no pasa de este alto, para que una foto muy vertical no ocupe toda la pantalla
const SINGLE_MAX_HEIGHT = "32rem";

function imageAlt(index: number, total: number, authorName: string): string {
  return total === 1
    ? `Imagen de la publicación de ${authorName}`
    : `Imagen ${index + 1} de ${total} de la publicación de ${authorName}`;
}

/**
 * Imágenes de una publicación (S4-15): cada una se ve completa, con su proporción real
 * y sin estirarse; el sobrante queda con el fondo surface. Con detailHref (feed y
 * perfiles) tocarla lleva a la publicación; sin él (ya en /p/[id]) abre el visor (S4-16).
 */
export function PostMedia({
  media,
  authorName,
  detailHref,
}: {
  media: MediaDto[];
  authorName: string;
  detailHref?: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  if (media.length === 0) return null;

  const images = media.map((item, index) => ({
    publicId: item.publicId,
    width: item.width,
    height: item.height,
    alt: imageAlt(index, media.length, authorName),
  }));
  const single = media.length === 1;

  function close() {
    const index = openIndex;
    setOpenIndex(null);
    // Al cerrar, el foco vuelve a la imagen que se estaba viendo
    if (index !== null) buttonsRef.current[index]?.focus();
  }

  return (
    <>
      <div
        className={`mt-1 grid gap-1 ${single ? "grid-cols-1" : "grid-cols-2"}`}
      >
        {images.map((image, index) => {
          const frameClass = `flex items-center justify-center overflow-hidden rounded-xl bg-surface ${
            single ? "" : "aspect-[4/3] [container-type:size]"
          }`;
          const picture = (
            <span
              className="relative block"
              style={
                single
                  ? mediaBoxStyle(image, "100%", SINGLE_MAX_HEIGHT)
                  : mediaBoxStyle(image, "100cqw", "100cqh")
              }
            >
              {/* Antes alt="": el lector de pantalla se saltaba las fotos (S4-06). No
                  se sabe qué muestran, pero sí que existen y de quién son. */}
              <Image
                src={cloudinaryImageUrl(image.publicId)}
                alt={image.alt}
                fill
                sizes={
                  single ? "(max-width: 640px) 100vw, 576px" : "(max-width: 640px) 50vw, 288px"
                }
                className="object-contain"
              />
            </span>
          );
          const lowerAlt = `${image.alt.charAt(0).toLowerCase()}${image.alt.slice(1)}`;

          return detailHref ? (
            <Link
              key={image.publicId}
              href={detailHref}
              aria-label={`Abrir la publicación (${lowerAlt})`}
              className={frameClass}
            >
              {picture}
            </Link>
          ) : (
            <button
              key={image.publicId}
              ref={(element) => {
                buttonsRef.current[index] = element;
              }}
              type="button"
              onClick={() => setOpenIndex(index)}
              aria-label={`Ver ${lowerAlt}`}
              className={`${frameClass} cursor-zoom-in`}
            >
              {picture}
            </button>
          );
        })}
      </div>

      {openIndex !== null && (
        <ImageViewer
          images={images}
          index={openIndex}
          onIndexChange={setOpenIndex}
          onClose={close}
        />
      )}
    </>
  );
}
