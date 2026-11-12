/**
 * Recon mode's network watcher: logs requests whose URL looks like an ad
 * server, ad SDK, or tracking beacon.
 *
 * Uses the Resource Timing API, which sees the page's requests from the
 * isolated content-script world without wrapping fetch. Requests made from
 * web workers aren't visible here.
 */
class NetworkSniffer {
  /** Known ad / measurement hosts and ad-ish path segments. */
  static AD_URL = /doubleclick|imasdk|googlesyndication|pubads|freewheel|fwmrm|moatads|innovid|adsrvr|adsafeprotected|doubleverify|springserve|yospace|\/vast|\/vmap|[/._-]ads?[/._-]|adserver|scte|beacon|impression/i;

  /** Repeat hits on the same URL within this window are logged once. */
  static DEDUPE_MS = 10000;

  #observer = null;

  /** URL (without query) -> last time it was logged. */
  #recent = new Map();

  /**
   * Starts observing new requests. Does nothing if already started.
   */
  start() {
    if (this.#observer) return;
    this.#observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) this.#check(entry.name, entry.initiatorType);
    });
    this.#observer.observe({ type: 'resource' });
  }

  /**
   * Stops observing.
   */
  stop() {
    this.#observer?.disconnect();
    this.#observer = null;
  }

  /**
   * Logs the request if it looks ad-related and wasn't logged recently.
   *
   * @param {string} url - Request URL.
   * @param {string} initiator - What started it (`xmlhttprequest`, `script`, ...).
   */
  #check(url, initiator) {
    if (!NetworkSniffer.AD_URL.test(url)) return;
    // Query strings carry per-request ids that would defeat deduping.
    const key = url.split('?')[0];
    const now = Date.now();
    if (now - (this.#recent.get(key) ?? 0) < NetworkSniffer.DEDUPE_MS) return;
    this.#recent.set(key, now);
    ReconLog.add('ad-request', { url: key.slice(0, 200), initiator });
  }
}
