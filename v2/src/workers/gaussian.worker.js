// Gaussian splat worker — owns buffer, depth-sort, and texture generation.
// Messages IN:
//   { type:'buffer', buffer, vertexCount }  – streaming chunk (transferred)
//   { type:'view',   viewProj }             – camera update, triggers sort
//   { type:'ply',    ply, save }            – raw PLY file
// Messages OUT:
//   { type:'tex',    texdata, texwidth, texheight, vertexCount }
//   { type:'sort',   depthIndex, vertexCount }
//   { type:'buffer', buffer, save }         – only for PLY download

const ROW_LENGTH = 32;

let buffer      = null;
let vertexCount = 0;
let viewProj    = null;
let lastProj    = new Float32Array(16);
let sortRunning = false;
let sortPending = false;
let f_buffer    = null;

// ── Half-float packing ────────────────────────────────────────────
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

// ── Texture generation ────────────────────────────────────────────
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

// ── 2-pass 16-bit radix sort (O(n)) ──────────────────────────────
// force=true when called from a buffer update — always sort even if camera didn't move
function runSort(vp, force) {
    if (!buffer || vertexCount === 0) { sortRunning = false; return; }
    const f   = f_buffer;
    const vp2 = vp[2], vp6 = vp[6], vp10 = vp[10];

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

// ── PLY parser ────────────────────────────────────────────────────
function processPlyBuffer(inputBuffer) {
    const ubuf   = new Uint8Array(inputBuffer);
    const header = new TextDecoder().decode(ubuf.slice(0, 10240));
    const HEND   = "end_header\n";
    const hei    = header.indexOf(HEND);
    if (hei < 0) throw new Error("Unable to read .ply header");
    const plyVC = parseInt(/element vertex (\d+)\n/.exec(header)[1]);
    let row_offset = 0;
    const offsets = {}, types = {};
    const TYPE_MAP = {
        double: "getFloat64", int: "getInt32",   uint: "getUint32",
        float:  "getFloat32", short: "getInt16", ushort: "getUint16", uchar: "getUint8"
    };
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

// ── Message handler ───────────────────────────────────────────────
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
        if (d.save) {
            const copy = buffer.slice(0);
            self.postMessage({ type: 'buffer', buffer: copy, save: true }, [copy]);
        }
    } else if (d.type === 'buffer') {
        buffer = d.buffer;
        f_buffer = new Float32Array(buffer);
        vertexCount = d.vertexCount | 0;
        generateTexture();
        if (viewProj) { sortRunning = true; runSort(viewProj, true); }
    } else if (d.type === 'view') {
        viewProj = d.viewProj;
        if (sortRunning) { sortPending = true; }
        else { sortRunning = true; runSort(viewProj); }
    }
};
