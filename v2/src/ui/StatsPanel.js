const fpsEl = document.getElementById('fps');

export function updateFps(fps) {
    if (fpsEl) fpsEl.innerText = fps + ' fps';
}
