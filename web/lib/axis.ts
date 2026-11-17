/**
 * A chart axis from the figures it has to show: a round step (1, 2, 2.5 or 5 times a power of ten) and the first tick at or above
 * the largest value. Presentation only: it decides where gridlines and labels go, never what a figure is or how it is classed.
 */
export interface Axis {
  /** The scale's top (or, for a symmetric axis, its +/- extent). */
  max: number;
  step: number;
  ticks: number[];
}

/** A round step that splits [0, max] into about `target` parts. */
export function niceStep(max: number, target = 4): number {
  if (!(max > 0) || !Number.isFinite(max)) return 1;
  const raw = max / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const f = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return f * mag;
}

/** 0 to the first round tick at or above `max`. */
export function niceAxis(max: number, target = 4): Axis {
  const step = niceStep(max, target);
  const top = Math.max(step, Math.ceil(max / step - 1e-9) * step);
  const ticks: number[] = [];
  for (let i = 0; i * step <= top + 1e-9; i += 1) ticks.push(Number((i * step).toPrecision(12)));
  return { max: top, step, ticks };
}

/** -extent to +extent about 0, with 0 a tick: for a % difference that can go either way. */
export function symmetricAxis(extent: number, target = 2): Axis {
  const half = niceAxis(extent, target);
  return { max: half.max, step: half.step, ticks: [...half.ticks.slice(1).reverse().map((t) => -t), ...half.ticks] };
}

/** A tick's label: as many decimals as the step needs, and no more. */
export function tickText(v: number, step: number): string {
  const digits = Number.isInteger(step) ? 0 : step * 10 === Math.round(step * 10) ? 1 : 2;
  return v.toLocaleString("en-SG", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
