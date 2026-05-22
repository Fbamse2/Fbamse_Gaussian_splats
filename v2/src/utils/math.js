export function getProjectionMatrix(fx, fy, width, height) {
    const znear = 0.2, zfar = 200;
    return [
        (2 * fx) / width, 0, 0, 0,
        0, -(2 * fy) / height, 0, 0,
        0, 0, zfar / (zfar - znear), 1,
        0, 0, -(zfar * znear) / (zfar - znear), 0,
    ];
}

export function multiply4(a, b) {
    return [
        b[0]*a[0]+b[1]*a[4]+b[2]*a[8]+b[3]*a[12],
        b[0]*a[1]+b[1]*a[5]+b[2]*a[9]+b[3]*a[13],
        b[0]*a[2]+b[1]*a[6]+b[2]*a[10]+b[3]*a[14],
        b[0]*a[3]+b[1]*a[7]+b[2]*a[11]+b[3]*a[15],
        b[4]*a[0]+b[5]*a[4]+b[6]*a[8]+b[7]*a[12],
        b[4]*a[1]+b[5]*a[5]+b[6]*a[9]+b[7]*a[13],
        b[4]*a[2]+b[5]*a[6]+b[6]*a[10]+b[7]*a[14],
        b[4]*a[3]+b[5]*a[7]+b[6]*a[11]+b[7]*a[15],
        b[8]*a[0]+b[9]*a[4]+b[10]*a[8]+b[11]*a[12],
        b[8]*a[1]+b[9]*a[5]+b[10]*a[9]+b[11]*a[13],
        b[8]*a[2]+b[9]*a[6]+b[10]*a[10]+b[11]*a[14],
        b[8]*a[3]+b[9]*a[7]+b[10]*a[11]+b[11]*a[15],
        b[12]*a[0]+b[13]*a[4]+b[14]*a[8]+b[15]*a[12],
        b[12]*a[1]+b[13]*a[5]+b[14]*a[9]+b[15]*a[13],
        b[12]*a[2]+b[13]*a[6]+b[14]*a[10]+b[15]*a[14],
        b[12]*a[3]+b[13]*a[7]+b[14]*a[11]+b[15]*a[15],
    ];
}

export function createViewMatrix(position, rotation) {
    const yaw = rotation[0], pitch = rotation[1];
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const forward = [-sy * cp, sp, -cy * cp];
    const right   = [cy, 0, -sy];
    const up      = [sy * sp, cp, cy * sp];
    const R = [
        right[0], up[0], -forward[0], 0,
        right[1], up[1], -forward[1], 0,
        right[2], up[2], -forward[2], 0,
        0, 0, 0, 1
    ];
    const t = position;
    return [
        R[0], R[1], R[2], R[3],
        R[4], R[5], R[6], R[7],
        R[8], R[9], R[10], R[11],
        -t[0]*R[0]-t[1]*R[4]-t[2]*R[8],
        -t[0]*R[1]-t[1]*R[5]-t[2]*R[9],
        -t[0]*R[2]-t[1]*R[6]-t[2]*R[10],
        1
    ];
}
