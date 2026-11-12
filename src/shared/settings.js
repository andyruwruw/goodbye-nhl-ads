/**
 * User settings, persisted in chrome.storage.local. Shared by the content
 * scripts (which react to changes) and the popup (which edits them).
 */
class Settings {
  /**
   * Every setting and its value when the user has never changed it.
   *
   * @type {{ enabled: boolean, recon: boolean, badgeSelector: string }}
   */
  static DEFAULTS = {
    enabled: true,
    recon: false,
    badgeSelector: '',
  };

  /**
   * Reads all settings, filling in defaults for anything never saved.
   *
   * @returns {Promise<typeof Settings.DEFAULTS>} The current settings.
   */
  static async load() {
    const stored = await chrome.storage.local.get(Object.keys(Settings.DEFAULTS));
    return { ...Settings.DEFAULTS, ...stored };
  }

  /**
   * Saves one or more settings.
   *
   * @param {Partial<typeof Settings.DEFAULTS>} values - Settings to overwrite.
   * @returns {Promise<void>} Resolves once stored.
   */
  static save(values) {
    return chrome.storage.local.set(values);
  }

  /**
   * Calls `callback` with the full, fresh settings whenever any setting
   * changes. Recon log writes share the same storage area, so those are
   * filtered out here.
   *
   * @param {(settings: typeof Settings.DEFAULTS) => void} callback - Change handler.
   */
  static onChange(callback) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (!Object.keys(changes).some((key) => key in Settings.DEFAULTS)) return;
      Settings.load().then(callback);
    });
  }
}
