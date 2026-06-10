export const Console = {
  info(msg) {
    console.log(`[INFO] ${msg}`);
  },
  success(msg) {
    console.log(`[SUCCESS] ${msg}`);
  },
  error(msg) {
    console.error(`[ERROR] ${msg}`);
  },
};