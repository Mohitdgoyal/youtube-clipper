function addClipButton() {
    if (document.getElementById('clipper-btn')) return;

    // Target the specific top-level buttons row next to Subscribe/Join/Share
    // Selector can be brittle on YT updates. 
    // #top-level-buttons-computed is often reliable for the row of buttons
    const targetRow = document.querySelector('#top-level-buttons-computed') ||
        document.querySelector('ytd-menu-renderer #top-level-buttons-computed');

    if (targetRow) {
        const btn = document.createElement('button');
        btn.id = 'clipper-btn';
        btn.innerText = '✂️ Clip';
        btn.onclick = () => {
            const videoUrl = window.location.href;
            const targetUrl = `http://localhost:3000?url=${encodeURIComponent(videoUrl)}`;
            window.open(targetUrl, '_blank');
        };

        // Insert as the first item for visibility (or appendChild to put at end)
        // targetRow.appendChild(btn); // puts it after 'Clip' or 'Save' usually
        targetRow.insertBefore(btn, targetRow.firstChild);
    }
}

// Initial run
addClipButton();

// Observer for navigation (SPA)
const observer = new MutationObserver((mutations) => {
    addClipButton();
});

// Watch for body changes (e.g. initial load of dynamic content)
observer.observe(document.body, { childList: true, subtree: true });

// YouTube specific event for navigation finish
window.addEventListener('yt-navigate-finish', () => {
    addClipButton();
});
