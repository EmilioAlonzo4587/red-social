import { render, screen } from "@testing-library/react";
import type { MeDto } from "@red/api-types";
import { describe, expect, it } from "vitest";
import { NavProfile } from "./nav-profile";

const ME: MeDto = {
  id: "u1",
  username: "ana_lopez",
  displayName: "Ana López",
  avatarPublicId: null,
  email: "ana@example.com",
  bio: "Fotógrafa de atardeceres",
  createdAt: new Date().toISOString(),
};

describe("NavProfile (S3-19)", () => {
  it("mientras carga, muestra un esqueleto y no los datos", () => {
    render(<NavProfile me={null} loading />);
    expect(screen.queryByText("@ana_lopez")).not.toBeInTheDocument();
  });

  it("caso feliz: foto, nombre y username, enlazando al perfil", () => {
    render(<NavProfile me={ME} loading={false} />);
    expect(screen.getByText("Ana López")).toBeInTheDocument();
    expect(screen.getByText("@ana_lopez")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ana López/ })).toHaveAttribute(
      "href",
      "/u/ana_lopez",
    );
  });

  it("no muestra la biografía (solo cabe el nombre en el navbar)", () => {
    render(<NavProfile me={ME} loading={false} />);
    expect(
      screen.queryByText("Fotógrafa de atardeceres"),
    ).not.toBeInTheDocument();
  });

  it("usa el username si no hay nombre visible", () => {
    render(<NavProfile me={{ ...ME, displayName: null }} loading={false} />);
    expect(screen.getByText("ana_lopez")).toBeInTheDocument();
  });

  it("si no hay datos y no está cargando (falló GET /api/auth/me), no muestra nada", () => {
    const { container } = render(<NavProfile me={null} loading={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
