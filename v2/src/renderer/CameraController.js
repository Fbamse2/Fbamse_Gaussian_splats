import { state } from '../app/State.js';
import { createViewMatrix } from '../utils/math.js';

let _hashTimer = null;

function _writeHash() {
    const p = state.cameraPosition;
    const r = state.cameraRotation;
    const fmt = (n) => n.toFixed(4);
    location.replace(`#[${fmt(p[0])},${fmt(p[1])},${fmt(p[2])}][${fmt(r[0])},${fmt(r[1])},${fmt(r[2])}]`);
}

export function saveCameraState() {
    localStorage.setItem('cameraState', JSON.stringify({
        position:   state.cameraPosition,
        rotation:   state.cameraRotation,
        splatIndex: state.activeSplatIndex,  // remember which scene this camera belongs to
    }));
    // Debounced hash update (every 500ms while moving)
    clearTimeout(_hashTimer);
    _hashTimer = setTimeout(_writeHash, 500);
}

// Recompute the view matrix from current camera state and mark the view dirty
export function updateViewMatrix() {
    state.viewMatrix = createViewMatrix(state.cameraPosition, state.cameraRotation);
    state.viewDirty  = true;
}

// Apply a splat's default camera, persist it, and recompute the view matrix
export function resetToSplatCamera(splat) {
    const sc = splat.scale ?? 1;
    state.cameraPosition = splat.cameraPosition.map(v => v * sc);
    state.cameraRotation = [...splat.cameraRotation];
    updateViewMatrix();
    saveCameraState();
}
