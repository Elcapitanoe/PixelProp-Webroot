import { Console } from './core-telemetry.js';
import { executeNativeCommand, fetchSystemOutput, locateModulePath } from './ksu-interface.js';

const PIF_MODULE_PATH = '/data/adb/modules/playintegrityfix';
const PIF_JSON_PATH = `${PIF_MODULE_PATH}/pif.json`;
const GOOGLE_GSI_URL = 'https://developer.android.com/topic/generic-system-image/releases';

function escapeShellArg(arg) {
  if (typeof arg !== 'string') return '';
  return arg.replace(/'/g, "'\\''");
}

export function mapAndroidToSdk(version) {
  const v = parseInt(version, 10);
  if (isNaN(v)) return 35;
  if (v >= 30) return v;
  return v + 20;
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
    await backupFile(`${parentPath}/pif.json`);
  }
}

export async function readModulePifSource(modulePath) {
  if (!modulePath) return null;

  const pifRaw = await fetchSystemOutput(`cat '${modulePath}/pif.json' 2>/dev/null`, '');
  if (pifRaw) {
    try {
      const parsed = JSON.parse(pifRaw);
      if (parsed.FINGERPRINT || parsed.fingerprint) {
        return {
          MODEL: parsed.MODEL || parsed.model || 'Pixel',
          MANUFACTURER: parsed.MANUFACTURER || parsed.manufacturer || 'Google',
          FINGERPRINT: parsed.FINGERPRINT || parsed.fingerprint,
          SECURITY_PATCH: parsed.SECURITY_PATCH || parsed.security_patch || '2026-08-05',
          DEVICE_INITIAL_SDK_INT: parseInt(parsed.DEVICE_INITIAL_SDK_INT || parsed.first_api_level || '34', 10)
        };
      }
    } catch {}
  }

  const sysProp = await fetchSystemOutput(`cat '${modulePath}/system.prop' 2>/dev/null`, '');
  if (!sysProp) return null;

  const getProp = (key) => {
    const match = sysProp.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return match ? match[1].trim() : '';
  };

  const model = getProp('ro.product.model') || getProp('ro.product.vendor.model') || 'Pixel';
  const manufacturer = getProp('ro.product.manufacturer') || 'Google';
  const fingerprint = getProp('ro.product.build.fingerprint') || getProp('ro.build.fingerprint');
  const patch = getProp('ro.vendor.build.security_patch') || getProp('ro.build.version.security_patch') || '2026-08-05';
  const firstApi = getProp('ro.product.first_api_level') || '34';

  if (!fingerprint) return null;

  return {
    MODEL: model,
    MANUFACTURER: manufacturer,
    FINGERPRINT: fingerprint,
    SECURITY_PATCH: patch,
    DEVICE_INITIAL_SDK_INT: parseInt(firstApi, 10)
  };
}

export async function applyModulePIF() {
  const parentPath = await locateModulePath();
  if (!parentPath) {
    throw new Error('Active module path not found');
  }

  const pifData = await readModulePifSource(parentPath);
  if (!pifData) {
    throw new Error('Unable to extract valid fingerprint from active module');
  }

  await writePIFToModule(pifData);
  return pifData;
}

export async function fetchGoogleBetaOTA() {
  Console.info('Fetching Google Beta OTA releases...');
  const downloadCmd = `curl -sL --connect-timeout 8 -m 15 '${GOOGLE_GSI_URL}'`;
  const { stdout: html, errno } = await executeNativeCommand(downloadCmd);

  if (errno !== 0 || !html.trim()) {
    throw new Error('Failed to fetch Google Beta OTA page (Network timeout/error)');
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
  const downloadCmd = `curl -sL --connect-timeout 8 -m 15 '${url}'`;
  const { stdout: html, errno } = await executeNativeCommand(downloadCmd);

  if (errno !== 0 || !html.trim()) {
    throw new Error('Failed to fetch OTA download page (Network timeout/error)');
  }

  Console.success('Successfully fetched OTA download page');
  return html;
}

export const PIXEL_DEVICE_CATALOG = [
  { codename: 'cubs', model: 'Pixel 11' },
  { codename: 'grizzly', model: 'Pixel 11 Pro' },
  { codename: 'kodiak', model: 'Pixel 11 Pro XL' },
  { codename: 'yogi', model: 'Pixel 11 Pro Fold' },

  { codename: 'frankel', model: 'Pixel 10' },
  { codename: 'blazer', model: 'Pixel 10 Pro' },
  { codename: 'mustang', model: 'Pixel 10 Pro XL' },
  { codename: 'rango', model: 'Pixel 10 Pro Fold' },
  { codename: 'stallion', model: 'Pixel 10a' },

  { codename: 'tokay', model: 'Pixel 9' },
  { codename: 'caiman', model: 'Pixel 9 Pro' },
  { codename: 'komodo', model: 'Pixel 9 Pro XL' },
  { codename: 'comet', model: 'Pixel 9 Pro Fold' },
  { codename: 'tegu', model: 'Pixel 9a' },

  { codename: 'shiba', model: 'Pixel 8' },
  { codename: 'husky', model: 'Pixel 8 Pro' },
  { codename: 'akita', model: 'Pixel 8a' },

  { codename: 'panther', model: 'Pixel 7' },
  { codename: 'cheetah', model: 'Pixel 7 Pro' },
  { codename: 'lynx', model: 'Pixel 7a' },
  { codename: 'felix', model: 'Pixel Fold' },

  { codename: 'bluejay', model: 'Pixel 6a' }
];

export function parseDeviceList(html) {
  const devices = [];
  const seenCodenames = new Set();

  for (const item of PIXEL_DEVICE_CATALOG) {
    seenCodenames.add(item.codename);
    devices.push({ codename: item.codename, model: item.model });
  }

  if (html && typeof html === 'string') {
    const trMatches = html.matchAll(/<tr\s+id="([^"]+)"[\s\S]*?<td>([^<]+)<\/td>/g);
    for (const match of trMatches) {
      const codename = match[1];
      const model = match[2].trim();

      if (!seenCodenames.has(codename) && model && codename) {
        seenCodenames.add(codename);
        devices.push({ codename, model });
      }
    }
  }

  Console.success(`Loaded ${devices.length} device models (including Pixel 11 series)`);
  return devices;
}

export function buildPIFJson(release, device) {
  const versionName = parseInt(release.androidVersion, 10) > 15 ? 'Baklava' : release.androidVersion;
  const fingerprint = `google/${device.codename}_beta/${device.codename}:${versionName}/${release.buildId}/${release.incremental}:user/release-keys`;

  return {
    MODEL: device.model,
    MANUFACTURER: 'Google',
    FINGERPRINT: fingerprint,
    SECURITY_PATCH: release.securityPatch,
    DEVICE_INITIAL_SDK_INT: mapAndroidToSdk(release.androidVersion)
  };
}

async function writePIFToPath(pifData, filePath, moduleName) {
  const jsonContent = JSON.stringify(pifData, null, 2);
  const escapedContent = escapeShellArg(jsonContent);
  const writeCmd = `echo '${escapedContent}' > '${filePath}'`;
  const { errno: writeErr } = await executeNativeCommand(writeCmd);

  if (writeErr !== 0) {
    throw new Error(`Failed to write pif.json to ${moduleName}`);
  }

  Console.success(`Successfully wrote pif.json to ${moduleName}`);
  return true;
}

export async function writePIFToModule(pifData) {
  Console.info('Writing PIF configuration to modules...');
  const moduleExists = await checkPIFModuleExists();
  if (!moduleExists) {
    throw new Error('PlayIntegrityFix module directory not found in /data/adb/modules/playintegrityfix');
  }

  await backupExistingPIF();
  await writePIFToPath(pifData, PIF_JSON_PATH, 'PlayIntegrityFix');

  const parentPath = await locateModulePath();
  if (parentPath) {
    await writePIFToPath(pifData, `${parentPath}/pif.json`, 'Parent Module');
  }

  return true;
}

export async function cleanGmsData() {
  Console.info('Clearing Google Play Services and Framework data...');
  const clearCmd = 'pm clear com.google.android.gms && pm clear com.google.android.gsf';
  const { errno, stderr } = await executeNativeCommand(clearCmd);
  if (errno !== 0) {
    throw new Error(stderr || 'Failed to clear GMS data');
  }
  Console.success('GMS and GSF data cleared successfully');
  return true;
}
