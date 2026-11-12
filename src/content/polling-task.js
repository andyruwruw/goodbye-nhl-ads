/**
 * Base class for work that runs on a fixed interval while enabled. Subclasses
 * implement `tick()` and may extend `start()` / `stop()`.
 *
 * Polling (rather than a MutationObserver) is deliberate: the ESPN player
 * re-renders its UI constantly, so a cheap fixed-rate check is both simpler
 * and lighter than reacting to every DOM mutation.
 *
 * @abstract
 */
class PollingTask {
  /** Interval handle, or null while stopped. */
  #timer = null;

  /**
   * @param {number} intervalMs - Milliseconds between ticks.
   */
  constructor(intervalMs) {
    if (new.target === PollingTask) throw new TypeError('PollingTask is abstract');
    this.intervalMs = intervalMs;
  }

  /**
   * @returns {boolean} Whether the task is currently ticking.
   */
  get running() {
    return this.#timer !== null;
  }

  /**
   * Starts ticking. Does nothing if already running.
   */
  start() {
    if (this.running) return;
    this.#timer = setInterval(() => this.tick(), this.intervalMs);
  }

  /**
   * Stops ticking. Safe to call when already stopped.
   */
  stop() {
    clearInterval(this.#timer);
    this.#timer = null;
  }

  /**
   * One unit of work, run every `intervalMs` while started.
   *
   * @abstract
   */
  tick() {
    throw new Error(`${this.constructor.name} must implement tick()`);
  }
}
