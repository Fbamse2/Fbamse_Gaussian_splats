import { state }            from '../app/State.js';
import { updateViewMatrix, saveCameraState } from '../renderer/CameraController.js';

export const activeKeys = new Set();

// Callback slots — wired up by App.js to avoid UI imports here
let _onKeyB    = null;
let _onKeyK    = null;
let _onKeyC    = null;
let _onEscape  = null;

export function onKeyB(fn)   { _onKeyB   = fn; }
export function onKeyK(fn)   { _onKeyK   = fn; }
export function onKeyC(fn)   { _onKeyC   = fn; }
export function onEscape(fn) { _onEscape = fn; }

let mouseLocked = false;

function lockChange() {
    const canvas = document.getElementById('canvas');
    if (document.pointerLockElement === canvas) {
        mouseLocked = true;
        document.addEventListener('mousemove', onMouseMove);
    } else {
        mouseLocked = false;
        document.removeEventListener('mousemove', onMouseMove);
    }
}

function onMouseMove(e) {
    if (!mouseLocked) return;
    state.cameraRotation[0] += e.movementX * 0.002;
    state.cameraRotation[1] -= e.movementY * 0.002;
    state.cameraRotation[1] = Math.max(-Math.PI/2+0.01, Math.min(Math.PI/2-0.01, state.cameraRotation[1]));
    updateViewMatrix();
    saveCameraState();
}

export function init() {
    const canvas = document.getElementById('canvas');

    canvas.addEventListener('click', () => {
        if (state.overlayOpen) return;
        (canvas.requestPointerLock || canvas.mozRequestPointerLock).call(canvas);
    });
    document.addEventListener('pointerlockchange',    lockChange);
    document.addEventListener('mozpointerlockchange', lockChange);

    window.addEventListener('keydown', (e) => {
        activeKeys.add(e.code);
        if (e.target.matches('input,textarea,select')) return;
        if (e.code === 'KeyB') { _onKeyB?.(); }
        if (e.code === 'KeyK') { _onKeyK?.(); }
        if (e.code === 'KeyC') { _onKeyC?.(); }
        if (e.code === 'Escape') { _onEscape?.(); }
    });
    window.addEventListener('keyup',  (e) => activeKeys.delete(e.code));
    window.addEventListener('blur',   ()  => activeKeys.clear());

    window.addEventListener('wheel', (e) => {
        const overlay = document.getElementById('splat-overlay');
        const grid    = document.getElementById('splat-grid');
        if (overlay?.classList.contains('open') && grid && e.target.closest?.('#splat-grid')) return;
        e.preventDefault();
    }, { passive: false });

    // Hash-based camera restore
    window.addEventListener('hashchange', () => {
        try {
            const m = location.hash.slice(1).match(
                /\[([-\d.]+),([-\d.]+),([-\d.]+)\]\[([-\d.]+),([-\d.]+),([-\d.]+)\]/
            );
            if (m) {
                state.cameraPosition = [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
                state.cameraRotation = [parseFloat(m[4]), parseFloat(m[5]), parseFloat(m[6])];
                updateViewMatrix();
            }
        } catch (err) { console.error('Failed to parse hash:', err); }
    });
}
