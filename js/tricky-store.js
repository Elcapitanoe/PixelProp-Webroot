import { Console } from './core-telemetry.js';
import { executeNativeCommand, listPackages } from './ksu-interface.js';

const TRICKY_STORE_DIR = '/data/adb/tricky_store';
const TARGET_FILE = `${TRICKY_STORE_DIR}/target.txt`;
const TEE_STATUS_FILE = `${TRICKY_STORE_DIR}/tee_status`;

const CORE_PACKAGES = [
  'com.google.android.gms',
  'com.google.android.gsf',
  'com.android.vending'
];

function escapeShellArg(arg) {
  if (typeof arg !== 'string') return '';
  return arg.replace(/'/g, "'\\''");
}

export async function checkTrickyStoreExists() {
  const { stdout, errno } = await executeNativeCommand(`test -d '${TRICKY_STORE_DIR}' && echo 'exists'`);
  return errno === 0 && stdout.trim() === 'exists';
}

export async function checkTEEStatus() {
  const { stdout, errno } = await executeNativeCommand(`cat '${TEE_STATUS_FILE}' 2>/dev/null`);

  if (errno === 0 && stdout.trim()) {
    const teeBrokenMatch = stdout.match(/teeBroken=(true|1)/i);
    const isBroken = teeBrokenMatch !== null;

    Console.info(`TEE status: ${isBroken ? 'Broken (Software attestation required)' : 'Working'}`);
    return { exists: true, broken: isBroken };
  }

  return { exists: false, broken: false };
}

export async function scanInstalledPackages() {
  const nativeList = listPackages('all');
  if (Array.isArray(nativeList) && nativeList.length > 0) {
    Console.success(`Found ${nativeList.length} packages via ksu native API`);
    return nativeList;
  }

  Console.info('Scanning installed packages via pm...');
  const { stdout, errno } = await executeNativeCommand('pm list packages');
  if (errno !== 0) {
    return CORE_PACKAGES;
  }

  return stdout
    .split('\n')
    .filter(line => line.startsWith('package:'))
    .map(line => line.replace('package:', '').trim())
    .filter(Boolean)
    .sort();
}

export function filterTargetPackages(packages) {
  const targetSet = new Set(CORE_PACKAGES);

  const sensitivePatterns = [
    'bank', 'pay', 'wallet', 'dana', 'ovo', 'gopay', 'shopeepay',
    'bca', 'mandiri', 'bri', 'bni', 'cimb', 'jago', 'aladin', 'jenius',
    'linkaja', 'fintech', 'crypto', 'binance', 'tokocrypto', 'authenticator'
  ];

  packages.forEach(pkg => {
    const lower = pkg.toLowerCase();
    if (sensitivePatterns.some(pat => lower.includes(pat))) {
      targetSet.add(pkg);
    }
  });

  return Array.from(targetSet);
}

export async function buildTargetList(packages, teeBroken = false) {
  const targets = filterTargetPackages(packages);
  Console.info(`Target list selected ${targets.length} essential/sensitive packages`);

  return targets.map(pkg => (teeBroken ? `${pkg}!` : (CORE_PACKAGES.includes(pkg) ? `${pkg}!` : pkg)));
}

export async function backupExistingTarget() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupPath = `${TARGET_FILE}.backup.${timestamp}`;
  const { errno } = await executeNativeCommand(`test -f '${TARGET_FILE}' && cp '${TARGET_FILE}' '${backupPath}'`);
  if (errno === 0) {
    Console.success(`Backed up existing target.txt`);
    return backupPath;
  }
  return null;
}

export async function writeTargetFile(targetList) {
  Console.info('Writing target.txt to TrickyStore...');
  const storeExists = await checkTrickyStoreExists();
  if (!storeExists) {
    throw new Error(`TrickyStore directory not found at ${TRICKY_STORE_DIR}`);
  }

  await backupExistingTarget();

  const content = targetList.join('\n');
  const escapedContent = escapeShellArg(content);
  const writeCmd = `echo '${escapedContent}' > '${TARGET_FILE}'`;
  const { errno: writeErr } = await executeNativeCommand(writeCmd);

  if (writeErr !== 0) {
    throw new Error('Failed to write target.txt to TrickyStore');
  }

  Console.success(`Successfully updated TrickyStore target.txt with ${targetList.length} packages`);
  return true;
}

export async function buildAndApplyTrickyStore() {
  const storeExists = await checkTrickyStoreExists();
  if (!storeExists) {
    return {
      success: false,
      message: 'TrickyStore not installed'
    };
  }

  const teeStatus = await checkTEEStatus();
  const packages = await scanInstalledPackages();
  const targetList = await buildTargetList(packages, teeStatus.broken);

  await writeTargetFile(targetList);

  return {
    success: true,
    packagesCount: targetList.length,
    teeBroken: teeStatus.broken,
    message: 'TrickyStore updated'
  };
}
