import { describe, expect, it } from "vitest";
import { validateImageFile } from "./media";

function jpeg(name: string, sizeBytes = 1024): File {
  return new File([new Uint8Array(sizeBytes)], name, { type: "image/jpeg" });
}

describe("validateImageFile", () => {
  it("acepta jpeg, png o webp de hasta 5 MB", () => {
    expect(validateImageFile(jpeg("foto.jpg"))).toBeNull();
  });

  it("rechaza un tipo no permitido", () => {
    const file = new File(["hola"], "notas.txt", { type: "text/plain" });
    expect(validateImageFile(file)).toBe("Debe ser jpeg, png o webp.");
  });

  it("rechaza un archivo de más de 5 MB", () => {
    const file = jpeg("grande.jpg", 5 * 1024 * 1024 + 1);
    expect(validateImageFile(file)).toBe("Pasa de 5 MB.");
  });
});
