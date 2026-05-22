function _openCacheDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('splat-cache', 2);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('splats')) db.createObjectStore('splats');
            if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
        };
        req.onsuccess  = e => resolve(e.target.result);
        req.onerror    = e => reject(e.target.error);
    });
}

export async function getCachedSplat(url) {
    try {
        const db = await _openCacheDB();
        return await new Promise(resolve => {
            const req = db.transaction('splats', 'readonly').objectStore('splats').get(url);
            req.onsuccess = e => resolve(e.target.result || null);
            req.onerror   = () => resolve(null);
        });
    } catch { return null; }
}

export async function setCachedSplat(url, buf) {
    try {
        const db = await _openCacheDB();
        await new Promise(resolve => {
            const tx = db.transaction('splats', 'readwrite');
            tx.objectStore('splats').put(buf, url);
            tx.oncomplete = resolve; tx.onerror = resolve;
        });
    } catch { /* silent */ }
}

export async function clearSplatCache() {
    try {
        const db = await _openCacheDB();
        await new Promise(resolve => {
            const tx = db.transaction('splats', 'readwrite');
            tx.objectStore('splats').clear();
            tx.oncomplete = resolve; tx.onerror = resolve;
        });
    } catch { /* silent */ }
}

export async function getCachedKeys() {
    try {
        const db = await _openCacheDB();
        return new Set(await new Promise(resolve => {
            const req = db.transaction('splats', 'readonly').objectStore('splats').getAllKeys();
            req.onsuccess = e => resolve(e.target.result || []);
            req.onerror   = () => resolve([]);
        }));
    } catch { return new Set(); }
}

export async function getCachedImage(url) {
    try {
        const db = await _openCacheDB();
        return await new Promise(resolve => {
            const req = db.transaction('images', 'readonly').objectStore('images').get(url);
            req.onsuccess = e => resolve(e.target.result || null);
            req.onerror   = () => resolve(null);
        });
    } catch { return null; }
}

export async function setCachedImage(url, blob) {
    try {
        const db = await _openCacheDB();
        await new Promise(resolve => {
            const tx = db.transaction('images', 'readwrite');
            tx.objectStore('images').put(blob, url);
            tx.oncomplete = resolve; tx.onerror = resolve;
        });
    } catch { /* silent */ }
}

export async function clearImageCache() {
    try {
        const db = await _openCacheDB();
        await new Promise(resolve => {
            const tx = db.transaction('images', 'readwrite');
            tx.objectStore('images').clear();
            tx.oncomplete = resolve; tx.onerror = resolve;
        });
    } catch { /* silent */ }
}

// ── Tab counter for multi-tab cache protection ────────────────────
// Incremented when a tab opens, decremented on beforeunload.
// If the counter is > 0 when a new tab starts, another tab is open → skip cache clear.
function _tabCount() { return parseInt(localStorage.getItem('splat-tab-count') || '0'); }
function _incTabCount() { localStorage.setItem('splat-tab-count', _tabCount() + 1); }
function _decTabCount() {
    const n = Math.max(0, _tabCount() - 1);
    localStorage.setItem('splat-tab-count', n);
}

// Increment now (this tab is opening)
_incTabCount();
window.addEventListener('beforeunload', _decTabCount);

// On fresh tab (no F5 token): wipe stale IDB data ONLY if:
//   - persist-cache is NOT set, AND
//   - this is the only open tab (counter was 0 before we incremented = was 1 now)
if (!sessionStorage.getItem('splat-session')) {
    const otherTabsWereOpen = _tabCount() > 1; // we already incremented
    if (!localStorage.getItem('splat-persist-cache') && !otherTabsWereOpen) {
        clearSplatCache();
        clearImageCache();
    }
    sessionStorage.setItem('splat-session', '1');
}
