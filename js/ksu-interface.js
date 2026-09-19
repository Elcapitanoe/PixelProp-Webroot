import { Console } from './core-telemetry.js';

const COMMAND_TIMEOUT_MS = 15000;
let callbackIdCounter = 0;

function getCallbackName(prefix) {
  return `${prefix}_callback_${Date.now()}_${callbackIdCounter++}`;
}

export function isKsuEnvironment() {
  return typeof ksu === 'object' && ksu !== null;
}

export function showToast(message) {
  if (isKsuEnvironment() && typeof ksu.toast === 'function') {
    try {
      ksu.toast(message);
      return;
    } catch {}
  }
  Console.info(`Toast: ${message}`);
}

export function getModuleInfo() {
  if (isKsuEnvironment() && typeof ksu.moduleInfo === 'function') {
    try {
      const raw = ksu.moduleInfo();
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      Console.error(`Failed to parse moduleInfo: ${e.message}`);
    }
  }
  return null;
}

export function listPackages(type = 'all') {
  if (isKsuEnvironment() && typeof ksu.listPackages === 'function') {
    try {
      const raw = ksu.listPackages(type);
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      Console.error(`Failed to parse listPackages: ${e.message}`);
    }
  }
  return null;
}

export function executeNativeCommand(command, timeoutMs = COMMAND_TIMEOUT_MS) {
  Console.info(`Executing: ${command}`);
  return new Promise((resolve, reject) => {
    if (!isKsuEnvironment() || typeof ksu.exec !== 'function') {
      resolve({ errno: -1, stdout: '', stderr: 'KernelSU interface unavailable' });
      return;
    }

    const callbackName = getCallbackName('exec');
    const timeoutId = setTimeout(() => {
      Console.error(`Command timeout: ${command}`);
      delete window[callbackName];
      resolve({ errno: -1, stdout: '', stderr: 'Execution timeout' });
    }, timeoutMs);

    window[callbackName] = (errno, stdout, stderr) => {
      clearTimeout(timeoutId);
      if (errno !== 0) {
        Console.error(`Command failed (errno ${errno}): ${stderr || 'Unknown error'}`);
      }
      resolve({
        errno: typeof errno === 'number' ? errno : 0,
        stdout: typeof stdout === 'string' ? stdout : '',
        stderr: typeof stderr === 'string' ? stderr : ''
      });
      delete window[callbackName];
    };

    try {
      ksu.exec(command, '{}', callbackName);
    } catch (error) {
      clearTimeout(timeoutId);
      Console.error(`KSU Exception: ${error.message}`);
      delete window[callbackName];
      reject(error);
    }
  });
}

export async function fetchSystemOutput(command, fallback = '') {
  try {
    const { stdout, errno } = await executeNativeCommand(command);
    if (errno === 0 && stdout && stdout.trim() !== '') {
      return stdout.trim();
    }
    return fallback;
  } catch (error) {
    Console.error(`Failed to fetch system output: ${error.message}`);
    return fallback;
  }
}

export async function locateModulePath() {
  const info = getModuleInfo();
  if (info && info.moduleDir) {
    Console.success(`Module located via ksu.moduleInfo: ${info.moduleDir}`);
    return info.moduleDir;
  }

  const patternMatch = await fetchSystemOutput(
    'ls -d /data/adb/modules/*[Pp]rops 2>/dev/null | head -n 1',
    ''
  );
  if (patternMatch) {
    Console.success(`Module located via directory pattern: ${patternMatch}`);
    return patternMatch;
  }

  const authorMatch = await fetchSystemOutput(
    'grep -l -E "author=.*(Elcapitanoe|Tesla)" /data/adb/modules/*/module.prop 2>/dev/null | head -n 1 | xargs -r dirname',
    ''
  );
  if (authorMatch) {
    Console.success(`Module located via author metadata: ${authorMatch}`);
    return authorMatch;
  }

  Console.error('Target module not found in /data/adb/modules/');
  return null;
}
