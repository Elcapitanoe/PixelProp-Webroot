import { Console } from './core-telemetry.js';

export async function verifyReleaseStatus(localVersion) {
  const statusEl = document.getElementById('mod-status');
  if (
    !localVersion ||
    localVersion === 'N/A' ||
    localVersion.includes('Error') ||
    localVersion.includes('Not Found')
  ) {
    if (statusEl) statusEl.textContent = 'Unknown';
    return;
  }

  try {
    const response = await fetch(
      'https://api.github.com/repos/Elcapitanoe/Build-Prop-BETA/releases/latest'
    );
    if (!response.ok) throw new Error(`API Error: ${response.status}`);

    const data = await response.json();
    const latestVersion = data.tag_name.replace(/^v/, '').trim();
    const currentVersion = localVersion.replace(/^v/, '').trim();

    if (!statusEl) return;

    if (currentVersion === latestVersion) {
      statusEl.innerHTML =
        '<span style="color: var(--log-success);">Up to date</span>';
    } else {
      statusEl.innerHTML = `<span style="color: var(--notice-text);">Update Available (${latestVersion})</span>`;
      Console.info(
        `Update available: ${latestVersion}. Current: ${currentVersion}`
      );
    }
  } catch (error) {
    Console.error(`Failed to check update: ${error.message}`);
    if (statusEl) statusEl.textContent = 'Check Failed';
  }
}
