import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NotificationDto, NotificationPageDto } from "@red/api-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NotificacionesPage from "./page";

const { apiFetchClient } = vi.hoisted(() => ({ apiFetchClient: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetchClient }));

const { onNotificationNew, notifyNotificationsRead } = vi.hoisted(() => ({
  onNotificationNew: {
    current: null as ((n: NotificationDto) => void) | null,
  },
  notifyNotificationsRead: vi.fn(),
}));

vi.mock("@/lib/socket", () => ({
  subscribeNotificationNew: vi.fn((cb: (n: NotificationDto) => void) => {
    onNotificationNew.current = cb;
    return () => {
      onNotificationNew.current = null;
    };
  }),
  notifyNotificationsRead,
}));

const N1: NotificationDto = {
  id: "n1",
  type: "comment",
  actor: {
    id: "u2",
    username: "beto",
    displayName: "Beto",
    avatarPublicId: null,
  },
  postId: "p1",
  commentId: "c1",
  preview: "Excelente aporte",
  read: false,
  createdAt: "2026-10-30T15:00:00.000Z",
};

const N2: NotificationDto = {
  id: "n2",
  type: "message",
  actor: {
    id: "u3",
    username: "carla",
    displayName: "Carla",
    avatarPublicId: null,
  },
  postId: null,
  commentId: null,
  preview: "Nos vemos mañana",
  read: false,
  createdAt: "2026-10-30T14:00:00.000Z",
};

describe("NotificacionesPage (S4-11)", () => {
  beforeEach(() => {
    apiFetchClient.mockReset();
    notifyNotificationsRead.mockReset();
    window.localStorage.clear();
  });

  it("carga la lista con preview, enlaces por tipo y permite Cargar más", async () => {
    const user = userEvent.setup();
    const firstPage: NotificationPageDto = {
      items: [N1],
      nextCursor: "cursor-1",
    };
    const secondPage: NotificationPageDto = {
      items: [N2],
      nextCursor: null,
    };
    apiFetchClient
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);

    render(<NotificacionesPage />);

    await waitFor(() => {
      expect(screen.getByText("Beto")).toBeInTheDocument();
    });
    expect(screen.getByText(/Excelente aporte/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Beto/ })).toHaveAttribute(
      "href",
      "/p/p1",
    );

    await user.click(screen.getByRole("button", { name: "Cargar más" }));

    await waitFor(() => {
      expect(apiFetchClient).toHaveBeenCalledWith(
        "/api/notifications?cursor=cursor-1",
      );
      expect(screen.getByText("Carla")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /Carla/ })).toHaveAttribute(
      "href",
      "/chat?username=carla",
    );
  });

  it("marca una como leída al hacer clic y todas con Marcar todas como leídas", async () => {
    const user = userEvent.setup();
    apiFetchClient
      .mockResolvedValueOnce({ items: [N1, N2], nextCursor: null })
      .mockResolvedValue(undefined);

    render(<NotificacionesPage />);

    await waitFor(() => {
      expect(screen.getAllByLabelText("Sin leer")).toHaveLength(2);
    });

    await user.click(
      screen.getByRole("button", { name: "Marcar todas como leídas" }),
    );

    expect(apiFetchClient).toHaveBeenCalledWith("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    expect(notifyNotificationsRead).toHaveBeenCalledWith({
      all: true,
      decrement: 2,
    });
    expect(screen.queryByLabelText("Sin leer")).not.toBeInTheDocument();
  });

  it("agrega en vivo cuando llega notification:new y permite silenciar el sonido", async () => {
    const user = userEvent.setup();
    apiFetchClient.mockResolvedValueOnce({ items: [], nextCursor: null });

    render(<NotificacionesPage />);

    await waitFor(() => {
      expect(
        screen.getByText("No tienes notificaciones todavía."),
      ).toBeInTheDocument();
    });

    act(() => {
      onNotificationNew.current?.(N1);
    });

    expect(screen.getByText("Beto")).toBeInTheDocument();

    const muteBtn = screen.getByRole("button", {
      name: "Silenciar sonido de notificaciones",
    });
    await user.click(muteBtn);
    expect(
      screen.getByRole("button", { name: "Activar sonido de notificaciones" }),
    ).toBeInTheDocument();
  });
});
