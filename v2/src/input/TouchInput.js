const joyRadius = 33;
export const joyMove = { x: 0, y: 0 };
export const joyLook = { x: 0, y: 0 };

function setupJoystick(pad, knob, out) {
    let id = null, ox = 0, oy = 0;
    pad.addEventListener('touchstart', (e) => {
        e.preventDefault(); if (id !== null) return;
        const t = e.changedTouches[0]; id = t.identifier;
        const r = pad.getBoundingClientRect(); ox = r.left+r.width/2; oy = r.top+r.height/2;
    }, { passive: false });
    pad.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
            if (t.identifier !== id) continue;
            const dx = t.clientX-ox, dy = t.clientY-oy;
            const cl = Math.min(Math.hypot(dx,dy), joyRadius);
            const ang = Math.atan2(dy, dx);
            const kx = Math.cos(ang)*cl, ky = Math.sin(ang)*cl;
            knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
            out.x = kx/joyRadius; out.y = ky/joyRadius;
        }
    }, { passive: false });
    const release = (e) => {
        for (const t of e.changedTouches) {
            if (t.identifier !== id) continue;
            id = null;
            knob.style.transform = 'translate(-50%, -50%)';
            out.x = out.y = 0;
        }
    };
    pad.addEventListener('touchend',    release, { passive: false });
    pad.addEventListener('touchcancel', release, { passive: false });
}

export function init() {
    const joystickLeft  = document.getElementById('joystick-left');
    const joystickRight = document.getElementById('joystick-right');
    const knobLeft  = document.getElementById('knob-left');
    const knobRight = document.getElementById('knob-right');
    if (joystickLeft  && knobLeft)  setupJoystick(joystickLeft,  knobLeft,  joyMove);
    if (joystickRight && knobRight) setupJoystick(joystickRight, knobRight, joyLook);
}
