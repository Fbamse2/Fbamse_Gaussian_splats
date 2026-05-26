import { state }                        from '../app/State.js';
import { ROW_LENGTH }                   from '../app/Config.js';
import { getCachedSplat, setCachedSplat } from '../gaussian/GaussianCache.js';
import { postToWorker }                 from '../gaussian/GaussianWorker.js';
import { resetToSplatCamera }           from '../renderer/CameraController.js';
import { show as showSpinner, setProgress, setIndeterminate, setLabel } from '../ui/LoadingScreen.js';

// Tracks in-flight fetches: url -> { promise: Promise<ArrayBuffer>, progressCbs: Set }
const pendingDownloads = new Map();

async function _fetchAndCache(url, progressCbs) {
    const notify = (pct) => progressCbs.forEach(cb => cb(pct));

    let r;
    try { r = await fetch(url, { mode: 'cors', credentials: 'omit' }); }
    catch (err) { throw err; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    const contentLength = parseInt(r.headers.get('content-length')) || 0;
    const reader = r.body.getReader();
    let bytesRead = 0;
    let arrayBuf;

    if (contentLength) {
        arrayBuf = new ArrayBuffer(contentLength);
        const view8 = new Uint8Array(arrayBuf);
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            view8.set(value, bytesRead);
            bytesRead += value.length;
            notify(Math.round(Math.min(99, (bytesRead / contentLength) * 100)));
        }
        if (bytesRead < contentLength) arrayBuf = arrayBuf.slice(0, bytesRead);
    } else {
        const chunks = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            bytesRead += value.length;
        }
        arrayBuf = new ArrayBuffer(bytesRead);
        const view8 = new Uint8Array(arrayBuf);
        let off = 0;
        for (const c of chunks) { view8.set(c, off); off += c.length; }
    }

    // IDB structured-clone copies the buffer — must await before we transfer it to the worker
    await setCachedSplat(url, arrayBuf);
    notify(100);
    return arrayBuf;
}

export async function loadSplat(splat, { onProgress } = {}) {
    const myGen = ++state.loadGen;
    const splatUrl = new URL(splat.splat, location.href).href;

    if (state.loadingSplatUrl === splatUrl || state.loadedSplatUrl === splatUrl) {
        return;
    }
    state.loadingSplatUrl = splatUrl;

    try {
        if (splat.cameraPosition && splat.cameraRotation) resetToSplatCamera(splat);
        state.vertexCount   = 0;
        state.texAllocWidth  = 0;
        state.texAllocHeight = 0;

        showSpinner();
        setProgress(0);
        setLabel(`Indlæser ${splat.name}…`);

        // ── Acquire the buffer ────────────────────────────────────────────
        let arrayBuf = await getCachedSplat(splatUrl);

        if (!arrayBuf) {
            // Spinner tracks priority download only
            const spinnerCb = (pct) => { if (myGen === state.loadGen) setProgress(pct); };

            if (pendingDownloads.has(splatUrl)) {
                // Attach to existing in-flight download
                const entry = pendingDownloads.get(splatUrl);
                entry.progressCbs.add(spinnerCb);
                if (onProgress) entry.progressCbs.add(onProgress);
                try { arrayBuf = await entry.promise; }
                catch { return; }
                entry.progressCbs.delete(spinnerCb);
            } else {
                // Start a new download
                const progressCbs = new Set([spinnerCb]);
                if (onProgress) progressCbs.add(onProgress);
                const promise = _fetchAndCache(splatUrl, progressCbs)
                    .finally(() => pendingDownloads.delete(splatUrl));
                pendingDownloads.set(splatUrl, { promise, progressCbs });
                try { arrayBuf = await promise; }
                catch (err) { console.error('Fetch error:', err); return; }
            }
        }

        // Only the most recently clicked splat renders
        if (myGen !== state.loadGen) return;

        setIndeterminate();
        state.viewDirty = true;

        const splatScale = splat.scale ?? 1;
        if (splatScale !== 1) {
            const fv  = new Float32Array(arrayBuf);
            const vc_s = (arrayBuf.byteLength / ROW_LENGTH) | 0;
            for (let i = 0; i < vc_s; i++) {
                const b = i * 8;
                fv[b]   *= splatScale; fv[b+1] *= splatScale; fv[b+2] *= splatScale;
                fv[b+3] *= splatScale; fv[b+4] *= splatScale; fv[b+5] *= splatScale;
            }
        }

        const vc = (arrayBuf.byteLength / ROW_LENGTH) | 0;
        state.loadedSplatUrl = splatUrl;
        postToWorker({ type: 'buffer', buffer: arrayBuf, vertexCount: vc }, [arrayBuf]);
    } finally {
        if (state.loadingSplatUrl === splatUrl) state.loadingSplatUrl = null;
    }
}

export function initFileDrop() {
    const isPly = (d) => d[0]===112 && d[1]===108 && d[2]===121 && d[3]===10;
    const selectFile = (file) => {
        ++state.loadGen;
        state.loadingSplatUrl = null;
        state.loadedSplatUrl = null;
        const fr = new FileReader();
        fr.onload = () => {
            const buf = fr.result;
            const vc  = (buf.byteLength / ROW_LENGTH) | 0;
            const d   = new Uint8Array(buf);
            if (isPly(d)) {
                postToWorker({ type: 'ply', ply: buf, save: true }, [buf]);
            } else {
                postToWorker({ type: 'buffer', buffer: buf, vertexCount: vc }, [buf]);
            }
        };
        fr.readAsArrayBuffer(file);
    };
    const pd = (e) => { e.preventDefault(); e.stopPropagation(); };
    document.addEventListener('dragenter', pd);
    document.addEventListener('dragover',  pd);
    document.addEventListener('dragleave', pd);
    document.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); selectFile(e.dataTransfer.files[0]); });
}
