# I hate NHL ads

Chrome extension that mutes the ESPN player (`espn.com/watch/player`) while the yellow "Ad" badge is on screen, and unmutes when the game comes back.

## Install

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.
3. Pin the extension so the popup is one click away.

After pulling changes, hit the reload icon on the extension card and refresh the ESPN tab.

## Where it runs

Only on ESPN's player, `espn.com/watch/player/...`. Chrome injects the scripts on all of `espn.com/watch/*`, because ESPN can move from `/watch/` into the player without a full page load, but every part (muting, the overlay, recon scanning, playlist sniffing, markers) checks `PlayerPage.active` (`src/shared/player-page.js`) first and stays idle anywhere else. Navigating away from the player inside the site stops everything and gives back any sound it muted.

## How muting works

Every 400ms the content script looks for ESPN's ad break overlay (`.ad-badge-overlay--container`, searched through shadow DOM too). It is the box in the bottom left with the break countdown, and it showed during "Commercial Break, We'll be Right Back" slates (countdown only), not just real ads. While it is visible, the video is muted. Once it has been gone for 1.5s, the video is unmuted, but only if the extension was the one that muted it.

While a break is muted, a small panel shows in the top-right of the video with an **Unmute** button. Unmuting holds for the rest of that break (the button flips to **Mute** to undo it), and the next break mutes again as usual. The panel is a top-layer popover, so it stays visible in fullscreen.

If ESPN changes their markup, paste a new CSS selector into **Badge CSS selector** in the popup. As a last resort the detector also looks for any element with text starting with "Ad" sitting over the video.
