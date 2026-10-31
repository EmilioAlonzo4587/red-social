import type { CSSProperties } from "react";

// Proporción por defecto si una imagen vieja no trae medidas
const FALLBACK_RATIO = 4 / 3;

/**
 * Caja con la proporción real de la imagen (S4-15): lo más grande que quepa en
 * maxWidth × maxHeight sin pasar de su ancho real, así nunca se recorta ni se estira.
 * maxWidth y maxHeight son longitudes CSS ("100%", "32rem", "100cqh", "85dvh").
 */
export function mediaBoxStyle(
  media: { width: number; height: number },
  maxWidth: string,
  maxHeight: string,
): CSSProperties {
  const hasSize = media.width > 0 && media.height > 0;
  const ratio = hasSize ? media.width / media.height : FALLBACK_RATIO;
  const limits = [maxWidth, `calc(${maxHeight} * ${ratio})`];
  if (hasSize) limits.push(`${media.width}px`);
  return {
    width: `min(${limits.join(", ")})`,
    aspectRatio: hasSize ? `${media.width} / ${media.height}` : "4 / 3",
  };
}
