/**
 * Event annotations for time-series charts: public holidays, Chinese New Year, changes in what a source covers.
 * The list comes from the warehouse (a pipeline table, never typed into the web code); this file only places the
 * events that fall inside a chart's days.
 */
export type AnnotationKind = "holiday" | "source_change";

export interface Annotation {
  date: string;       // YYYY-MM-DD
  label: string;      // "Chinese New Year"
  kind: AnnotationKind;
}

export interface PlacedAnnotation extends Annotation {
  /** Index into the chart's days. */
  index: number;
  /** 1-based number printed on the rule and in the key. */
  n: number;
}

/** The annotations that fall on one of `days`, in date order and numbered from 1. Others are ignored, never clamped to an edge. */
export function placeAnnotations(list: readonly Annotation[], days: readonly string[]): PlacedAnnotation[] {
  const at = new Map(days.map((d, i) => [d, i]));
  return [...list]
    .filter((a) => at.has(a.date))
    .sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label))
    .map((a, k) => ({ ...a, index: at.get(a.date) as number, n: k + 1 }));
}
