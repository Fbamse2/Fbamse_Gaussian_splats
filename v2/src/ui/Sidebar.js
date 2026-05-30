import { state }              from '../app/State.js';
import { ENABLE_SAVE_VIEW }  from '../app/Config.js';
import { showToast }         from './Toast.js';
import { getCachedKeys, clearSplatCache, getCachedImage, setCachedImage, clearImageCache } from '../gaussian/GaussianCache.js';
import { loadSplat }         from '../loaders/SplatLoader.js';
import { setShaderMode, setDepthScale, setFovScale, getDepthScale, SHADER_MODES } from '../renderer/Renderer.js';
import { syncRouteFromUi } from '../app/Router.js';

const overlayEl      = document.getElementById('splat-overlay');
const browserBtn     = document.getElementById('splat-browser-btn');
const hudSettingsBtn = document.getElementById('hud-settings-btn');
const overlayClose   = document.getElementById('overlay-close');
const overlayFilters = document.getElementById('overlay-filters');
const splatGridEl    = document.getElementById('splat-grid');
const overlayCountEl = document.getElementById('overlay-count');
const saveViewRowEl  = document.getElementById('help-save-view-row');
const searchInput    = document.getElementById('overlay-search');
const sortSelect     = document.getElementById('sort-select');
const settingsBtn    = document.getElementById('overlay-settings-btn');
const settingsDropdown = document.getElementById('settings-dropdown');
const clearCacheBtn  = document.getElementById('clear-cache-btn');

// Module-level UI state
let activeFilters   = new Set();
let searchQuery     = '';
let sortOrder       = 'default';
let cachedSplatUrls = new Set();
let filterPanelOpen = false;
const expandedGroups      = new Set();
const FILTER_INITIAL_COUNT = 4;

// In-memory object URL cache (prevents repeated IDB lookups within a session)
const imageObjectUrls = new Map();

// ── Favorites ──────────────────────────────────────────────────────
let favorites = new Set(JSON.parse(localStorage.getItem('splat-favorites') || '[]'));

function _saveFavorites() {
    localStorage.setItem('splat-favorites', JSON.stringify([...favorites]));
}

function _toggleFavorite(url) {
    if (favorites.has(url)) favorites.delete(url);
    else favorites.add(url);
    _saveFavorites();
    _renderSplatGrid();
}

// ── Image loading ──────────────────────────────────────────────────
async function _loadCardImage(imgEl, url) {
    if (imageObjectUrls.has(url)) { imgEl.src = imageObjectUrls.get(url); return; }
    try {
        let blob = await getCachedImage(url);
        if (!blob) {
            const resp = await fetch(url);
            if (!resp.ok) return;
            blob = await resp.blob();
            setCachedImage(url, blob);
        }
        const objectUrl = URL.createObjectURL(blob);
        imageObjectUrls.set(url, objectUrl);
        if (imgEl.isConnected) imgEl.src = objectUrl;
    } catch { /* network failure — leave blank */ }
}

// ── Overlay open/close ─────────────────────────────────────────────
export function openOverlay() {
    if (state.presetsOpen) {
        state.presetsOpen = false;
        document.getElementById('presets-overlay')?.classList.remove('open');
    }
    state.overlayOpen = true;
    overlayEl.classList.add('open');
    if (document.pointerLockElement) document.exitPointerLock();
    sessionStorage.setItem('overlayWasOpen', '1');
    _refreshCacheState();
    _renderFilters();
    _renderSplatGrid();
    syncRouteFromUi();
}

export function closeOverlay() {
    state.overlayOpen = false;
    overlayEl.classList.remove('open');
    sessionStorage.removeItem('overlayWasOpen');
    syncRouteFromUi();
}

async function _refreshCacheState() {
    cachedSplatUrls = await getCachedKeys();
    if (state.overlayOpen) _renderSplatGrid();
}

// ── Filter render ──────────────────────────────────────────────────
function _renderFilters() {
    overlayFilters.innerHTML = '';

    // ── Always-visible quick-access chip bar ───────────────────────
    const quickBar = document.createElement('div');
    quickBar.className = 'filter-quick-bar';

    // "All" chip
    const resetBtn = document.createElement('button');
    resetBtn.className = 'filter-chip' + (!activeFilters.size ? ' active' : '');
    resetBtn.textContent = 'Alle';
    resetBtn.addEventListener('click', (e) => { e.stopPropagation(); activeFilters.clear(); _renderFilters(); _renderSplatGrid(); });
    quickBar.appendChild(resetBtn);

    // "⭐ Starred" chip
    const starBtn = document.createElement('button');
    starBtn.className = 'filter-chip' + (activeFilters.has('__starred__') ? ' active starred' : ' starred');
    starBtn.textContent = '⭐ Starred';
    starBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (activeFilters.has('__starred__')) activeFilters.delete('__starred__');
        else { activeFilters.clear(); activeFilters.add('__starred__'); }
        _renderFilters(); _renderSplatGrid();
    });
    quickBar.appendChild(starBtn);

    // Top 6 most-frequent tags always shown
    const tagFreq = new Map();
    state.splatLibrary.forEach(s => (s.tags || []).forEach(t => tagFreq.set(t, (tagFreq.get(t) || 0) + 1)));
    const topTags = [...tagFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t]) => t);
    topTags.forEach(tag => {
        const chip = document.createElement('button');
        chip.className = 'filter-chip' + (activeFilters.has(tag) ? ' active' : '');
        chip.textContent = tag;
        chip.addEventListener('click', (e) => {
            e.stopPropagation();
            activeFilters.has(tag) ? activeFilters.delete(tag) : activeFilters.add(tag);
            _renderFilters(); _renderSplatGrid();
        });
        quickBar.appendChild(chip);
    });

    // "More filters" toggle
    const moreBtn = document.createElement('button');
    moreBtn.className = 'filter-chip filter-more-toggle' + (filterPanelOpen ? ' active' : '');
    moreBtn.textContent = filterPanelOpen ? '▲ Mindre' : '▼ Mere';
    moreBtn.addEventListener('click', (e) => { e.stopPropagation(); filterPanelOpen = !filterPanelOpen; _renderFilters(); });
    quickBar.appendChild(moreBtn);

    overlayFilters.appendChild(quickBar);

    // ── Expanded full-panel (all categories) ──────────────────────
    if (!filterPanelOpen) return;
    const panel = document.createElement('div');
    panel.className = 'filter-panel open';

    Object.entries(state.splatCategories).forEach(([key, cat]) => {
        const tags  = Array.isArray(cat) ? cat : (cat.tags || []);
        const label = Array.isArray(cat) ? key : (cat.label || key);
        if (!tags.length) return;
        const isExpanded  = expandedGroups.has(key);
        const visibleTags = isExpanded ? tags : tags.slice(0, FILTER_INITIAL_COUNT);
        const hiddenCount = tags.length - FILTER_INITIAL_COUNT;
        const group = document.createElement('div'); group.className = 'filter-group';
        const labelEl = document.createElement('span'); labelEl.className = 'filter-group-label'; labelEl.textContent = label; group.appendChild(labelEl);
        const chips = document.createElement('div'); chips.className = 'filter-group-chips open';
        visibleTags.forEach(tag => {
            const chip = document.createElement('button');
            chip.className = 'filter-chip' + (activeFilters.has(tag) ? ' active' : ''); chip.textContent = tag;
            chip.addEventListener('click', (e) => { e.stopPropagation(); activeFilters.has(tag) ? activeFilters.delete(tag) : activeFilters.add(tag); _renderFilters(); _renderSplatGrid(); });
            chips.appendChild(chip);
        });
        if (hiddenCount > 0 && !isExpanded) {
            const mb = document.createElement('button'); mb.className = 'filter-more-btn'; mb.textContent = `+ ${hiddenCount} mere`;
            mb.addEventListener('click', (e) => { e.stopPropagation(); expandedGroups.add(key); _renderFilters(); }); chips.appendChild(mb);
        } else if (isExpanded && tags.length > FILTER_INITIAL_COUNT) {
            const lb = document.createElement('button'); lb.className = 'filter-more-btn'; lb.textContent = 'mindre';
            lb.addEventListener('click', (e) => { e.stopPropagation(); expandedGroups.delete(key); _renderFilters(); }); chips.appendChild(lb);
        }
        group.appendChild(chips); panel.appendChild(group);
    });
    overlayFilters.appendChild(panel);
}

// ── Grid helpers ───────────────────────────────────────────────────
function _splatSizeLabel(vc) {
    if (!vc)            return null;
    if (vc < 100000)   return { label:'Tiny',     cls:'size-tiny'     };
    if (vc < 300000)   return { label:'Small',    cls:'size-small'    };
    if (vc < 600000)   return { label:'Medium',   cls:'size-medium'   };
    if (vc < 1000000)  return { label:'Large',    cls:'size-large'    };
    if (vc < 2000000)  return { label:'Huge',     cls:'size-huge'     };
    return                    { label:'Gigantic', cls:'size-gigantic' };
}

function _markSplatCached(splatUrl, card = null) {
    if (!splatUrl) return;
    cachedSplatUrls.add(splatUrl);

    const targetCard = card || splatGridEl.querySelector(`.splat-card[data-splat-url="${encodeURIComponent(splatUrl)}"]`);
    if (!targetCard) return;

    if (!targetCard.querySelector('.splat-cache-badge')) {
        const cb = document.createElement('div');
        cb.className = 'splat-cache-badge';
        cb.textContent = '✓ Cached';
        targetCard.querySelector('.splat-card-overlay-left')?.appendChild(cb);
    }
}

function _updateSplatDownloadUi(splatUrl, pct, card = null) {
    if (!splatUrl) return;

    const targetCard = card || splatGridEl.querySelector(`.splat-card[data-splat-url="${encodeURIComponent(splatUrl)}"]`);
    if (!targetCard) return;

    const dlOverlay = targetCard.querySelector('.splat-dl-overlay');
    const dlPct = targetCard.querySelector('.splat-dl-pct');
    const dlBar = targetCard.querySelector('.splat-dl-bar');
    if (!dlOverlay || !dlPct || !dlBar) return;

    if (pct < 100) {
        dlOverlay.style.display = '';
        dlPct.textContent = pct + '%';
        dlBar.style.width = pct + '%';
        if (targetCard.__dlHideTimer) {
            clearTimeout(targetCard.__dlHideTimer);
            targetCard.__dlHideTimer = null;
        }
        return;
    }

    dlOverlay.style.display = '';
    dlPct.textContent = '✓';
    dlBar.style.width = '100%';
    _markSplatCached(splatUrl, targetCard);

    if (targetCard.__dlHideTimer) clearTimeout(targetCard.__dlHideTimer);
    targetCard.__dlHideTimer = setTimeout(() => {
        dlOverlay.style.display = 'none';
        targetCard.__dlHideTimer = null;
    }, 5000);
}

function _renderSplatGrid() {
    splatGridEl.innerHTML = '';
    let filtered = state.splatLibrary.filter(s => {
        // Starred filter
        if (activeFilters.has('__starred__')) {
            let url = ''; try { url = new URL(s.splat || '').href; } catch {}
            return favorites.has(url);
        }
        if (!activeFilters.size && !searchQuery) return true;
        if (activeFilters.size) {
            for (const [key, cat] of Object.entries(state.splatCategories)) {
                const catTags = Array.isArray(cat) ? cat : (cat.tags || []);
                const active  = catTags.filter(t => activeFilters.has(t));
                if (!active.length) continue;
                if (!active.some(t => (s.tags || []).map(x => x.toLowerCase()).includes(t.toLowerCase()) || (s.season || '').toLowerCase() === t.toLowerCase())) return false;
            }
        }
        if (searchQuery) {
            const hay = (s.name + ' ' + (s.desc || '') + ' ' + (s.tags || []).join(' ')).toLowerCase();
            if (!hay.includes(searchQuery)) return false;
        }
        return true;
    });

    if (sortOrder === 'name') {
        filtered.sort((a, b) => a.name.localeCompare(b.name, 'da'));
    } else if (sortOrder === 'size-desc') {
        filtered.sort((a, b) => (b.vertexCount||0) - (a.vertexCount||0));
    } else if (sortOrder === 'size-asc') {
        filtered.sort((a, b) => (a.vertexCount||0) - (b.vertexCount||0));
    } else if (sortOrder === 'year-desc') {
        filtered.sort((a, b) => {
            const ya = (a.tags||[]).find(t => /^\d{4}$/.test(t)) || '0';
            const yb = (b.tags||[]).find(t => /^\d{4}$/.test(t)) || '0';
            return yb.localeCompare(ya);
        });
    }

    overlayCountEl.textContent = filtered.length > 0 ? `(${filtered.length})` : '';
    if (!filtered.length) {
        const empty = document.createElement('div');
        empty.id = 'overlay-empty'; empty.textContent = 'Ingen scener fundet.';
        splatGridEl.appendChild(empty); return;
    }

    filtered.forEach(splat => {
        const realIndex = state.splatLibrary.indexOf(splat);
        const card = document.createElement('div');
        card.className = 'splat-card' + (realIndex === state.activeSplatIndex ? ' active' : '');
        let resolvedUrl = ''; try { resolvedUrl = new URL(splat.splat || location.href).href; } catch {}
        card.dataset.splatUrl = encodeURIComponent(resolvedUrl);
        const isFav = favorites.has(resolvedUrl);

        const thumb = splat.image
            ? `<img src="" data-src="${splat.image}" alt="${splat.name}" loading="lazy" />`
            : `<div class="splat-card-thumb-emoji">${splat.emoji || '✨'}</div>`;
        const tagsHtml = (splat.tags||[]).map(t => `<span class="splat-tag">${t}</span>`).join('');
        const activeBadge = realIndex === state.activeSplatIndex ? `<div class="splat-card-active-badge">AKTIV</div>` : '';
        const si = _splatSizeLabel(splat.vertexCount);
        const vcFormatted = splat.vertexCount
            ? (splat.vertexCount >= 1e6
                ? (splat.vertexCount/1e6).toFixed(1)+'M'
                : (splat.vertexCount/1e3).toFixed(0)+'K') + ' splats'
            : '';
        const sizeBadge = si ? `<div class="splat-size-badge ${si.cls}">${si.label}</div>` : '';
        const warnBadge = (splat.vertexCount >= 2000000)
            ? `<div class="splat-warn-badge" title="Very large scene — may be slow on weaker devices">⚠️ Heavy</div>`
            : '';
        const isCached = resolvedUrl && cachedSplatUrls.has(resolvedUrl);
        const cacheBadge = isCached ? `<div class="splat-cache-badge">✓ Cached</div>` : '';
        const descHtml = splat.desc ? `<div class="splat-card-desc">${splat.desc}</div>` : '';

        card.innerHTML = `
            <div class="splat-card-thumb">
                ${thumb}
                <button class="splat-fav-btn${isFav ? ' starred' : ''}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">${isFav ? '⭐' : '☆'}</button>
                <div class="splat-card-overlay">
                    <div class="splat-card-overlay-left">
                        ${sizeBadge}${warnBadge}${cacheBadge}
                    </div>
                    <div class="splat-card-overlay-right">
                        ${activeBadge}
                    </div>
                </div>
            </div>
            <div class="splat-dl-overlay" style="display:none">
                <div class="splat-dl-pct"></div>
                <div class="splat-dl-bar-track"><div class="splat-dl-bar"></div></div>
            </div>
            <div class="splat-card-body">
                <div class="splat-card-name">${splat.name}</div>
                ${descHtml}
                <div class="splat-card-meta">${tagsHtml}${vcFormatted ? `<span class="splat-year">${vcFormatted}</span>` : ''}</div>
            </div>`;

        // Fav button
        card.querySelector('.splat-fav-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            _toggleFavorite(resolvedUrl);
        });

        card.addEventListener('click', () => {
            const wasActive = realIndex === state.activeSplatIndex;
            state.activeSplatIndex = realIndex;
            localStorage.setItem('activeSplatIndex', realIndex);
            syncRouteFromUi();
            splatGridEl.querySelectorAll('.splat-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');

            if (cachedSplatUrls.has(resolvedUrl)) {
                closeOverlay();
                if (!wasActive) loadSplat(splat);
                return;
            }
            if (wasActive) return;

            const onProgress = (pct) => {
                _updateSplatDownloadUi(resolvedUrl, pct, card);
            };
            loadSplat(splat, { onProgress });
        });
        splatGridEl.appendChild(card);
        const lazyImg = card.querySelector('img[data-src]');
        if (lazyImg) _loadCardImage(lazyImg, lazyImg.dataset.src);
    });
}

export function renderSplatGrid() { _renderSplatGrid(); }

// ── Download all ───────────────────────────────────────────────────
async function _downloadAll() {
    const btn = document.getElementById('download-all-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Queuing…'; }
    const uncached = state.splatLibrary.filter(s => {
        let url = ''; try { url = new URL(s.splat || '').href; } catch {}
        return url && !cachedSplatUrls.has(url);
    });
    if (!uncached.length) {
        if (btn) { btn.textContent = 'All cached ✓'; setTimeout(() => { btn.textContent = 'Download All'; btn.disabled = false; }, 2000); }
        return;
    }
    let done = 0;
    const completedUrls = new Set();
    const updateBtn = () => { if (btn) btn.textContent = `${done}/${uncached.length} cached`; };
    updateBtn();
    for (const s of uncached) {
        let splatUrl = '';
        try { splatUrl = new URL(s.splat || '', location.href).href; } catch {}
        loadSplat(s, {
            onProgress: (pct) => {
                if (!splatUrl) return;
                _updateSplatDownloadUi(splatUrl, pct);
                if (pct !== 100 || completedUrls.has(splatUrl)) return;
                completedUrls.add(splatUrl);
                done++;
                updateBtn();
            }
        });
        await new Promise(r => setTimeout(r, 300)); // slight stagger
    }
    if (state.overlayOpen) _renderSplatGrid();
    if (btn) setTimeout(() => { btn.textContent = 'Download All'; btn.disabled = false; }, 3000);
}

// ── Settings dropdown toggle ───────────────────────────────────────
function _toggleSettings(e, isOverlayMode) {
    e.stopPropagation();
    const willOpen = !settingsDropdown.classList.contains('open');
    settingsDropdown.classList.toggle('open');
    // Overlay-mode hides actions/movement/camera sections
    settingsDropdown.classList.toggle('overlay-mode', willOpen && isOverlayMode);
    if (settingsBtn)    settingsBtn.classList.toggle('active', willOpen);
    if (hudSettingsBtn) hudSettingsBtn.classList.toggle('active', willOpen && !isOverlayMode);
}

// ── Init ───────────────────────────────────────────────────────────
export function init() {
    if (saveViewRowEl && !ENABLE_SAVE_VIEW) saveViewRowEl.style.display = 'none';

    searchInput.addEventListener('input', () => { searchQuery = searchInput.value.trim().toLowerCase(); _renderSplatGrid(); });
    sortSelect.addEventListener('change', () => { sortOrder = sortSelect.value; _renderSplatGrid(); });
    browserBtn.addEventListener('click', () => state.overlayOpen ? closeOverlay() : openOverlay());
    overlayClose.addEventListener('click', closeOverlay);

    if (settingsBtn)    settingsBtn.addEventListener('click', (e) => _toggleSettings(e, true));
    if (hudSettingsBtn) hudSettingsBtn.addEventListener('click', (e) => _toggleSettings(e, false));
    document.addEventListener('click', (e) => {
        if (!settingsDropdown.contains(e.target) && e.target !== settingsBtn && e.target !== hudSettingsBtn) {
            settingsDropdown.classList.remove('open', 'overlay-mode');
            settingsBtn?.classList.remove('active');
            hudSettingsBtn?.classList.remove('active');
        }
    });

    clearCacheBtn.addEventListener('click', async () => {
        clearCacheBtn.disabled = true;
        clearCacheBtn.textContent = 'Clearing…';
        await clearSplatCache();
        await clearImageCache();
        cachedSplatUrls.clear();
        clearCacheBtn.textContent = 'Cleared!';
        if (state.overlayOpen) _renderSplatGrid();
        setTimeout(() => { clearCacheBtn.textContent = 'Clear all'; clearCacheBtn.disabled = false; }, 1500);
    });

    // Persist cache toggle
    const persistToggle = document.getElementById('persist-cache-toggle');
    if (persistToggle) {
        persistToggle.checked = !!localStorage.getItem('splat-persist-cache');
        persistToggle.addEventListener('change', () => {
            if (persistToggle.checked) localStorage.setItem('splat-persist-cache', '1');
            else localStorage.removeItem('splat-persist-cache');
        });
    }

    // Shader mode select
    const shaderSelect = document.getElementById('shader-select');
    if (shaderSelect) {
        // Populate options from SHADER_MODES
        shaderSelect.innerHTML = SHADER_MODES.map((name, i) => `<option value="${i}">${name}</option>`).join('');
        const savedMode = parseInt(localStorage.getItem('shader-mode') || '0');
        shaderSelect.value = savedMode;
        if (savedMode) setShaderMode(savedMode);
        shaderSelect.addEventListener('change', () => {
            const mode = parseInt(shaderSelect.value);
            setShaderMode(mode);
            localStorage.setItem('shader-mode', mode);
            _updateDepthSliderVisibility(mode);
        });
        _updateDepthSliderVisibility(savedMode);
    }

    // Depth scale slider — migrate old default (0.08) to new default (0.02)
    if (parseFloat(localStorage.getItem('depth-scale') || '0') === 0.08) {
        localStorage.removeItem('depth-scale'); // will fall back to new 0.02 default
    }
    const depthSlider = document.getElementById('depth-scale-slider');
    const depthVal    = document.getElementById('depth-scale-val');
    if (depthSlider) {
        depthSlider.value = getDepthScale();
        if (depthVal) depthVal.textContent = parseFloat(depthSlider.value).toFixed(3);
        depthSlider.addEventListener('input', () => {
            const v = parseFloat(depthSlider.value);
            setDepthScale(v);
            localStorage.setItem('depth-scale', v);
            if (depthVal) depthVal.textContent = v.toFixed(3);
        });
    }

    // Speed slider
    const speedSlider = document.getElementById('speed-slider');
    const speedVal    = document.getElementById('speed-val');
    if (speedSlider) {
        speedSlider.value = state.speedMultiplier;
        if (speedVal) speedVal.textContent = parseFloat(speedSlider.value).toFixed(1) + 'x';
        speedSlider.addEventListener('input', () => {
            const v = parseFloat(speedSlider.value);
            state.speedMultiplier = v;
            localStorage.setItem('speed-mult', v);
            if (speedVal) speedVal.textContent = v.toFixed(1) + 'x';
        });
    }

    // FOV slider
    const fovSlider = document.getElementById('fov-slider');
    const fovVal    = document.getElementById('fov-val');
    if (fovSlider) {
        fovSlider.value = state.fovScale;
        if (fovVal) fovVal.textContent = Math.round(state.fovScale * 100) + '%';
        fovSlider.addEventListener('input', () => {
            const v = parseFloat(fovSlider.value);
            setFovScale(v);
            localStorage.setItem('fov-scale', v);
            if (fovVal) fovVal.textContent = Math.round(v * 100) + '%';
        });
    }

    // Download all button
    const dlAllBtn = document.getElementById('download-all-btn');
    if (dlAllBtn) dlAllBtn.addEventListener('click', _downloadAll);

    // Screenshot button
    const screenshotBtn = document.getElementById('screenshot-btn');
    if (screenshotBtn) {
        screenshotBtn.addEventListener('click', () => {
            settingsDropdown.classList.remove('open');
            state.pendingScreenshot = (canvas) => {
                const link = document.createElement('a');
                const sceneName = (state.splatLibrary[state.activeSplatIndex]?.name || 'scene')
                    .replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
                const date = new Date().toISOString().slice(0,10);
                link.download = `${sceneName}_${date}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
            };
            showToast('Screenshot will be taken on next frame…');
        });
    }

    // Copy link button (bookmarkable URL with camera hash)
    const copyLinkBtn = document.getElementById('copy-link-btn');
    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(location.href).then(() => {
                showToast('📋 Link copied!');
            }).catch(() => showToast('Could not copy link'));
            settingsDropdown.classList.remove('open');
        });
    }

    // Help panel
    const helpToggle = document.getElementById('help-toggle');
    const helpPanel  = document.getElementById('help-panel');
    if (helpToggle) {
        helpToggle.addEventListener('click', (e) => { e.stopPropagation(); helpPanel?.classList.toggle('show'); });
        document.addEventListener('click', () => helpPanel?.classList.remove('show'));
    }

    // Slider reset buttons
    document.querySelectorAll('.slider-reset[data-target]').forEach(btn => {
        btn.addEventListener('click', () => {
            const slider = document.getElementById(btn.dataset.target);
            if (!slider) return;
            slider.value = btn.dataset.default;
            slider.dispatchEvent(new Event('input'));
        });
    });

    // Apply saved FOV on boot
    if (state.fovScale !== 1) setFovScale(state.fovScale);

    // Restore overlay if it was open before F5 reload
    if (sessionStorage.getItem('overlayWasOpen')) {
        openOverlay();
    }
}

function _updateDepthSliderVisibility(mode) {
    const row = document.getElementById('depth-slider-row');
    if (!row) return;
    // Show depth slider for all depth-based shader modes
    const depthModes = new Set([3, 4, 8, 9, 10, 11]);
    row.style.display = depthModes.has(mode) ? '' : 'none';
}
