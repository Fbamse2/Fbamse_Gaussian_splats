import { state }                        from '../app/State.js';
import { multiply4 }                    from '../utils/math.js';
import { draw, clearFrame, getCanvas } from './Renderer.js';
import { updateViewMatrix, saveCameraState } from './CameraController.js';
import { sendView }                     from '../gaussian/GaussianWorker.js';
import { activeKeys }                   from '../input/InputManager.js';
import { joyMove, joyLook }             from '../input/TouchInput.js';
import { updateFps }                    from '../ui/StatsPanel.js';
import { show as showSpinner, hide as hideSpinner } from '../ui/LoadingScreen.js';
import { processPendingCapture }        from '../ui/CaptureGallery.js';

let lastFrame = 0;
let avgFps    = 0;

function frame(now) {
    const yaw   = state.cameraRotation[0];
    const pitch = state.cameraRotation[1];
    const cy = Math.cos(yaw),  sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const fx = -sy*cp, fz = -cy*cp, fy = sp;
    const rx = cy, rz = -sy;

    const activeSplat = state.splatLibrary[state.activeSplatIndex];
    const moveSpeed  = activeSplat?.speed ?? 0.1;
    const sprintMult = activeSplat?.sprintMultiplier ?? 2;
    const speed = moveSpeed * state.speedMultiplier * (activeKeys.has('ShiftLeft') ? sprintMult : 1);

    let dx = 0, dy = 0, dz = 0;
    if (activeKeys.has('KeyW'))        { dx -= fx*speed; dz -= fz*speed; dy -= fy*speed; }
    if (activeKeys.has('KeyS'))        { dx += fx*speed; dz += fz*speed; dy += fy*speed; }
    if (activeKeys.has('KeyA'))        { dx -= rx*speed; dz -= rz*speed; }
    if (activeKeys.has('KeyD'))        { dx += rx*speed; dz += rz*speed; }
    if (activeKeys.has('Space'))       { dy -= speed; }
    if (activeKeys.has('ControlLeft')) { dy += speed; }

    if (joyMove.x || joyMove.y) {
        dx += (rx*joyMove.x + fx*joyMove.y)*speed;
        dz += (rz*joyMove.x + fz*joyMove.y)*speed;
        dy += fy*joyMove.y*speed;
    }
    if (joyLook.x || joyLook.y) {
        state.cameraRotation[0] += joyLook.x * 0.01;
        state.cameraRotation[1]  = Math.max(
            -Math.PI/2+0.01,
            Math.min(Math.PI/2-0.01, state.cameraRotation[1] - joyLook.y*0.01)
        );
    }

    if (dx || dy || dz || joyLook.x || joyLook.y) {
        state.cameraPosition[0] += dx;
        state.cameraPosition[1] += dy;
        state.cameraPosition[2] += dz;
        updateViewMatrix();
        saveCameraState();
    }

    const viewProj = multiply4(state.projectionMatrix, state.viewMatrix);
    sendView(viewProj);

    const dt = now - lastFrame;
    if (dt > 0) avgFps = avgFps * 0.9 + (1000 / dt) * 0.1;
    lastFrame = now;
    updateFps(Math.round(avgFps));

    if (state.vertexCount > 0) {
        hideSpinner();
        draw();
        // Screenshot capture — must fire synchronously right after draw()
        if (state.pendingScreenshot) {
            const cb = state.pendingScreenshot;
            state.pendingScreenshot = null;
            cb(getCanvas());
        }
        processPendingCapture();
    } else {
        clearFrame();
        showSpinner();
    }

    requestAnimationFrame(frame);
}

export function start() {
    requestAnimationFrame(frame);
}
