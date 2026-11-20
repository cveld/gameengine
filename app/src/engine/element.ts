import { LitElement } from "lit";
import type { Unsubscribe } from "./observable";

/**
 * Lit element rendered into the light DOM, so the global Bootstrap styles apply
 * exactly as they did in the Angular templates.
 */
export class PageElement extends LitElement {
  private cleanups: Unsubscribe[] = [];

  protected createRenderRoot(): HTMLElement {
    return this;
  }

  /** Re-render when a Value changes; released on disconnect. */
  protected watch<T>(source: { subscribe(listener: (value: T) => void): Unsubscribe }): void {
    this.cleanups.push(source.subscribe(() => this.requestUpdate()));
  }

  protected track(cleanup: Unsubscribe): void {
    this.cleanups.push(cleanup);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
  }
}
