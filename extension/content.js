/**
 * App origin resolution:
 * 1) localStorage.clipperAppBase (set via extension options or youtube.com console)
 * 2) http://localhost:3000 in development (default for unpacked extension)
 * 3) https://clippa.in otherwise
 */
let cachedStorageBase = null;
try {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        chrome.storage.sync.get(['clipperAppBase'], (data) => {
            if (data?.clipperAppBase && /^https?:\/\//i.test(data.clipperAppBase)) {
                cachedStorageBase = data.clipperAppBase.replace(/\/$/, '');
                try {
                    localStorage.setItem('clipperAppBase', cachedStorageBase);
                } catch (_) { /* ignore */ }
            }
        });
    }
} catch (_) { /* ignore */ }

function getAppBase() {
    if (cachedStorageBase) return cachedStorageBase;
    try {
        const stored = localStorage.getItem('clipperAppBase');
        if (stored && /^https?:\/\//i.test(stored)) {
            return stored.replace(/\/$/, '');
        }
    } catch (_) {
        /* ignore */
    }

    try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
            const manifest = chrome.runtime.getManifest();
            if (!manifest.update_url) {
                return 'http://localhost:3000';
            }
        }
    } catch (_) {
        /* ignore */
    }

    return 'https://clippa.in';
}

function findActionsRow() {
    return (
        document.querySelector('#top-level-buttons-computed') ||
        document.querySelector('ytd-menu-renderer #top-level-buttons-computed') ||
        document.querySelector('#actions #top-level-buttons-computed') ||
        document.querySelector('#actions')
    );
}

function addClipButton() {
    if (document.getElementById('clipper-btn')) return;

    const targetRow = findActionsRow();
    if (!targetRow) return;

    const btn = document.createElement('button');
    btn.id = 'clipper-btn';
    btn.innerText = '✂️ Clip';
    btn.onclick = () => {
        const videoUrl = window.location.href;
        const targetUrl = `${getAppBase()}?url=${encodeURIComponent(videoUrl)}`;
        window.open(targetUrl, '_blank');
    };

    targetRow.insertBefore(btn, targetRow.firstChild);
}

function attachObserver() {
    const target = findActionsRow() || document.querySelector('#content') || document.body;
    if (!target || target.dataset.clipperObserved === '1') return;
    target.dataset.clipperObserved = '1';

    let scheduled = false;
    const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        setTimeout(() => {
            scheduled = false;
            addClipButton();
            // Re-scope if actions row appeared later
            if (!findActionsRow()?.dataset?.clipperObserved) {
                target.dataset.clipperObserved = '';
                attachObserver();
            }
        }, 500);
    });

    observer.observe(target, { childList: true, subtree: true });
}

addClipButton();
attachObserver();

window.addEventListener('yt-navigate-finish', () => {
    addClipButton();
    attachObserver();
});
