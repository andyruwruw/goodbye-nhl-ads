/**
 * Decides whether a commercial break is on screen by looking for ESPN's
 * break overlay: the box in the bottom-left of the player with the break
 * countdown. It shows for real ads (with a yellow "Ad" label) and for
 * "Commercial Break, We'll be Right Back" slates (countdown only).
 */
class AdBadgeDetector {
  /** ESPN's break overlay, found via recon on 2026-11-11. */
  static DEFAULT_SELECTOR = '.ad-badge-overlay--container';

  /** Fallback: short text that starts with "Ad", e.g. `Ad`, `AD 0:30`, `Ad 1 of 3`. */
  static AD_TEXT = /^(ad|ads|advertisement)(\s|$|\d|[:·•|(-])/i;

  /**
   * @param {string} [selector] - User override from the popup; blank uses the default.
   */
  constructor(selector = '') {
    this.selector = selector;
  }

  /**
   * The visible break badge, if any.
   *
   * @param {HTMLVideoElement} video - The main video.
   * @returns {Element | null} The badge element, or null when no break is showing.
   */
  findBadge(video) {
    return this.#findBySelector(this.selector || AdBadgeDetector.DEFAULT_SELECTOR) ?? this.#findByText(video);
  }

  /**
   * First visible element matching `selector`, searching shadow roots too.
   *
   * @param {string} selector - CSS selector.
   * @returns {Element | null} The match, or null.
   */
  #findBySelector(selector) {
    return DomWalk.queryDeep(document, selector).find((el) => DomWalk.isVisible(el)) ?? null;
  }

  /**
   * Last resort if ESPN renames the overlay: a visible element over the
   * video whose own text (or aria-label) starts with "Ad".
   *
   * @param {HTMLVideoElement} video - The main video.
   * @returns {Element | null} The match, or null.
   */
  #findByText(video) {
    const videoRect = video.getBoundingClientRect();
    for (const el of DomWalk.elements(PlayerLocator.findContainer(video))) {
      const text = DomWalk.ownText(el) || el.getAttribute('aria-label') || '';
      if (!text || text.length > 30 || !AdBadgeDetector.AD_TEXT.test(text)) continue;
      if (!DomWalk.isVisible(el)) continue;
      if (!DomWalk.centerInside(el.getBoundingClientRect(), videoRect)) continue;
      return el;
    }
    return null;
  }
}
