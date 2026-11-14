// code/lib/crosscheck.mjs: compare a paid answer with a free reference.
import { CONFIG } from "./config.mjs";

export function compare(value, reference, kind, tolerance = CONFIG.tolerance) {
  if (value === null || value === undefined || Number.isNaN(value)) return "no_answer";
  if (reference === null || reference === undefined) return "unchecked";
  if (kind === "boolean") return value === reference ? "confirmed" : "looks_wrong";
  const base = Math.max(Math.abs(reference), Number.EPSILON);
  return Math.abs(value - reference) / base <= tolerance ? "confirmed" : "looks_wrong";
}

export function effectiveValue(state, value, reference) {
  return state === "looks_wrong" || state === "no_answer" ? reference ?? null : value;
}
