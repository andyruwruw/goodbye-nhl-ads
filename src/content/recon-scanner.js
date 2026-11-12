/**
 * Recon mode's DOM watcher. Once a second it looks for anything ad-like on
 * the page and logs when each one appears and disappears, so a break's
 * on-screen signals can be lined up against the user's markers afterward.
 *
 * Also logs iframes (in case the player lives in one) and video element
 * changes (new element, mute, pause, source).
 */
class ReconScanner extends PollingTask {
  static INTERVAL_MS = 1000;

  /** Ad-like visible text or aria-labels. */
  static TEXT = /\b(ad|ads|advert\w*|commercial|sponsor\w*|break|will resume|be right back)\b/i;

  /** Ad-like tokens in class, id, or test-id attributes (`ad-badge`, `ima-container`, ...). */
  static ATTR = /(^|[-_\s])(ad|ads|adv|advert\w*|commercial|sponsor\w*|ima|vast|ssai)([-_\s]|$)/i;

  /** Currently visible candidates: CSS path -> time first seen. */
  #visible = new Map();

  /** Stable ids for video elements, to spot when the player swaps them. */
  #videoIds = new WeakMap();
  #nextVideoId = 1;

  /** Last logged video state, serialized, to log only on change. */
  #videoState = '';

  /** Iframe sources already logged. */
  #iframes = new Set();

  constructor() {
    super(ReconScanner.INTERVAL_MS);
  }

  /**
   * Starts scanning and marks the start in the log.
   */
  start() {
    if (this.running) return;
    ReconLog.add('recon-start', { url: location.href.split('?')[0] });
    super.start();
  }

  /**
   * Stops scanning and forgets what was visible.
   */
  stop() {
    super.stop();
    this.#visible.clear();
  }

  tick() {
    const video = PlayerLocator.findVideo();
    this.#scanIframes();
    this.#scanVideo(video);
    this.#scanCandidates(video);
  }

  /**
   * Everything ad-like on screen right now, for the popup's Mark buttons.
   *
   * @returns {{ video: object | null, candidates: object[] }} Video state and candidate descriptions.
   */
  snapshot() {
    const video = PlayerLocator.findVideo();
    return {
      video: video ? this.#describeVideo(video) : null,
      candidates: this.#collect(video).map(({ el, reasons }) => ({ reasons, ...DomWalk.describe(el, video) })),
    };
  }

  /**
   * Logs each iframe source the first time it's seen.
   */
  #scanIframes() {
    for (const frame of document.querySelectorAll('iframe')) {
      const src = (frame.src || '(no src)').split('?')[0];
      if (this.#iframes.has(src)) continue;
      this.#iframes.add(src);
      ReconLog.add('iframe', { src });
    }
  }

  /**
   * Logs the video's state whenever it changes.
   *
   * @param {HTMLVideoElement | null} video - The main video.
   */
  #scanVideo(video) {
    const description = video ? this.#describeVideo(video) : { none: true };
    const state = JSON.stringify(description);
    if (state === this.#videoState) return;
    this.#videoState = state;
    ReconLog.add('video', description);
  }

  /**
   * @param {HTMLVideoElement} video - Video to describe.
   * @returns {object} Id, mute/pause state, duration, source, and video count.
   */
  #describeVideo(video) {
    if (!this.#videoIds.has(video)) this.#videoIds.set(video, this.#nextVideoId++);
    return {
      id: this.#videoIds.get(video),
      muted: video.muted,
      paused: video.paused,
      // Live streams report Infinity, which JSON can't hold.
      duration: Number.isFinite(video.duration) ? Math.round(video.duration) : String(video.duration),
      src: video.currentSrc.slice(0, 80),
      count: document.querySelectorAll('video').length,
    };
  }

  /**
   * Diffs the current candidates against the last scan and logs each
   * appearance and disappearance.
   *
   * @param {HTMLVideoElement | null} video - The main video.
   */
  #scanCandidates(video) {
    const now = Date.now();
    const seen = new Set();

    for (const { el, reasons } of this.#collect(video)) {
      // Keyed by path only, so a ticking countdown doesn't log every second.
      const path = DomWalk.cssPath(el);
      seen.add(path);
      if (this.#visible.has(path)) continue;
      this.#visible.set(path, now);
      ReconLog.add('appear', { reasons, ...DomWalk.describe(el, video) });
    }

    for (const [path, since] of this.#visible) {
      if (seen.has(path)) continue;
      this.#visible.delete(path);
      ReconLog.add('disappear', { path, shownForMs: now - since });
    }
  }

  /**
   * Every visible element that looks ad-related, with the reasons it matched:
   * `text` (ad-like text), `attr` (ad-like class/id), or `yellow` (a small
   * yellow element inside the player).
   *
   * @param {HTMLVideoElement | null} video - The main video.
   * @returns {Array<{ el: Element, reasons: string[] }>} Matches.
   */
  #collect(video) {
    const container = video ? PlayerLocator.findContainer(video) : null;
    const videoRect = video?.getBoundingClientRect();
    const results = [];

    for (const el of DomWalk.elements(document.body)) {
      const reasons = [];

      const text = DomWalk.ownText(el);
      const aria = el.getAttribute('aria-label') ?? '';
      if ((text && text.length <= 60 && ReconScanner.TEXT.test(text)) || ReconScanner.TEXT.test(aria)) {
        reasons.push('text');
      }

      const attrs = [
        el.getAttribute('class'),
        el.id,
        el.getAttribute('data-testid'),
        el.getAttribute('data-test-id'),
      ].join(' ');
      if (ReconScanner.ATTR.test(attrs)) reasons.push('attr');

      if (container?.contains(el) && ReconScanner.#isYellowBadge(el, videoRect)) reasons.push('yellow');

      if (reasons.length && DomWalk.isVisible(el)) results.push({ el, reasons });
    }
    return results;
  }

  /**
   * A badge-sized element (under a third of the video's width) with a
   * yellow background or text.
   *
   * @param {Element} el - Element to check.
   * @param {DOMRect} videoRect - The video's bounds.
   * @returns {boolean} True if it looks like a yellow badge.
   */
  static #isYellowBadge(el, videoRect) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.width > videoRect.width / 3) return false;
    const style = getComputedStyle(el);
    return DomWalk.isYellow(style.backgroundColor) || DomWalk.isYellow(style.color);
  }
}
