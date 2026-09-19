import { Console } from './core-telemetry.js';
import { executeNativeCommand, fetchSystemOutput, locateModulePath, showToast } from './ksu-interface.js';
import { cleanGmsData } from './pif-builder.js';

const KNOWN_CONFIG_KEYS = [
  {
    key: 'pixelprops.sensitive.props',
    label: 'Sensitive Props Spoofing',
    desc: 'Verify and apply system properties against sensitive checks'
  },
  {
    key: 'pixelprops.sensitive.pihooks',
    label: 'PIHOOKS Internal Spoofing',
    desc: 'Spoof PropImitationHooks when PlayIntegrityFix is absent'
  },
  {
    key: 'pixelprops.sensitive.device',
    label: 'Sensitive Device Check',
    desc: 'Strict device identification verification'
  },
  {
    key: 'pixelprops.sensitive.security_patch',
    label: 'Security Patch Spoofing',
    desc: 'Synchronize security patch date with certified build'
  },
  {
    key: 'pixelprops.sensitive.sdk',
    label: 'Initial SDK Check',
    desc: 'Match initial API level to prevent attestation mismatches'
  }
];

export async function readModuleConfig() {
  const modulePath = await locateModulePath();
  if (!modulePath) return {};

  const content = await fetchSystemOutput(`cat '${modulePath}/config.prop' 2>/dev/null`, '');
  const result = {};

  KNOWN_CONFIG_KEYS.forEach(item => {
    result[item.key] = false;
  });

  if (!content) return result;

  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const isCommented = trimmed.startsWith('#');
    const clean = trimmed.replace(/^#\s*/, '');
    const [key, val] = clean.split('=').map(s => s ? s.trim() : '');

    if (key && key in result) {
      result[key] = !isCommented && val.toLowerCase() === 'true';
    }
  });

  return result;
}

export async function updateModuleConfigKey(key, enabled) {
  const modulePath = await locateModulePath();
  if (!modulePath) {
    showToast('Module path not found');
    return false;
  }

  const configPath = `${modulePath}/config.prop`;
  const content = await fetchSystemOutput(`cat '${configPath}' 2>/dev/null`, '');
  let lines = content ? content.split('\n') : [];
  let found = false;

  const targetLine = enabled ? `${key}=true` : `# ${key}=false`;

  lines = lines.map(line => {
    const clean = line.trim().replace(/^#\s*/, '');
    if (clean.startsWith(`${key}=`)) {
      found = true;
      return targetLine;
    }
    return line;
  });

  if (!found) {
    lines.push(targetLine);
  }

  const newContent = lines.join('\n');
  const escaped = newContent.replace(/'/g, "'\\''");
  const { errno } = await executeNativeCommand(`echo '${escaped}' > '${configPath}'`);

  if (errno === 0) {
    const shortKey = key.replace('pixelprops.sensitive.', '');
    showToast(`${shortKey}: ${enabled ? 'Enabled' : 'Disabled'}`);
    Console.success(`Updated ${key} to ${enabled}`);
    return true;
  } else {
    showToast('Failed to update config.prop');
    return false;
  }
}

export function renderModuleSettings(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 13px;">
      Loading module configurations...
    </div>
  `;

  readModuleConfig().then(config => {
    container.innerHTML = '';

    KNOWN_CONFIG_KEYS.forEach(item => {
      const isChecked = Boolean(config[item.key]);
      const row = document.createElement('div');
      row.className = 'config-item';
      row.innerHTML = `
        <div class="config-text">
          <div class="config-title">${item.label}</div>
          <div class="config-desc">${item.desc}</div>
        </div>
        <label class="switch">
          <input type="checkbox" data-key="${item.key}" ${isChecked ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      `;

      const input = row.querySelector('input');
      input.addEventListener('change', async (e) => {
        const target = e.target;
        target.disabled = true;
        const success = await updateModuleConfigKey(item.key, target.checked);
        if (!success) {
          target.checked = !target.checked;
        }
        target.disabled = false;
      });

      container.appendChild(row);
    });
  }).catch(err => {
    container.innerHTML = `<div class="apply-result error">Failed to load config: ${err.message}</div>`;
  });
}

export function setupQuickActions() {
  const btnClearGms = document.getElementById('action-clear-gms');
  const btnRestartSysui = document.getElementById('action-restart-sysui');
  const btnReboot = document.getElementById('action-reboot');

  if (btnClearGms) {
    btnClearGms.addEventListener('click', async () => {
      btnClearGms.disabled = true;
      try {
        await cleanGmsData();
        showToast('Google Play Services data cleared');
      } catch (e) {
        showToast('Failed to clear GMS: ' + e.message);
      } finally {
        btnClearGms.disabled = false;
      }
    });
  }

  if (btnRestartSysui) {
    btnRestartSysui.addEventListener('click', async () => {
      showToast('Restarting System UI...');
      await executeNativeCommand('killall com.android.systemui');
    });
  }

  if (btnReboot) {
    btnReboot.addEventListener('click', async () => {
      showToast('Rebooting device...');
      await executeNativeCommand('svc power reboot || reboot');
    });
  }
}
