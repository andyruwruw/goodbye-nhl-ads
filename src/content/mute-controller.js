/**
 * Mutes the main video while a commercial break is on screen and restores
 * the sound when the game comes back.
 *
 * The controller only ever unmutes what it muted itself: if the user had the
 * stream muted before the break, it stays muted afterward. The user can also
 * unmute a single break from the on-player overlay.
 */
class MuteController extends PollingTask {
  static INTERVAL_MS = 400;

  /**
   * How long the badge must stay gone before the break counts as over.
   * Bridges the brief gaps between back-to-back ads.
   */
  static END_GRACE_MS = 1500;

  /** Whether a break is currently in progress. */
  #adActive = false;

  /** Last time the badge was seen. */
  #lastAdAt = 0;

  /** True if the current mute was ours (and so ours to undo). */
  #mutedByUs = false;

  /** True if the user unmuted the current break from the overlay. */
  #soundOn = false;

  /**
   * @param {AdBadgeDetector} detector - Decides whether a break is on screen.
   * @param {(ad: boolean, badge: Element | null, video: HTMLVideoElement) => void} onAdChange
   *   Called when a break starts or ends (used for recon logging).
   */
  constructor(detector, onAdChange) {
    super(MuteController.INTERVAL_MS);
    this.detector = detector;
    this.onAdChange = onAdChange;
    this.overlay = new AdOverlay(() => this.toggleSound());
  }

  /**
   * Checks for the break badge and mutes, unmutes, and shows or hides the
   * overlay to match.
   */
  tick() {
    const video = PlayerLocator.findVideo();
    if (!video) return;

    const badge = this.detector.findBadge(video);
    const now = Date.now();

    if (badge) {
      this.#lastAdAt = now;
      if (!this.#adActive) {
        this.#adActive = true;
        this.#soundOn = false;
        this.onAdChange(true, badge, video);
      }
      // Re-checked every tick in case the player resets its mute state mid-break.
      if (!this.#soundOn) this.#mute(video);
      this.overlay.show(video, this.#soundOn);
    } else if (this.#adActive && now - this.#lastAdAt > MuteController.END_GRACE_MS) {
      this.#adActive = false;
      this.onAdChange(false, null, video);
      this.#restore(video);
      this.overlay.hide();
    }
  }

  /**
   * Overlay button handler: unmutes for the rest of the current break, or
   * re-mutes if already unmuted. The next break mutes again regardless.
   */
  toggleSound() {
    const video = PlayerLocator.findVideo();
    if (!video || !this.#adActive) return;
    this.#soundOn = !this.#soundOn;
    if (this.#soundOn) {
      // Unmute unconditionally: the user asked for sound, even if the
      // stream was muted before the break.
      video.muted = false;
      this.#mutedByUs = false;
    } else {
      this.#mute(video);
    }
    this.overlay.show(video, this.#soundOn);
  }

  /**
   * Stops watching, hides the overlay, and gives back any sound we took.
   */
  stop() {
    super.stop();
    this.#adActive = false;
    this.overlay.hide();
    const video = PlayerLocator.findVideo();
    if (video) this.#restore(video);
  }

  /**
   * Mutes the video, remembering that we did it.
   *
   * @param {HTMLVideoElement} video - The main video.
   */
  #mute(video) {
    if (video.muted) return;
    video.muted = true;
    this.#mutedByUs = true;
  }

  /**
   * Unmutes the video, but only if we were the ones who muted it.
   *
   * @param {HTMLVideoElement} video - The main video.
   */
  #restore(video) {
    if (!this.#mutedByUs) return;
    video.muted = false;
    this.#mutedByUs = false;
  }
}
