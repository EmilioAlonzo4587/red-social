import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-error";
import { QuickCommentBox } from "./quick-comment-box";

const { apiFetchClient } = vi.hoisted(() => ({ apiFetchClient: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetchClient }));

const POST_ID = "11111111-1111-1111-1111-111111111111";

function apiError(statusCode: number, details: ApiError["details"] = []) {
  return new ApiError(
    { statusCode, error: "Error", message: "Error de la api", details },
    statusCode,
  );
}

describe("QuickCommentBox", () => {
  const onPosted = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    apiFetchClient.mockReset();
    onPosted.mockReset();
    onClose.mockReset();
  });

  function renderBox() {
    render(
      <QuickCommentBox postId={POST_ID} onPosted={onPosted} onClose={onClose} />,
    );
    return screen.getByLabelText("Escribe un comentario");
  }

  it("se abre con el cuadro enfocado y el contador en 0", () => {
    const input = renderBox();
    expect(input).toHaveFocus();
    expect(screen.getByText("0 / 1000")).toBeInTheDocument();
  });

  it("caso feliz: envía el comentario y avisa con el comentario creado", async () => {
    const user = userEvent.setup();
    const created = { id: "c1", content: "Hola" };
    apiFetchClient.mockResolvedValueOnce(created);
    const input = renderBox();

    await user.type(input, "Hola");
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(onPosted).toHaveBeenCalledWith(created));
    expect(apiFetchClient).toHaveBeenCalledWith(
      `/api/posts/${POST_ID}/comments`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ content: "Hola" }),
      }),
    );
  });

  it("no deja enviar un comentario en blanco (RN07)", async () => {
    const user = userEvent.setup();
    const input = renderBox();

    await user.type(input, "   ");
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
    expect(apiFetchClient).not.toHaveBeenCalled();
  });

  it("si la publicación ya no existe (404), lo dice y no cierra", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockRejectedValueOnce(apiError(404));
    const input = renderBox();

    await user.type(input, "Hola");
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(
      await screen.findByText("Esta publicación ya no existe."),
    ).toBeInTheDocument();
    expect(onPosted).not.toHaveBeenCalled();
    expect(input).toHaveValue("Hola");
  });

  it("un 400 de la api muestra el límite del comentario", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockRejectedValueOnce(
      apiError(400, [
        { field: "content", rule: "maxLength" },
      ]),
    );
    const input = renderBox();

    await user.type(input, "Hola");
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(
      await screen.findByText(
        "El comentario debe tener entre 1 y 1000 caracteres.",
      ),
    ).toBeInTheDocument();
  });

  it("se cierra con Escape o con Cancelar", async () => {
    const input = renderBox();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.setup().click(
      screen.getByRole("button", { name: "Cancelar" }),
    );
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("emojis: inserta en la posición del cursor y Escape cierra solo el panel", async () => {
    const user = userEvent.setup();
    const input = renderBox() as HTMLTextAreaElement;
    await user.type(input, "Qué foto");
    input.setSelectionRange(3, 3);

    await user.click(screen.getByRole("button", { name: "Abrir emojis" }));
    await user.click(screen.getByRole("button", { name: "Insertar enamorado" }));
    expect(input).toHaveValue("Qué😍 foto");
    expect(input.selectionStart).toBe(5);

    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("dialog", { name: "Elegir emoji" }),
    ).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    // Sin el panel abierto, Escape sí cierra el recuadro
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("emojis: no pasa de 1000 caracteres (RN07)", async () => {
    const user = userEvent.setup();
    const input = renderBox();
    fireEvent.change(input, { target: { value: "a".repeat(999) } });

    await user.click(screen.getByRole("button", { name: "Abrir emojis" }));
    await user.click(screen.getByRole("button", { name: "Insertar sonrisa" }));
    expect((input as HTMLTextAreaElement).value).toHaveLength(999);
  });
});
