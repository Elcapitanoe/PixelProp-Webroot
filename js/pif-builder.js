import { Console } from './core-telemetry.js';
import { executeNativeCommand, fetchSystemOutput, locateModulePath } from './ksu-interface.js';

const PIF_MODULE_PATH = '/data/adb/modules/playintegrityfix';
const PIF_JSON_PATH = `${PIF_MODULE_PATH}/pif.json`;
const GOOGLE_GSI_URL = 'https://developer.android.com/topic/generic-system-image/releases';

function escapeShellArg(arg) {
  if (typeof arg !== 'string') return '';
  return arg.replace(/'/g, "'\\''");
}

export async function checkPIFModuleExists() {
  const { stdout, errno } = await executeNativeCommand(`test -d '${PIF_MODULE_PATH}' && echo 'exists'`);
  return errno === 0 && stdout.trim() === 'exists';
}

async function backupFile(filePath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupPath = `${filePath}.backup.${timestamp}`;
  
  const { errno } = await executeNativeCommand(`test -f '${filePath}' && cp '${filePath}' '${backupPath}'`);
  
  if (errno === 0) {
    Console.success(`Backed up ${filePath}`);
    return backupPath;
  }
  return null;
}

export async function backupExistingPIF() {
  await backupFile(PIF_JSON_PATH);
  
  const parentPath = await locateModulePath();
  if (parentPath) {
    const parentPifPath = `${parentPath}/pif.json`;
    await backupFile(parentPifPath);
  }
}

export async function fetchGoogleBetaOTA() {
  Console.info('Fetching Google Beta OTA releases...');
  
  const tempFile = '/data/local/tmp/gsi_releases.html';
  
  const downloadCmd = `curl -L -s -o '${tempFile}' '${GOOGLE_GSI_URL}'`;
  const { errno: downloadErr } = await executeNativeCommand(downloadCmd);
  
  if (downloadErr !== 0) {
    throw new Error('Failed to fetch Google Beta OTA page');
  }

  const { stdout: html, errno: readErr } = await executeNativeCommand(`cat '${tempFile}'`);
  await executeNativeCommand(`rm -f '${tempFile}'`);
  
  if (readErr !== 0 || !html.trim()) {
    throw new Error('Failed to read downloaded HTML');
  }

  Console.success('Successfully fetched Beta OTA page');
  return html;
}

export function parseReleaseInfo(html) {
  const releases = [];
  
  const dateMatch = html.match(/Date:\s*([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/);
  if (!dateMatch) {
    Console.error('Could not find release date');
    return releases;
  }
  
  const dateStr = dateMatch[1];
  const releaseDate = new Date(dateStr);
  const securityPatch = `${releaseDate.getFullYear()}-${String(releaseDate.getMonth() + 1).padStart(2, '0')}-05`;
  
  const betaMatches = html.matchAll(/\(Beta\)[\s\S]*?Build:\s*([A-Z0-9.]+)[\s\S]*?Android\s+(\d+)/g);
  
  for (const match of betaMatches) {
    const buildId = match[1];
    const androidVersion = match[2];
    
    const incrementalMatch = html.match(new RegExp(`${buildId}-(\\d+)-`));
    const incremental = incrementalMatch ? incrementalMatch[1] : '0000000';
    
    releases.push({
      buildId,
      androidVersion,
      incremental,
      securityPatch,
      releaseDate: dateStr
    });
  }
  
  Console.success(`Found ${releases.length} beta releases`);
  return releases;
}

export async function fetchOTADownloadPage(androidVersion) {
  Console.info(`Fetching OTA download page for Android ${androidVersion}...`);
  
  const url = `https://developer.android.com/about/versions/${androidVersion}/download-ota`;
  const tempFile = '/data/local/tmp/ota_download.html';
  
  const downloadCmd = `curl -L -s -o '${tempFile}' '${url}'`;
  const { errno: downloadErr } = await executeNativeCommand(downloadCmd);
  
  if (downloadErr !== 0) {
    throw new Error('Failed to fetch OTA download page');
  }

  const { stdout: html, errno: readErr } = await executeNativeCommand(`cat '${tempFile}'`);
  await executeNativeCommand(`rm -f '${tempFile}'`);
  
  if (readErr !== 0 || !html.trim()) {
    throw new Error('Failed to read OTA download HTML');
  }

  Console.success('Successfully fetched OTA download page');
  return html;
}

export function parseDeviceList(html) {
  const devices = [];
  const seenCodenames = new Set();
  
  const trMatches = html.matchAll(/<tr\s+id="([^"]+)"[\s\S]*?<td>([^<]+)<\/td>/g);
  
  for (const match of trMatches) {
    const codename = match[1];
    const model = match[2].trim();
    
    if (!seenCodenames.has(codename) && model && codename) {
      seenCodenames.add(codename);
      devices.push({ codename, model });
    }
  }
  
  Console.success(`Found ${devices.length} device models`);
  return devices;
}

export function buildPIFJson(release, device) {
  const versionName = parseInt(release.androidVersion) > 15 ? 'Baklava' : release.androidVersion;
  
  const fingerprint = `google/${device.codename}_beta/${device.codename}:${versionName}/${release.buildId}/${release.incremental}:user/release-keys`;
  
  const pifData = {
    MODEL: device.model,
    MANUFACTURER: 'Google',
    FINGERPRINT: fingerprint,
    SECURITY_PATCH: release.securityPatch,
    DEVICE_INITIAL_SDK_INT: parseInt(release.androidVersion)
  };
  
  Console.success('Built PIF configuration');
  return pifData;
}

async function writePIFToPath(pifData, filePath, moduleName) {
  const jsonContent = JSON.stringify(pifData, null, 2);
  const escapedContent = escapeShellArg(jsonContent);
  
  const writeCmd = `echo '${escapedContent}' > '${filePath}'`;
  const { errno: writeErr } = await executeNativeCommand(writeCmd);
  
  if (writeErr !== 0) {
    throw new Error(`Failed to write pif.json to ${moduleName}`);
  }

  const { stdout: written, errno: verifyErr } = await executeNativeCommand(`cat '${filePath}'`);
  
  if (verifyErr !== 0) {
    throw new Error(`Failed to verify pif.json in ${moduleName}`);
  }

  try {
    JSON.parse(written);
    Console.success(`Successfully wrote pif.json to ${moduleName}`);
    return true;
  } catch (e) {
    throw new Error(`Written file is not valid JSON in ${moduleName}`);
  }
}

export async function writePIFToModule(pifData) {
  Console.info('Writing PIF configuration to modules...');
  
  const moduleExists = await checkPIFModuleExists();
  if (!moduleExists) {
    throw new Error('PlayIntegrityFix module not found');
  }

  await backupExistingPIF();
  
  await writePIFToPath(pifData, PIF_JSON_PATH, 'PlayIntegrityFix');
  
  const parentPath = await locateModulePath();
  if (parentPath) {
    const parentPifPath = `${parentPath}/pif.json`;
    await writePIFToPath(pifData, parentPifPath, 'Parent Module');
    Console.success('PIF configuration written to both modules');
  } else {
    Console.info('Parent module not found, only wrote to PlayIntegrityFix');
  }
  
  return true;
}

