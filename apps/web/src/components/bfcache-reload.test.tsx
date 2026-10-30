import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BfcacheReload } from "./bfcache-reload";

const originalLocation = window.location;

// jsdom no deja usar vi.spyOn directo sobre window.location.reload (no es
// configurable); se reemplaza toda la propiedad y se restaura después de cada prueba.
function mockReload() {
  const reload = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, reload },
  });
  return reload;
}

function mockNavigationType(type: string) {
  vi.spyOn(performance, "getEntriesByType").mockReturnValue([
    { type } as PerformanceNavigationTiming,
  ]);
}

describe("BfcacheReload", () => {
  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
  });

  it("si la página se restaura desde bfcache (atrás/adelante de verdad), recarga", () => {
    const reload = mockReload();
    mockNavigationType("back_forward");
    render(<BfcacheReload />);

    window.dispatchEvent(
      Object.assign(new Event("pageshow"), { persisted: true }),
    );

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("en una carga normal (no restaurada), no recarga", () => {
    const reload = mockReload();
    mockNavigationType("navigate");
    render(<BfcacheReload />);

    window.dispatchEvent(
      Object.assign(new Event("pageshow"), { persisted: false }),
    );

    expect(reload).not.toHaveBeenCalled();
  });

  it("si persisted da true pero la navegación no fue atrás/adelante, no recarga (evita el bucle)", () => {
    // event.persisted es poco confiable en algunos navegadores: puede dar true
    // en una carga normal. Sin este chequeo cruzado, esto recargaría la página,
    // lo que dispararía pageshow otra vez y podría repetirse sin parar.
    const reload = mockReload();
    mockNavigationType("navigate");
    render(<BfcacheReload />);

    window.dispatchEvent(
      Object.assign(new Event("pageshow"), { persisted: true }),
    );

    expect(reload).not.toHaveBeenCalled();
  });
});
