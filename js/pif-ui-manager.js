import { Console } from './core-telemetry.js';
import {
  fetchGoogleBetaOTA,
  parseReleaseInfo,
  fetchOTADownloadPage,
  parseDeviceList,
  buildPIFJson,
  writePIFToModule,
  applyModulePIF,
  cleanGmsData
} from './pif-builder.js';
import { buildAndApplyTrickyStore } from './tricky-store.js';
import { synchronizeSystemProperties } from './dashboard-core.js';
import { showToast } from './ksu-interface.js';

const wizardState = {
  currentStep: 1,
  selectedRelease: null,
  selectedDevice: null,
  releases: [],
  devices: [],
  customPIF: null
};

const deviceCache = {
  releases: null,
  devices: {},
  timestamp: null
};

const CACHE_DURATION = 5 * 60 * 1000;

function showWizardStep(step) {
  document.querySelectorAll('.wizard-step').forEach(stepEl => {
    stepEl.classList.remove('active');
  });

  const targetStep = document.querySelector(`.wizard-step[data-step="${step}"]`);
  if (targetStep) {
    targetStep.classList.add('active');
  }

  wizardState.currentStep = step;
  updateNavigationButtons();
}

function updateNavigationButtons() {
  const backBtn = document.getElementById('wizard-back');
  const nextBtn = document.getElementById('wizard-next');
  const applyBtn = document.getElementById('wizard-apply');
  const finishBtn = document.getElementById('wizard-finish');

  backBtn.disabled = wizardState.currentStep === 1;

  nextBtn.classList.add('hidden');
  applyBtn.classList.add('hidden');
  finishBtn.classList.add('hidden');

  if (wizardState.currentStep === 2) {
    nextBtn.classList.remove('hidden');
    nextBtn.disabled = !wizardState.selectedDevice;
  } else if (wizardState.currentStep === 3) {
    nextBtn.classList.remove('hidden');
    nextBtn.disabled = !wizardState.customPIF;
  } else if (wizardState.currentStep === 4) {
    applyBtn.classList.remove('hidden');
  }
}

function showInlineLoading() {
  const deviceList = document.getElementById('device-list');
  if (deviceList) {
    deviceList.style.display = 'flex';
    deviceList.style.flexDirection = 'column';
    deviceList.style.alignItems = 'center';
    deviceList.style.padding = '40px 20px';
    deviceList.innerHTML = `
      <div class="loading-spinner"></div>
      <p style="color: var(--text-muted); font-size: 14px; margin: 0;">Fetching Google Beta OTA releases...</p>
    `;
  }
}

async function handleCustomBuild() {
  try {
    const html = await fetchGoogleBetaOTA();
    const releases = parseReleaseInfo(html);

    if (releases.length === 0) {
      throw new Error('No beta releases found on Google developer page');
    }

    wizardState.releases = releases;
    wizardState.selectedRelease = releases[0];

    Console.success('Loaded beta releases');
    await loadDeviceList(releases[0].androidVersion);
  } catch (error) {
    Console.error('Failed to fetch releases: ' + error.message);
    const deviceList = document.getElementById('device-list');
    if (deviceList) {
      deviceList.innerHTML = `<div class="apply-result error">Error: ${error.message}</div>`;
    }
  }
}

async function loadDeviceList(androidVersion) {
  const deviceList = document.getElementById('device-list');
  showInlineLoading();

  try {
    let devices;

    if (
      deviceCache.devices[androidVersion] &&
      deviceCache.timestamp &&
      Date.now() - deviceCache.timestamp < CACHE_DURATION
    ) {
      Console.info(`Using cached devices for Android ${androidVersion}`);
      devices = deviceCache.devices[androidVersion];
    } else {
      try {
        const html = await fetchOTADownloadPage(androidVersion);
        devices = parseDeviceList(html);
      } catch {
        Console.info('OTA download page fetch failed, using built-in catalog');
        devices = parseDeviceList(null);
      }

      deviceCache.devices[androidVersion] = devices;
      deviceCache.timestamp = Date.now();
      Console.info(`Cached devices for Android ${androidVersion}`);
    }

    if (devices.length === 0) {
      throw new Error('No devices found for this Android version');
    }

    wizardState.devices = devices;
    deviceList.removeAttribute('style');
    deviceList.innerHTML = '';

    devices.forEach(device => {
      const card = document.createElement('button');
      card.className = 'device-card';
      card.innerHTML = `
        <div class="device-name">${device.model}</div>
        <div class="device-codename">${device.codename}</div>
      `;

      card.addEventListener('click', () => {
        document.querySelectorAll('.device-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        wizardState.selectedDevice = device;
        updateNavigationButtons();
      });

      deviceList.appendChild(card);
    });

    Console.success(`Loaded ${devices.length} device models`);
  } catch (error) {
    deviceList.removeAttribute('style');
    deviceList.innerHTML = `<div class="apply-result error">Error: ${error.message}</div>`;
    Console.error('Failed to load devices: ' + error.message);
  }
}

function showBuildSelection() {
  const buildList = document.getElementById('build-list');
  buildList.innerHTML = '';

  wizardState.releases.forEach((release, index) => {
    const option = document.createElement('button');
    option.className = 'build-option';
    if (index === 0) option.classList.add('selected');

    option.innerHTML = `
      <div class="build-info">
        <div class="build-version">Android ${release.androidVersion}</div>
        <div class="build-details">Build: ${release.buildId} | Incremental: ${release.incremental}</div>
      </div>
    `;

    option.addEventListener('click', () => {
      document.querySelectorAll('.build-option').forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
      wizardState.selectedRelease = release;
      generateCustomPIF();
    });

    buildList.appendChild(option);
  });

  if (wizardState.releases.length > 0) {
    generateCustomPIF();
  }
}

function generateCustomPIF() {
  if (!wizardState.selectedDevice || !wizardState.selectedRelease) {
    return;
  }

  const pifData = buildPIFJson(wizardState.selectedRelease, wizardState.selectedDevice);
  wizardState.customPIF = pifData;

  updateNavigationButtons();
  Console.success('Generated custom PIF configuration');
}

function handleNavigationNext() {
  if (wizardState.currentStep === 2) {
    showBuildSelection();
    showWizardStep(3);
  } else if (wizardState.currentStep === 3) {
    showWizardStep(4);
  }
}

function handleNavigationBack() {
  if (wizardState.currentStep > 1) {
    showWizardStep(wizardState.currentStep - 1);
  }
}

async function handleApplyConfiguration() {
  const applyBtn = document.getElementById('wizard-apply');
  const finishBtn = document.getElementById('wizard-finish');
  const pifStatus = document.getElementById('pif-status');
  const trickyStatus = document.getElementById('tricky-status');
  const resultDiv = document.getElementById('apply-result');
  const instructionsBox = document.getElementById('apply-instructions');

  applyBtn.disabled = true;
  resultDiv.innerHTML = '';
  resultDiv.classList.add('hidden');
  instructionsBox.classList.add('hidden');

  pifStatus.textContent = 'Processing...';
  pifStatus.className = 'status-value processing';

  try {
    const pifData = wizardState.customPIF;
    if (!pifData) {
      throw new Error('No PIF configuration available');
    }

    await writePIFToModule(pifData);

    pifStatus.textContent = 'Success';
    pifStatus.className = 'status-value success';
    showToast('PIF applied successfully');

    trickyStatus.textContent = 'Processing...';
    trickyStatus.className = 'status-value processing';

    try {
      const trickyResult = await buildAndApplyTrickyStore();
      if (trickyResult.success) {
        trickyStatus.textContent = `Success (${trickyResult.packagesCount} targets)`;
        trickyStatus.className = 'status-value success';
      } else {
        trickyStatus.textContent = trickyResult.message;
        trickyStatus.className = 'status-value pending';
      }
    } catch (trickyError) {
      trickyStatus.textContent = 'Failed';
      trickyStatus.className = 'status-value error';
    }

    resultDiv.innerHTML = 'PIF and target configurations applied successfully!';
    resultDiv.className = 'apply-result success';
    resultDiv.classList.remove('hidden');

    instructionsBox.classList.remove('hidden');
    applyBtn.classList.add('hidden');
    finishBtn.classList.remove('hidden');

    synchronizeSystemProperties();
  } catch (error) {
    pifStatus.textContent = 'Failed';
    pifStatus.className = 'status-value error';

    resultDiv.innerHTML = `Failed to apply configuration: ${error.message}`;
    resultDiv.className = 'apply-result error';
    resultDiv.classList.remove('hidden');

    applyBtn.disabled = false;
    Console.error('Configuration apply failed: ' + error.message);
  }
}

async function handleQuickApply() {
  showWizardStep(4);
  const applyBtn = document.getElementById('wizard-apply');
  const finishBtn = document.getElementById('wizard-finish');
  const pifStatus = document.getElementById('pif-status');
  const trickyStatus = document.getElementById('tricky-status');
  const resultDiv = document.getElementById('apply-result');
  const instructionsBox = document.getElementById('apply-instructions');

  applyBtn.classList.add('hidden');
  resultDiv.innerHTML = '';
  resultDiv.classList.add('hidden');
  instructionsBox.classList.add('hidden');

  pifStatus.textContent = 'Applying...';
  pifStatus.className = 'status-value processing';

  try {
    const pifData = await applyModulePIF();

    pifStatus.textContent = `Success (${pifData.MODEL})`;
    pifStatus.className = 'status-value success';
    showToast(`Applied: ${pifData.MODEL}`);

    trickyStatus.textContent = 'Configuring...';
    trickyStatus.className = 'status-value processing';

    try {
      const trickyResult = await buildAndApplyTrickyStore();
      if (trickyResult.success) {
        trickyStatus.textContent = `Success (${trickyResult.packagesCount} targets)`;
        trickyStatus.className = 'status-value success';
      } else {
        trickyStatus.textContent = trickyResult.message;
        trickyStatus.className = 'status-value pending';
      }
    } catch {
      trickyStatus.textContent = 'Not installed';
      trickyStatus.className = 'status-value pending';
    }

    resultDiv.innerHTML = `Module fingerprint applied directly to PlayIntegrityFix: <strong>${pifData.MODEL}</strong>`;
    resultDiv.className = 'apply-result success';
    resultDiv.classList.remove('hidden');

    instructionsBox.classList.remove('hidden');
    finishBtn.classList.remove('hidden');

    synchronizeSystemProperties();
  } catch (error) {
    pifStatus.textContent = 'Failed';
    pifStatus.className = 'status-value error';
    resultDiv.innerHTML = `Quick apply failed: ${error.message}`;
    resultDiv.className = 'apply-result error';
    resultDiv.classList.remove('hidden');
  }
}

function resetWizard() {
  wizardState.currentStep = 1;
  wizardState.selectedRelease = null;
  wizardState.selectedDevice = null;
  wizardState.releases = [];
  wizardState.devices = [];
  wizardState.customPIF = null;

  document.querySelectorAll('.device-card').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.build-option').forEach(o => o.classList.remove('selected'));

  const deviceList = document.getElementById('device-list');
  const buildList = document.getElementById('build-list');

  if (deviceList) deviceList.innerHTML = '';
  if (buildList) buildList.innerHTML = '';

  document.getElementById('pif-status').textContent = 'Pending';
  document.getElementById('pif-status').className = 'status-value pending';
  document.getElementById('tricky-status').textContent = 'Pending';
  document.getElementById('tricky-status').className = 'status-value pending';
  document.getElementById('apply-result').innerHTML = '';
  document.getElementById('apply-result').classList.add('hidden');
  document.getElementById('apply-instructions').classList.add('hidden');

  showWizardStep(1);
}

export function initializePIFTools() {
  Console.info('Initializing PIF Tools...');

  const quickApplyBtn = document.getElementById('quick-apply-pif');
  const startBtn = document.getElementById('start-custom-build');
  const backBtn = document.getElementById('wizard-back');
  const nextBtn = document.getElementById('wizard-next');
  const applyBtn = document.getElementById('wizard-apply');
  const finishBtn = document.getElementById('wizard-finish');
  const clearGmsBtn = document.getElementById('btn-clear-gms-wizard');

  if (quickApplyBtn) {
    quickApplyBtn.addEventListener('click', handleQuickApply);
  }

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      showWizardStep(2);
      showInlineLoading();
      setTimeout(() => {
        handleCustomBuild();
      }, 50);
    });
  }

  if (clearGmsBtn) {
    clearGmsBtn.addEventListener('click', async () => {
      clearGmsBtn.disabled = true;
      try {
        await cleanGmsData();
        showToast('GMS data cleared');
        clearGmsBtn.textContent = 'GMS Cleared ✓';
      } catch (e) {
        showToast('Clear failed: ' + e.message);
      } finally {
        setTimeout(() => {
          clearGmsBtn.disabled = false;
          clearGmsBtn.textContent = 'Clear Google Play Services (GMS)';
        }, 3000);
      }
    });
  }

  backBtn.addEventListener('click', handleNavigationBack);
  nextBtn.addEventListener('click', handleNavigationNext);
  applyBtn.addEventListener('click', handleApplyConfiguration);
  finishBtn.addEventListener('click', resetWizard);

  showWizardStep(1);
  Console.success('PIF Tools initialized');
}
