/**
 * Floating "muted for the break" panel with an Unmute / Mute button, shown
 * over the top-right of the video while a break is on.
 *
 * It's a manual popover, so it renders in the browser's top layer above the
 * player (including in fullscreen), and its contents live in a closed shadow
 * root so ESPN's page styles can't leak in.
 */
class AdOverlay {
  /** Extension stylesheets adopted into the shadow root (klomp tokens, then panel styles). */
  static STYLESHEETS = ['src/shared/theme.css', 'src/content/ad-overlay.css'];

  /** Gap between the panel and the video's top-right corner. */
  static OFFSET_PX = 16;

  static SVG_NS = 'http://www.w3.org/2000/svg';

  /** Shared attributes for the 24x24 stroke icons (Lucide style). */
  static SVG_ATTRS = {
    'viewBox': '0 0 24 24',
    'fill': 'none',
    'stroke': 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  };

  /** Speaker body shared by both icons. */
  static SPEAKER = { tag: 'polygon', points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5' };

  /** Icon shapes: speaker with an X (muted) or with sound waves. */
  static ICONS = {
    muted: [
      AdOverlay.SPEAKER,
      { tag: 'line', x1: '22', y1: '9', x2: '16', y2: '15' },
      { tag: 'line', x1: '16', y1: '9', x2: '22', y2: '15' },
    ],
    sound: [
      AdOverlay.SPEAKER,
      { tag: 'path', d: 'M15.54 8.46a5 5 0 0 1 0 7.07' },
      { tag: 'path', d: 'M19.07 4.93a10 10 0 0 1 0 14.14' },
    ],
  };

  /** Popover host element; built lazily on first show. */
  #host = null;
  #icon = null;
  #label = null;
  #button = null;

  /** State last rendered, so ticks only touch the DOM when it changes. */
  #soundOn = null;

  /**
   * @param {() => void} onToggle - Called when the Unmute / Mute button is clicked.
   */
  constructor(onToggle) {
    this.onToggle = onToggle;
  }

  /**
   * Shows (or updates) the panel next to the video. Cheap to call every tick.
   *
   * @param {HTMLVideoElement} video - The main video, for positioning.
   * @param {boolean} soundOn - True if the user unmuted this break.
   */
  show(video, soundOn) {
    this.#host ??= this.#build();
    if (soundOn !== this.#soundOn) this.#render(soundOn);
    this.#position(video);
    if (!this.#host.matches(':popover-open')) this.#host.showPopover();
  }

  /**
   * Hides the panel. Safe to call when it was never shown.
   */
  hide() {
    if (this.#host?.matches(':popover-open')) this.#host.hidePopover();
  }

  /**
   * Creates the popover host, its shadow root, and the panel markup.
   *
   * @returns {HTMLElement} The host, already attached to the page.
   */
  #build() {
    const host = document.createElement('hate-nhl-ads-overlay');
    host.popover = 'manual';
    // Always dark: it sits on top of video.
    host.className = 'dark';
    // Undo the browser's default popover box (centered, bordered, opaque).
    host.style.cssText = 'position: fixed; inset: auto; margin: 0; padding: 0; border: 0; background: transparent; overflow: visible;';

    const root = host.attachShadow({ mode: 'closed' });
    AdOverlay.#loadStyles(root);

    const panel = document.createElement('div');
    panel.className = 'overlay';
    this.#icon = document.createElementNS(AdOverlay.SVG_NS, 'svg');
    this.#icon.setAttribute('class', 'overlay__icon');
    this.#label = document.createElement('span');
    this.#button = document.createElement('button');
    this.#button.type = 'button';
    this.#button.addEventListener('click', () => this.onToggle());
    panel.append(this.#icon, this.#label, this.#button);
    root.append(panel);

    document.addEventListener('fullscreenchange', () => this.#raise());
    document.body.append(host);
    return host;
  }

  /**
   * Updates the label, button, and icon for the current mute state.
   *
   * @param {boolean} soundOn - True if the user unmuted this break.
   */
  #render(soundOn) {
    this.#soundOn = soundOn;
    this.#label.textContent = soundOn ? 'Sound on for this break' : 'Muted for commercial break';
    this.#button.textContent = soundOn ? 'Mute' : 'Unmute';
    this.#button.className = soundOn ? 'overlay__button overlay__button--secondary' : 'overlay__button';
    AdOverlay.#drawIcon(this.#icon, soundOn ? AdOverlay.ICONS.sound : AdOverlay.ICONS.muted);
  }

  /**
   * Pins the panel to the video's top-right corner, clamped to the viewport.
   *
   * @param {HTMLVideoElement} video - The main video.
   */
  #position(video) {
    const rect = video.getBoundingClientRect();
    this.#host.style.top = `${Math.max(rect.top, 0) + AdOverlay.OFFSET_PX}px`;
    this.#host.style.right = `${Math.max(innerWidth - rect.right, 0) + AdOverlay.OFFSET_PX}px`;
  }

  /**
   * Entering fullscreen puts the player at the top of the top layer, above
   * the panel. Re-showing the popover moves it back above the player.
   */
  #raise() {
    if (!this.#host?.matches(':popover-open')) return;
    this.#host.hidePopover();
    this.#host.showPopover();
  }

  /**
   * Fetches the extension stylesheets and adopts them into the shadow root.
   * Constructed stylesheets aren't blocked by the page's CSP the way `<link>`
   * and `<style>` tags can be.
   *
   * @param {ShadowRoot} root - The panel's shadow root.
   * @returns {Promise<void>} Resolves once styles are applied.
   */
  static async #loadStyles(root) {
    root.adoptedStyleSheets = await Promise.all(AdOverlay.STYLESHEETS.map(async (path) => {
      const css = await fetch(chrome.runtime.getURL(path)).then((response) => response.text());
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      return sheet;
    }));
  }

  /**
   * Replaces the icon's shapes. Built with DOM APIs rather than innerHTML so
   * it works on pages that enforce Trusted Types.
   *
   * @param {SVGSVGElement} svg - The icon element.
   * @param {Array<{ tag: string }>} shapes - Shapes, each a tag name plus attributes.
   */
  static #drawIcon(svg, shapes) {
    for (const [name, value] of Object.entries(AdOverlay.SVG_ATTRS)) svg.setAttribute(name, value);
    svg.replaceChildren(...shapes.map(({ tag, ...attrs }) => {
      const el = document.createElementNS(AdOverlay.SVG_NS, tag);
      for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
      return el;
    }));
  }
}
