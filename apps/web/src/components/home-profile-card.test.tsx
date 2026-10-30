import { render, screen } from "@testing-library/react";
import type { MeDto, ProfileDto } from "@red/api-types";
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

const PROFILE: ProfileDto = {
  id: "u1",
  username: "ana_lopez",
  displayName: "Ana López",
  avatarPublicId: null,
  bio: "Fotógrafa de atardeceres",
  createdAt: new Date().toISOString(),
  postCount: 12,
  followerCount: 128,
  followingCount: 96,
  isFollowing: false,
};

describe("HomeProfileCard (S4-09)", () => {
  it("mientras carga, muestra un esqueleto y no los datos", () => {
    render(<HomeProfileCard me={null} profile={null} loading />);
    expect(screen.queryByText("@ana_lopez")).not.toBeInTheDocument();
  });

  it("caso feliz: foto, nombre, username, biografía, seguidores/seguidos y editar perfil", () => {
    render(<HomeProfileCard me={ME} profile={PROFILE} loading={false} />);
    expect(screen.getByText("Ana López")).toBeInTheDocument();
    expect(screen.getByText("@ana_lopez")).toBeInTheDocument();
    expect(screen.getByText("Fotógrafa de atardeceres")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ana López/ })).toHaveAttribute(
      "href",
      "/u/ana_lopez",
    );
    expect(screen.getByText("128")).toBeInTheDocument();
    expect(screen.getByText("96")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Editar perfil" }),
    ).toHaveAttribute("href", "/perfil/editar");
  });

  it("sin biografía, muestra el enlace para agregar una", () => {
    render(
      <HomeProfileCard
        me={{ ...ME, bio: null }}
        profile={PROFILE}
        loading={false}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Agregar una biografía" }),
    ).toHaveAttribute("href", "/perfil/editar");
  });

  it("usa el username si no hay nombre visible", () => {
    render(
      <HomeProfileCard
        me={{ ...ME, displayName: null }}
        profile={PROFILE}
        loading={false}
      />,
    );
    expect(screen.getByText("ana_lopez")).toBeInTheDocument();
  });

  it("si todavía no llega el perfil (seguidores/seguidos), no revienta: solo no los muestra", () => {
    render(<HomeProfileCard me={ME} profile={null} loading={false} />);
    expect(screen.getByText("Ana López")).toBeInTheDocument();
    expect(screen.queryByText("seguidores")).not.toBeInTheDocument();
  });

  it("si no hay datos y no está cargando (falló GET /api/auth/me), no muestra nada", () => {
    const { container } = render(
      <HomeProfileCard me={null} profile={null} loading={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
