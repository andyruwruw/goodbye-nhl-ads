/**
 * Append-only diagnostic log for recon mode, persisted in
 * chrome.storage.local so the popup can download it.
 *
 * Every frame of every page load writes under its own key, so frames never
 * race each other's read-modify-write; `readAll()` merges them by timestamp.
 * Writes are buffered and flushed every couple of seconds to keep storage
 * traffic low.
 */
class ReconLog {
  /** Storage key prefix shared by every frame's log. */
  static KEY_PREFIX = 'reconLog:';

  /** Oldest entries are dropped past this, per frame. */
  static MAX_ENTRIES_PER_FRAME = 2000;

  /** How long entries sit in memory before being written out. */
  static FLUSH_DELAY_MS = 2000;

  /** This frame's storage key. */
  static #key = ReconLog.KEY_PREFIX + Math.random().toString(36).slice(2, 10);

  /** Entries not yet written to storage. */
  static #buffer = [];

  /** Pending flush timer, or null when the buffer is empty. */
  static #flushTimer = null;

  /**
   * False once the extension is reloaded or removed while this page stays
   * open. Every chrome.* call from the orphaned script throws
   * "Extension context invalidated" after that, so logging just stops.
   *
   * @returns {boolean} Whether chrome.* APIs are still usable.
   */
  static get alive() {
    return Boolean(chrome.runtime?.id);
  }

  /**
   * Records an entry and mirrors it to the page console.
   *
   * @param {string} kind - Entry type, e.g. `appear`, `stream-cue`, `marker`.
   * @param {object} [data] - Extra fields merged into the entry.
   */
  static add(kind, data = {}) {
    if (!ReconLog.alive) return;
    const entry = {
      t: new Date().toISOString(),
      frame: location.host + location.pathname,
      kind,
      ...data,
    };
    console.log('[hate-nhl-ads]', kind, data);
    ReconLog.#buffer.push(entry);
    ReconLog.#flushTimer ??= setTimeout(() => ReconLog.#flush(), ReconLog.FLUSH_DELAY_MS);
  }

  /**
   * Every frame's entries, oldest first.
   *
   * @returns {Promise<object[]>} All stored entries.
   */
  static async readAll() {
    const all = await chrome.storage.local.get(null);
    return Object.entries(all)
      .filter(([key]) => key.startsWith(ReconLog.KEY_PREFIX))
      .flatMap(([, entries]) => entries)
      .sort((a, b) => a.t.localeCompare(b.t));
  }

  /**
   * Deletes every frame's entries.
   *
   * @returns {Promise<void>} Resolves once removed.
   */
  static async clear() {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter((key) => key.startsWith(ReconLog.KEY_PREFIX));
    await chrome.storage.local.remove(keys);
  }

  /**
   * Appends the buffered entries to this frame's stored log, trimming it to
   * the newest `MAX_ENTRIES_PER_FRAME`.
   *
   * @returns {Promise<void>} Resolves once written.
   */
  static async #flush() {
    ReconLog.#flushTimer = null;
    const pending = ReconLog.#buffer.splice(0);
    if (!ReconLog.alive) return;
    const { [ReconLog.#key]: existing = [] } = await chrome.storage.local.get(ReconLog.#key);
    const merged = existing.concat(pending).slice(-ReconLog.MAX_ENTRIES_PER_FRAME);
    await chrome.storage.local.set({ [ReconLog.#key]: merged });
  }
}
