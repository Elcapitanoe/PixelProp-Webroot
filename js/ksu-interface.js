import { Console } from './core-telemetry.js';

const COMMAND_TIMEOUT_MS = 10000;

let callbackIdCounter = 0;

function getCallbackName(prefix) {
  return `${prefix}_callback_${Date.now()}_${callbackIdCounter++}`;
}

export function executeNativeCommand(command) {
  Console.info(`Executing: ${command}`);
  return new Promise((resolve, reject) => {
    const callbackName = getCallbackName('exec');
    const timeoutId = setTimeout(() => {
      Console.error(`Command timeout: ${command}`);
      delete window[callbackName];
      resolve({ errno: -1, stdout: '', stderr: 'Execution timeout' });
    }, COMMAND_TIMEOUT_MS);

    window[callbackName] = (errno, stdout, stderr) => {
      clearTimeout(timeoutId);
      if (errno !== 0) {
        Console.error(
          `Command failed (errno ${errno}): ${stderr || 'Unknown error'}`
        );
      }
      resolve({ errno, stdout, stderr });
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

export async function fetchSystemOutput(command, fallback = 'Not Found') {
  try {
    const { stdout, errno } = await executeNativeCommand(command);
    if (errno === 0 && stdout.trim() !== '') return stdout.trim();
    return fallback;
  } catch (error) {
    Console.error(`Failed to fetch system output: ${error.message}`);
    return fallback;
  }
}

export async function locateModulePath() {
  const path = await fetchSystemOutput(
    'ls -d /data/adb/modules/*_beta_Props 2>/dev/null | head -n 1',
    ''
  );
  return path !== '' ? path : null;
}