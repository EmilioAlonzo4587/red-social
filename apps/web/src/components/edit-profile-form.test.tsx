import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MediaDto, MeDto } from "@red/api-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-error";
import { EditProfileForm } from "./edit-profile-form";

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

const ME_SIN_AVATAR: MeDto = {
  id: "u1",
  username: "ana_lopez",
  displayName: "Ana López",
  avatarPublicId: null,
  email: "ana@example.com",
  bio: "Hola",
  createdAt: "2026-10-01T00:00:00.000Z",
};

const ME_CON_AVATAR: MeDto = {
  ...ME_SIN_AVATAR,
  avatarPublicId: "users/u1/actual",
};

const SAMPLE_MEDIA: MediaDto = {
  publicId: "users/u1/nuevo",
  mediaType: "image",
  width: 400,
  height: 400,
};

describe("EditProfileForm", () => {
  beforeEach(() => {
    uploadMedia.mockReset();
    apiFetchClient.mockReset();
  });

  it("precarga el nombre y la biografía actuales", () => {
    render(<EditProfileForm me={ME_SIN_AVATAR} />);
    expect(screen.getByLabelText("Nombre visible")).toHaveValue("Ana López");
    expect(screen.getByLabelText("Biografía")).toHaveValue("Hola");
  });

  it("no muestra Quitar foto si no hay avatar", () => {
    render(<EditProfileForm me={ME_SIN_AVATAR} />);
    expect(
      screen.queryByRole("button", { name: "Quitar foto" }),
    ).not.toBeInTheDocument();
  });

  it("muestra la foto real guardada si ya hay un avatar", () => {
    const { container } = render(<EditProfileForm me={ME_CON_AVATAR} />);
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("sin avatar guardado, muestra las iniciales", () => {
    render(<EditProfileForm me={ME_SIN_AVATAR} />);
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("tiene un enlace para cancelar que regresa al perfil", () => {
    render(<EditProfileForm me={ME_SIN_AVATAR} />);
    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute(
      "href",
      "/u/ana_lopez",
    );
  });

  it("muestra Quitar foto si ya hay un avatar guardado", () => {
    render(<EditProfileForm me={ME_CON_AVATAR} />);
    expect(
      screen.getByRole("button", { name: "Quitar foto" }),
    ).toBeInTheDocument();
  });

  it("guarda solo nombre y biografía si no se toca el avatar", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockResolvedValueOnce(ME_SIN_AVATAR);
    render(<EditProfileForm me={ME_SIN_AVATAR} />);

    await user.clear(screen.getByLabelText("Nombre visible"));
    await user.type(screen.getByLabelText("Nombre visible"), "Ana García");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      expect(screen.getByText("Perfil actualizado.")).toBeInTheDocument();
    });
    expect(uploadMedia).not.toHaveBeenCalled();
    expect(apiFetchClient).toHaveBeenCalledWith(
      "/api/users/me",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ displayName: "Ana García", bio: "Hola" }),
      }),
    );
  });

  it("muestra la vista previa de un avatar nuevo y permite quitarlo antes de guardar", async () => {
    const user = userEvent.setup();
    render(<EditProfileForm me={ME_SIN_AVATAR} />);

    const input = screen.getByLabelText("Cambiar foto", { selector: "input" });
    await user.upload(input, jpeg("foto.jpg"));
    expect(screen.getByAltText("Vista previa del avatar")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Quitar foto" }));
    expect(
      screen.queryByAltText("Vista previa del avatar"),
    ).not.toBeInTheDocument();
  });

  it("muestra el error y bloquea si el archivo no es válido", async () => {
    const user = userEvent.setup();
    render(<EditProfileForm me={ME_SIN_AVATAR} />);

    const input = screen.getByLabelText("Cambiar foto", { selector: "input" });
    const tooBig = jpeg("grande.jpg", 5 * 1024 * 1024 + 1);
    await user.upload(input, tooBig);

    expect(screen.getByText("Pasa de 5 MB.")).toBeInTheDocument();
    expect(
      screen.queryByAltText("Vista previa del avatar"),
    ).not.toBeInTheDocument();
  });

  it("sube el avatar nuevo y lo manda en el PATCH", async () => {
    const user = userEvent.setup();
    uploadMedia.mockResolvedValueOnce(SAMPLE_MEDIA);
    apiFetchClient.mockResolvedValueOnce(ME_CON_AVATAR);
    render(<EditProfileForm me={ME_SIN_AVATAR} />);

    const input = screen.getByLabelText("Cambiar foto", { selector: "input" });
    await user.upload(input, jpeg("foto.jpg"));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      expect(screen.getByText("Perfil actualizado.")).toBeInTheDocument();
    });
    expect(uploadMedia).toHaveBeenCalledWith(expect.any(File));
    expect(apiFetchClient).toHaveBeenCalledWith(
      "/api/users/me",
      expect.objectContaining({
        body: JSON.stringify({
          displayName: "Ana López",
          bio: "Hola",
          avatarPublicId: "users/u1/nuevo",
        }),
      }),
    );
  });

  it("si falla la subida del avatar, no llama al PATCH", async () => {
    const user = userEvent.setup();
    uploadMedia.mockRejectedValueOnce(
      new ApiError(
        {
          statusCode: 413,
          error: "Payload Too Large",
          message: "File too large",
          details: [],
        },
        413,
      ),
    );
    render(<EditProfileForm me={ME_SIN_AVATAR} />);

    const input = screen.getByLabelText("Cambiar foto", { selector: "input" });
    await user.upload(input, jpeg("foto.jpg"));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      expect(screen.getByText("Pasa de 5 MB.")).toBeInTheDocument();
    });
    expect(apiFetchClient).not.toHaveBeenCalled();
  });

  it("quitar la foto manda avatarPublicId null", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockResolvedValueOnce(ME_SIN_AVATAR);
    render(<EditProfileForm me={ME_CON_AVATAR} />);

    await user.click(screen.getByRole("button", { name: "Quitar foto" }));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      expect(apiFetchClient).toHaveBeenCalledWith(
        "/api/users/me",
        expect.objectContaining({
          body: JSON.stringify({
            displayName: "Ana López",
            bio: "Hola",
            avatarPublicId: null,
          }),
        }),
      );
    });
  });

  it("muestra los errores de campo que devuelve la api (400)", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockRejectedValueOnce(
      new ApiError(
        {
          statusCode: 400,
          error: "Bad Request",
          message: "displayName: máximo 80 caracteres",
          details: [{ field: "displayName", rule: "maxLength" }],
        },
        400,
      ),
    );
    render(<EditProfileForm me={ME_SIN_AVATAR} />);
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      expect(screen.getByText("muy largo")).toBeInTheDocument();
    });
  });

  it("muestra un error general si la api falla de otra forma", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockRejectedValueOnce(
      new ApiError(
        {
          statusCode: 500,
          error: "Internal Server Error",
          message: "Error interno del servidor",
          details: [],
        },
        500,
      ),
    );
    render(<EditProfileForm me={ME_SIN_AVATAR} />);
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      expect(
        screen.getByText("Error interno del servidor"),
      ).toBeInTheDocument();
    });
  });
});
