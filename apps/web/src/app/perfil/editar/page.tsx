"use client";

import { useState } from "react";
import { Avatar } from "@/components/avatar";

const BIO_MAX = 300;
const DISPLAY_NAME_MAX = 80;

export default function EditarPerfilPage() {
  const [displayName, setDisplayName] = useState("Ana García");
  const [bio, setBio] = useState(
    "Estudiante de ingeniería, apasionada por el café y las caminatas de fin de semana.",
  );
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarPreview(URL.createObjectURL(file));
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-6">
      <h1 className="text-2xl font-bold">Editar perfil</h1>

      <form method="post" className="mt-6 flex flex-col gap-6">
        <div className="flex items-center gap-4">
          {avatarPreview ? (
            // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) antes de subir el archivo
            <img
              src={avatarPreview}
              alt="Vista previa del avatar"
              className="h-20 w-20 rounded-full object-cover"
            />
          ) : (
            <Avatar name={displayName || "?"} size="lg" />
          )}

          <label className="cursor-pointer text-sm font-medium text-primary hover:underline">
            Cambiar foto
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </label>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="displayName" className="text-sm font-medium">
            Nombre visible
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            maxLength={DISPLAY_NAME_MAX}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="rounded-md border border-border px-3 py-2 outline-primary"
          />
          <p className="text-right text-xs text-muted">
            {displayName.length}/{DISPLAY_NAME_MAX}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="bio" className="text-sm font-medium">
            Biografía
          </label>
          <textarea
            id="bio"
            name="bio"
            rows={4}
            maxLength={BIO_MAX}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="resize-none rounded-md border border-border px-3 py-2 outline-primary"
          />
          <p className="text-right text-xs text-muted">
            {bio.length}/{BIO_MAX}
          </p>
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-primary-hover"
        >
          Guardar cambios
        </button>
      </form>
    </main>
  );
}
