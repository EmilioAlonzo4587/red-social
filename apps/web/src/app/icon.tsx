import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Burbuja de chat blanca sobre el verde de la marca (--color-primary). Generado
// con next/og en vez de un archivo de imagen: no hace falta ningún diseño externo.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#16a34a",
          borderRadius: 8,
        }}
      >
        <div
          style={{
            position: "relative",
            display: "flex",
            width: 18,
            height: 13,
            background: "white",
            borderRadius: 4,
          }}
        >
          <div
            style={{
              position: "absolute",
              bottom: -4,
              left: 4,
              width: 0,
              height: 0,
              borderLeft: "4px solid transparent",
              borderRight: "4px solid transparent",
              borderTop: "5px solid white",
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
