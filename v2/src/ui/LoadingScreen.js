const loadingSpinner  = document.getElementById('spinner');
const loadingProgress = document.getElementById('progress');
const loadingLabel    = document.getElementById('loading-label');

export function show() {
    if (loadingSpinner) loadingSpinner.style.display = '';
}

export function hide() {
    if (loadingSpinner) loadingSpinner.style.display = 'none';
}

export function setProgress(pct) {
    if (!loadingProgress) return;
    loadingProgress.style.width = pct + '%';
    loadingProgress.style.display = '';
}

export function setIndeterminate() {
    if (!loadingProgress) return;
    loadingProgress.style.width = '100%';
    loadingProgress.style.display = '';
    loadingProgress.classList.add('indeterminate');
}

export function setLabel(text) {
    if (loadingLabel) loadingLabel.textContent = text;
}

export function hideProgress() {
    if (!loadingProgress) return;
    loadingProgress.style.display = 'none';
    loadingProgress.classList.remove('indeterminate');
    if (loadingLabel) loadingLabel.textContent = '';
}
