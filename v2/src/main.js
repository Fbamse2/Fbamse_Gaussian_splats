import { init } from './app/App.js';

init().catch((err) => {
    const spinner = document.getElementById('spinner');
    const message = document.getElementById('message');
    if (spinner) spinner.style.display = 'none';
    if (message) message.innerText = err.toString();
    console.error(err);
});
