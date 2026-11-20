/** How close (in degrees) another pin must be for a label to give way: about 5 km across, 1.5 km up and down. */
const NEAR_LNG = 0.05;
const NEAR_LAT = 0.015;

/**
 * Which side a hospital's label goes, from where its neighbours are (no per-hospital list): right by default, left when a pin is close
 * on its east, below when pins are close on both sides (the SGH-AH-NUH cluster), so labels don't sit on each other or get cut short.
 */
export function labelSide(h: { code: string; latitude: number; longitude: number },
                          all: { code: string; latitude: number; longitude: number }[]): "right" | "left" | "bottom" {
  const near = all.filter((o) => o.code !== h.code && Math.abs(o.latitude - h.latitude) < NEAR_LAT);
  const east = near.some((o) => o.longitude > h.longitude && o.longitude - h.longitude < NEAR_LNG);
  const west = near.some((o) => o.longitude < h.longitude && h.longitude - o.longitude < NEAR_LNG);
  return east && west ? "bottom" : east ? "left" : "right";
}
