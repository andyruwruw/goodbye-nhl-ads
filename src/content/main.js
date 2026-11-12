/**
 * Content-script entry point. Wires the user's settings to the muter and the
 * recon watchers, and routes messages from the page-world stream sniffer and
 * from the popup. Everything stays stopped unless `PlayerPage.active`.
 */
class HateNhlAds {
  /** `source` tag on messages posted by src/page/stream-sniffer.js. */
  static PAGE_SOURCE = 'hate-nhl-ads-page';

  #settings = Settings.DEFAULTS;
  #mute = new MuteController(new AdBadgeDetector(), (ad, badge, video) => this.#onAdChange(ad, badge, video));
  #recon = new ReconScanner();
  #network = new NetworkSniffer();

  /**
   * Applies the stored settings and starts listening for setting changes,
   * in-page navigation, and messages.
   *
   * @returns {Promise<void>} Resolves once running.
   */
  async start() {
    this.#apply(await Settings.load());
    Settings.onChange((settings) => this.#apply(settings));
    PlayerPage.onChange(() => this.#apply(this.#settings));
    window.addEventListener('message', (event) => this.#onPageMessage(event));
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => this.#onRuntimeMessage(message, sendResponse));
  }

  /**
   * Starts or stops each part to match the settings, and stops everything
   * when not on the player page.
   *
   * @param {typeof Settings.DEFAULTS} settings - Current settings.
   */
  #apply(settings) {
    this.#settings = settings;
    this.#mute.detector.selector = settings.badgeSelector.trim();
    const onPlayer = PlayerPage.active;

    if (settings.enabled && onPlayer) this.#mute.start();
    else this.#mute.stop();

    if (settings.recon && onPlayer) {
      this.#recon.start();
      this.#network.start();
    } else {
      this.#recon.stop();
      this.#network.stop();
    }
  }

  /**
   * Logs break start/end in recon mode, with the element that triggered it.
   *
   * @param {boolean} ad - True when a break started, false when it ended.
   * @param {Element | null} badge - The badge that was detected (start only).
   * @param {HTMLVideoElement} video - The main video.
   */
  #onAdChange(ad, badge, video) {
    if (!this.#recon.running) return;
    ReconLog.add('detector', { ad, badge: badge ? DomWalk.describe(badge, video) : undefined });
  }

  /**
   * Logs playlist ad cues forwarded by the page-world stream sniffer.
   *
   * @param {MessageEvent} event - A window message.
   */
  #onPageMessage(event) {
    if (event.source !== window || event.data?.source !== HateNhlAds.PAGE_SOURCE) return;
    if (!this.#recon.running) return;
    const { kind, url, line } = event.data;
    ReconLog.add(kind, { url, line });
  }

  /**
   * Handles the popup's "Mark" buttons by logging a full snapshot. Logged
   * even outside recon mode, since the user asked for it explicitly, but
   * only on the player page. Replies only when a marker was logged, so the
   * popup can tell a player tab from any other tab.
   *
   * @param {{ type: string, label: string }} message - Message from the popup.
   * @param {(response: { ok: true }) => void} sendResponse - Reply to the popup.
   */
  #onRuntimeMessage(message, sendResponse) {
    if (message?.type !== 'mark' || !PlayerPage.active) return;
    ReconLog.add('marker', { label: message.label, ...this.#recon.snapshot() });
    sendResponse({ ok: true });
  }
}

new HateNhlAds().start();
