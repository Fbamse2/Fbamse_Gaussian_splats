import { state } from '../app/State.js';

// Worker is created once at module load
const worker = new Worker(new URL('../workers/gaussian.worker.js', import.meta.url));

let _onTex  = null;
let _onSort = null;

export function initWorker({ onTex, onSort }) {
    _onTex  = onTex;
    _onSort = onSort;

    worker.onmessage = (e) => {
        const d = e.data;
        if (d.type === 'buffer' && d.save) {
            // PLY download response — trigger browser save
            const blob = new Blob([d.buffer], { type: 'application/octet-stream' });
            const link = document.createElement('a');
            link.download = 'model.splat';
            link.href = URL.createObjectURL(blob);
            document.body.appendChild(link);
            link.click();
        } else if (d.type === 'tex') {
            _onTex(d);
        } else if (d.type === 'sort') {
            _onSort(d);
        }
    };
}

export function postToWorker(msg, transfer) {
    worker.postMessage(msg, transfer);
}

// Only posts when the camera has actually moved (viewDirty flag)
export function sendView(viewProj) {
    if (!state.viewDirty) return;
    state.viewDirty = false;
    worker.postMessage({ type: 'view', viewProj });
}
