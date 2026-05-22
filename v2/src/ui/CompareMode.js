/**
 * CompareMode — split-screen A/B comparison.
 *
 * Left side: frozen screenshot of scene A.
 * Right side: live canvas of scene B (the current view).
 *
 * A drag handle lets the user resize the split.
 */

import { state }            from '../app/State.js';
import { loadSplat }        from '../loaders/SplatLoader.js';

let overlay, imgA, dragHandle, labelA, labelB;
let isDragging = false;
let splitPct   = 50; // percent

export function initCompareMode() {
    overlay    = document.getElementById('compare-overlay');
    imgA       = document.getElementById('compare-img-a');
    dragHandle = document.getElementById('compare-drag');
    labelA     = document.getElementById('compare-label-a');
    labelB     = document.getElementById('compare-label-b');
    if (!overlay) return;

    // Drag logic
    dragHandle.addEventListener('mousedown', (e) => { isDragging = true; e.preventDefault(); });
    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        splitPct = Math.max(10, Math.min(90, (e.clientX / innerWidth) * 100));
        _applySplit();
    });
    window.addEventListener('mouseup', () => { isDragging = false; });

    // Touch
    dragHandle.addEventListener('touchstart', (e) => { isDragging = true; e.preventDefault(); }, { passive: false });
    window.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        splitPct = Math.max(10, Math.min(90, (e.touches[0].clientX / innerWidth) * 100));
        _applySplit();
    });
    window.addEventListener('touchend', () => { isDragging = false; });

    document.getElementById('compare-close-btn')?.addEventListener('click', exitCompare);
}

function _applySplit() {
    imgA.style.width          = splitPct + '%';
    dragHandle.style.left     = splitPct + '%';
    const canvas = document.querySelector('canvas');
    if (canvas) canvas.style.clipPath = `inset(0 0 0 ${splitPct}%)`;
    if (labelA) labelA.style.maxWidth = splitPct + '%';
}

export function enterCompare(splatA, splatB) {
    if (!overlay) return;

    // Capture current canvas as Scene A screenshot
    state.pendingScreenshot = (canvas) => {
        const dataUrl = canvas.toDataURL('image/png');
        imgA.src = dataUrl;
        imgA.style.display = 'block';
        state.compareMode = true;
        overlay.classList.add('active');
        splitPct = 50;
        _applySplit();

        if (labelA) labelA.textContent = splatA?.name || 'Scene A';
        if (labelB) labelB.textContent = splatB?.name || 'Scene B';

        // Load scene B
        if (splatB) loadSplat(splatB);
    };
}

export function exitCompare() {
    if (!overlay) return;
    overlay.classList.remove('active');
    state.compareMode = false;
    const canvas = document.querySelector('canvas');
    if (canvas) canvas.style.clipPath = '';
    imgA.src = '';
}
