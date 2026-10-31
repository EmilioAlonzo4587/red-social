import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ConversationDto, NotificationDto } from "@red/api-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SOUND_MUTE_STORAGE_KEY,
  isNotificationSoundMuted,
  playNotificationSound,
  resetNotificationSoundState,
  setNotificationSoundMuted,
} from "@/lib/notification-sound";
import { NotificationToaster } from "./notification-toaster";

const { pathname } = vi.hoisted(() => ({ pathname: { value: "/feed" } }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
}));

const { apiFetchClient } = vi.hoisted(() => ({ apiFetchClient: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetchClient }));

const {
  onNotificationNew,
  onConversationUpdated,
  activeChatUser,
  notifyNotificationsRead,
} = vi.hoisted(() => ({
  onNotificationNew: {
    current: null as ((n: NotificationDto) => void) | null,
  },
  onConversationUpdated: {
    current: null as ((c: ConversationDto) => void) | null,
  },
  activeChatUser: { current: null as string | null },
  notifyNotificationsRead: vi.fn(),
}));

vi.mock("@/lib/socket", () => ({
  subscribeNotificationNew: vi.fn((cb: (n: NotificationDto) => void) => {
    onNotificationNew.current = cb;
    return () => {
      onNotificationNew.current = null;
    };
  }),
  subscribeConversationUpdated: vi.fn((cb: (c: ConversationDto) => void) => {
    onConversationUpdated.current = cb;
    return () => {
      onConversationUpdated.current = null;
    };
  }),
  getActiveChatUser: vi.fn(() => activeChatUser.current),
  notifyNotificationsRead,
}));

function makeNotification(
  overrides: Partial<NotificationDto> = {},
): NotificationDto {
  return {
    id: overrides.id ?? "n1",
    type: overrides.type ?? "comment",
    actor: overrides.actor ?? {
      id: "u2",
      username: "beto",
      displayName: "Beto",
      avatarPublicId: null,
    },
    postId: overrides.postId !== undefined ? overrides.postId : "p1",
    commentId: overrides.commentId !== undefined ? overrides.commentId : "c1",
    preview:
      overrides.preview !== undefined
        ? overrides.preview
        : "Qué buena publicación",
    reaction: overrides.reaction ?? null,
    read: overrides.read ?? false,
    createdAt: overrides.createdAt ?? "2026-10-30T15:00:00.000Z",
  };
}

// conversation:updated tal como lo recibe Ana (u1): otherUser es quien escribe si senderId coincide
function makeConversation(
  sender: { id: string; username: string; displayName: string },
  senderId: string,
  content: string,
): ConversationDto {
  return {
    id: `conv-${sender.id}`,
    otherUser: { ...sender, avatarPublicId: null },
    lastMessage: {
      id: `m-${content}`,
      conversationId: `conv-${sender.id}`,
      senderId,
      content,
      createdAt: "2026-10-31T15:00:00.000Z",
    },
    unread: 1,
  };
}

const BETO = { id: "u2", username: "beto", displayName: "Beto" };
const CARLA = { id: "u3", username: "carla", displayName: "Carla" };

class FakeAudioContext {
  static frequencies: number[] = [];
  currentTime = 0;
  state = "running";
  destination = {};
  createOscillator() {
    return {
      type: "sine",
      frequency: {
        setValueAtTime: (value: number) => {
          FakeAudioContext.frequencies.push(value);
        },
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }
  createGain() {
    return {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
  }
  resume() {
    return Promise.resolve();
  }
}

describe("NotificationToaster y sonido (S4-11)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    pathname.value = "/feed";
    activeChatUser.current = null;
    apiFetchClient.mockReset();
    apiFetchClient.mockResolvedValue({ id: "u1", username: "ana" });
    notifyNotificationsRead.mockReset();
    window.localStorage.clear();
    resetNotificationSoundState();
    FakeAudioContext.frequencies = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("una reacción muestra su emoji; si ya no existe, el texto general", () => {
    render(<NotificationToaster />);

    act(() => {
      onNotificationNew.current?.(
        makeNotification({
          id: "n1",
          type: "like",
          commentId: null,
          preview: null,
          reaction: "love",
        }),
      );
    });
    expect(screen.getByText(/reaccionó con ❤️/)).toBeInTheDocument();

    act(() => {
      onNotificationNew.current?.(
        makeNotification({
          id: "n2",
          type: "like",
          commentId: null,
          preview: null,
          reaction: null,
        }),
      );
    });
    expect(screen.getByText(/reaccionó a tu publicación/)).toBeInTheDocument();
  });

  it("muestra el aviso con actor, acción, preview y se cierra solo a los 5 s", () => {
    render(<NotificationToaster />);

    act(() => {
      onNotificationNew.current?.(makeNotification());
    });

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Beto")).toBeInTheDocument();
    expect(screen.getByText(/comentó tu publicación/)).toBeInTheDocument();
    expect(screen.getByText(/Qué buena publicación/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("pausa el cierre al pasar el mouse y permite cerrar con ✕", () => {
    render(<NotificationToaster />);

    act(() => {
      onNotificationNew.current?.(makeNotification());
    });

    const region = screen.getByRole("status");
    fireEvent.mouseEnter(region);

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    // Sigue visible porque el mouse está encima
    expect(screen.getByText("Beto")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Cerrar notificación" }),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("apila todos los avisos, sin tope, y cada uno se cierra solo (S4-15)", () => {
    render(<NotificationToaster />);

    act(() => {
      onNotificationNew.current?.(
        makeNotification({ id: "n1", preview: "Primero" }),
      );
      onNotificationNew.current?.(
        makeNotification({ id: "n2", preview: "Segundo" }),
      );
      onNotificationNew.current?.(
        makeNotification({ id: "n3", preview: "Tercero" }),
      );
      onNotificationNew.current?.(
        makeNotification({ id: "n4", preview: "Cuarto" }),
      );
    });

    expect(screen.getAllByRole("status", { hidden: true })).toHaveLength(4);
    for (const text of [/Primero/, /Segundo/, /Tercero/, /Cuarto/]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("plegados van uno encima del otro: arriba el más reciente, 2 asomando y el resto escondido; con el mouse encima se despliegan (S4-16)", () => {
    render(<NotificationToaster />);
    act(() => {
      for (const [id, preview] of [
        ["n1", "Primero"],
        ["n2", "Segundo"],
        ["n3", "Tercero"],
        ["n4", "Cuarto"],
        ["n5", "Quinto"],
      ]) {
        onNotificationNew.current?.(makeNotification({ id, preview }));
      }
    });

    const toastOf = (text: string) =>
      screen.getByText(text).closest('[role="status"]') as HTMLElement;
    // El más reciente arriba y usable
    expect(toastOf("Quinto").style.zIndex).toBe("5");
    expect(toastOf("Quinto")).not.toHaveAttribute("inert");
    // Los 2 siguientes asoman detrás, sin clics ni foco
    expect(toastOf("Cuarto").style.transform).toBe("translateY(10px) scale(0.95)");
    expect(toastOf("Tercero").style.transform).toBe("translateY(20px) scale(0.9)");
    expect(toastOf("Cuarto")).toHaveAttribute("inert");
    // El resto, escondido y fuera del lector de pantalla
    expect(toastOf("Primero").style.opacity).toBe("0");
    expect(toastOf("Primero")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getAllByRole("status")).toHaveLength(3);

    // Con el mouse encima se despliegan en lista y todos se pueden usar
    const stack = toastOf("Quinto").parentElement as HTMLElement;
    fireEvent.mouseEnter(stack);
    expect(screen.getAllByRole("status")).toHaveLength(5);
    expect(toastOf("Primero")).not.toHaveAttribute("inert");
    expect(toastOf("Primero").style.transform).toBe("");

    // Mientras el mouse está encima no se cierra ninguno
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(screen.getAllByRole("status")).toHaveLength(5);

    fireEvent.mouseLeave(stack);
    expect(screen.getAllByRole("status")).toHaveLength(3);
    // Al salir vuelven a correr los 5 s
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("muestra un aviso por cada mensaje desde conversation:updated, enlazando a /chat?username= (S4-15)", () => {
    render(<NotificationToaster />);

    act(() => {
      onConversationUpdated.current?.(makeConversation(BETO, "u2", "Hola"));
    });
    act(() => {
      onConversationUpdated.current?.(
        makeConversation(BETO, "u2", "¿Estás ahí?"),
      );
    });

    // Cada mensaje tiene su aviso, aunque sean de la misma persona
    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(screen.getAllByText(/te envió un mensaje/)).toHaveLength(2);
    expect(screen.getByText("Hola")).toBeInTheDocument();
    expect(screen.getByText("¿Estás ahí?")).toBeInTheDocument();

    // Sin tope: con 5 mensajes seguidos se ven los 5
    act(() => {
      onConversationUpdated.current?.(makeConversation(BETO, "u2", "Tercero"));
      onConversationUpdated.current?.(makeConversation(BETO, "u2", "Cuarto"));
      onConversationUpdated.current?.(makeConversation(BETO, "u2", "Quinto"));
    });
    expect(screen.getAllByRole("status", { hidden: true })).toHaveLength(5);
    expect(screen.getByText("Hola")).toBeInTheDocument();

    const link = screen.getAllByRole("link", { name: /Beto/ })[0];
    expect(link).toHaveAttribute("href", "/chat?username=beto");

    // Abrirlo no marca ninguna notificación: los mensajes no se guardan como notificación
    fireEvent.click(link);
    expect(notifyNotificationsRead).not.toHaveBeenCalled();
    expect(apiFetchClient).not.toHaveBeenCalledWith(
      "/api/notifications/read",
      expect.anything(),
    );
  });

  it("no avisa de un mensaje propio ni de uno de la conversación abierta en /chat", () => {
    pathname.value = "/chat";
    activeChatUser.current = "u2";
    render(<NotificationToaster />);

    act(() => {
      // Mensaje que escribió Ana: conversation:updated también le llega a ella
      onConversationUpdated.current?.(makeConversation(CARLA, "u1", "Mío"));
      // Mensaje de Beto con su conversación abierta
      onConversationUpdated.current?.(makeConversation(BETO, "u2", "Abierta"));
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    act(() => {
      onConversationUpdated.current?.(
        makeConversation(CARLA, "u3", "¿Tienes un minuto?"),
      );
    });
    expect(screen.getByText("¿Tienes un minuto?")).toBeInTheDocument();
  });

  it("todas las notificaciones y los mensajes suenan igual (S4-15)", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    render(<NotificationToaster />);

    const chimes: number[][] = [];
    function expectChime(trigger: () => void) {
      FakeAudioContext.frequencies = [];
      act(trigger);
      chimes.push([...FakeAudioContext.frequencies]);
    }

    for (const type of ["like", "comment", "follow", "reply"] as const) {
      expectChime(() =>
        onNotificationNew.current?.(makeNotification({ id: type, type })),
      );
    }
    expectChime(() =>
      onConversationUpdated.current?.(makeConversation(BETO, "u2", "Hola")),
    );

    expect(chimes).toHaveLength(5);
    for (const chime of chimes) {
      expect(chime).toEqual([1318.5, 2637]);
    }
  });

  it("suena con cada aviso, aunque lleguen seguidos, y guarda el silencio en localStorage (S4-15)", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    render(<NotificationToaster />);

    // Tres mensajes en el mismo instante: tres avisos y tres sonidos
    act(() => {
      for (const content of ["Uno", "Dos", "Tres"]) {
        onConversationUpdated.current?.(makeConversation(BETO, "u2", content));
      }
    });
    expect(screen.getAllByRole("status")).toHaveLength(3);
    expect(FakeAudioContext.frequencies).toEqual([
      1318.5, 2637, 1318.5, 2637, 1318.5, 2637,
    ]);
    expect(playNotificationSound()).toBe(true);

    // Silenciar persiste en localStorage e impide sonar
    setNotificationSoundMuted(true);
    expect(isNotificationSoundMuted()).toBe(true);
    expect(window.localStorage.getItem(SOUND_MUTE_STORAGE_KEY)).toBe("1");
    expect(playNotificationSound()).toBe(false);
  });
});
