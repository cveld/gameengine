import { readJson, readText, writeJson, writeText } from "./storage";

const ACTIVE_KEY = "activeProfile";
const RECENT_KEY = "recentProfiles";
const MAX_RECENT = 5;

// Remembers who's playing across a page refresh, and a short list of recently
// used names so switching profiles doesn't require retyping.
export const profile = {
  active(): string | null {
    return readText(ACTIVE_KEY);
  },
  setActive(name: string): void {
    writeText(ACTIVE_KEY, name);
    const recent = [name, ...profile.recent().filter(p => p !== name)].slice(0, MAX_RECENT);
    writeJson(RECENT_KEY, recent);
  },
  clearActive(): void {
    writeText(ACTIVE_KEY, null);
  },
  recent(): string[] {
    const value = readJson<unknown>(RECENT_KEY, []);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  }
};
