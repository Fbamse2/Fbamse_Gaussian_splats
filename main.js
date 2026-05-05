// ── Feature toggles ─────────────────────────────────────────────
const ENABLE_SAVE_VIEW = false;

// ── Constants ────────────────────────────────────────────────────
const ROW_LENGTH = 3 * 4 + 3 * 4 + 4 + 4; // 32 bytes per splat

// ── Global state ─────────────────────────────────────────────────
let vertexCount = 0;
let activeSplatIndex = 0;
let splatLibrary = [];
let splatCategories = {};

const savedSplatIndex = localStorage.getItem("activeSplatIndex");
if (savedSplatIndex !== null && !isNaN(Number(savedSplatIndex))) {
    activeSplatIndex = Number(savedSplatIndex);
}

async function loadSplatLibraryAndStart() {
    try {
        const resp = await fetch('splats.json');
        if (!resp.ok) throw new Error('Failed to load splats.json');
        const data = await resp.json();
        if (Array.isArray(data)) {
            splatLibrary = data;
            splatCategories = {};
        } else {
            splatLibrary = data.splats || [];
            splatCategories = data.categories || {};
        }
    } catch (e) {
        console.error('Error loading splats.json:', e);
        splatLibrary = [];
        splatCategories = {};
    }
    main().catch((err) => {
        document.getElementById("spinner").style.display = "none";
        document.getElementById("message").innerText = err.toString();
    });
}
loadSplatLibraryAndStart();

// ── Camera ────────────────────────────────────────────────────────
let cameraPosition = [0, 0, 0];
let cameraRotation = [0, 0, 0];
const savedCamera = localStorage.getItem("cameraState");
if (savedCamera) {
    try {
        const { position, rotation } = JSON.parse(savedCamera);
        if (Array.isArray(position) && Array.isArray(rotation)) {
            cameraPosition = [...position];
            cameraRotation = [...rotation];
        }
    } catch (e) { /* ignore */ }
}
function saveCameraState() {
    localStorage.setItem("cameraState", JSON.stringify({ position: cameraPosition, rotation: cameraRotation }));
}

const camera = { fy: 1164.6601287484507, fx: 1159.5880733038064 };

function getProjectionMatrix(fx, fy, width, height) {
    const znear = 0.2, zfar = 200;
    return [
        (2 * fx) / width, 0, 0, 0,
        0, -(2 * fy) / height, 0, 0,
        0, 0, zfar / (zfar - znear), 1,
        0, 0, -(zfar * znear) / (zfar - znear), 0,
    ];
}

function multiply4(a, b) {
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

function createViewMatrix(position, rotation) {
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
let viewMatrix = createViewMatrix(cameraPosition, cameraRotation);

// ── Worker ────────────────────────────────────────────────────────
// Owns the splat buffer, depth sorting (2-pass radix O(n)), and texture generation.
// Messages IN:  { type:'buffer', buffer, vertexCount }  – streaming chunk (transferred)
//               { type:'view',   viewProj }              – camera update, triggers sort
//               { type:'ply',    ply, save }             – raw PLY file
// Messages OUT: { type:'tex',  texdata, texwidth, texheight, vertexCount }
//               { type:'sort', depthIndex, vertexCount }
//               { type:'buffer', buffer, save }          – only for PLY download
function createWorker(self) {
    const ROW_LENGTH = 32;

    let buffer      = null;
    let vertexCount = 0;
    let viewProj    = null;
    let lastProj    = new Float32Array(16);
    let sortRunning = false;
    let sortPending = false;
    let f_buffer    = null;

    // half-float packing
    const _fv = new Float32Array(1);
    const _iv = new Int32Array(_fv.buffer);
    function floatToHalf(v) {
        _fv[0] = v;
        const f = _iv[0];
        const sign = (f >> 31) & 1;
        const exp  = (f >> 23) & 0xff;
        const frac =  f & 0x7fffff;
        let ne = 0, nf = frac;
        if (exp === 0) {
            ne = 0;
        } else if (exp < 113) {
            ne = 0; nf = (frac | 0x800000) >> (113 - exp);
            if (nf & 0x1000000) { ne = 1; nf = 0; }
        } else if (exp < 142) {
            ne = exp - 112;
        } else {
            ne = 31; nf = 0;
        }
        return (sign << 15) | (ne << 10) | (nf >> 13);
    }
    function packHalf2x16(x, y) {
        return (floatToHalf(x) | (floatToHalf(y) << 16)) >>> 0;
    }

    function generateTexture() {
        if (!buffer || vertexCount === 0) return;
        const f = f_buffer;
        const u = new Uint8Array(buffer);
        const texwidth  = 2048;
        const texheight = Math.ceil((2 * vertexCount) / texwidth);
        const texdata   = new Uint32Array(texwidth * texheight * 4);
        const tc = new Uint8Array(texdata.buffer);
        const tf = new Float32Array(texdata.buffer);

        for (let i = 0; i < vertexCount; i++) {
            const fi = 8 * i;
            const ui = 32 * i;
            tf[fi]   = f[fi];
            tf[fi+1] = f[fi+1];
            tf[fi+2] = f[fi+2];
            tc[(fi+7)*4]   = u[ui+24];
            tc[(fi+7)*4+1] = u[ui+25];
            tc[(fi+7)*4+2] = u[ui+26];
            tc[(fi+7)*4+3] = u[ui+27];
            const sx = f[fi+3], sy = f[fi+4], sz = f[fi+5];
            const r0 = (u[ui+28]-128)/128, r1 = (u[ui+29]-128)/128;
            const r2 = (u[ui+30]-128)/128, r3 = (u[ui+31]-128)/128;
            const M = [
                (1-2*(r2*r2+r3*r3))*sx, (2*(r1*r2+r0*r3))*sx, (2*(r1*r3-r0*r2))*sx,
                (2*(r1*r2-r0*r3))*sy,   (1-2*(r1*r1+r3*r3))*sy, (2*(r2*r3+r0*r1))*sy,
                (2*(r1*r3+r0*r2))*sz,   (2*(r2*r3-r0*r1))*sz,   (1-2*(r1*r1+r2*r2))*sz,
            ];
            texdata[fi+4] = packHalf2x16(4*(M[0]*M[0]+M[3]*M[3]+M[6]*M[6]), 4*(M[0]*M[1]+M[3]*M[4]+M[6]*M[7]));
            texdata[fi+5] = packHalf2x16(4*(M[0]*M[2]+M[3]*M[5]+M[6]*M[8]), 4*(M[1]*M[1]+M[4]*M[4]+M[7]*M[7]));
            texdata[fi+6] = packHalf2x16(4*(M[1]*M[2]+M[4]*M[5]+M[7]*M[8]), 4*(M[2]*M[2]+M[5]*M[5]+M[8]*M[8]));
        }
        self.postMessage({ type: 'tex', texdata, texwidth, texheight, vertexCount }, [texdata.buffer]);
    }

    // 2-pass 16-bit radix sort (O(n), no JS array allocations beyond typed arrays)
    // force=true when called from a buffer update – always sort even if camera didn't move
    function runSort(vp, force) {
        if (!buffer || vertexCount === 0) { sortRunning = false; return; }
        const f   = f_buffer;
        const vp2 = vp[2], vp6 = vp[6], vp10 = vp[10];

        // Skip if camera barely moved AND data hasn't changed
        if (!force && Math.abs(lastProj[2]*vp2 + lastProj[6]*vp6 + lastProj[10]*vp10 - 1) < 0.01) {
            sortRunning = false;
            if (sortPending) { sortPending = false; runSort(viewProj); }
            return;
        }

        let maxD = -Infinity, minD = Infinity;
        const depths = new Float32Array(vertexCount);
        for (let i = 0; i < vertexCount; i++) {
            const d = vp2*f[8*i] + vp6*f[8*i+1] + vp10*f[8*i+2];
            depths[i] = d;
            if (d > maxD) maxD = d;
            if (d < minD) minD = d;
        }
        const scale = 65535 / ((maxD - minD) || 1);
        const keys  = new Uint16Array(vertexCount);
        for (let i = 0; i < vertexCount; i++) keys[i] = ((depths[i] - minD) * scale + 0.5) | 0;

        // pass 1 – low byte
        const c0 = new Uint32Array(256);
        for (let i = 0; i < vertexCount; i++) c0[keys[i] & 0xff]++;
        const s0 = new Uint32Array(256);
        for (let i = 1; i < 256; i++) s0[i] = s0[i-1] + c0[i-1];
        const tmp = new Uint32Array(vertexCount);
        for (let i = 0; i < vertexCount; i++) tmp[s0[keys[i] & 0xff]++] = i;

        // pass 2 – high byte
        const c1 = new Uint32Array(256);
        for (let i = 0; i < vertexCount; i++) c1[(keys[tmp[i]] >> 8) & 0xff]++;
        const s1 = new Uint32Array(256);
        for (let i = 1; i < 256; i++) s1[i] = s1[i-1] + c1[i-1];
        const depthIndex = new Uint32Array(vertexCount);
        for (let i = 0; i < vertexCount; i++) depthIndex[s1[(keys[tmp[i]] >> 8) & 0xff]++] = tmp[i];

        lastProj[2] = vp2; lastProj[6] = vp6; lastProj[10] = vp10;
        self.postMessage({ type: 'sort', depthIndex, vertexCount }, [depthIndex.buffer]);
        sortRunning = false;
        if (sortPending) { sortPending = false; runSort(viewProj); }
    }

    function processPlyBuffer(inputBuffer) {
        const ubuf   = new Uint8Array(inputBuffer);
        const header = new TextDecoder().decode(ubuf.slice(0, 10240));
        const HEND   = "end_header\n";
        const hei    = header.indexOf(HEND);
        if (hei < 0) throw new Error("Unable to read .ply header");
        const plyVC = parseInt(/element vertex (\d+)\n/.exec(header)[1]);
        let row_offset = 0; const offsets = {}, types = {};
        const TYPE_MAP = { double:"getFloat64", int:"getInt32", uint:"getUint32",
            float:"getFloat32", short:"getInt16", ushort:"getUint16", uchar:"getUint8" };
        for (const prop of header.slice(0, hei).split("\n").filter(k => k.startsWith("property "))) {
            const [, type, name] = prop.split(" ");
            const at = TYPE_MAP[type] || "getInt8";
            types[name] = at; offsets[name] = row_offset;
            row_offset += parseInt(at.replace(/\D/g, "")) / 8;
        }
        const dv = new DataView(inputBuffer, hei + HEND.length);
        let row = 0;
        const attrs = new Proxy({}, { get(_, p) {
            if (!types[p]) throw new Error(p + " not found");
            return dv[types[p]](row * row_offset + offsets[p], true);
        }});
        const szList = new Float32Array(plyVC), szIdx = new Uint32Array(plyVC);
        for (row = 0; row < plyVC; row++) {
            szIdx[row] = row;
            if (types["scale_0"]) szList[row] = Math.exp(attrs.scale_0)*Math.exp(attrs.scale_1)*Math.exp(attrs.scale_2)*(1/(1+Math.exp(-attrs.opacity)));
        }
        szIdx.sort((b, a) => szList[a] - szList[b]);
        const out = new ArrayBuffer(ROW_LENGTH * plyVC);
        for (let j = 0; j < plyVC; j++) {
            row = szIdx[j];
            const pos  = new Float32Array(out, j*ROW_LENGTH, 3);
            const scl  = new Float32Array(out, j*ROW_LENGTH+12, 3);
            const rgba = new Uint8ClampedArray(out, j*ROW_LENGTH+24, 4);
            const rot  = new Uint8ClampedArray(out, j*ROW_LENGTH+28, 4);
            pos[0] = attrs.x; pos[1] = attrs.y; pos[2] = attrs.z;
            if (types["scale_0"]) {
                const ql = Math.hypot(attrs.rot_0, attrs.rot_1, attrs.rot_2, attrs.rot_3);
                rot[0]=(attrs.rot_0/ql)*128+128; rot[1]=(attrs.rot_1/ql)*128+128;
                rot[2]=(attrs.rot_2/ql)*128+128; rot[3]=(attrs.rot_3/ql)*128+128;
                scl[0]=Math.exp(attrs.scale_0); scl[1]=Math.exp(attrs.scale_1); scl[2]=Math.exp(attrs.scale_2);
            } else { scl[0]=scl[1]=scl[2]=0.01; rot[0]=255; rot[1]=rot[2]=rot[3]=0; }
            if (types["f_dc_0"]) {
                const C0=0.28209479177387814;
                rgba[0]=(0.5+C0*attrs.f_dc_0)*255; rgba[1]=(0.5+C0*attrs.f_dc_1)*255; rgba[2]=(0.5+C0*attrs.f_dc_2)*255;
            } else { rgba[0]=attrs.red; rgba[1]=attrs.green; rgba[2]=attrs.blue; }
            rgba[3] = types["opacity"] ? (1/(1+Math.exp(-attrs.opacity)))*255 : 255;
        }
        return out;
    }

    self.onmessage = (e) => {
        const d = e.data;
        if (d.type === 'ply') {
            vertexCount = 0;
            const out = processPlyBuffer(d.ply);
            buffer = out;
            f_buffer = new Float32Array(buffer);
            vertexCount = (buffer.byteLength / ROW_LENGTH) | 0;
            generateTexture();
            if (viewProj) { sortRunning = true; runSort(viewProj); }
            // Send a copy for optional download; keep buffer in worker
            if (d.save) {
                const copy = buffer.slice(0);
                self.postMessage({ type: 'buffer', buffer: copy, save: true }, [copy]);
            }
        } else if (d.type === 'buffer') {
            buffer = d.buffer;
            f_buffer = new Float32Array(buffer);
            vertexCount = d.vertexCount | 0;
            generateTexture();
            // force=true: new data always needs a fresh sort even if camera didn't move
            if (viewProj) { sortRunning = true; runSort(viewProj, true); }
        } else if (d.type === 'view') {
            viewProj = d.viewProj;
            if (sortRunning) { sortPending = true; }
            else { sortRunning = true; runSort(viewProj); }
        }
    };
}

// ── Shaders ───────────────────────────────────────────────────────
const vertexShaderSource = `#version 300 es
precision highp float;
precision highp int;
uniform highp usampler2D u_texture;
uniform mat4 projection, view;
uniform vec2 focal;
uniform vec2 viewport;
in vec2 position;
in int index;
out vec4 vColor;
out vec2 vPosition;
void main () {
    uvec4 cen = texelFetch(u_texture, ivec2((uint(index) & 0x3ffu) << 1, uint(index) >> 10), 0);
    vec4 cam = view * vec4(uintBitsToFloat(cen.xyz), 1);
    vec4 pos2d = projection * cam;
    float clip = 1.2 * pos2d.w;
    if (pos2d.z < -clip || pos2d.x < -clip || pos2d.x > clip || pos2d.y < -clip || pos2d.y > clip) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return;
    }
    uvec4 cov = texelFetch(u_texture, ivec2(((uint(index) & 0x3ffu) << 1) | 1u, uint(index) >> 10), 0);
    vec2 u1 = unpackHalf2x16(cov.x), u2 = unpackHalf2x16(cov.y), u3 = unpackHalf2x16(cov.z);
    mat3 Vrk = mat3(u1.x, u1.y, u2.x, u1.y, u2.y, u3.x, u2.x, u3.x, u3.y);
    mat3 J = mat3(
        focal.x / cam.z, 0., -(focal.x * cam.x) / (cam.z * cam.z),
        0., -focal.y / cam.z, (focal.y * cam.y) / (cam.z * cam.z),
        0., 0., 0.);
    mat3 T = transpose(mat3(view)) * J;
    mat3 cov2d = transpose(T) * Vrk * T;
    float mid = (cov2d[0][0] + cov2d[1][1]) / 2.0;
    float radius = length(vec2((cov2d[0][0] - cov2d[1][1]) / 2.0, cov2d[0][1]));
    float lambda1 = mid + radius, lambda2 = mid - radius;
    if (lambda2 < 0.0) return;
    vec2 diagonalVector = normalize(vec2(cov2d[0][1], lambda1 - cov2d[0][0]));
    vec2 majorAxis = min(sqrt(2.0 * lambda1), 1024.0) * diagonalVector;
    vec2 minorAxis = min(sqrt(2.0 * lambda2), 1024.0) * vec2(diagonalVector.y, -diagonalVector.x);
    vColor = clamp(pos2d.z/pos2d.w+1.0, 0.0, 1.0) * vec4(
        float((cov.w) & 0xffu), float((cov.w >> 8) & 0xffu),
        float((cov.w >> 16) & 0xffu), float((cov.w >> 24) & 0xffu)) / 255.0;
    vPosition = position;
    vec2 vCenter = vec2(pos2d) / pos2d.w;
    gl_Position = vec4(vCenter + position.x * majorAxis / viewport + position.y * minorAxis / viewport, 0.0, 1.0);
}`.trim();

const fragmentShaderSource = `#version 300 es
precision highp float;
in vec4 vColor;
in vec2 vPosition;
out vec4 fragColor;
void main () {
    float A = -dot(vPosition, vPosition);
    if (A < -4.0) discard;
    float B = exp(A) * vColor.a;
    fragColor = vec4(B * vColor.rgb, B);
}`.trim();

// ── IndexedDB splat cache ───────────────────────────────────────────
// Persists across F5 (sessionStorage token survives refresh).
// Cleared automatically on fresh tab open (no token) or explicit close.
function _openCacheDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('splat-cache', 1);
        req.onupgradeneeded = e => e.target.result.createObjectStore('splats');
        req.onsuccess  = e => resolve(e.target.result);
        req.onerror    = e => reject(e.target.error);
    });
}
async function getCachedSplat(url) {
    try {
        const db = await _openCacheDB();
        return await new Promise(resolve => {
            const req = db.transaction('splats', 'readonly').objectStore('splats').get(url);
            req.onsuccess = e => resolve(e.target.result || null);
            req.onerror   = () => resolve(null);
        });
    } catch { return null; }
}
async function setCachedSplat(url, buf) {
    try {
        const db = await _openCacheDB();
        await new Promise(resolve => {
            const tx = db.transaction('splats', 'readwrite');
            tx.objectStore('splats').put(buf, url);
            tx.oncomplete = resolve; tx.onerror = resolve;
        });
    } catch { /* silent */ }
}
async function clearSplatCache() {
    try {
        const db = await _openCacheDB();
        await new Promise(resolve => {
            const tx = db.transaction('splats', 'readwrite');
            tx.objectStore('splats').clear();
            tx.oncomplete = resolve; tx.onerror = resolve;
        });
    } catch { /* silent */ }
}
async function getCachedKeys() {
    try {
        const db = await _openCacheDB();
        return new Set(await new Promise(resolve => {
            const req = db.transaction('splats', 'readonly').objectStore('splats').getAllKeys();
            req.onsuccess = e => resolve(e.target.result || []);
            req.onerror   = () => resolve([]);
        }));
    } catch { return new Set(); }
}
// On fresh tab open (no sessionStorage token): wipe stale IDB data.
// F5 preserves the token, so the cache is kept across reloads.
if (!sessionStorage.getItem('splat-session')) {
    clearSplatCache();
    sessionStorage.setItem('splat-session', '1');
}

// ── Main ──────────────────────────────────────────────────────────
let mouseLocked = false;

async function main() {
    const rowLength = ROW_LENGTH;
    let splatData = new Uint8Array(0);

    // Cache DOM refs — queried once, reused everywhere
    const spinnerEl  = document.getElementById("spinner");
    const progressEl = document.getElementById("progress");

    // Set of fully-resolved URLs currently in IDB cache (refreshed when overlay opens)
    let cachedSplatUrls = new Set();

    // Only post a view message to the worker when the camera actually moved.
    // This eliminates the constant postMessage flood that caused rAF violations.
    let viewDirty = true; // start true so initial sort fires

    const worker = new Worker(URL.createObjectURL(
        new Blob(["(", createWorker.toString(), ")(self)"], { type: "application/javascript" })
    ));

    // The worker uses sortPending internally to queue one deferred sort – no main-thread gate needed.

    const canvas = document.getElementById("canvas");
    const fpsEl  = document.getElementById("fps");
    const camid  = document.getElementById("camid");
    let projectionMatrix;

    const gl = canvas.getContext("webgl2", { antialias: false });
    if (!gl) { document.getElementById("message").innerText = "WebGL2 not supported"; return; }

    function compileShader(type, src) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(sh));
        return sh;
    }
    const program = gl.createProgram();
    gl.attachShader(program, compileShader(gl.VERTEX_SHADER,   vertexShaderSource));
    gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(program));
    gl.useProgram(program);

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE_MINUS_DST_ALPHA, gl.ONE, gl.ONE_MINUS_DST_ALPHA, gl.ONE);
    gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);

    const u_projection = gl.getUniformLocation(program, "projection");
    const u_viewport   = gl.getUniformLocation(program, "viewport");
    const u_focal      = gl.getUniformLocation(program, "focal");
    const u_view       = gl.getUniformLocation(program, "view");
    gl.uniform1i(gl.getUniformLocation(program, "u_texture"), 0);

    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-2,-2, 2,-2, 2,2, -2,2]), gl.STATIC_DRAW);
    const a_position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(a_position);
    gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    const indexBuffer = gl.createBuffer();
    const a_index = gl.getAttribLocation(program, "index");
    gl.enableVertexAttribArray(a_index);
    gl.bindBuffer(gl.ARRAY_BUFFER, indexBuffer);
    gl.vertexAttribIPointer(a_index, 1, gl.INT, false, 0, 0);
    gl.vertexAttribDivisor(a_index, 1);

    let texAllocWidth = 0, texAllocHeight = 0;

    const resize = () => {
        gl.useProgram(program);
        gl.uniform2fv(u_focal, [camera.fx, camera.fy]);
        projectionMatrix = getProjectionMatrix(camera.fx, camera.fy, innerWidth, innerHeight);
        gl.uniform2fv(u_viewport, [innerWidth, innerHeight]);
        gl.canvas.width  = Math.round(innerWidth);
        gl.canvas.height = Math.round(innerHeight);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.uniformMatrix4fv(u_projection, false, projectionMatrix);
    };
    window.addEventListener("resize", resize);
    resize();

    function sendView(vp) {
        if (!viewDirty) return;
        viewDirty = false;
        worker.postMessage({ type: 'view', viewProj: vp });
    }

    worker.onmessage = (e) => {
        const d = e.data;
        if (d.type === 'buffer') {
            if (d.save) {
                const blob = new Blob([d.buffer], { type: "application/octet-stream" });
                const link = document.createElement("a");
                link.download = "model.splat"; link.href = URL.createObjectURL(blob);
                document.body.appendChild(link); link.click();
            }
        } else if (d.type === 'tex') {
            const { texdata, texwidth, texheight } = d;
            // vertexCount is NOT updated here — only 'sort' updates it atomically with the index buffer.
            // Setting it here while the index buffer still has the old count causes GL_INVALID_OPERATION.
            gl.bindTexture(gl.TEXTURE_2D, texture);
            if (texwidth === texAllocWidth && texheight <= texAllocHeight) {
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, texwidth, texheight, gl.RGBA_INTEGER, gl.UNSIGNED_INT, texdata);
            } else {
                const allocH = Math.ceil(texheight * 1.5);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32UI, texwidth, allocH, 0, gl.RGBA_INTEGER, gl.UNSIGNED_INT, null);
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, texwidth, texheight, gl.RGBA_INTEGER, gl.UNSIGNED_INT, texdata);
                texAllocWidth = texwidth; texAllocHeight = allocH;
            }
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
        } else if (d.type === 'sort') {
            vertexCount = d.vertexCount;
            gl.bindBuffer(gl.ARRAY_BUFFER, indexBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, d.depthIndex, gl.DYNAMIC_DRAW);
            // Sort done — hide the loading bar and allow next view to be sent
            progressEl.classList.remove("indeterminate");
            progressEl.style.display = "none";
            viewDirty = true; // camera may have moved while sorting
        }
    };

    // ── Input ─────────────────────────────────────────────────
    let activeKeys = new Set();
    let isSaving   = false;

    canvas.addEventListener("click", () => {
        if (overlayOpen) return;
        (canvas.requestPointerLock || canvas.mozRequestPointerLock).call(canvas);
    });
    document.addEventListener("pointerlockchange",    lockChange);
    document.addEventListener("mozpointerlockchange", lockChange);

    function lockChange() {
        if (document.pointerLockElement === canvas) {
            mouseLocked = true; document.addEventListener("mousemove", onMouseMove);
        } else {
            mouseLocked = false; document.removeEventListener("mousemove", onMouseMove);
        }
    }
    function onMouseMove(e) {
        if (!mouseLocked) return;
        cameraRotation[0] += e.movementX * 0.002;
        cameraRotation[1] -= e.movementY * 0.002;
        cameraRotation[1] = Math.max(-Math.PI/2+0.01, Math.min(Math.PI/2-0.01, cameraRotation[1]));
        viewMatrix = createViewMatrix(cameraPosition, cameraRotation);
        saveCameraState();
        viewDirty = true;
    }
    window.addEventListener("keydown", (e) => {
        activeKeys.add(e.code);
        if (ENABLE_SAVE_VIEW && e.code === "KeyV") {
            isSaving = true;
            const pos = cameraPosition.map(p => Math.round(p*100)/100);
            const rot = cameraRotation.map(r => Math.round(r*100)/100);
            location.hash = `[${pos}][${rot}]`;
            camid.innerText = "saved!";
            setTimeout(() => { if (camid.innerText === "saved!") camid.innerText = ""; isSaving = false; }, 100);
        }
    });
    window.addEventListener("keyup",  (e) => activeKeys.delete(e.code));
    window.addEventListener("blur",   ()  => activeKeys.clear());
    window.addEventListener("wheel",  (e) => e.preventDefault(), { passive: false });

    // ── Overlay ───────────────────────────────────────────────
    const overlayEl      = document.getElementById("splat-overlay");
    const browserBtn     = document.getElementById("splat-browser-btn");
    const overlayClose   = document.getElementById("overlay-close");
    const overlayFilters = document.getElementById("overlay-filters");
    const splatGridEl    = document.getElementById("splat-grid");
    const overlayCountEl = document.getElementById("overlay-count");
    const saveViewRowEl  = document.getElementById("help-save-view-row");
    if (saveViewRowEl && !ENABLE_SAVE_VIEW) saveViewRowEl.style.display = "none";

    let overlayOpen   = false;
    let activeFilters = new Set();

    function openOverlay()  { overlayOpen = true;  overlayEl.classList.add("open"); if (document.pointerLockElement) document.exitPointerLock(); refreshCacheState(); renderFilters(); renderSplatGrid(); }
    function closeOverlay() { overlayOpen = false; overlayEl.classList.remove("open"); }

    async function refreshCacheState() {
        cachedSplatUrls = await getCachedKeys();
        if (overlayOpen) renderSplatGrid();
    }

    const expandedGroups = new Set();
    let filterPanelOpen = false;
    const FILTER_INITIAL_COUNT = 4;

    function renderFilters() {
        overlayFilters.innerHTML = "";
        const bar = document.createElement("div"); bar.className = "filter-bar";
        const arrow = document.createElement("span"); arrow.className = "filter-bar-arrow" + (filterPanelOpen ? " open" : ""); arrow.textContent = "▶"; bar.appendChild(arrow);
        const barLabel = document.createElement("span"); barLabel.className = "filter-bar-label"; barLabel.textContent = "Filter"; bar.appendChild(barLabel);
        const activeChips = document.createElement("div"); activeChips.className = "filter-active-chips";
        activeFilters.forEach(tag => {
            const chip = document.createElement("span"); chip.className = "filter-active-chip"; chip.textContent = "× " + tag;
            chip.addEventListener("click", (e) => { e.stopPropagation(); activeFilters.delete(tag); renderFilters(); renderSplatGrid(); });
            activeChips.appendChild(chip);
        });
        bar.appendChild(activeChips);
        if (activeFilters.size > 0) {
            const cb = document.createElement("button"); cb.className = "filter-clear-btn"; cb.textContent = "Ryd";
            cb.addEventListener("click", (e) => { e.stopPropagation(); activeFilters.clear(); renderFilters(); renderSplatGrid(); });
            bar.appendChild(cb);
        }
        bar.addEventListener("click", () => { filterPanelOpen = !filterPanelOpen; renderFilters(); });
        overlayFilters.appendChild(bar);

        const panel = document.createElement("div"); panel.className = "filter-panel" + (filterPanelOpen ? " open" : "");
        const topRow = document.createElement("div"); topRow.className = "filter-top-row";
        const resetBtn = document.createElement("button"); resetBtn.className = "filter-chip" + (!activeFilters.size ? " active" : ""); resetBtn.textContent = "Alle";
        resetBtn.addEventListener("click", (e) => { e.stopPropagation(); activeFilters.clear(); renderFilters(); renderSplatGrid(); });
        topRow.appendChild(resetBtn); panel.appendChild(topRow);

        Object.entries(splatCategories).forEach(([key, cat]) => {
            const tags  = Array.isArray(cat) ? cat : (cat.tags || []);
            const label = Array.isArray(cat) ? key : (cat.label || key);
            if (!tags.length) return;
            const isExpanded  = expandedGroups.has(key);
            const visibleTags = isExpanded ? tags : tags.slice(0, FILTER_INITIAL_COUNT);
            const hiddenCount = tags.length - FILTER_INITIAL_COUNT;
            const group = document.createElement("div"); group.className = "filter-group";
            const labelEl = document.createElement("span"); labelEl.className = "filter-group-label"; labelEl.textContent = label; group.appendChild(labelEl);
            const chips = document.createElement("div"); chips.className = "filter-group-chips open";
            visibleTags.forEach(tag => {
                const chip = document.createElement("button"); chip.className = "filter-chip" + (activeFilters.has(tag) ? " active" : ""); chip.textContent = tag;
                chip.addEventListener("click", (e) => { e.stopPropagation(); activeFilters.has(tag) ? activeFilters.delete(tag) : activeFilters.add(tag); renderFilters(); renderSplatGrid(); });
                chips.appendChild(chip);
            });
            if (hiddenCount > 0 && !isExpanded) {
                const mb = document.createElement("button"); mb.className = "filter-more-btn"; mb.textContent = `+ ${hiddenCount} mere`;
                mb.addEventListener("click", (e) => { e.stopPropagation(); expandedGroups.add(key); renderFilters(); }); chips.appendChild(mb);
            } else if (isExpanded && tags.length > FILTER_INITIAL_COUNT) {
                const lb = document.createElement("button"); lb.className = "filter-more-btn"; lb.textContent = "mindre";
                lb.addEventListener("click", (e) => { e.stopPropagation(); expandedGroups.delete(key); renderFilters(); }); chips.appendChild(lb);
            }
            group.appendChild(chips); panel.appendChild(group);
        });
        overlayFilters.appendChild(panel);
    }

    function renderSplatGrid() {
        splatGridEl.innerHTML = "";
        const filtered = splatLibrary.filter(s => {
            if (!activeFilters.size) return true;
            for (const [key, cat] of Object.entries(splatCategories)) {
                const catTags = Array.isArray(cat) ? cat : (cat.tags || []);
                const active  = catTags.filter(t => activeFilters.has(t));
                if (!active.length) continue;
                if (!active.some(t => (s.tags || []).includes(t))) return false;
            }
            return true;
        });
        overlayCountEl.textContent = filtered.length > 0 ? `(${filtered.length})` : "";
        if (!filtered.length) {
            const empty = document.createElement("div"); empty.id = "overlay-empty"; empty.textContent = "Ingen scener fundet."; splatGridEl.appendChild(empty); return;
        }
        filtered.forEach(splat => {
            const realIndex = splatLibrary.indexOf(splat);
            const card = document.createElement("div"); card.className = "splat-card" + (realIndex === activeSplatIndex ? " active" : "");
            const thumb = splat.image ? `<img src="${splat.image}" alt="${splat.name}" loading="lazy" />` : `<div class="splat-card-thumb-emoji">${splat.emoji || "✨"}</div>`;
            const tagsHtml = (splat.tags || []).map(t => `<span class="splat-tag">${t}</span>`).join("");
            const activeBadge = realIndex === activeSplatIndex ? `<div class="splat-card-active-badge">AKTIV</div>` : "";
            function splatSizeLabel(vc) {
                if (!vc)           return null;
                if (vc < 100000)  return { label:"Tiny",     cls:"size-tiny"     };
                if (vc < 300000)  return { label:"Small",    cls:"size-small"    };
                if (vc < 600000)  return { label:"Medium",   cls:"size-medium"   };
                if (vc < 1000000) return { label:"Large",    cls:"size-large"    };
                if (vc < 2000000) return { label:"Huge",     cls:"size-huge"     };
                return               { label:"Gigantic", cls:"size-gigantic" };
            }
            const si = splatSizeLabel(splat.vertexCount);
            const sizeBadge = si ? `<div class="splat-size-badge ${si.cls}">${si.label}</div>` : "";
            let resolvedUrl = ''; try { resolvedUrl = new URL(splat.url, splat.base || location.href).href; } catch {}
            const cacheBadge = resolvedUrl && cachedSplatUrls.has(resolvedUrl) ? `<div class="splat-cache-badge">✓ Cached</div>` : "";
            card.innerHTML = `<div class="splat-card-thumb">${thumb}</div>${sizeBadge}${cacheBadge}${activeBadge}<div class="splat-card-body"><div class="splat-card-name">${splat.name}</div><div class="splat-card-meta">${tagsHtml}</div></div>`;
            card.addEventListener("click", () => {
                closeOverlay();
                if (realIndex === activeSplatIndex) return;
                activeSplatIndex = realIndex; localStorage.setItem("activeSplatIndex", activeSplatIndex); loadSplat(splat);
            });
            splatGridEl.appendChild(card);
        });
    }

    browserBtn.addEventListener("click", () => overlayOpen ? closeOverlay() : openOverlay());
    overlayClose.addEventListener("click", closeOverlay);
    window.loadSplat    = loadSplat;
    window.closeOverlay = closeOverlay;

    // ── Settings dropdown ─────────────────────────────────────
    const settingsBtn       = document.getElementById("overlay-settings-btn");
    const settingsDropdown  = document.getElementById("settings-dropdown");
    const clearCacheBtn     = document.getElementById("clear-cache-btn");
    settingsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        settingsDropdown.classList.toggle("open");
        settingsBtn.classList.toggle("active");
    });
    document.addEventListener("click", (e) => {
        if (!settingsDropdown.contains(e.target) && e.target !== settingsBtn) {
            settingsDropdown.classList.remove("open");
            settingsBtn.classList.remove("active");
        }
    });
    clearCacheBtn.addEventListener("click", async () => {
        clearCacheBtn.disabled = true;
        clearCacheBtn.textContent = "Clearing…";
        await clearSplatCache();
        cachedSplatUrls.clear();
        clearCacheBtn.textContent = "Cleared!";
        if (overlayOpen) renderSplatGrid();
        setTimeout(() => { clearCacheBtn.textContent = "Clear all"; clearCacheBtn.disabled = false; }, 1500);
    });

    // ── Loader ────────────────────────────────────────────────
    // loadGen bumps on each new load so stale async continuations abort.
    let loadGen  = 0;
    let streamVC = 0;

    async function loadSplat(splat) {
        const gen = ++loadGen;

        if (splat.cameraPosition && splat.cameraRotation) {
            cameraPosition = [...splat.cameraPosition];
            cameraRotation = [...splat.cameraRotation];
            viewMatrix = createViewMatrix(cameraPosition, cameraRotation);
            saveCameraState();
        }
        vertexCount = 0; streamVC = 0;
        texAllocWidth = 0; texAllocHeight = 0;

        const splatUrl   = new URL(splat.url, splat.base).href;
        spinnerEl.style.display  = "";
        progressEl.style.display = "";
        progressEl.style.width   = "0%";
        progressEl.classList.remove("indeterminate");

        // ── Cache check ──────────────────────────────────────
        let arrayBuf = await getCachedSplat(splatUrl);
        if (gen !== loadGen) return;

        if (!arrayBuf) {
            // ── Fetch with live progress ──────────────────────
            let r;
            try { r = await fetch(splatUrl, { mode: "cors", credentials: "omit" }); }
            catch (err) { console.error("Fetch error:", err); return; }
            if (!r.ok || gen !== loadGen) return;

            const contentLength = parseInt(r.headers.get("content-length")) || 0;
            const reader = r.body.getReader();
            const chunks = [];
            let bytesRead = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (gen !== loadGen) { reader.cancel(); return; }
                if (done) break;
                chunks.push(value);
                bytesRead += value.length;
                if (contentLength) {
                    progressEl.style.width = Math.min(99, (bytesRead / contentLength) * 100).toFixed(1) + "%";
                }
            }

            // Merge chunks into one aligned ArrayBuffer
            arrayBuf = new ArrayBuffer(bytesRead);
            const view8 = new Uint8Array(arrayBuf);
            let off = 0;
            for (const c of chunks) { view8.set(c, off); off += c.length; }

            // Cache a copy for the next F5 reload (fire-and-forget)
            setCachedSplat(splatUrl, arrayBuf.slice(0));
            cachedSplatUrls.add(splatUrl);
            if (overlayOpen) renderSplatGrid(); // update cache badge
        }

        // Switch to indeterminate shimmer while the worker generates texture + sort
        progressEl.classList.add("indeterminate");
        viewDirty = true; // ensure view is sent to worker for initial sort

        const vc = (arrayBuf.byteLength / rowLength) | 0;
        streamVC = vc;
        splatData = new Uint8Array(arrayBuf);
        worker.postMessage({ type: 'buffer', buffer: arrayBuf, vertexCount: vc }, [arrayBuf]);
    }

    // ── Mobile joysticks ─────────────────────────────────────
    const joystickLeft  = document.getElementById("joystick-left");
    const joystickRight = document.getElementById("joystick-right");
    const knobLeft  = document.getElementById("knob-left");
    const knobRight = document.getElementById("knob-right");
    const joyRadius = 33;
    let joyMove = { x: 0, y: 0 };
    let joyLook = { x: 0, y: 0 };
    function setupJoystick(pad, knob, out) {
        let id = null, ox = 0, oy = 0;
        pad.addEventListener("touchstart", (e) => {
            e.preventDefault(); if (id !== null) return;
            const t = e.changedTouches[0]; id = t.identifier;
            const r = pad.getBoundingClientRect(); ox = r.left+r.width/2; oy = r.top+r.height/2;
        }, { passive: false });
        pad.addEventListener("touchmove", (e) => {
            e.preventDefault();
            for (const t of e.changedTouches) {
                if (t.identifier !== id) continue;
                const dx = t.clientX-ox, dy = t.clientY-oy;
                const cl = Math.min(Math.hypot(dx,dy), joyRadius), ang = Math.atan2(dy,dx);
                const kx = Math.cos(ang)*cl, ky = Math.sin(ang)*cl;
                knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
                out.x = kx/joyRadius; out.y = ky/joyRadius;
            }
        }, { passive: false });
        const release = (e) => { for (const t of e.changedTouches) { if (t.identifier !== id) continue; id = null; knob.style.transform = "translate(-50%, -50%)"; out.x = out.y = 0; } };
        pad.addEventListener("touchend",    release, { passive: false });
        pad.addEventListener("touchcancel", release, { passive: false });
    }
    setupJoystick(joystickLeft,  knobLeft,  joyMove);
    setupJoystick(joystickRight, knobRight, joyLook);
    window._joyMove = joyMove; window._joyLook = joyLook;

    // ── Help panel ───────────────────────────────────────────
    const helpToggle = document.getElementById("help-toggle");
    const helpPanel  = document.getElementById("help-panel");
    helpToggle.addEventListener("click", (e) => { e.stopPropagation(); helpPanel.classList.toggle("show"); });
    document.addEventListener("click", () => helpPanel.classList.remove("show"));

    // ── Render loop ───────────────────────────────────────────
    let lastFrame = 0, avgFps = 0;
    const moveSpeed = 0.1;

    const frame = (now) => {
        gl.useProgram(program);
        const yaw = cameraRotation[0], pitch = cameraRotation[1];
        const cy = Math.cos(yaw), sy = Math.sin(yaw);
        const cp = Math.cos(pitch), sp = Math.sin(pitch);
        const fx = -sy*cp, fz = -cy*cp, fy = sp;
        const rx = cy, rz = -sy;
        const speed = moveSpeed * (activeKeys.has("ShiftLeft") ? 2 : 1);
        let dx = 0, dy = 0, dz = 0;
        if (activeKeys.has("KeyW"))        { dx -= fx*speed; dz -= fz*speed; dy -= fy*speed; }
        if (activeKeys.has("KeyS"))        { dx += fx*speed; dz += fz*speed; dy += fy*speed; }
        if (activeKeys.has("KeyA"))        { dx -= rx*speed; dz -= rz*speed; }
        if (activeKeys.has("KeyD"))        { dx += rx*speed; dz += rz*speed; }
        if (activeKeys.has("Space"))       { dy -= speed; }
        if (activeKeys.has("ControlLeft")) { dy += speed; }
        const jm = window._joyMove, jl = window._joyLook;
        if (jm && (jm.x || jm.y)) { dx += (rx*jm.x+fx*jm.y)*speed; dz += (rz*jm.x+fz*jm.y)*speed; dy += fy*jm.y*speed; }
        if (jl && (jl.x || jl.y)) {
            cameraRotation[0] += jl.x * 0.01;
            cameraRotation[1] = Math.max(-Math.PI/2+0.01, Math.min(Math.PI/2-0.01, cameraRotation[1] - jl.y*0.01));
        }
        if (dx || dy || dz || (jl && (jl.x || jl.y))) {
            cameraPosition[0] += dx; cameraPosition[1] += dy; cameraPosition[2] += dz;
            viewMatrix = createViewMatrix(cameraPosition, cameraRotation);
            saveCameraState();
            viewDirty = true;
        }

        const viewProj = multiply4(projectionMatrix, viewMatrix);
        sendView(viewProj);

        const dt = now - lastFrame; if (dt > 0) avgFps = avgFps * 0.9 + (1000 / dt) * 0.1;
        lastFrame = now;
        fpsEl.innerText = Math.round(avgFps) + " fps";

        if (vertexCount > 0) {
            spinnerEl.style.display = "none";
            gl.uniformMatrix4fv(u_view, false, viewMatrix);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, 4, vertexCount);
        } else {
            gl.clear(gl.COLOR_BUFFER_BIT);
            spinnerEl.style.display = "";
        }

        // Progress is hidden by the sort handler; no per-frame DOM query needed

        requestAnimationFrame(frame);
    };

    renderSplatGrid();
    if (activeSplatIndex >= 0 && activeSplatIndex < splatLibrary.length) {
        const splat = splatLibrary[activeSplatIndex];
        if (!savedCamera && splat.cameraPosition && splat.cameraRotation) {
            cameraPosition = [...splat.cameraPosition]; cameraRotation = [...splat.cameraRotation];
            viewMatrix = createViewMatrix(cameraPosition, cameraRotation);
        }
        const s = { ...splat }; delete s.cameraPosition; delete s.cameraRotation;
        loadSplat(s);
    }
    requestAnimationFrame(frame);

    // ── File drop ────────────────────────────────────────────
    const isPly = (d) => d[0]===112 && d[1]===108 && d[2]===121 && d[3]===10;
    const selectFile = (file) => {
        ++loadGen; // cancel any in-flight loadSplat
        const fr = new FileReader();
        fr.onload = () => {
            splatData = new Uint8Array(fr.result);
            streamVC  = (splatData.length / rowLength) | 0;
            if (isPly(splatData)) {
                worker.postMessage({ type: 'ply', ply: fr.result, save: true }, [fr.result]);
            } else {
                worker.postMessage({ type: 'buffer', buffer: fr.result, vertexCount: streamVC }, [fr.result]);
            }
        };
        fr.readAsArrayBuffer(file);
    };
    const pd = (e) => { e.preventDefault(); e.stopPropagation(); };
    document.addEventListener("dragenter", pd); document.addEventListener("dragover", pd);
    document.addEventListener("dragleave", pd);
    document.addEventListener("drop", (e) => { e.preventDefault(); e.stopPropagation(); selectFile(e.dataTransfer.files[0]); });

    // ── Hash camera ──────────────────────────────────────────
    window.addEventListener("hashchange", () => {
        if (isSaving) return;
        try {
            const m = location.hash.slice(1).match(/\[([-\d.]+),([-\d.]+),([-\d.]+)\]\[([-\d.]+),([-\d.]+),([-\d.]+)\]/);
            if (m) {
                cameraPosition = [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
                cameraRotation = [parseFloat(m[4]), parseFloat(m[5]), parseFloat(m[6])];
                viewMatrix = createViewMatrix(cameraPosition, cameraRotation);
            }
        } catch (err) { console.error("Failed to parse hash:", err); }
    });
}

// (main is started by loadSplatLibraryAndStart above)
