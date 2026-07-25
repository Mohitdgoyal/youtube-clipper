const input = document.getElementById('base');
const status = document.getElementById('status');

function load() {
  try {
    // Prefer youtube.com localStorage when available; also keep chrome.storage
    chrome.storage.sync.get(['clipperAppBase'], (data) => {
      input.value = data.clipperAppBase || '';
    });
  } catch (_) {
    input.value = '';
  }
}

document.getElementById('save').addEventListener('click', () => {
  const value = (input.value || '').trim().replace(/\/$/, '');
  if (value && !/^https?:\/\//i.test(value)) {
    status.textContent = 'URL must start with http:// or https://';
    return;
  }

  chrome.storage.sync.set({ clipperAppBase: value }, () => {
    // Mirror into active YouTube tab localStorage when possible
    chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
      for (const tab of tabs) {
        if (!tab.id) continue;
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (base) => {
            try {
              if (base) localStorage.setItem('clipperAppBase', base);
              else localStorage.removeItem('clipperAppBase');
            } catch (_) { /* ignore */ }
          },
          args: [value],
        }).catch(() => undefined);
      }
    });
    status.textContent = value ? `Saved: ${value}` : 'Cleared — using automatic defaults.';
  });
});

load();
