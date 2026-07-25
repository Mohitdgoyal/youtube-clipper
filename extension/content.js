/**
 * App origin resolution:
 * 1) localStorage.clipperAppBase (set on youtube.com console if needed)
 * 2) http://localhost:3000 in development (default for unpacked extension)
 * 3) https://clippa.in otherwise
 *
 * Override examples:
 *   localStorage.setItem('clipperAppBase', 'http://localhost:3000')
 *   localStorage.setItem('clipperAppBase', 'https://clippa.in')
 */
function getAppBase() {
    try {
        const stored = localStorage.getItem('clipperAppBase');
        if (stored && /^https?:\/\//i.test(stored)) {
            return stored.replace(/\/$/, '');
        }
    } catch (_) {
        /* ignore */
    }

    // Unpacked / Chrome "development" install → local app
    try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
            // Heuristic: no update_url means unpacked (local) extension
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

function addClipButton() {
    if (document.getElementById('clipper-btn')) return;

    const targetRow = document.querySelector('#top-level-buttons-computed') ||
        document.querySelector('ytd-menu-renderer #top-level-buttons-computed');

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

addClipButton();

// Throttle MutationObserver — YouTube mutates the DOM constantly
let scheduled = false;
const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
        scheduled = false;
        addClipButton();
    }, 500);
});

observer.observe(document.body, { childList: true, subtree: true });

window.addEventListener('yt-navigate-finish', () => {
    addClipButton();
});
