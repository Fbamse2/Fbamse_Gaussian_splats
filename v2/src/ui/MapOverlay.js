import { state }    from '../app/State.js';
import { loadSplat } from '../loaders/SplatLoader.js';
import { closeOverlay } from './Sidebar.js';
import { getCachedImage, setCachedImage } from '../gaussian/GaussianCache.js';
import { syncRouteFromUi } from '../app/Router.js';

const mapOverlayEl = document.getElementById('map-overlay');
const mapOpenBtn   = document.getElementById('overlay-map-btn');
const mapCloseBtn  = document.getElementById('map-close');

let leafletMap = null;
let mapMarkers = [];

// Shared in-memory cache so repeated map opens don't re-query IDB
const _imgCache = new Map();

async function _resolveImageUrl(url) {
    if (!url) return null;
    if (_imgCache.has(url)) return _imgCache.get(url);
    try {
        const cached = await getCachedImage(url);
        if (cached) {
            const blobUrl = URL.createObjectURL(cached);
            _imgCache.set(url, blobUrl);
            return blobUrl;
        }
        const resp = await fetch(url);
        if (!resp.ok) return url;
        const blob = await resp.blob();
        await setCachedImage(url, blob);
        const blobUrl = URL.createObjectURL(blob);
        _imgCache.set(url, blobUrl);
        return blobUrl;
    } catch {
        return url;
    }
}

export async function openMap() {
    state.mapOpen = true;
    mapOverlayEl.classList.add('open');
    sessionStorage.setItem('mapWasOpen', '1');
    syncRouteFromUi();

    if (!leafletMap) {
        // Restore saved center/zoom if available
        const savedView = _loadMapView();
        const center = savedView ? savedView.center : [55.6, 12.34];
        const zoom   = savedView ? savedView.zoom   : 11;
        leafletMap = L.map('leaflet-map', { zoomControl: true }).setView(center, zoom);
        L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            { maxZoom: 19, attribution: '&copy; Esri & contributors' }
        ).addTo(leafletMap);
        // Save view on every move/zoom
        leafletMap.on('moveend zoomend', _saveMapView);
    } else {
        mapMarkers.forEach(m => leafletMap.removeLayer(m));
        mapMarkers = [];
        setTimeout(() => leafletMap.invalidateSize(), 50);
    }

    await _placeMarkers();
}

async function _placeMarkers() {
    let activeMarker = null;
    const splatsWithCoords = state.splatLibrary
        .map((splat, idx) => ({ splat, idx }))
        .filter(({ splat }) => splat.lat != null && splat.lng != null);

    const resolvedUrls = await Promise.all(
        splatsWithCoords.map(({ splat }) => _resolveImageUrl(splat.image || null))
    );

    splatsWithCoords.forEach(({ splat, idx }, i) => {
        const isActive = idx === state.activeSplatIndex;
        const imgSrc = resolvedUrls[i];
        const thumbHtml = imgSrc
            ? `<div class="splat-marker-thumb"><img src="${imgSrc}" alt=""></div>`
            : `<div class="splat-marker-thumb splat-marker-thumb-emoji">${splat.emoji || '📍'}</div>`;
        const markerHtml = `
            <div class="splat-marker${isActive ? ' active' : ''}">
                ${thumbHtml}
                <div class="splat-marker-pin"></div>
                <div class="splat-marker-label">${splat.name}</div>
            </div>`;
        const icon = L.divIcon({
            html: markerHtml,
            className: '',
            iconSize:   [80, 76],
            iconAnchor: [40, 60],
            popupAnchor: [0, -62],
        });
        const marker = L.marker([splat.lat, splat.lng], { icon }).addTo(leafletMap);
        mapMarkers.push(marker);
        if (isActive) activeMarker = marker;

        const popupThumb = imgSrc
            ? `<img src="${imgSrc}" style="width:160px;height:100px;object-fit:cover;border-radius:6px;display:block;margin-bottom:6px;">`
            : `<div style="font-size:36px;text-align:center;margin-bottom:6px;">${splat.emoji || '📍'}</div>`;
        const popupHtml = `
            <div style="font-family:'Segoe UI',sans-serif;min-width:160px;">
                ${popupThumb}
                <b style="font-size:13px;">${splat.name}</b><br>
                <span style="font-size:11px;color:#999;">${splat.desc || ''}</span><br>
                <button onclick="activateSplatFromMap(${idx})" style="margin-top:8px;margin-right:6px;padding:4px 14px;border-radius:7px;border:none;background:#6366f1;color:#fff;font-weight:600;cursor:pointer;">Åbn</button>
                <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(splat.lat)},${encodeURIComponent(splat.lng)}" target="_blank" rel="noopener" style="margin-top:8px;padding:4px 14px;border-radius:7px;border:none;background:#22c55e;color:#fff;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block;">Google Maps</a>
            </div>`;
        marker.bindPopup(popupHtml, { maxWidth: 200 });
    });

    if (activeMarker) {
        setTimeout(() => {
            leafletMap.flyTo(activeMarker.getLatLng(), Math.max(leafletMap.getZoom(), 14), { duration: 0.8 });
            activeMarker.openPopup();
        }, 150);
    }
    setTimeout(() => leafletMap.invalidateSize(), 80);
}

function _saveMapView() {
    if (!leafletMap) return;
    const c = leafletMap.getCenter();
    sessionStorage.setItem('mapView', JSON.stringify({ center: [c.lat, c.lng], zoom: leafletMap.getZoom() }));
}

function _loadMapView() {
    try { return JSON.parse(sessionStorage.getItem('mapView')); } catch { return null; }
}

export function closeMap() {
    state.mapOpen = false;
    mapOverlayEl.classList.remove('open');
    sessionStorage.removeItem('mapWasOpen');
    syncRouteFromUi();
}

window.activateSplatFromMap = function(idx) {
    const splat = state.splatLibrary[idx];
    if (!splat) return;
    state.activeSplatIndex = idx;
    localStorage.setItem('activeSplatIndex', idx);
    closeMap();
    closeOverlay();
    loadSplat(splat);
    syncRouteFromUi();
};

export function init() {
    mapOpenBtn.addEventListener('click', openMap);
    mapCloseBtn.addEventListener('click', closeMap);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMap(); });

    // Restore map if it was open before F5
    if (sessionStorage.getItem('mapWasOpen')) {
        openMap();
    }
}
