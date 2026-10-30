import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "./avatar";

describe("Avatar", () => {
  it("sin avatarPublicId, muestra las iniciales", () => {
    render(<Avatar name="Ana López" />);
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("con avatarPublicId null, muestra las iniciales", () => {
    render(<Avatar name="Ana López" avatarPublicId={null} />);
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("con avatarPublicId, muestra la foto en vez de las iniciales", () => {
    const { container } = render(
      <Avatar name="Ana López" avatarPublicId="users/u1/foto" />,
    );
    expect(screen.queryByText("AL")).not.toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("size xl usa 80px (S4-09: tamaño grande para el encabezado de perfil)", () => {
    const { container } = render(<Avatar name="Ana López" size="xl" />);
    expect(container.firstChild).toHaveClass("h-20", "w-20");
  });
});
