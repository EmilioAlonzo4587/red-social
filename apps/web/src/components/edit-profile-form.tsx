"use client";

import { useState } from "react";
import Link from "next/link";
import type { MeDto, UpdateMeDto } from "@red/api-types";
import { Avatar } from "@/components/avatar";
import { apiFetchClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";
import { fieldErrorsFromDetails } from "@/lib/api-field-errors";
import { uploadMedia, validateImageFile } from "@/lib/media";

const DISPLAY_NAME_MAX = 80;
const BIO_MAX = 300;

type FormErrors = {
  displayName?: string;
  bio?: string;
  avatarPublicId?: string;
  general?: string;
};

function uploadErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.statusCode === 413) return "Pasa de 5 MB.";
    if (error.statusCode === 400) return "Tipo de archivo no permitido.";
    return error.message;
  }
  return "No se pudo subir la imagen.";
}

export function EditProfileForm({ me }: { me: MeDto }) {
  const [displayName, setDisplayName] = useState(me.displayName ?? "");
  const [bio, setBio] = useState(me.bio ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(
    null,
  );
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const hasCurrentAvatar = me.avatarPublicId !== null && !avatarRemoved;
  const canRemove = avatarPreviewUrl !== null || hasCurrentAvatar;

  function clearPreview() {
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    setAvatarFile(null);
    setAvatarPreviewUrl(null);
  }

  function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setSuccess(false);
    const error = validateImageFile(file);
    if (error) {
      setErrors((prev) => ({ ...prev, avatarPublicId: error }));
      return;
    }
    setErrors((prev) => ({ ...prev, avatarPublicId: undefined }));
    clearPreview();
    setAvatarFile(file);
    setAvatarPreviewUrl(URL.createObjectURL(file));
    setAvatarRemoved(false);
  }

  function handleRemoveAvatar() {
    setSuccess(false);
    clearPreview();
    setAvatarRemoved(true);
    setErrors((prev) => ({ ...prev, avatarPublicId: undefined }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setSubmitting(true);

    const body: UpdateMeDto = { displayName, bio };

    if (avatarFile) {
      try {
        const media = await uploadMedia(avatarFile);
        body.avatarPublicId = media.publicId;
      } catch (error) {
        setErrors({ avatarPublicId: uploadErrorMessage(error) });
        setSubmitting(false);
        return;
      }
    } else if (avatarRemoved) {
      body.avatarPublicId = null;
    }

    try {
      await apiFetchClient<MeDto>("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      clearPreview();
      setAvatarRemoved(false);
      setSuccess(true);
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 400) {
        setErrors(fieldErrorsFromDetails(error.details));
      } else {
        setErrors({
          general:
            error instanceof ApiError
              ? error.message
              : "No se pudo guardar. Intenta de nuevo.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="mt-6 flex flex-col gap-6"
    >
      {errors.general && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {errors.general}
        </p>
      )}
      {success && (
        <p className="rounded-md bg-surface px-3 py-2 text-sm text-primary">
          Perfil actualizado.
        </p>
      )}

      <div className="flex items-center gap-4">
        {avatarPreviewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) antes de subir el archivo
          <img
            src={avatarPreviewUrl}
            alt="Vista previa del avatar"
            className="h-20 w-20 rounded-full object-cover"
          />
        ) : (
          <Avatar
            name={displayName || me.username}
            avatarPublicId={hasCurrentAvatar ? me.avatarPublicId : null}
            size="lg"
          />
        )}

        <div className="flex flex-col items-start gap-1">
          <label className="cursor-pointer text-sm font-medium text-primary hover:underline">
            Cambiar foto
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={submitting}
              onChange={handleAvatarChange}
            />
          </label>
          {canRemove && (
            <button
              type="button"
              onClick={handleRemoveAvatar}
              disabled={submitting}
              className="text-sm text-muted hover:underline"
            >
              Quitar foto
            </button>
          )}
          {errors.avatarPublicId && (
            <p className="text-xs text-red-600">{errors.avatarPublicId}</p>
          )}
        </div>
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
          onChange={(event) => {
            setDisplayName(event.target.value);
            setSuccess(false);
          }}
          aria-invalid={Boolean(errors.displayName)}
          className="rounded-md border border-border px-3 py-2 outline-primary"
        />
        <div className="flex justify-between text-xs">
          <span className="text-red-600">{errors.displayName}</span>
          <span className="text-muted">
            {displayName.length}/{DISPLAY_NAME_MAX}
          </span>
        </div>
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
          onChange={(event) => {
            setBio(event.target.value);
            setSuccess(false);
          }}
          aria-invalid={Boolean(errors.bio)}
          className="resize-none rounded-md border border-border px-3 py-2 outline-primary"
        />
        <div className="flex justify-between text-xs">
          <span className="text-red-600">{errors.bio}</span>
          <span className="text-muted">
            {bio.length}/{BIO_MAX}
          </span>
        </div>
      </div>

      <div className="flex gap-3">
        <Link
          href={`/u/${me.username}`}
          className="flex-1 rounded-md border border-border px-4 py-2 text-center font-medium hover:bg-surface"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
