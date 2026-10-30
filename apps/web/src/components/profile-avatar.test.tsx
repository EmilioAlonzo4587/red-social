import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ProfileAvatar } from "./profile-avatar";

describe("ProfileAvatar", () => {
  it("sin foto, muestra solo las iniciales, sin botón para ampliar", () => {
    render(<ProfileAvatar name="Ana López" avatarPublicId={null} />);
    expect(screen.getByText("AL")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Ver la foto de perfil/ }),
    ).not.toBeInTheDocument();
  });

  it("con foto, el click abre la vista ampliada", async () => {
    const user = userEvent.setup();
    render(<ProfileAvatar name="Ana López" avatarPublicId="users/u1/foto" />);

    await user.click(
      screen.getByRole("button", {
        name: "Ver la foto de perfil de Ana López más grande",
      }),
    );

    expect(
      screen.getByRole("dialog", { name: "Foto de perfil de Ana López" }),
    ).toBeInTheDocument();
  });

  it("el botón Cerrar cierra la vista ampliada", async () => {
    const user = userEvent.setup();
    render(<ProfileAvatar name="Ana López" avatarPublicId="users/u1/foto" />);

    await user.click(
      screen.getByRole("button", {
        name: "Ver la foto de perfil de Ana López más grande",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(
      screen.queryByRole("dialog", { name: "Foto de perfil de Ana López" }),
    ).not.toBeInTheDocument();
  });

  it("la tecla Escape cierra la vista ampliada", async () => {
    const user = userEvent.setup();
    render(<ProfileAvatar name="Ana López" avatarPublicId="users/u1/foto" />);

    await user.click(
      screen.getByRole("button", {
        name: "Ver la foto de perfil de Ana López más grande",
      }),
    );
    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("dialog", { name: "Foto de perfil de Ana López" }),
    ).not.toBeInTheDocument();
  });
});
