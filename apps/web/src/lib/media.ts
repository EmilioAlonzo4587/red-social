import type { MediaDto } from "@red/api-types";
import { apiFetchClient } from "./api-client";

/** Sube una imagen a Cloudinary a través de la api (POST /api/media). */
export function uploadMedia(file: File): Promise<MediaDto> {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetchClient<MediaDto>("/api/media", {
    method: "POST",
    body: formData,
  });
}
