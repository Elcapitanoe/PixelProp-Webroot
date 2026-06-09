export const Console = {
  init() {
    this.box = document.getElementById('log-box');
    document
      .getElementById('btn-clear-logs')
      .addEventListener('click', () => this.clear());
  },
  log(level, msg) {
    if (!this.box) return;
    const time = new Date().toTimeString().split(' ')[0];
    const entry = document.createElement('div');
    entry.className = `log-entry log-${level}`;
    entry.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-badge">[${level.toUpperCase()}]</span> ${msg}`;
    this.box.appendChild(entry);
    this.box.scrollTop = this.box.scrollHeight;
  },
  info(msg) {
    this.log('info', msg);
  },
  success(msg) {
    this.log('success', msg);
  },
  error(msg) {
    this.log('error', msg);
  },
  clear() {
    if (this.box) this.box.innerHTML = '';
  },
};
