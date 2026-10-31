import { act, fireEvent, render, screen } from "@testing-library/react";
import type { NotificationDto } from "@red/api-types";
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

const { onNotificationNew, activeChatUser, notifyNotificationsRead } =
  vi.hoisted(() => ({
    onNotificationNew: {
      current: null as ((n: NotificationDto) => void) | null,
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

  it("apila como máximo 3 avisos a la vez", () => {
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

    expect(screen.queryByText(/Primero/)).not.toBeInTheDocument();
    expect(screen.getByText(/Segundo/)).toBeInTheDocument();
    expect(screen.getByText(/Tercero/)).toBeInTheDocument();
    expect(screen.getByText(/Cuarto/)).toBeInTheDocument();
  });

  it("no muestra el aviso de mensaje si esa conversación ya está abierta en /chat, y en caso contrario enlaza a /chat?username=", () => {
    pathname.value = "/chat";
    activeChatUser.current = "u2";
    render(<NotificationToaster />);

    act(() => {
      onNotificationNew.current?.(
        makeNotification({
          id: "m-open",
          type: "message",
          postId: null,
          commentId: null,
          preview: "Hola desde el chat abierto",
          reaction: null,
        }),
      );
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    // Si llega un mensaje de otra persona cuya conversación NO está abierta, sí sale el aviso
    act(() => {
      onNotificationNew.current?.(
        makeNotification({
          id: "m-other",
          type: "message",
          actor: {
            id: "u3",
            username: "carla",
            displayName: "Carla",
            avatarPublicId: null,
          },
          postId: null,
          commentId: null,
          preview: "¿Tienes un minuto?",
          reaction: null,
        }),
      );
    });

    const link = screen.getByRole("link", { name: /Carla/ });
    expect(link).toHaveAttribute("href", "/chat?username=carla");
  });

  it("guarda el silencio en localStorage y limita el sonido a como máximo 1 cada 2 s", () => {
    const startMock = vi.fn();
    class FakeAudioContext {
      currentTime = 0;
      state = "running";
      destination = {};
      createOscillator() {
        return {
          type: "sine",
          frequency: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: startMock,
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
    vi.stubGlobal("AudioContext", FakeAudioContext);

    expect(playNotificationSound("like", 1000)).toBe(true);
    // Dentro de los 2 s se descarta
    expect(playNotificationSound("comment", 2500)).toBe(false);

    expect(playNotificationSound("comment", 3000)).toBe(true);

    // Silenciar persiste en localStorage e impide sonar
    setNotificationSoundMuted(true);
    expect(isNotificationSoundMuted()).toBe(true);
    expect(window.localStorage.getItem(SOUND_MUTE_STORAGE_KEY)).toBe("1");
    expect(playNotificationSound("like", 6000)).toBe(false);
  });
});
