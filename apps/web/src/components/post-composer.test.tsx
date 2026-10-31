import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MediaDto, PostDto } from "@red/api-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-error";
import { MAX_CONTENT_LENGTH, PostComposer } from "./post-composer";

// Mockea solo uploadMedia: validateImageFile se usa de verdad, el componente depende
// de su comportamiento real (RN03) para bloquear Publicar con una imagen inválida.
const { uploadMedia } = vi.hoisted(() => ({ uploadMedia: vi.fn() }));
vi.mock("@/lib/media", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/media")>();
  return { ...actual, uploadMedia };
});

const { apiFetchClient } = vi.hoisted(() => ({ apiFetchClient: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetchClient }));

function jpeg(name: string, sizeBytes = 1024): File {
  return new File([new Uint8Array(sizeBytes)], name, { type: "image/jpeg" });
}

const SAMPLE_MEDIA: MediaDto = {
  publicId: "users/u1/foto1",
  mediaType: "image",
  width: 1200,
  height: 800,
};

const SAMPLE_POST: PostDto = {
  id: "11111111-1111-1111-1111-111111111111",
  author: {
    id: "u1",
    username: "ana_lopez",
    displayName: "Ana López",
    avatarPublicId: null,
  },
  content: "hola",
  media: [],
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
  myReaction: null,
  topReactions: [],
  createdAt: "2026-10-28T00:00:00.000Z",
  editedAt: null,
};

describe("PostComposer", () => {
  beforeEach(() => {
    uploadMedia.mockReset();
    apiFetchClient.mockReset();
  });

  it("el botón Publicar empieza deshabilitado sin texto ni imágenes", () => {
    render(<PostComposer />);
    expect(screen.getByRole("button", { name: "Publicar" })).toBeDisabled();
  });

  it("muestra el contador de caracteres al escribir", async () => {
    const user = userEvent.setup();
    render(<PostComposer />);
    const textarea = screen.getByPlaceholderText("¿Qué estás pensando?");
    await user.type(textarea, "hola");
    expect(
      screen.getByText(`4 / ${MAX_CONTENT_LENGTH}`),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publicar" })).toBeEnabled();
  });

  it("muestra la vista previa de una imagen válida y habilita publicar", async () => {
    const user = userEvent.setup();
    render(<PostComposer />);
    const input = screen.getByLabelText("Agregar imágenes", {
      selector: "input",
    });
    await user.upload(input, jpeg("foto.jpg"));

    expect(screen.getByAltText("Vista previa de foto.jpg")).toBeInTheDocument();
    expect(screen.getByText("1/4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publicar" })).toBeEnabled();
  });

  it("muestra el error y bloquea Publicar si el tipo o el tamaño no son válidos", async () => {
    const user = userEvent.setup();
    render(<PostComposer />);
    const input = screen.getByLabelText("Agregar imágenes", {
      selector: "input",
    });
    const tooBig = jpeg("grande.jpg", 5 * 1024 * 1024 + 1);
    await user.upload(input, tooBig);

    expect(screen.getByText("Pasa de 5 MB.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publicar" })).toBeDisabled();
  });

  it("quitar una imagen la saca de la lista y del contador", async () => {
    const user = userEvent.setup();
    render(<PostComposer />);
    const input = screen.getByLabelText("Agregar imágenes", {
      selector: "input",
    });
    await user.upload(input, jpeg("foto.jpg"));
    await user.click(screen.getByRole("button", { name: "Quitar foto.jpg" }));

    expect(screen.queryByAltText("Vista previa de foto.jpg")).not.toBeInTheDocument();
    expect(screen.getByText("0/4")).toBeInTheDocument();
  });

  it("sube la imagen, crea la publicación y limpia el formulario", async () => {
    const user = userEvent.setup();
    uploadMedia.mockResolvedValueOnce(SAMPLE_MEDIA);
    apiFetchClient.mockResolvedValueOnce(SAMPLE_POST);
    const onPosted = vi.fn();

    render(<PostComposer onPosted={onPosted} />);
    const textarea = screen.getByPlaceholderText("¿Qué estás pensando?");
    await user.type(textarea, "hola");
    const input = screen.getByLabelText("Agregar imágenes", {
      selector: "input",
    });
    await user.upload(input, jpeg("foto.jpg"));
    await user.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => {
      expect(screen.getByText("Publicación creada.")).toBeInTheDocument();
    });

    expect(uploadMedia).toHaveBeenCalledWith(expect.any(File));
    expect(apiFetchClient).toHaveBeenCalledWith(
      "/api/posts",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          content: "hola",
          // CreatePostDto no acepta mediaType, solo publicId/width/height
          media: [{ publicId: "users/u1/foto1", width: 1200, height: 800 }],
        }),
      }),
    );
    expect(onPosted).toHaveBeenCalledWith(SAMPLE_POST);
    expect(textarea).toHaveValue("");
    expect(screen.queryByAltText("Vista previa de foto.jpg")).not.toBeInTheDocument();
  });

  it("si falla la subida de la imagen, muestra el error y no crea la publicación", async () => {
    const user = userEvent.setup();
    uploadMedia.mockRejectedValueOnce(
      new ApiError(
        { statusCode: 413, error: "Payload Too Large", message: "File too large", details: [] },
        413,
      ),
    );

    render(<PostComposer />);
    const input = screen.getByLabelText("Agregar imágenes", {
      selector: "input",
    });
    await user.upload(input, jpeg("foto.jpg"));
    await user.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => {
      expect(screen.getByText("Pasa de 5 MB.")).toBeInTheDocument();
    });
    expect(apiFetchClient).not.toHaveBeenCalled();
  });

  it("si falla la creación de la publicación, muestra un error general", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockRejectedValueOnce(
      new ApiError(
        { statusCode: 500, error: "Internal Server Error", message: "Error interno del servidor", details: [] },
        500,
      ),
    );

    render(<PostComposer />);
    await user.type(screen.getByPlaceholderText("¿Qué estás pensando?"), "hola");
    await user.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => {
      expect(
        screen.getByText("Error interno del servidor"),
      ).toBeInTheDocument();
    });
  });
});
