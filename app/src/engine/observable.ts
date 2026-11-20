// Minimal observable values, replacing RxJS BehaviorSubject/Subject.

export type Unsubscribe = () => void;

/** A value that notifies subscribers on change (like a BehaviorSubject). */
export class Value<T> {
  private listeners = new Set<(value: T) => void>();
  constructor(private current: T) {}

  get value(): T {
    return this.current;
  }

  set(next: T): void {
    this.current = next;
    for (const listener of [...this.listeners]) listener(next);
  }

  /** Calls the listener now and on every change. */
  subscribe(listener: (value: T) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(this.current);
    return () => this.listeners.delete(listener);
  }
}

/** Fire-and-forget events (like a Subject). */
export class Emitter<T = void> {
  private listeners = new Set<(value: T) => void>();

  emit(value: T): void {
    for (const listener of [...this.listeners]) listener(value);
  }

  on(listener: (value: T) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // randomUUID needs a secure context; plain http (LAN testing) falls back here.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
