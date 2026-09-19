import { Console } from './core-telemetry.js';
import {
  fetchSystemOutput,
  locateModulePath,
  executeNativeCommand,
} from './ksu-interface.js';
import { verifyReleaseStatus } from './ota-manager.js';
import { setupIntentLinks } from './intent-handler.js';
import { renderAboutSections } from './about-renderer.js';
import { initializePIFTools } from './pif-ui-manager.js';
import { readModulePifSource } from './pif-builder.js';
import { renderModuleSettings, setupQuickActions } from './settings-manager.js';

function escapeShellArg(arg) {
  if (typeof arg !== 'string') return '';
  return arg.replace(/'/g, "'\\''");
}

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach((navItem) => {
    navItem.addEventListener('click', (event) => {
      document
        .querySelectorAll('.nav-item')
        .forEach((item) => item.classList.remove('active'));
      document
        .querySelectorAll('.page')
        .forEach((page) => page.classList.remove('active'));

      const targetId = event.target.getAttribute('data-target');
      event.target.classList.add('active');
      const targetPage = document.getElementById(targetId);
      if (targetPage) {
        targetPage.classList.add('active');
      }

      if (targetId === 'content-settings') {
        renderModuleSettings('module-config-container');
      }
    });
  });
}

function setupThemeConfiguration() {
  const themeToggle = document.getElementById('theme-toggle');
  if (!themeToggle) return;

  const toggleTheme = () => {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    html.setAttribute('data-theme', isDark ? 'light' : 'dark');
    themeToggle.textContent = isDark
      ? 'Switch to Dark Mode'
      : 'Switch to Light Mode';
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
  };

  themeToggle.addEventListener('click', toggleTheme);
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  themeToggle.textContent =
    savedTheme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode';
}

function setModuleFallbackLabels(message) {
  const targets = [
    'mod-model',
    'mod-manufacturer',
    'mod-fingerprint',
    'mod-patch',
    'mod-sdk',
    'mod-version',
    'mod-desc',
    'mod-status',
  ];
  targets.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = message;
  });
}

export async function synchronizeSystemProperties() {
  Console.info('Starting hardware & module property sync...');

  const [model, manufacturer, fingerprint, patch, sdk1, sdk2] =
    await Promise.all([
      fetchSystemOutput('getprop ro.product.model'),
      fetchSystemOutput('getprop ro.product.manufacturer'),
      fetchSystemOutput('getprop ro.build.fingerprint'),
      fetchSystemOutput('getprop ro.build.version.security_patch'),
      fetchSystemOutput('getprop ro.product.first_api_level', ''),
      fetchSystemOutput('getprop ro.board.first_api_level', 'N/A'),
    ]);

  document.getElementById('dev-model').textContent = model || 'N/A';
  document.getElementById('dev-manufacturer').textContent = manufacturer || 'N/A';
  document.getElementById('dev-fingerprint').textContent = fingerprint || 'N/A';
  document.getElementById('dev-patch').textContent = patch || 'N/A';
  document.getElementById('dev-sdk').textContent = sdk1 || sdk2 || 'N/A';

  const modulePath = await locateModulePath();
  if (!modulePath) {
    Console.error('Target module not found in /data/adb/modules/');
    setModuleFallbackLabels('Module Not Found');
    return;
  }

  document.getElementById('module-path').textContent = modulePath;
  document.getElementById('module-props-file').textContent = `${modulePath}/pif.json`;

  const escapedPath = escapeShellArg(modulePath);

  const [version, description] = await Promise.all([
    fetchSystemOutput(
      `sed -n 's/^version=//p' '${escapedPath}/module.prop'`,
      'N/A'
    ),
    fetchSystemOutput(
      `sed -n 's/^description=//p' '${escapedPath}/module.prop'`,
      'N/A'
    ),
  ]);

  document.getElementById('mod-version').textContent = version;
  document.getElementById('mod-desc').textContent = description;

  verifyReleaseStatus(description);

  try {
    const moduleProps = await readModulePifSource(modulePath);
    if (moduleProps) {
      document.getElementById('mod-model').textContent = moduleProps.MODEL || 'N/A';
      document.getElementById('mod-manufacturer').textContent = moduleProps.MANUFACTURER || 'N/A';
      document.getElementById('mod-fingerprint').textContent = moduleProps.FINGERPRINT || 'N/A';
      document.getElementById('mod-patch').textContent = moduleProps.SECURITY_PATCH || 'N/A';
      document.getElementById('mod-sdk').textContent = moduleProps.DEVICE_INITIAL_SDK_INT || 'N/A';
      Console.success('Module properties parsed and injected successfully.');
    } else {
      setModuleFallbackLabels('Properties Not Found');
    }
  } catch (err) {
    Console.error(`Error loading module properties: ${err.message}`);
    setModuleFallbackLabels('Parse Error');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupThemeConfiguration();
  setupIntentLinks();
  renderAboutSections();
  synchronizeSystemProperties();
  initializePIFTools();
  setupQuickActions();
});
