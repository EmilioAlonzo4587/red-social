import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type {
  ConversationDto,
  MeDto,
  NotificationDto,
} from "@red/api-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./sidebar";

// Desde S4-06 Sidebar pinta dos menús con los mismos enlaces: la barra lateral
// (escritorio) y la barra inferior (celular). Cada prueba mira el que le toca.
const desktop = () =>
  within(screen.getByRole("navigation", { name: "Navegación principal" }));
const mobile = () =>
  within(screen.getByRole("navigation", { name: "Navegación inferior" }));

const { pathname } = vi.hoisted(() => ({ pathname: { value: "/feed" } }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
}));

const { apiFetchClient } = vi.hoisted(() => ({ apiFetchClient: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetchClient }));

const { onUpdated, onRead, onNotificationNew, onNotificationsRead } =
  vi.hoisted(() => ({
    onUpdated: { current: null as ((c: ConversationDto) => void) | null },
    onRead: { current: null as ((id: string) => void) | null },
    onNotificationNew: {
      current: null as ((n: NotificationDto) => void) | null,
    },
    onNotificationsRead: {
      current: null as ((p: { decrement?: number; all?: boolean }) => void) | null,
    },
  }));
vi.mock("@/lib/socket", () => ({
  subscribeConversationUpdated: vi.fn((cb: (c: ConversationDto) => void) => {
    onUpdated.current = cb;
    return () => {
      onUpdated.current = null;
    };
  }),
  subscribeConversationRead: vi.fn((cb: (id: string) => void) => {
    onRead.current = cb;
    return () => {
      onRead.current = null;
    };
  }),
  subscribeNotificationNew: vi.fn((cb: (n: NotificationDto) => void) => {
    onNotificationNew.current = cb;
    return () => {
      onNotificationNew.current = null;
    };
  }),
  subscribeNotificationsRead: vi.fn(
    (cb: (p: { decrement?: number; all?: boolean }) => void) => {
      onNotificationsRead.current = cb;
      return () => {
        onNotificationsRead.current = null;
      };
    },
  ),
  notifyNotificationsRead: vi.fn(),
}));

const ME: MeDto = {
  id: "u1",
  username: "ana_lopez",
  displayName: "Ana López",
  avatarPublicId: null,
  email: "ana@example.com",
  bio: null,
  createdAt: "2026-10-01T00:00:00.000Z",
};

describe("Sidebar", () => {
  beforeEach(() => {
    apiFetchClient.mockReset();
    pathname.value = "/feed";
  });

  it("en una ruta pública no se muestra", () => {
    pathname.value = "/login";
    const { container } = render(<Sidebar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("con sesión muestra Inicio, Notificaciones y Mensajes", () => {
    apiFetchClient.mockResolvedValueOnce(ME);
    render(<Sidebar />);

    expect(desktop().getByRole("link", { name: "Inicio" })).toHaveAttribute(
      "href",
      "/feed",
    );
    expect(
      desktop().getByRole("link", { name: "Notificaciones" }),
    ).toHaveAttribute("href", "/notificaciones");
    expect(desktop().getByRole("link", { name: "Mensajes" })).toHaveAttribute(
      "href",
      "/chat",
    );
  });

  it("agrega Mi perfil una vez que carga el usuario actual", async () => {
    apiFetchClient.mockResolvedValueOnce(ME);
    render(<Sidebar />);

    expect(
      desktop().queryByRole("link", { name: "Mi perfil" }),
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(
        desktop().getByRole("link", { name: "Mi perfil" }),
      ).toHaveAttribute("href", "/u/ana_lopez");
    });
  });

  it("si falla pedir el usuario actual, no muestra Mi perfil pero el resto funciona", async () => {
    apiFetchClient.mockRejectedValueOnce(new Error("caído"));
    render(<Sidebar />);

    await waitFor(() => expect(apiFetchClient).toHaveBeenCalled());
    expect(
      desktop().queryByRole("link", { name: "Mi perfil" }),
    ).not.toBeInTheDocument();
    expect(desktop().getByRole("link", { name: "Inicio" })).toBeInTheDocument();
  });

  it("cada ítem tiene su ícono junto al texto, sin cambiar el nombre accesible", async () => {
    apiFetchClient.mockResolvedValueOnce(ME);
    render(<Sidebar />);

    await waitFor(() => {
      expect(desktop().getByRole("link", { name: "Mi perfil" })).toBeInTheDocument();
    });

    // 4 ítems, 4 íconos: el nombre accesible de cada enlace sigue siendo solo
    // el texto porque el svg lleva aria-hidden.
    expect(
      screen
        .getByRole("navigation", { name: "Navegación principal" })
        .querySelectorAll("a svg"),
    ).toHaveLength(4);
    expect(desktop().getByRole("link", { name: "Inicio" })).toBeInTheDocument();
    expect(
      desktop().getByRole("link", { name: "Notificaciones" }),
    ).toBeInTheDocument();
    expect(desktop().getByRole("link", { name: "Mensajes" })).toBeInTheDocument();
  });

  it("muestra la suma de no leídos de la bandeja y la actualiza con conversation:updated y al leer (S3-06)", async () => {
    const conv1: ConversationDto = {
      id: "c1",
      otherUser: {
        id: "u2",
        username: "beto",
        displayName: "Beto",
        avatarPublicId: null,
      },
      lastMessage: null,
      unread: 2,
    };
    const conv2: ConversationDto = {
      id: "c2",
      otherUser: {
        id: "u3",
        username: "carla",
        displayName: "Carla",
        avatarPublicId: null,
      },
      lastMessage: null,
      unread: 1,
    };
    apiFetchClient
      .mockResolvedValueOnce(ME)
      .mockResolvedValueOnce([conv1, conv2]);

    render(<Sidebar />);

    await waitFor(() => {
      expect(desktop().getByLabelText("3 sin leer")).toHaveTextContent("3");
    });

    // Llega un mensaje más en c1 por socket (unread pasa de 2 a 3 -> total 4)
    act(() => {
      onUpdated.current?.({ ...conv1, unread: 3 });
    });
    expect(desktop().getByLabelText("4 sin leer")).toHaveTextContent("4");

    // Se lee c1 en /chat (unread de c1 pasa a 0 -> total 1)
    act(() => {
      onRead.current?.("c1");
    });
    expect(desktop().getByLabelText("1 sin leer")).toHaveTextContent("1");

    // Se lee c2 -> total 0, desaparece la insignia
    act(() => {
      onRead.current?.("c2");
    });
    expect(screen.queryByLabelText(/sin leer/)).not.toBeInTheDocument();
  });

  it("celular (S4-06): barra inferior con los mismos destinos, Mi perfil y no leídos", async () => {
    const conv: ConversationDto = {
      id: "c1",
      otherUser: {
        id: "u2",
        username: "beto",
        displayName: "Beto",
        avatarPublicId: null,
      },
      lastMessage: null,
      unread: 2,
    };
    apiFetchClient.mockResolvedValueOnce(ME).mockResolvedValueOnce([conv]);
    pathname.value = "/chat";
    render(<Sidebar />);

    const bar = screen.getByRole("navigation", { name: "Navegación inferior" });
    expect(bar).toHaveClass("fixed", "bottom-0", "sm:hidden");
    expect(mobile().getByRole("link", { name: "Inicio" })).toHaveAttribute(
      "href",
      "/feed",
    );
    expect(
      mobile().getByRole("link", { name: "Notificaciones" }),
    ).toHaveAttribute("href", "/notificaciones");
    expect(mobile().getByRole("link", { name: /Mensajes/ })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await waitFor(() => {
      expect(mobile().getByRole("link", { name: "Mi perfil" })).toHaveAttribute(
        "href",
        `/u/${ME.username}`,
      );
    });
    expect(mobile().getByLabelText("2 sin leer")).toHaveTextContent("2");
  });

  it("en una ruta pública tampoco muestra la barra inferior", () => {
    pathname.value = "/login";
    render(<Sidebar />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("muestra el contador de notificaciones sin leer y lo actualiza con notification:new y al leer (S4-11)", async () => {
    apiFetchClient
      .mockResolvedValueOnce(ME)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ count: 2 });

    render(<Sidebar />);

    await waitFor(() => {
      expect(
        desktop().getByLabelText("2 notificaciones sin leer"),
      ).toHaveTextContent("2");
      expect(
        mobile().getByLabelText("2 notificaciones sin leer"),
      ).toHaveTextContent("2");
    });

    // Llega una notificación nueva por socket -> sube a 3
    act(() => {
      onNotificationNew.current?.({
        id: "n1",
        type: "like",
        actor: {
          id: "u2",
          username: "beto",
          displayName: "Beto",
          avatarPublicId: null,
        },
        postId: "p1",
        commentId: null,
        preview: null,
        read: false,
        createdAt: "2026-10-30T15:00:00.000Z",
      });
    });
    expect(
      desktop().getByLabelText("3 notificaciones sin leer"),
    ).toHaveTextContent("3");

    // Se marca una como leída -> baja a 2
    act(() => {
      onNotificationsRead.current?.({ decrement: 1 });
    });
    expect(
      desktop().getByLabelText("2 notificaciones sin leer"),
    ).toHaveTextContent("2");

    // Se marcan todas como leídas -> desaparece la insignia
    act(() => {
      onNotificationsRead.current?.({ all: true });
    });
    expect(
      screen.queryByLabelText(/notificaciones sin leer/),
    ).not.toBeInTheDocument();
  });

  it("abre y cierra el panel deslizable de notificaciones sobre la pantalla actual al pulsar Notificaciones", async () => {
    apiFetchClient
      .mockResolvedValueOnce(ME)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ items: [], nextCursor: null });

    render(<Sidebar />);

    expect(
      screen.queryByRole("dialog", { name: "Panel de notificaciones" }),
    ).not.toBeInTheDocument();

    fireEvent.click(desktop().getByRole("link", { name: "Notificaciones" }));

    const drawer = await screen.findByRole("dialog", {
      name: "Panel de notificaciones",
    });
    expect(drawer).toBeInTheDocument();

    fireEvent.click(
      within(drawer).getByRole("button", {
        name: "Cerrar panel de notificaciones",
      }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Panel de notificaciones" }),
    ).not.toBeInTheDocument();
  });
});
