import type { AppManifest } from "./types.ts";
import type { Prefs } from "./storage.ts";

export interface ScreenProps {
  manifest: AppManifest;
  prefs: Prefs;
  updatePref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  navigate: (to: string) => void;
}

export function navigate(to: string): void {
  window.location.hash = to.startsWith("#") ? to : `#${to}`;
}
