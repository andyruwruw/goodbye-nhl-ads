/**
 * Finds the main video and its player wrapper on the page.
 */
class PlayerLocator {
  /**
   * The largest `<video>` on the page. ESPN keeps a second, tiny video
   * element around, so "largest" picks the actual broadcast.
   *
   * @returns {HTMLVideoElement | null} The main video, or null if none.
   */
  static findVideo() {
    let best = null;
    let bestArea = 0;
    for (const video of document.querySelectorAll('video')) {
      const rect = video.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > bestArea) {
        best = video;
        bestArea = area;
      }
    }
    return best;
  }

  /**
   * Highest ancestor that is still roughly the size of the video, which is
   * where player overlays like the ad badge are normally mounted.
   *
   * @param {HTMLVideoElement} video - The main video.
   * @returns {Element} The player wrapper (falls back to the video's parent).
   */
  static findContainer(video) {
    const vr = video.getBoundingClientRect();
    let container = video.parentElement ?? document.body;
    for (let node = container; node && node !== document.body; node = node.parentElement) {
      const rect = node.getBoundingClientRect();
      // 5% + 2px of slack for borders and rounding.
      if (rect.width > vr.width * 1.05 + 2 || rect.height > vr.height * 1.05 + 2) break;
      container = node;
    }
    return container;
  }
}
