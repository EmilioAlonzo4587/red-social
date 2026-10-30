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

describe("BfcacheReload", () => {
  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("si la página se restaura desde bfcache, recarga de verdad", () => {
    const reload = mockReload();
    render(<BfcacheReload />);

    window.dispatchEvent(
      Object.assign(new Event("pageshow"), { persisted: true }),
    );

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("en una carga normal (no restaurada), no recarga", () => {
    const reload = mockReload();
    render(<BfcacheReload />);

    window.dispatchEvent(
      Object.assign(new Event("pageshow"), { persisted: false }),
    );

    expect(reload).not.toHaveBeenCalled();
  });
});
