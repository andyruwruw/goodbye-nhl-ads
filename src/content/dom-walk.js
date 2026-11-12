/**
 * DOM helpers that see through shadow roots. ESPN's player is built from web
 * components (`espn-web-player-ui`, `ad-badge-overlay`, ...), so plain
 * `querySelectorAll` can miss what we're looking for.
 */
class DomWalk {
  /**
   * Every element under `root` in document order, descending into open
   * shadow roots.
   *
   * @param {Element | Document | ShadowRoot} root - Where to start.
   * @yields {Element} Each element found.
   */
  static *elements(root) {
    const stack = [root];
    while (stack.length) {
      const node = stack.pop();
      if (node.nodeType === Node.ELEMENT_NODE) yield node;
      if (node.shadowRoot) stack.push(node.shadowRoot);
      // Pushed in reverse so they pop off in document order.
      for (let child = node.lastElementChild; child; child = child.previousElementSibling) {
        stack.push(child);
      }
    }
  }

  /**
   * `querySelectorAll` that also searches inside open shadow roots.
   *
   * @param {Document | Element | ShadowRoot} root - Where to start.
   * @param {string} selector - CSS selector to match.
   * @returns {Element[]} Every match, light DOM first.
   */
  static queryDeep(root, selector) {
    const matches = [...root.querySelectorAll(selector)];
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) matches.push(...DomWalk.queryDeep(el.shadowRoot, selector));
    }
    return matches;
  }

  /**
   * The element's own text (direct text-node children only, not
   * descendants), whitespace-collapsed.
   *
   * @param {Element} el - Element to read.
   * @returns {string} Its direct text.
   */
  static ownText(el) {
    let text = '';
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) text += node.nodeValue;
    }
    return text.trim().replace(/\s+/g, ' ');
  }

  /**
   * Whether the element is actually rendered: it has a size, and neither it
   * nor an ancestor is hidden by display, visibility, or zero opacity.
   *
   * @param {Element} el - Element to check.
   * @returns {boolean} True if visible.
   */
  static isVisible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    return el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  }

  /**
   * Whether the center point of `rect` falls inside `outer`.
   *
   * @param {DOMRect} rect - Rect whose center is tested.
   * @param {DOMRect} outer - Bounding rect.
   * @returns {boolean} True if the center is inside.
   */
  static centerInside(rect, outer) {
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    return x >= outer.left && x <= outer.right && y >= outer.top && y <= outer.bottom;
  }

  /**
   * Loose "is this yellow" test on a computed CSS color.
   *
   * @param {string} cssColor - An `rgb()` / `rgba()` string from getComputedStyle.
   * @returns {boolean} True for a mostly opaque yellow-ish color.
   */
  static isYellow(cssColor) {
    const match = cssColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
    if (!match) return false;
    const [r, g, b, a] = match.slice(1).map((value) => Number(value ?? 1));
    return a > 0.3 && r >= 200 && g >= 160 && b <= 110;
  }

  /**
   * Short human-readable path to the element, e.g.
   * `espn-web-player-ui > ad-badge-overlay > div.ad-badge-overlay--container`.
   * Crosses shadow boundaries via the shadow host.
   *
   * @param {Element} el - Element to describe.
   * @param {number} [depth] - Maximum number of ancestors to include.
   * @returns {string} The path.
   */
  static cssPath(el, depth = 5) {
    const parts = [];
    for (let node = el; node && parts.length < depth; node = DomWalk.#parent(node)) {
      parts.unshift(DomWalk.#selectorFor(node));
    }
    return parts.join(' > ');
  }

  /**
   * Snapshot of an element for the recon log: path, text, colors, and
   * position (absolute and relative to the video).
   *
   * @param {Element} el - Element to describe.
   * @param {HTMLVideoElement | null} video - The main video, for relative position.
   * @returns {object} Plain-JSON description.
   */
  static describe(el, video) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const info = {
      path: DomWalk.cssPath(el),
      text: DomWalk.ownText(el).slice(0, 80),
      aria: el.getAttribute('aria-label') ?? undefined,
      bg: style.backgroundColor,
      color: style.color,
      rect: [rect.left, rect.top, rect.width, rect.height].map(Math.round),
    };
    if (video) {
      // 0..1 fractions of the video box, so (0, 0.95) means bottom-left.
      const vr = video.getBoundingClientRect();
      info.relToVideo = {
        x: +((rect.left - vr.left) / vr.width).toFixed(2),
        y: +((rect.top - vr.top) / vr.height).toFixed(2),
      };
    }
    return info;
  }

  /**
   * One path segment: `tag#id.class1.class2.class3`.
   *
   * @param {Element} node - Element to describe.
   * @returns {string} The segment.
   */
  static #selectorFor(node) {
    let part = node.localName;
    if (node.id) part += '#' + node.id;
    const classes = (node.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 3);
    if (classes.length) part += '.' + classes.join('.');
    return part;
  }

  /**
   * Parent element, stepping out of a shadow root to its host.
   *
   * @param {Element} node - Element whose parent to find.
   * @returns {Element | null} The parent or shadow host, or null at the top.
   */
  static #parent(node) {
    return node.parentElement ?? node.getRootNode().host ?? null;
  }
}
