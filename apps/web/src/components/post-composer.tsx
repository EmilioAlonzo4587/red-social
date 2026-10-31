"use client";

import { useRef, useState } from "react";
import type { CreatePostDto, PostDto } from "@red/api-types";
import { apiFetchClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";
import { uploadMedia, validateImageFile } from "@/lib/media";

// RN03: texto hasta 2000, al menos texto o imagen, hasta 4 imágenes jpeg/png/webp de 5 MB.
export const MAX_CONTENT_LENGTH = 2000;
export const MAX_IMAGES = 4;

type ImageStatus = "pendiente" | "subiendo" | "lista" | "error";

type ComposerImage = {
  id: string;
  file: File;
  previewUrl: string;
  status: ImageStatus;
  error: string | null;
};

function uploadErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.statusCode === 413) return "Pasa de 5 MB.";
    if (error.statusCode === 400) return "Tipo de archivo no permitido.";
    return error.message;
  }
  return "No se pudo subir la imagen.";
}

export function PostComposer({
  onPosted,
}: {
  onPosted?: (post: PostDto) => void;
}) {
  const [content, setContent] = useState("");
  const [images, setImages] = useState<ComposerImage[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canAddMore = images.length < MAX_IMAGES;
  const hasImageError = images.some((image) => image.error !== null);
  const canSubmit =
    !submitting &&
    (content.trim().length > 0 || images.length > 0) &&
    !hasImageError;

  function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setSuccess(false);
    const files = Array.from(fileList).slice(0, MAX_IMAGES - images.length);
    const next: ComposerImage[] = files.map((file) => ({
      id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      status: "pendiente",
      error: validateImageFile(file),
    }));
    setImages((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeImage(id: string) {
    setImages((prev) => {
      const target = prev.find((image) => image.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((image) => image.id !== id);
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setGeneralError(null);
    setSubmitting(true);

    const uploaded: { publicId: string; width: number; height: number }[] = [];
    let failed = false;

    for (const image of images) {
      setImages((prev) =>
        prev.map((img) =>
          img.id === image.id ? { ...img, status: "subiendo" } : img,
        ),
      );
      try {
        const media = await uploadMedia(image.file);
        // CreatePostDto solo acepta publicId, width y height (no mediaType):
        // el ValidationPipe global rechaza cualquier campo de más.
        uploaded.push({
          publicId: media.publicId,
          width: media.width,
          height: media.height,
        });
        setImages((prev) =>
          prev.map((img) =>
            img.id === image.id ? { ...img, status: "lista" } : img,
          ),
        );
      } catch (error) {
        failed = true;
        const message = uploadErrorMessage(error);
        setImages((prev) =>
          prev.map((img) =>
            img.id === image.id
              ? { ...img, status: "error", error: message }
              : img,
          ),
        );
        break;
      }
    }

    if (failed) {
      setSubmitting(false);
      return;
    }

    try {
      const post = await apiFetchClient<PostDto>("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim() || null,
          media: uploaded,
        } satisfies CreatePostDto),
      });
      for (const image of images) URL.revokeObjectURL(image.previewUrl);
      setContent("");
      setImages([]);
      setSuccess(true);
      onPosted?.(post);
    } catch (error) {
      setGeneralError(
        error instanceof ApiError
          ? error.message
          : "No se pudo publicar. Intenta de nuevo.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="flex flex-col gap-2.5 rounded-xl border border-border p-3 focus-within:border-primary"
    >
      <label htmlFor="post-content" className="sr-only">
        ¿Qué estás pensando?
      </label>
      <textarea
        id="post-content"
        value={content}
        onChange={(event) => {
          setContent(event.target.value);
          setSuccess(false);
        }}
        maxLength={MAX_CONTENT_LENGTH}
        placeholder="¿Qué estás pensando?"
        rows={3}
        className="min-h-11 w-full resize-none bg-background text-base leading-relaxed outline-none placeholder:text-muted"
      />

      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {images.map((image) => (
            <div key={image.id} className="relative">
              {/* Vista previa local (blob:): next/image no sirve para esto */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.previewUrl}
                alt={`Vista previa de ${image.file.name}`}
                className="aspect-video w-full rounded-xl border border-border object-cover"
              />
              <button
                type="button"
                onClick={() => removeImage(image.id)}
                disabled={submitting}
                aria-label={`Quitar ${image.file.name}`}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs font-bold text-white"
              >
                ✕
              </button>
              {image.status === "subiendo" && (
                <p className="mt-1 text-xs text-muted">Subiendo…</p>
              )}
              {image.status === "lista" && (
                <p className="mt-1 text-xs text-primary">Lista</p>
              )}
              {image.error && (
                <p className="mt-1 text-xs text-red-600">{image.error}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {generalError && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
          {generalError}
        </p>
      )}

      {success && (
        <p className="rounded-xl bg-surface px-3 py-2 text-sm text-primary">
          Publicación creada.
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        {/* flex-wrap + whitespace-nowrap: en 375px el contador y "Agregar imágenes"
            bajan juntos de línea en vez de partirse a la mitad (S4-06). */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
          <span className="whitespace-nowrap text-xs text-muted tabular-nums">
            {content.length} / {MAX_CONTENT_LENGTH}
          </span>
          {/* El input va antes (peer) para que, con Tab, el contorno de foco se vea en
              "Agregar imágenes": el input en sí está oculto (S4-06). */}
          <input
            ref={fileInputRef}
            id="post-images"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={!canAddMore || submitting}
            onChange={(event) => handleFilesSelected(event.target.files)}
            className="peer sr-only"
          />
          <label
            htmlFor="post-images"
            className={`cursor-pointer whitespace-nowrap rounded text-sm font-medium text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary peer-focus-visible:[outline-style:solid] ${
              !canAddMore || submitting ? "pointer-events-none opacity-50" : ""
            }`}
          >
            Agregar imágenes
          </label>
          {/* -ml-2: queda a 8px de "Agregar imágenes", como antes del gap-x-4 */}
          <span className="-ml-2 whitespace-nowrap text-xs text-muted">
            {images.length}/{MAX_IMAGES}
          </span>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Publicando…" : "Publicar"}
        </button>
      </div>
    </form>
  );
}
