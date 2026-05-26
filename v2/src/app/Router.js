import { state } from './State.js';

let routerHandlers = null;
let suppressRouteSync = false;

function slugify(value) {
    return String(value || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function buildSplatPath(index) {
    const splat = state.splatLibrary[index];
    if (!splat) return '/splat';
    const slug = slugify(splat.name) || String(index + 1);
    return `/splat/${slug}?i=${index}`;
}

function parseRouteFromLocation() {
    const path = location.pathname.replace(/\/+$/, '') || '/';
    const parts = path.split('/').filter(Boolean);

    if (!parts.length) return { view: 'splat', index: null };
    if (parts[0] === 'map') return { view: 'map', index: null };
    if (parts[0] === 'splat-index') return { view: 'splat-index', index: null };

    if (parts[0] === 'splat') {
        const slug = parts[1] || null;
        const idxParam = Number(new URLSearchParams(location.search).get('i'));
        const indexFromQuery = Number.isInteger(idxParam) ? idxParam : null;

        if (indexFromQuery !== null && indexFromQuery >= 0 && indexFromQuery < state.splatLibrary.length) {
            return { view: 'splat', index: indexFromQuery };
        }

        if (slug) {
            const foundIdx = state.splatLibrary.findIndex((s) => slugify(s.name) === slug);
            if (foundIdx >= 0) return { view: 'splat', index: foundIdx };
        }

        return { view: 'splat', index: null };
    }

    return { view: 'splat', index: null };
}

function writeHistory(pathAndSearch, replace = false) {
    const nextUrl = new URL(pathAndSearch, location.origin);
    nextUrl.hash = location.hash;

    const current = `${location.pathname}${location.search}${location.hash}`;
    const next = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
    if (current === next) return;

    if (replace) history.replaceState(null, '', next);
    else history.pushState(null, '', next);
}

function pathForCurrentUi() {
    if (state.mapOpen) return '/map';
    if (state.overlayOpen) return '/splat-index';
    return buildSplatPath(state.activeSplatIndex);
}

function applyRoute(route, { loadSplat = false } = {}) {
    if (!routerHandlers) return;

    suppressRouteSync = true;
    try {
        let didChangeIndex = false;
        let targetIndex = route.index;
        if (targetIndex === null || targetIndex < 0 || targetIndex >= state.splatLibrary.length) {
            targetIndex = state.activeSplatIndex;
        }

        if (targetIndex >= 0 && targetIndex < state.splatLibrary.length && targetIndex !== state.activeSplatIndex) {
            state.activeSplatIndex = targetIndex;
            localStorage.setItem('activeSplatIndex', String(targetIndex));
            routerHandlers.renderSplatGrid?.();
            didChangeIndex = true;
        }

        if (route.view === 'map') {
            if (state.overlayOpen) routerHandlers.closeOverlay?.();
            if (!state.mapOpen) routerHandlers.openMap?.();
            return;
        }

        if (state.mapOpen) routerHandlers.closeMap?.();

        if (route.view === 'splat-index') {
            if (!state.overlayOpen) routerHandlers.openOverlay?.();
            return;
        }

        if (state.overlayOpen) routerHandlers.closeOverlay?.();

        if (loadSplat && didChangeIndex && targetIndex >= 0 && targetIndex < state.splatLibrary.length) {
            routerHandlers.loadSplatByIndex?.(targetIndex);
        }
    } finally {
        suppressRouteSync = false;
    }
}

export function syncRouteFromUi({ replace = false } = {}) {
    if (suppressRouteSync || !routerHandlers) return;
    writeHistory(pathForCurrentUi(), replace);
}

export function initRouting(handlers) {
    routerHandlers = handlers;

    window.addEventListener('popstate', () => {
        applyRoute(parseRouteFromLocation(), { loadSplat: true });
    });

    applyRoute(parseRouteFromLocation(), { loadSplat: false });
}