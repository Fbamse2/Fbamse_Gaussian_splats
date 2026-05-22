export function showToast(message, type = 'ok') {
    const t = document.createElement('div');
    t.className = 'splat-toast' + (type === 'error' ? ' toast-error' : '');
    t.textContent = message;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('visible'));
    setTimeout(() => {
        t.classList.remove('visible');
        setTimeout(() => t.remove(), 300);
    }, 2500);
}
