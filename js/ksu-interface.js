import { Console } from './core-telemetry.js';

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
    }, 10000);

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
      reject(error);
      delete window[callbackName];
    }
  });
}

export async function fetchSystemOutput(command, fallback = 'Not Found') {
  try {
    const { stdout, errno } = await executeNativeCommand(command);
    if (errno === 0 && stdout.trim() !== '') return stdout.trim();
    return fallback;
  } catch (error) {
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
