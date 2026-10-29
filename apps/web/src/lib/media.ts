import type { MediaDto } from "@red/api-types";
import { apiFetchClient } from "./api-client";

// RN03: solo jpeg, png o webp, hasta 5 MB. Mismo límite para posts y avatar.
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "Debe ser jpeg, png o webp.";
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return "Pasa de 5 MB.";
  }
  return null;
}

/** Sube una imagen a Cloudinary a través de la api (POST /api/media). */
export function uploadMedia(file: File): Promise<MediaDto> {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetchClient<MediaDto>("/api/media", {
    method: "POST",
    body: formData,
  });
}

/**
 * URL de entrega de una imagen subida (S2-09). f_auto/q_auto dejan que Cloudinary
 * elija el formato; next/image (remotePatterns en next.config.ts) ajusta el tamaño.
 */
export function cloudinaryImageUrl(publicId: string): string {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  return `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto/${publicId}`;
}
