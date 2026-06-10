import { Console } from './core-telemetry.js';

const GITHUB_API_BASE = 'https://api.github.com/repos/Elcapitanoe/Build-Prop-BETA';
const MAX_RELEASES_TO_CHECK = 10;

export async function verifyReleaseStatus(localDescription) {
  const statusEl = document.getElementById('mod-status');
  if (
    !localDescription ||
    localDescription === 'N/A' ||
    localDescription.includes('Error')
  ) {
    if (statusEl) statusEl.textContent = 'Unknown';
    return;
  }

  const match = localDescription.match(/to\s+([a-zA-Z0-9_-]+)\s+\[(.*?)\]/i);

  if (!match) {
    Console.error('Failed to extract Codename/Build ID from description.');
    if (statusEl) statusEl.textContent = 'Parse Error';
    return;
  }

  const localCodename = match[1].toLowerCase();
  const localBuildId = match[2];

  try {
    const response = await fetch(
      `${GITHUB_API_BASE}/releases?per_page=${MAX_RELEASES_TO_CHECK}`
    );
    if (!response.ok)
      throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);

    const releases = await response.json();
    let remoteBuildId = null;

    for (const release of releases) {
      const asset = release.assets.find((a) =>
        a.name.toLowerCase().includes(localCodename)
      );

      if (asset) {
        if (asset.name.includes(localBuildId)) {
          remoteBuildId = localBuildId;
        } else {
          const nameParts = asset.name.replace('.zip', '').split('_');
          remoteBuildId = nameParts[nameParts.length - 1];
        }
        break;
      }
    }

    if (!statusEl) return;

    if (!remoteBuildId) {
      statusEl.innerHTML = `<span style="color: var(--text-muted);">No data in recent releases</span>`;
      return;
    }

    if (localBuildId === remoteBuildId) {
      statusEl.innerHTML =
        '<span style="color: var(--log-success);">Up to date</span>';
      Console.success(`Module is up to date: ${localCodename.toUpperCase()}`);
    } else {
      statusEl.innerHTML = `<span style="color: var(--notice-text);">Update Available (${remoteBuildId})</span>`;
      Console.info(
        `Update available for ${localCodename.toUpperCase()}: ${remoteBuildId}`
      );
    }
  } catch (error) {
    Console.error(`Failed to check update: ${error.message}`);
    if (statusEl) statusEl.textContent = 'Check Failed';
  }
}