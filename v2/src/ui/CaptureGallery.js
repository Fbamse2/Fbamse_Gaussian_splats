import { state }            from '../app/State.js';
import { MASTER_DELETE_CODE } from '../app/Config.js';
import { showToast }          from './Toast.js';
import { updateViewMatrix, saveCameraState } from '../renderer/CameraController.js';

const presetsOverlay  = document.getElementById('presets-overlay');
const presetsBtn      = document.getElementById('presets-btn');
const presetsCloseBtn = document.getElementById('presets-close');
const presetsGridEl   = document.getElementById('presets-grid');
const presetsCountEl  = document.getElementById('presets-count');
const presetsTitleEl  = document.getElementById('presets-title');
const masterBtn       = document.getElementById('presets-master-btn');

let masterMode = false;

function getSplatPresetKey() {
    const splat = state.splatLibrary[state.activeSplatIndex];
    return splat?.splat ? 'cameraPresets_' + splat.splat : null;
}
function _loadPresets(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}
function _savePresets(key, presets) {
    try { localStorage.setItem(key, JSON.stringify(presets)); }
    catch { showToast('Failed to save capture', 'error'); }
}
function _fmtTime(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString('da-DK', { day:'2-digit', month:'2-digit', year:'2-digit' })
         + ' ' + d.toLocaleTimeString('da-DK', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

// Called from RenderLoop immediately after draw when state.pendingCapture is true
export function doCapture(canvas) {
    const key = getSplatPresetKey();
    if (!key) { showToast('No splat loaded', 'error'); return; }
    let thumbnail = '';
    try { thumbnail = canvas.toDataURL('image/jpeg', 0.4); } catch {}
    const preset = {
        thumbnail,
        timestamp: Date.now(),
        position: [...state.cameraPosition],
        rotation: [...state.cameraRotation],
    };
    const presets = _loadPresets(key);
    presets.push(preset);
    _savePresets(key, presets);
    showToast('Capture saved (' + presets.length + ' total)');
    if (state.presetsOpen) renderPresetsGallery();
}

export function capturePreset() {
    if (state.vertexCount === 0) { showToast('Nothing loaded yet', 'error'); return; }
    state.pendingCapture = true;
}

function renderPresetsGallery() {
    const key     = getSplatPresetKey();
    const presets = key ? _loadPresets(key) : [];
    const splat   = state.splatLibrary[state.activeSplatIndex];
    presetsTitleEl.textContent = 'Captures' + (splat ? ': ' + splat.name : '');
    presetsCountEl.textContent = presets.length ? '(' + presets.length + ')' : '';
    masterBtn.className        = masterMode ? 'active' : '';
    masterBtn.textContent      = masterMode ? '\uD83D\uDD13' : '\uD83D\uDD12';
    presetsGridEl.innerHTML    = '';
    if (!presets.length) {
        const empty = document.createElement('div');
        empty.id = 'presets-empty';
        empty.textContent = 'No captures yet. Press C to capture the current view.';
        presetsGridEl.appendChild(empty);
        return;
    }
    [...presets].reverse().forEach((preset, ri) => {
        const realIndex = presets.length - 1 - ri;
        const card = document.createElement('div');
        card.className = 'preset-card';
        const imgHtml = preset.thumbnail
            ? `<img src="${preset.thumbnail}" alt="Capture" />`
            : `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,0.2);font-size:12px;">No preview</div>`;
        card.innerHTML = `
            <div class="preset-card-thumb">${imgHtml}</div>
            <div class="preset-card-footer">
                <span class="preset-card-time">${_fmtTime(preset.timestamp)}</span>
                <div class="preset-card-actions">
                    <button class="preset-goto-btn">Go to</button>
                    <button class="preset-share-btn" title="Copy shareable link">🔗 Share</button>
                    <button class="preset-delete-btn${masterMode ? ' visible' : ''}">Delete</button>
                </div>
            </div>`;
        card.querySelector('.preset-goto-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            state.cameraPosition = [...preset.position];
            state.cameraRotation = [...preset.rotation];
            updateViewMatrix();
            saveCameraState();
            closePresetsGallery();
            showToast('Moved to capture');
        });
        card.querySelector('.preset-share-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            // Build a shareable URL: current origin + path + camera hash
            const [x, y, z]    = preset.position.map(v => v.toFixed(4));
            const [rx, ry, rz] = preset.rotation.map(v => v.toFixed(4));
            const hash = `#[${x},${y},${z}][${rx},${ry},${rz}]`;
            const url  = location.origin + location.pathname + hash;
            navigator.clipboard.writeText(url)
                .then(() => showToast('📋 Link copied!'))
                .catch(() => showToast('Could not copy link', 'error'));
        });
        card.querySelector('.preset-delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (!confirm('Delete this capture?')) return;
            const latest = _loadPresets(key);
            latest.splice(realIndex, 1);
            _savePresets(key, latest);
            showToast('Capture deleted');
            renderPresetsGallery();
        });
        presetsGridEl.appendChild(card);
    });
}

export function openPresetsGallery() {
    // Close splat browser overlay if open (original behavior)
    if (state.overlayOpen) {
        state.overlayOpen = false;
        document.getElementById('splat-overlay')?.classList.remove('open');
    }
    state.presetsOpen = true;
    presetsOverlay.classList.add('open');
    sessionStorage.setItem('captureWasOpen', '1');
    if (document.pointerLockElement) document.exitPointerLock();
    renderPresetsGallery();
}

export function closePresetsGallery() {
    state.presetsOpen = false;
    presetsOverlay.classList.remove('open');
    sessionStorage.removeItem('captureWasOpen');
}

// Called by RenderLoop after each draw
export function processPendingCapture() {
    if (!state.pendingCapture) return;
    state.pendingCapture = false;
    const canvas = document.getElementById('canvas');
    doCapture(canvas);
}

export function init() {
    presetsBtn.addEventListener('click', () =>
        state.presetsOpen ? closePresetsGallery() : openPresetsGallery());
    presetsCloseBtn.addEventListener('click', closePresetsGallery);
    masterBtn.addEventListener('click', () => {
        if (masterMode) {
            masterMode = false;
            renderPresetsGallery();
            showToast('Delete mode disabled');
        } else {
            const code = prompt('Enter master code to enable delete mode:');
            if (code === null) return;
            if (code === MASTER_DELETE_CODE) {
                masterMode = true;
                renderPresetsGallery();
                showToast('Delete mode enabled \uD83D\uDD13');
            } else {
                showToast('Incorrect code', 'error');
            }
        }
    });
}
