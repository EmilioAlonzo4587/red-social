"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/avatar";
import { cloudinaryImageUrl } from "@/lib/media";

// Si no hay foto, el círculo con iniciales no tiene nada que ampliar.
export function ProfileAvatar({
  name,
  avatarPublicId,
}: {
  name: string;
  avatarPublicId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setExpanded(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expanded]);

  if (!avatarPublicId) {
    return <Avatar name={name} size="lg" />;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label={`Ver la foto de perfil de ${name} más grande`}
        className="rounded-full outline-primary"
      >
        <Avatar name={name} avatarPublicId={avatarPublicId} size="lg" />
      </button>

      {expanded && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Foto de perfil de ${name}`}
          onClick={() => setExpanded(false)}
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4"
        >
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label="Cerrar"
            className="absolute right-4 top-4 text-3xl text-white"
          >
            ×
          </button>
          <div className="relative h-[min(80vh,80vw)] w-[min(80vh,80vw)]">
            <Image
              src={cloudinaryImageUrl(avatarPublicId)}
              alt={`Foto de perfil de ${name}`}
              fill
              sizes="80vw"
              className="rounded-md object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}
