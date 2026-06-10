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
      document.getElementById(targetId).classList.add('active');
    });
  });
}

function setupThemeConfiguration() {
  const themeToggle = document.getElementById('theme-toggle');
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

  document.getElementById('dev-model').textContent = model;
  document.getElementById('dev-manufacturer').textContent = manufacturer;
  document.getElementById('dev-fingerprint').textContent = fingerprint;
  document.getElementById('dev-patch').textContent = patch;
  document.getElementById('dev-sdk').textContent = sdk1 || sdk2 || 'N/A';

  const modulePath = await locateModulePath();
  if (!modulePath) {
    Console.error('Target module *_beta_Props not found in /data/adb/modules/');
    setModuleFallbackLabels('Module Not Found');
    return;
  }

  if (!/^\/data\/adb\/modules\/[a-zA-Z0-9_-]+$/.test(modulePath)) {
    Console.error(`Invalid module path format: ${modulePath}`);
    setModuleFallbackLabels('Invalid Module Path');
    return;
  }

  Console.success(`Module located at: ${modulePath}`);

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

  const { errno, stdout, stderr } = await executeNativeCommand(
    `cat '${escapedPath}/pif.json'`
  );

  if (errno === 0 && stdout) {
    try {
      const pifData = JSON.parse(stdout);
      document.getElementById('mod-model').textContent =
        pifData.MODEL || pifData.model || 'N/A';
      document.getElementById('mod-manufacturer').textContent =
        pifData.MANUFACTURER || pifData.manufacturer || 'N/A';
      document.getElementById('mod-fingerprint').textContent =
        pifData.FINGERPRINT || pifData.fingerprint || 'N/A';
      document.getElementById('mod-patch').textContent =
        pifData.SECURITY_PATCH || pifData.security_patch || 'N/A';
      document.getElementById('mod-sdk').textContent =
        pifData.DEVICE_INITIAL_SDK_INT ||
        pifData.FIRST_API_LEVEL ||
        pifData.first_api_level ||
        'N/A';
      Console.success('pif.json parsed and injected successfully.');
    } catch (e) {
      Console.error(`JSON Parse Error: ${e.message}`);
      setModuleFallbackLabels('Parse Error');
    }
  } else {
    Console.error(`Failed to read pif.json: ${stderr}`);
    setModuleFallbackLabels('pif.json Not Found');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupThemeConfiguration();
  setupIntentLinks();
  renderAboutSections();
  synchronizeSystemProperties();
  initializePIFTools();
});
