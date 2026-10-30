import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  ConversationDto,
  ConversationJoinAck,
  MeDto,
  MessageDto,
  MessagePageDto,
} from "@red/api-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-error";
import ChatPage from "./page";

const { searchParams } = vi.hoisted(() => ({
  searchParams: { value: new URLSearchParams() },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams.value,
}));

const { apiFetchClient } = vi.hoisted(() => ({ apiFetchClient: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetchClient }));

const {
  onMessageRef,
  onJoinAckRef,
  onTypingRef,
  onRemoteReadRef,
  onConversationUpdatedRef,
  onPresenceRef,
  emitConversationTyping,
  notifyConversationRead,
  subscribeConversationMessages,
  watchUsersPresence,
} = vi.hoisted(() => {
  const onMessageRef = { current: null as ((m: MessageDto) => void) | null };
  const onJoinAckRef = {
    current: null as ((ack: ConversationJoinAck) => void) | null,
  };
  const onTypingRef = { current: null as ((userId: string) => void) | null };
  const onRemoteReadRef = {
    current: null as ((readAt: string, userId: string) => void) | null,
  };
  const onConversationUpdatedRef = {
    current: null as ((c: ConversationDto) => void) | null,
  };
  const onPresenceRef = {
    current: null as ((onlineIds: ReadonlySet<string>) => void) | null,
  };
  const emitConversationTyping = vi.fn();
  const notifyConversationRead = vi.fn();
  const watchUsersPresence = vi.fn(
    (_ids: string[], cb: (onlineIds: ReadonlySet<string>) => void) => {
      onPresenceRef.current = cb;
      return () => {
        onPresenceRef.current = null;
      };
    },
  );
  const subscribeConversationMessages = vi.fn(
    (
      _id: string,
      onMsg: (m: MessageDto) => void,
      onAck?: (ack: ConversationJoinAck) => void,
      options?: {
        onTyping?: (userId: string) => void;
        onRemoteRead?: (readAt: string, userId: string) => void;
      },
    ) => {
      onMessageRef.current = onMsg;
      onJoinAckRef.current = onAck ?? null;
      onTypingRef.current = options?.onTyping ?? null;
      onRemoteReadRef.current = options?.onRemoteRead ?? null;
      return () => {
        onMessageRef.current = null;
        onJoinAckRef.current = null;
        onTypingRef.current = null;
        onRemoteReadRef.current = null;
      };
    },
  );
  return {
    onMessageRef,
    onJoinAckRef,
    onTypingRef,
    onRemoteReadRef,
    onConversationUpdatedRef,
    onPresenceRef,
    emitConversationTyping,
    notifyConversationRead,
    subscribeConversationMessages,
    watchUsersPresence,
  };
});

vi.mock("@/lib/socket", () => ({
  subscribeConversationMessages,
  subscribeConversationUpdated: vi.fn((cb: (c: ConversationDto) => void) => {
    onConversationUpdatedRef.current = cb;
    return () => {
      onConversationUpdatedRef.current = null;
    };
  }),
  emitConversationTyping,
  notifyConversationRead,
  watchUsersPresence,
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

const CONV_BETO: ConversationDto = {
  id: "c1",
  otherUser: {
    id: "u2",
    username: "beto",
    displayName: "Beto Pérez",
    avatarPublicId: null,
  },
  lastMessage: {
    id: "m2",
    conversationId: "c1",
    senderId: "u2",
    content: "Nos vemos mañana",
    createdAt: "2026-10-30T10:05:00.000Z",
  },
  unread: 2,
};

describe("ChatPage (S3-06)", () => {
  beforeEach(() => {
    searchParams.value = new URLSearchParams();
    apiFetchClient.mockReset();
    emitConversationTyping.mockClear();
    notifyConversationRead.mockClear();
    subscribeConversationMessages.mockClear();
    watchUsersPresence.mockClear();
    onMessageRef.current = null;
    onJoinAckRef.current = null;
    onTypingRef.current = null;
    onRemoteReadRef.current = null;
    onConversationUpdatedRef.current = null;
    onPresenceRef.current = null;
  });

  it("muestra estado vacío cuando la bandeja no tiene conversaciones", async () => {
    apiFetchClient.mockResolvedValueOnce(ME).mockResolvedValueOnce([]);

    render(<ChatPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Todavía no tienes conversaciones."),
      ).toBeInTheDocument();
    });
  });

  it("abre una conversación, invierte el historial, marca como leído y carga mensajes anteriores al subir", async () => {
    const user = userEvent.setup();
    // La API devuelve del más reciente (m2) al más antiguo (m1)
    const firstPage: MessagePageDto = {
      items: [
        {
          id: "m2",
          conversationId: "c1",
          senderId: "u2",
          content: "Segundo mensaje",
          createdAt: "2026-10-30T10:05:00.000Z",
        },
        {
          id: "m1",
          conversationId: "c1",
          senderId: "u1",
          content: "Primer mensaje",
          createdAt: "2026-10-30T10:00:00.000Z",
        },
      ],
      nextCursor: "cursor-anterior",
    };
    const olderPage: MessagePageDto = {
      items: [
        {
          id: "m0",
          conversationId: "c1",
          senderId: "u2",
          content: "Mensaje más antiguo",
          createdAt: "2026-10-30T09:50:00.000Z",
        },
      ],
      nextCursor: null,
    };

    apiFetchClient
      .mockResolvedValueOnce(ME)
      .mockResolvedValueOnce([CONV_BETO])
      .mockResolvedValueOnce(undefined) // POST /api/conversations/c1/read
      .mockResolvedValueOnce(firstPage) // GET /api/conversations/c1/messages
      .mockResolvedValueOnce(olderPage); // GET /api/conversations/c1/messages?cursor=cursor-anterior

    render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByText("Beto Pérez")).toBeInTheDocument();
    });
    expect(screen.getByText("2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Beto Pérez/ }));

    await waitFor(() => {
      expect(screen.getByText("Primer mensaje")).toBeInTheDocument();
      expect(screen.getByText("Segundo mensaje")).toBeInTheDocument();
    });

    // Se marcó como leída en el servidor y se avisó al menú lateral
    expect(notifyConversationRead).toHaveBeenCalledWith("c1");
    expect(apiFetchClient).toHaveBeenCalledWith("/api/conversations/c1/read", {
      method: "POST",
    });

    // Orden en el DOM: "Primer mensaje" aparece antes que "Segundo mensaje"
    const firstEl = screen.getByText("Primer mensaje");
    const secondEl = screen.getByText("Segundo mensaje");
    expect(
      firstEl.compareDocumentPosition(secondEl) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Cargar historial anterior al subir
    await user.click(
      screen.getByRole("button", { name: "Cargar mensajes anteriores" }),
    );

    await waitFor(() => {
      expect(screen.getByText("Mensaje más antiguo")).toBeInTheDocument();
    });
    const oldestEl = screen.getByText("Mensaje más antiguo");
    expect(
      oldestEl.compareDocumentPosition(firstEl) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("envía un mensaje y recibe message:new y conversation:updated en vivo sin duplicar", async () => {
    const user = userEvent.setup();
    const emptyPage: MessagePageDto = { items: [], nextCursor: null };
    const sentMessage: MessageDto = {
      id: "m3",
      conversationId: "c1",
      senderId: "u1",
      content: "Hola en vivo",
      createdAt: "2026-10-30T10:10:00.000Z",
    };

    apiFetchClient
      .mockResolvedValueOnce(ME)
      .mockResolvedValueOnce([{ ...CONV_BETO, unread: 0 }])
      .mockResolvedValueOnce(emptyPage)
      .mockResolvedValueOnce(sentMessage);

    render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByText("Beto Pérez")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Beto Pérez/ }));

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Escribe un mensaje..."),
      ).toBeInTheDocument();
    });

    await user.type(
      screen.getByPlaceholderText("Escribe un mensaje..."),
      "Hola en vivo",
    );
    expect(emitConversationTyping).toHaveBeenCalledWith("c1");

    // El otro participante está escribiendo
    act(() => {
      onTypingRef.current?.("u2");
    });
    expect(
      screen.getByText("Beto Pérez está escribiendo…"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => {
      expect(screen.getAllByText("Hola en vivo")).toHaveLength(2); // burbuja + vista previa en bandeja
    });
    expect(screen.getByText(/Enviado/)).toBeInTheDocument();

    // Cuando el otro participante lee el chat, cambia de "Enviado" a "Visto"
    act(() => {
      onRemoteReadRef.current?.("2026-10-30T10:11:00.000Z", "u2");
    });
    expect(screen.getByText(/Visto/)).toBeInTheDocument();

    // Estado de presencia en el encabezado: Inactivo → Activo ahora
    expect(screen.getByText("Inactivo")).toBeInTheDocument();
    act(() => {
      onPresenceRef.current?.(new Set(["u2"]));
    });
    expect(screen.getByText("Activo ahora")).toBeInTheDocument();

    // Si además llega por socket message:new con el mismo id, no duplica la burbuja
    act(() => {
      onMessageRef.current?.(sentMessage);
    });
    expect(screen.getAllByText("Hola en vivo")).toHaveLength(2);
  });

  it("abre directamente la conversación cuando viene ?username= desde un perfil", async () => {
    searchParams.value = new URLSearchParams("username=beto");
    const newConv: ConversationDto = {
      ...CONV_BETO,
      lastMessage: null,
      unread: 0,
    };
    const emptyPage: MessagePageDto = { items: [], nextCursor: null };

    apiFetchClient
      .mockResolvedValueOnce(ME)
      .mockResolvedValueOnce([]) // bandeja vacía (aún no hay mensajes)
      .mockResolvedValueOnce(newConv) // POST /api/conversations { username: "beto" }
      .mockResolvedValueOnce(emptyPage); // GET /api/conversations/c1/messages

    render(<ChatPage />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Aún no hay mensajes. Envía el primero para iniciar la conversación.",
        ),
      ).toBeInTheDocument();
    });
    expect(apiFetchClient).toHaveBeenCalledWith("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "beto" }),
    });
  });

  it("muestra 'No tienes permiso.' si el servidor rechaza con 403 o forbidden (caso prohibido, RN09)", async () => {
    const user = userEvent.setup();
    apiFetchClient
      .mockResolvedValueOnce(ME)
      .mockResolvedValueOnce([{ ...CONV_BETO, unread: 0 }])
      .mockRejectedValueOnce(
        new ApiError(
          {
            statusCode: 403,
            error: "Forbidden",
            message: "No participas",
            details: [],
          },
          403,
        ),
      );

    render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByText("Beto Pérez")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Beto Pérez/ }));

    await waitFor(() => {
      expect(screen.getByText("No tienes permiso.")).toBeInTheDocument();
    });
  });
});
