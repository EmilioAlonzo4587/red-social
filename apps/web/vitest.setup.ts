import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Sin "globals: true" en vitest.config.mts, Testing Library no registra la limpieza sola.
afterEach(() => {
  cleanup();
});

// jsdom no implementa URLs de blob: cualquier vista previa de imagen local lo necesita.
URL.createObjectURL = vi.fn(() => "blob:mock-url");
URL.revokeObjectURL = vi.fn();
