import { parseScope } from "./combine.ts";
import type { Mode, ScopeGroup } from "./types.ts";

/** Every screen the hash router can reach; `unknown` is the error screen. */
export type Route =
  | { kind: "home" }
  | { kind: "course"; courseId: string }
  | { kind: "quiz"; examId: string; mode: Mode }
  | { kind: "combined"; courseId: string; groups: ScopeGroup[]; mode: Mode }
  | { kind: "results"; attemptId: number }
  | { kind: "unknown" };

function modeOf(value: string | undefined): Mode {
  return value === "exam" ? "exam" : "practice";
}

/** Parse `window.location.hash`; trailing segments are ignored. */
export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts.length === 0) return { kind: "home" };
  if (parts[0] === "course") {
    return { kind: "course", courseId: parts[1] ?? "" };
  }
  if (parts[0] === "quiz") {
    return { kind: "quiz", examId: parts[1] ?? "", mode: modeOf(parts[2]) };
  }
  if (parts[0] === "combined") {
    const groups = parseScope(parts[2] ?? "");
    if (groups.length === 0) return { kind: "unknown" };
    return {
      kind: "combined",
      courseId: parts[1] ?? "",
      groups,
      mode: modeOf(parts[3]),
    };
  }
  if (parts[0] === "results") {
    const attemptId = Number(parts[1]);
    return Number.isInteger(attemptId)
      ? { kind: "results", attemptId }
      : { kind: "unknown" };
  }
  return { kind: "unknown" };
}
