/**
 * Toolbar popup: settings toggles, the badge selector override, and the
 * recon log controls (mark, download, clear).
 */
class Popup {
  /**
   * Loads settings into the form and wires every control.
   *
   * @returns {Promise<void>} Resolves once the popup is ready.
   */
  static async init() {
    document.documentElement.classList.toggle('dark', matchMedia('(prefers-color-scheme: dark)').matches);

    const settings = await Settings.load();
    Popup.#el('enabled').checked = settings.enabled;
    Popup.#el('recon').checked = settings.recon;
    Popup.#el('badgeSelector').value = settings.badgeSelector;

    Popup.#el('enabled').addEventListener('change', (e) => Settings.save({ enabled: e.target.checked }));
    Popup.#el('recon').addEventListener('change', (e) => Settings.save({ recon: e.target.checked }));
    Popup.#el('badgeSelector').addEventListener('change', (e) => Settings.save({ badgeSelector: e.target.value }));
    Popup.#el('markAd').addEventListener('click', () => Popup.#mark('ad on screen'));
    Popup.#el('markGame').addEventListener('click', () => Popup.#mark('game is back'));
    Popup.#el('download').addEventListener('click', () => Popup.#download());
    Popup.#el('clear').addEventListener('click', () => ReconLog.clear().then(() => Popup.#refreshCount()));

    // Keeps the entry count live while the popup is open.
    chrome.storage.onChanged.addListener(() => Popup.#refreshCount());
    Popup.#refreshCount();
  }

  /**
   * @param {string} id - Element id in popup.html.
   * @returns {HTMLElement} The element.
   */
  static #el(id) {
    return document.getElementById(id);
  }

  /**
   * Shows how many entries the recon log holds.
   *
   * @returns {Promise<void>} Resolves once updated.
   */
  static async #refreshCount() {
    const entries = await ReconLog.readAll();
    Popup.#el('count').textContent = `${entries.length} log entries`;
  }

  /**
   * Asks the active tab to log a labeled snapshot of what's on screen.
   *
   * @param {string} label - What the user says is happening right now.
   * @returns {Promise<void>} Resolves once sent.
   */
  static async #mark(label) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // Rejects when nothing replies: not an ESPN player tab.
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'mark', label }).catch(() => null);
    Popup.#el('message').textContent = response?.ok ? `Marked "${label}"` : 'Open the ESPN player tab first';
  }

  /**
   * Saves the full recon log as a timestamped JSON file.
   *
   * @returns {Promise<void>} Resolves once the download starts.
   */
  static async #download() {
    const entries = await ReconLog.readAll();
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `hate-nhl-ads-recon-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    // Revoking right away can cancel the download before it starts.
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
}

Popup.init();
