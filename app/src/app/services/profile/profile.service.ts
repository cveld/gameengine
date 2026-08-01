import { Injectable } from '@angular/core';

const ACTIVE_KEY = 'activeProfile';
const RECENT_KEY = 'recentProfiles';
const MAX_RECENT = 5;

// Remembers who's playing across a page refresh, and a short list of
// recently used names so switching profiles doesn't require retyping.
@Injectable({
  providedIn: 'root'
})
export class ProfileService {

  getActiveProfile(): string | null {
    return localStorage.getItem(ACTIVE_KEY);
  }

  setActiveProfile(name: string): void {
    localStorage.setItem(ACTIVE_KEY, name);
    const recent = [name, ...this.getRecentProfiles().filter(p => p !== name)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  }

  clearActiveProfile(): void {
    localStorage.removeItem(ACTIVE_KEY);
  }

  getRecentProfiles(): string[] {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
