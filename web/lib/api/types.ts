/**
 * Friendly names for the generated API types (lib/api/schema.d.ts, from api/openapi.json).
 * Safe to import anywhere, including client components: types only, no code.
 */
import type { components, paths } from "./schema";

type Schemas = components["schemas"];

export type Meta = Schemas["Meta"];
export type Source = Schemas["Source"];
export type DqWarning = Schemas["DqWarning"];
export type ErrorBody = Schemas["ErrorBody"];

export type Hospital = Schemas["Hospital"];
export type EdDay = Schemas["EdDay"];
export type EdWeek = Schemas["EdWeek"];
export type EdSummary = Schemas["EdSummary"];
export type Clinic = Schemas["Clinic"];
export type ClinicPage = Schemas["ClinicPage"];
export type AreaCollection = Schemas["AreaCollection"];
export type Svy21Collection = Schemas["Svy21Collection"];
export type QualityReport = Schemas["QualityReport"];
export type LiveReading = Schemas["LiveReading"];
export type SnapshotInfo = Schemas["SnapshotInfo"];
export type Insight = Schemas["Insight"];
export type InsightDisplay = Schemas["InsightDisplay"];
export type InsightChart = Schemas["InsightChart"];
export type PopulationYear = Schemas["PopulationYear"];

/** Query parameters of a GET endpoint, e.g. Query<"/api/v1/ed/daily">. */
export type Query<P extends keyof paths> = paths[P] extends { get: { parameters: { query?: infer Q } } }
  ? NonNullable<Q>
  : never;

/** Every successful response: the endpoint's data plus meta (as_of, sources, caveats, dq_warnings). */
export interface Envelope<T> {
  data: T;
  meta: Meta;
}
