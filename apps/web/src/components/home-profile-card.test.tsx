import { render, screen } from "@testing-library/react";
import type { MeDto } from "@red/api-types";
import { describe, expect, it } from "vitest";
import { HomeProfileCard } from "./home-profile-card";

const ME: MeDto = {
  id: "u1",
  username: "ana_lopez",
  displayName: "Ana López",
  avatarPublicId: null,
  email: "ana@example.com",
  bio: "Fotógrafa de atardeceres",
  createdAt: new Date().toISOString(),
};

describe("HomeProfileCard (S3-19)", () => {
  it("mientras carga, muestra un esqueleto y no los datos", () => {
    render(<HomeProfileCard me={null} loading />);
    expect(screen.queryByText("@ana_lopez")).not.toBeInTheDocument();
    expect(screen.queryByText("Editar perfil")).not.toBeInTheDocument();
  });

  it("caso feliz: foto, nombre, username y biografía, enlazando al perfil", () => {
    render(<HomeProfileCard me={ME} loading={false} />);
    expect(screen.getByText("Ana López")).toBeInTheDocument();
    expect(screen.getByText("@ana_lopez")).toBeInTheDocument();
    expect(
      screen.getByText("Fotógrafa de atardeceres"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ana López/ })).toHaveAttribute(
      "href",
      "/u/ana_lopez",
    );
    expect(
      screen.getByRole("link", { name: "Editar perfil" }),
    ).toHaveAttribute("href", "/perfil/editar");
  });

  it("sin biografía, muestra el enlace para agregar una", () => {
    render(<HomeProfileCard me={{ ...ME, bio: null }} loading={false} />);
    expect(
      screen.getByRole("link", { name: "Agregar una biografía" }),
    ).toHaveAttribute("href", "/perfil/editar");
  });

  it("usa el username si no hay nombre visible", () => {
    render(
      <HomeProfileCard me={{ ...ME, displayName: null }} loading={false} />,
    );
    expect(screen.getByText("ana_lopez")).toBeInTheDocument();
  });

  it("si no hay datos y no está cargando (falló GET /api/auth/me), no muestra nada", () => {
    const { container } = render(<HomeProfileCard me={null} loading={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
