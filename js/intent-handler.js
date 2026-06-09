export function openUrlViaIntent(url) {
  if (!url || typeof url !== 'string') return;

  const intentCmd = `nohup am start -a android.intent.action.VIEW -d '${url}' >/dev/null 2>&1 &`;

  if (typeof ksu === 'object' && typeof ksu.exec === 'function') {
    const cbId = `cb_${Date.now()}`;
    window[cbId] = () => delete window[cbId];
    ksu.exec(intentCmd, '{}', cbId);
  } else {
    try {
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (!opened) {
        window.location.href = url;
      }
    } catch {
      window.location.href = url;
    }
  }
}

export function setupIntentLinks(selector = '[data-url]') {
  document.querySelectorAll(selector).forEach((button) => {
    const url = button.dataset.url;
    if (url) {
      button.addEventListener('click', () => openUrlViaIntent(url));
    }
  });
}
