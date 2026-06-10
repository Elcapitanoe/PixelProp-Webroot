import { Console } from './core-telemetry.js';
import {
  fetchGoogleBetaOTA,
  parseReleaseInfo,
  fetchOTADownloadPage,
  parseDeviceList,
  buildPIFJson,
  writePIFToModule,
} from './pif-builder.js';
import { buildAndApplyTrickyStore } from './tricky-store.js';
import { synchronizeSystemProperties } from './dashboard-core.js';

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
      <p style="color: var(--text-muted); font-size: 14px; margin: 0;">Fetching device data...</p>
    `;
  }
}

async function handleCustomBuild() {
  try {
    const html = await fetchGoogleBetaOTA();
    const releases = parseReleaseInfo(html);
    
    if (releases.length === 0) {
      throw new Error('No beta releases found');
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
    
    if (deviceCache.devices[androidVersion] && 
        deviceCache.timestamp && 
        (Date.now() - deviceCache.timestamp < CACHE_DURATION)) {
      Console.info(`Using cached devices for Android ${androidVersion}`);
      devices = deviceCache.devices[androidVersion];
    } else {
      const html = await fetchOTADownloadPage(androidVersion);
      devices = parseDeviceList(html);
      
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
    Console.success('PIF configuration applied successfully');
    
    trickyStatus.textContent = 'Processing...';
    trickyStatus.className = 'status-value processing';
    
    try {
      const trickyResult = await buildAndApplyTrickyStore();
      
      if (trickyResult.success) {
        trickyStatus.textContent = `Success (${trickyResult.packagesCount} packages)`;
        trickyStatus.className = 'status-value success';
        Console.success('TrickyStore configuration applied successfully');
      } else {
        trickyStatus.textContent = trickyResult.message;
        trickyStatus.className = 'status-value pending';
        Console.info('TrickyStore: ' + trickyResult.message);
      }
    } catch (trickyError) {
      trickyStatus.textContent = 'Failed';
      trickyStatus.className = 'status-value error';
      Console.error('TrickyStore error: ' + trickyError.message);
    }
    
    resultDiv.innerHTML = 'Configuration applied successfully!';
    resultDiv.className = 'apply-result success';
    resultDiv.classList.remove('hidden');
    
    instructionsBox.classList.remove('hidden');
    
    applyBtn.classList.add('hidden');
    finishBtn.classList.remove('hidden');
    
    Console.info('Refreshing dashboard information...');
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
  
  const startBtn = document.getElementById('start-custom-build');
  const backBtn = document.getElementById('wizard-back');
  const nextBtn = document.getElementById('wizard-next');
  const applyBtn = document.getElementById('wizard-apply');
  const finishBtn = document.getElementById('wizard-finish');
  
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      showWizardStep(2);
      showInlineLoading();
      requestAnimationFrame(() => handleCustomBuild());
    });
  }
  
  backBtn.addEventListener('click', handleNavigationBack);
  nextBtn.addEventListener('click', handleNavigationNext);
  applyBtn.addEventListener('click', handleApplyConfiguration);
  finishBtn.addEventListener('click', resetWizard);
  
  showWizardStep(1);
  
  Console.success('PIF Tools initialized');
}
