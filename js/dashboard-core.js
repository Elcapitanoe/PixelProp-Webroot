import { Console } from './core-telemetry.js';
import {
  fetchSystemOutput,
  locateModulePath,
  executeNativeCommand,
} from './ksu-interface.js';
import { verifyReleaseStatus } from './ota-manager.js';
import { setupIntentLinks } from './intent-handler.js';
import { renderAboutSections } from './about-renderer.js';

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

async function synchronizeSystemProperties() {
  Console.info('Starting hardware & module property sync...');

  document.getElementById('dev-model').textContent = await fetchSystemOutput(
    'getprop ro.product.model'
  );
  document.getElementById('dev-manufacturer').textContent =
    await fetchSystemOutput('getprop ro.product.manufacturer');
  document.getElementById('dev-fingerprint').textContent =
    await fetchSystemOutput('getprop ro.build.fingerprint');
  document.getElementById('dev-patch').textContent = await fetchSystemOutput(
    'getprop ro.build.version.security_patch'
  );

  let sdk = await fetchSystemOutput('getprop ro.product.first_api_level', '');
  if (sdk === '') {
    sdk = await fetchSystemOutput('getprop ro.board.first_api_level', 'N/A');
  }
  document.getElementById('dev-sdk').textContent = sdk || 'N/A';

  const modulePath = await locateModulePath();
  if (modulePath) {
    Console.success(`Module located at: ${modulePath}`);

    const version = await fetchSystemOutput(
      `sed -n 's/^version=//p' "${modulePath}/module.prop"`,
      'N/A'
    );
    const description = await fetchSystemOutput(
      `sed -n 's/^description=//p' "${modulePath}/module.prop"`,
      'N/A'
    );

    document.getElementById('mod-version').textContent = version;
    document.getElementById('mod-desc').textContent = description;

    verifyReleaseStatus(description);

    const { errno, stdout, stderr } = await executeNativeCommand(
      `cat "${modulePath}/pif.json"`
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
  } else {
    Console.error('Target module *_beta_Props not found in /data/adb/modules/');
    setModuleFallbackLabels('Module Not Found');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  Console.init();
  setupNavigation();
  setupThemeConfiguration();
  setupIntentLinks();
  renderAboutSections();
  synchronizeSystemProperties();
});
