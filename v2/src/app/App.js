import { state }             from './State.js';
import { init as initRenderer }   from '../renderer/Renderer.js';
import { start as startLoop }     from '../renderer/RenderLoop.js';
import { resetToSplatCamera }     from '../renderer/CameraController.js';
import { init as initInput }      from '../input/InputManager.js';
import { onKeyB, onKeyK, onKeyC, onEscape } from '../input/InputManager.js';
import { init as initTouch }      from '../input/TouchInput.js';
import { loadSplat, initFileDrop } from '../loaders/SplatLoader.js';
import { init as initSidebar, openOverlay, closeOverlay, renderSplatGrid } from '../ui/Sidebar.js';
import { init as initCapture, openPresetsGallery, closePresetsGallery, capturePreset } from '../ui/CaptureGallery.js';
import { init as initMap, openMap, closeMap } from '../ui/MapOverlay.js';
import { initRouting, syncRouteFromUi } from './Router.js';

export async function init() {
    // ── Load splat library ────────────────────────────────────────
    try {
        const resp = await fetch('/splats.json');
        if (!resp.ok) throw new Error('Failed to load splats.json');
        const data = await resp.json();
        if (Array.isArray(data)) {
            state.splatLibrary   = data;
            state.splatCategories = {};
        } else {
            state.splatLibrary   = data.splats    || [];
            state.splatCategories = data.categories || {};
        }
    } catch (e) {
        console.error('Error loading splats.json:', e);
        state.splatLibrary   = [];
        state.splatCategories = {};
    }

    // ── Bootstrap systems ─────────────────────────────────────────
    const canvas = document.getElementById('canvas');

    // Renderer (also calls initWorker internally for tex/sort handlers)
    initRenderer(canvas);

    // Input
    initInput();
    initTouch();

    // UI modules
    initSidebar();
    initCapture();
    initMap();
    initFileDrop();

    initRouting({
        openOverlay,
        closeOverlay,
        openMap,
        closeMap,
        renderSplatGrid,
        loadSplatByIndex: (index) => {
            const splat = state.splatLibrary[index];
            if (!splat) return;
            loadSplat(splat);
        },
    });

    // ── Wire keyboard callbacks ───────────────────────────────────
    onKeyB(() => state.overlayOpen  ? closeOverlay()        : openOverlay());
    onKeyK(() => state.presetsOpen  ? closePresetsGallery() : openPresetsGallery());
    onKeyC(() => capturePreset());
    onEscape(() => { if (state.presetsOpen) closePresetsGallery(); });

    // ── Initial splat load ────────────────────────────────────────
    renderSplatGrid(); // populate grid before load starts

    if (state.activeSplatIndex >= 0 && state.activeSplatIndex < state.splatLibrary.length) {
        const splat = state.splatLibrary[state.activeSplatIndex];
        // Only apply splat's default camera if no persisted camera was found
        if (!state.hasPersistedCamera && splat.cameraPosition && splat.cameraRotation) {
            resetToSplatCamera(splat);
        }
        // Strip camera fields so loadSplat won't override the camera we just set
        const splatNoCamera = { ...splat };
        delete splatNoCamera.cameraPosition;
        delete splatNoCamera.cameraRotation;
        loadSplat(splatNoCamera);
    }

    syncRouteFromUi({ replace: true });

    // ── Start render loop ─────────────────────────────────────────
    startLoop();
}
