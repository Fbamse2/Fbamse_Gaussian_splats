import { createViewMatrix } from '../utils/math.js';

// ── Restore persisted camera ──────────────────────────────────────
let initPosition = [0, 0, 0];
let initRotation = [0, 0, 0];
const _savedCamera = localStorage.getItem('cameraState');

// ── Restore active splat index ────────────────────────────────────
const _savedIdx = localStorage.getItem('activeSplatIndex');
const initSplatIndex = (_savedIdx !== null && !isNaN(Number(_savedIdx)))
    ? Number(_savedIdx)
    : 0;

// Only restore camera if it was saved for the same splat we're loading
let _cameraMatchesSplat = false;
if (_savedCamera) {
    try {
        const { position, rotation, splatIndex } = JSON.parse(_savedCamera);
        // Restore if: splatIndex matches, OR the save is from before we started tracking splatIndex
        const indexMatches = splatIndex === undefined || splatIndex === initSplatIndex;
        if (indexMatches && Array.isArray(position) && Array.isArray(rotation)) {
            initPosition = [...position];
            initRotation = [...rotation];
            _cameraMatchesSplat = true;
        }
    } catch { /* ignore corrupt data */ }
}

// Also check URL hash for camera position (overrides localStorage if present)
const _hashMatch = location.hash.slice(1).match(
    /\[([-\d.]+),([-\d.]+),([-\d.]+)\]\[([-\d.]+),([-\d.]+),([-\d.]+)\]/
);
if (_hashMatch) {
    initPosition = [parseFloat(_hashMatch[1]), parseFloat(_hashMatch[2]), parseFloat(_hashMatch[3])];
    initRotation = [parseFloat(_hashMatch[4]), parseFloat(_hashMatch[5]), parseFloat(_hashMatch[6])];
    _cameraMatchesSplat = true;
}

export const state = {
    // Gaussian data
    vertexCount:    0,
    texAllocWidth:  0,
    texAllocHeight: 0,

    // Library
    activeSplatIndex: initSplatIndex,
    splatLibrary:     [],
    splatCategories:  {},

    // Camera
    cameraPosition: initPosition,
    cameraRotation: initRotation,
    viewMatrix:     createViewMatrix(initPosition, initRotation),
    projectionMatrix: null,

    // Render flags
    viewDirty:      true,
    pendingCapture: false,
    pendingScreenshot: null, // callback(canvas) fired right after next draw()

    // Overlay state
    overlayOpen:  false,
    presetsOpen:  false,
    mapOpen:      false,

    // Loading generation counter — incremented on each new load to cancel stale fetches
    loadGen: 0,

    // Loader bookkeeping to prevent duplicate same-scene reload loops
    loadingSplatUrl: null,
    loadedSplatUrl:  null,

    // True when a camera was saved from a previous session (for this splat or from URL hash)
    hasPersistedCamera: _cameraMatchesSplat,

    // Settings persisted in localStorage
    speedMultiplier: parseFloat(localStorage.getItem('speed-mult') || '1'),
    fovScale:        parseFloat(localStorage.getItem('fov-scale')  || '1'),
};
