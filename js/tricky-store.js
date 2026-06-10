import { Console } from './core-telemetry.js';
import { executeNativeCommand } from './ksu-interface.js';

const TRICKY_STORE_DIR = '/data/adb/tricky_store';
const TARGET_FILE = `${TRICKY_STORE_DIR}/target.txt`;
const TEE_STATUS_FILE = `${TRICKY_STORE_DIR}/tee_status`;

const SPECIAL_PACKAGES = [
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
    const teeBrokenMatch = stdout.match(/teeBroken=(true|1)/);
    const isBroken = teeBrokenMatch !== null;
    
    Console.info(`TEE status: ${isBroken ? 'Broken (Hardware attestation not available)' : 'Working'}`);
    return {
      exists: true,
      broken: isBroken
    };
  }
  
  Console.info('TEE status file not found, assuming working');
  return {
    exists: false,
    broken: false
  };
}

export async function scanInstalledPackages() {
  Console.info('Scanning installed packages...');
  
  const { stdout, errno } = await executeNativeCommand('pm list packages');
  
  if (errno !== 0) {
    throw new Error('Failed to list installed packages');
  }

  const packages = stdout
    .split('\n')
    .filter(line => line.startsWith('package:'))
    .map(line => line.replace('package:', '').trim())
    .filter(pkg => pkg.length > 0)
    .sort();
  
  Console.success(`Found ${packages.length} installed packages`);
  return packages;
}

export async function buildTargetList(packages, teeBroken = false) {
  Console.info('Building TrickyStore target list...');
  
  let targetList = [];
  
  if (teeBroken) {
    Console.info('TEE is broken, adding ! suffix to all packages');
    targetList = packages.map(pkg => `${pkg}!`);
  } else {
    targetList = packages.map(pkg => {
      if (SPECIAL_PACKAGES.includes(pkg)) {
        return `${pkg}!`;
      }
      return pkg;
    });
  }
  
  Console.success(`Built target list with ${targetList.length} entries`);
  return targetList;
}

export async function backupExistingTarget() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupPath = `${TARGET_FILE}.backup.${timestamp}`;
  
  const { errno } = await executeNativeCommand(`test -f '${TARGET_FILE}' && cp '${TARGET_FILE}' '${backupPath}'`);
  
  if (errno === 0) {
    Console.success(`Backed up existing target.txt to ${backupPath}`);
    return backupPath;
  }
  return null;
}

export async function writeTargetFile(targetList) {
  Console.info('Writing target.txt to TrickyStore...');
  
  const storeExists = await checkTrickyStoreExists();
  if (!storeExists) {
    throw new Error('TrickyStore directory not found at ' + TRICKY_STORE_DIR);
  }

  await backupExistingTarget();
  
  const content = targetList.join('\n');
  const tempFile = '/data/local/tmp/target_temp.txt';
  
  const escapedContent = escapeShellArg(content);
  const writeCmd = `echo '${escapedContent}' > '${tempFile}'`;
  const { errno: writeErr } = await executeNativeCommand(writeCmd);
  
  if (writeErr !== 0) {
    throw new Error('Failed to write temporary target file');
  }

  const { errno: moveErr } = await executeNativeCommand(`mv '${tempFile}' '${TARGET_FILE}'`);
  
  if (moveErr !== 0) {
    await executeNativeCommand(`rm -f '${tempFile}'`);
    throw new Error('Failed to move target file to TrickyStore directory');
  }

  const { stdout: lineCount, errno: verifyErr } = await executeNativeCommand(`wc -l < '${TARGET_FILE}'`);
  
  if (verifyErr === 0) {
    const lines = parseInt(lineCount.trim());
    Console.success(`Successfully wrote target.txt with ${lines} packages`);
    return true;
  }
  
  Console.success('Successfully wrote target.txt');
  return true;
}

export async function buildAndApplyTrickyStore() {
  Console.info('Starting TrickyStore configuration...');
  
  const storeExists = await checkTrickyStoreExists();
  if (!storeExists) {
    Console.info('TrickyStore not found, skipping target.txt generation');
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
    message: 'TrickyStore configuration completed'
  };
}