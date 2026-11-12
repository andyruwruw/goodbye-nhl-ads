/**
 * The single gate deciding where the extension does anything: ESPN's video
 * player, `espn.com/watch/player/...`.
 *
 * The manifest injects scripts on all of `espn.com/watch/*`, because ESPN
 * can navigate from `/watch/` into the player without a full page load, and
 * a script limited to the player URL would never get injected in that case.
 * Everything that mutes, scans, or logs checks `PlayerPage.active` first, so
 * on every other page the scripts stay idle.
 *
 * Loaded into both the isolated content-script world and the page world.
 */
class PlayerPage {
  static HOST = /(^|\.)espn\.com$/;
  static PATH_PREFIX = '/watch/player';

  /**
   * @returns {boolean} True if the current URL is an ESPN player page.
   */
  static get active() {
    return PlayerPage.HOST.test(location.hostname) && location.pathname.startsWith(PlayerPage.PATH_PREFIX);
  }

  /**
   * Calls `callback` whenever in-page navigation moves onto or off of the
   * player.
   *
   * @param {(active: boolean) => void} callback - Called with the new state.
   */
  static onChange(callback) {
    let last = PlayerPage.active;
    navigation.addEventListener('currententrychange', () => {
      const active = PlayerPage.active;
      if (active === last) return;
      last = active;
      callback(active);
    });
  }
}
