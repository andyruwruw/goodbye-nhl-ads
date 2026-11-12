/**
 * Runs in the page's own JS world (not the isolated content-script world) so
 * it can wrap the page's `fetch` and `XMLHttpRequest`. It reads every HLS /
 * DASH playlist the player downloads and forwards ad-break markers to the
 * content script via `window.postMessage`.
 *
 * ESPN's playlists mark each break with `EXT-X-DATERANGE` tags
 * (`com.disney.media.break.v1` and `com.apple.hls.interstitial`), roughly 35
 * seconds before the break reaches the screen.
 *
 * Loaded at document_start so the wrappers are in place before the player
 * makes its first request.
 */
class StreamSniffer {
  /** Tag that lets the content script recognize our messages. */
  static SOURCE = 'hate-nhl-ads-page';

  /** HLS (.m3u8) and DASH (.mpd) playlist URLs. */
  static MANIFEST_URL = /\.(m3u8|mpd)(\?|$)/i;

  /** HLS tags used for ad breaks and SCTE-35 splice points. */
  static HLS_CUE = /^#(EXT-X-CUE-OUT|EXT-X-CUE-OUT-CONT|EXT-X-CUE-IN|EXT-X-CUE|EXT-X-DATERANGE|EXT-OATCLS-SCTE35|EXT-X-SCTE35|EXT-X-ASSET|EXT-X-SPLICEPOINT)\b.*$/gm;

  /** DASH elements that carry ad events or mark inserted periods. */
  static DASH_CUE = /<(EventStream|Event|Period)\b[^>]*>/g;

  /** Bound on the dedupe set for long sessions. */
  static MAX_SEEN = 1000;

  /**
   * Cue lines already forwarded. Live playlists are re-fetched every few
   * seconds and repeat the same tags, so each line is sent once.
   */
  static #seen = new Set();

  /**
   * Wraps fetch and XHR.
   */
  static install() {
    StreamSniffer.#wrapFetch();
    StreamSniffer.#wrapXhr();
  }

  /**
   * Replaces `window.fetch` with a version that inspects a clone of each
   * playlist response. The player still gets the original, untouched.
   */
  static #wrapFetch() {
    const original = window.fetch;
    window.fetch = async function (...args) {
      const response = await original.apply(this, args);
      const url = response.url || String(args[0]?.url ?? args[0]);
      if (StreamSniffer.MANIFEST_URL.test(url)) {
        response.clone().text().then((text) => StreamSniffer.#inspect(url, text), () => {});
      }
      return response;
    };
  }

  /**
   * Patches `XMLHttpRequest.open` to inspect playlist responses once loaded.
   */
  static #wrapXhr() {
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      if (StreamSniffer.MANIFEST_URL.test(String(url))) {
        this.addEventListener('load', () => {
          // responseText throws for binary response types.
          if (this.responseType === '' || this.responseType === 'text') {
            StreamSniffer.#inspect(this.responseURL || String(url), this.responseText);
          }
        });
      }
      return originalOpen.call(this, method, url, ...rest);
    };
  }

  /**
   * Forwards each new ad-cue line in a playlist to the content script.
   *
   * @param {string} url - Playlist URL.
   * @param {string} text - Playlist body.
   */
  static #inspect(url, text) {
    if (!PlayerPage.active) return;
    const lines = [
      ...text.matchAll(StreamSniffer.HLS_CUE),
      ...text.matchAll(StreamSniffer.DASH_CUE),
    ].map((match) => match[0]);

    for (const line of lines) {
      if (StreamSniffer.#seen.has(line)) continue;
      if (StreamSniffer.#seen.size >= StreamSniffer.MAX_SEEN) StreamSniffer.#seen.clear();
      StreamSniffer.#seen.add(line);
      window.postMessage({
        source: StreamSniffer.SOURCE,
        kind: 'stream-cue',
        url: url.split('?')[0].slice(0, 200),
        line: line.slice(0, 300),
      }, '*');
    }
  }
}

StreamSniffer.install();
