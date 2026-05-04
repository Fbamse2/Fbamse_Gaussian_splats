// ── Splat library – add more entries here to populate the sidebar ──
const splatLibrary = [
    {
        name: "Greve Havn",
        desc: "Outdoor harbour scene",
        emoji: "⚓",
        url: "greve_havn_splat_c51e10e7-983c-42f1-a5bf-6e1411100b70.splat",
        base: "https://huggingface.co/fbamse1/Fbamse_Gaussian_splats/resolve/main/",
    },
    // Add more splats here, e.g.:
    // { name: "Indoor Room", desc: "Living room", emoji: "🛋️", url: "room.splat", base: "https://..." },
];

let cameras = [
    {
        id: 0,
        position: [-2.53, -5.32, -16.74],
        rotation: [
            [1, -0.02, 0.04],
            [0, 0.92, 0.39],
            [-0.05, -0.39, 0.92],
        ],
        fy: 1164.6601287484507,
        fx: 1159.5880733038064,
    },
];

let camera = cameras[0];

function getProjectionMatrix(fx, fy, width, height) {
    const znear = 0.2;
    const zfar = 200;
    return [
        [(2 * fx) / width, 0, 0, 0],
        [0, -(2 * fy) / height, 0, 0],
        [0, 0, zfar / (zfar - znear), 1],
        [0, 0, -(zfar * znear) / (zfar - znear), 0],
    ].flat();
}

function getViewMatrix(camera) {
    const R = camera.rotation.flat();
    const t = camera.position;
    const camToWorld = [
        [R[0], R[1], R[2], 0],
        [R[3], R[4], R[5], 0],
        [R[6], R[7], R[8], 0],
        [
            -t[0] * R[0] - t[1] * R[3] - t[2] * R[6],
            -t[0] * R[1] - t[1] * R[4] - t[2] * R[7],
            -t[0] * R[2] - t[1] * R[5] - t[2] * R[8],
            1,
        ],
    ].flat();
    return camToWorld;
}

function multiply4(a, b) {
    return [
        b[0] * a[0] + b[1] * a[4] + b[2] * a[8] + b[3] * a[12],
        b[0] * a[1] + b[1] * a[5] + b[2] * a[9] + b[3] * a[13],
        b[0] * a[2] + b[1] * a[6] + b[2] * a[10] + b[3] * a[14],
        b[0] * a[3] + b[1] * a[7] + b[2] * a[11] + b[3] * a[15],
        b[4] * a[0] + b[5] * a[4] + b[6] * a[8] + b[7] * a[12],
        b[4] * a[1] + b[5] * a[5] + b[6] * a[9] + b[7] * a[13],
        b[4] * a[2] + b[5] * a[6] + b[6] * a[10] + b[7] * a[14],
        b[4] * a[3] + b[5] * a[7] + b[6] * a[11] + b[7] * a[15],
        b[8] * a[0] + b[9] * a[4] + b[10] * a[8] + b[11] * a[12],
        b[8] * a[1] + b[9] * a[5] + b[10] * a[9] + b[11] * a[13],
        b[8] * a[2] + b[9] * a[6] + b[10] * a[10] + b[11] * a[14],
        b[8] * a[3] + b[9] * a[7] + b[10] * a[11] + b[11] * a[15],
        b[12] * a[0] + b[13] * a[4] + b[14] * a[8] + b[15] * a[12],
        b[12] * a[1] + b[13] * a[5] + b[14] * a[9] + b[15] * a[13],
        b[12] * a[2] + b[13] * a[6] + b[14] * a[10] + b[15] * a[14],
        b[12] * a[3] + b[13] * a[7] + b[14] * a[11] + b[15] * a[15],
    ];
}

function invert4(a) {
    let b00 = a[0] * a[5] - a[1] * a[4];
    let b01 = a[0] * a[6] - a[2] * a[4];
    let b02 = a[0] * a[7] - a[3] * a[4];
    let b03 = a[1] * a[6] - a[2] * a[5];
    let b04 = a[1] * a[7] - a[3] * a[5];
    let b05 = a[2] * a[7] - a[3] * a[6];
    let b06 = a[8] * a[13] - a[9] * a[12];
    let b07 = a[8] * a[14] - a[10] * a[12];
    let b08 = a[8] * a[15] - a[11] * a[12];
    let b09 = a[9] * a[14] - a[10] * a[13];
    let b10 = a[9] * a[15] - a[11] * a[13];
    let b11 = a[10] * a[15] - a[11] * a[14];
    let det =
        b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    return [
        (a[5] * b11 - a[6] * b10 + a[7] * b09) / det,
        (a[2] * b10 - a[1] * b11 - a[3] * b09) / det,
        (a[13] * b05 - a[14] * b04 + a[15] * b03) / det,
        (a[10] * b04 - a[9] * b05 - a[11] * b03) / det,
        (a[6] * b08 - a[4] * b11 - a[7] * b07) / det,
        (a[0] * b11 - a[2] * b08 + a[3] * b07) / det,
        (a[14] * b02 - a[12] * b05 - a[15] * b01) / det,
        (a[8] * b05 - a[10] * b02 + a[11] * b01) / det,
        (a[4] * b10 - a[5] * b08 + a[7] * b06) / det,
        (a[1] * b08 - a[0] * b10 - a[3] * b06) / det,
        (a[12] * b04 - a[13] * b02 + a[15] * b00) / det,
        (a[9] * b02 - a[8] * b04 - a[11] * b00) / det,
        (a[5] * b07 - a[4] * b09 - a[6] * b06) / det,
        (a[0] * b09 - a[1] * b07 + a[2] * b06) / det,
        (a[13] * b01 - a[12] * b03 - a[14] * b00) / det,
        (a[8] * b03 - a[9] * b01 + a[10] * b00) / det,
    ];
}

function rotate4(a, rad, x, y, z) {
    let len = Math.hypot(x, y, z);
    x /= len;
    y /= len;
    z /= len;
    let s = Math.sin(rad);
    let c = Math.cos(rad);
    let t = 1 - c;
    let b00 = x * x * t + c;
    let b01 = y * x * t + z * s;
    let b02 = z * x * t - y * s;
    let b10 = x * y * t - z * s;
    let b11 = y * y * t + c;
    let b12 = z * y * t + x * s;
    let b20 = x * z * t + y * s;
    let b21 = y * z * t - x * s;
    let b22 = z * z * t + c;
    return [
        a[0] * b00 + a[4] * b01 + a[8] * b02,
        a[1] * b00 + a[5] * b01 + a[9] * b02,
        a[2] * b00 + a[6] * b01 + a[10] * b02,
        a[3] * b00 + a[7] * b01 + a[11] * b02,
        a[0] * b10 + a[4] * b11 + a[8] * b12,
        a[1] * b10 + a[5] * b11 + a[9] * b12,
        a[2] * b10 + a[6] * b11 + a[10] * b12,
        a[3] * b10 + a[7] * b11 + a[11] * b12,
        a[0] * b20 + a[4] * b21 + a[8] * b22,
        a[1] * b20 + a[5] * b21 + a[9] * b22,
        a[2] * b20 + a[6] * b21 + a[10] * b22,
        a[3] * b20 + a[7] * b21 + a[11] * b22,
        ...a.slice(12, 16),
    ];
}

function translate4(a, x, y, z) {
    return [
        ...a.slice(0, 12),
        a[0] * x + a[4] * y + a[8] * z + a[12],
        a[1] * x + a[5] * y + a[9] * z + a[13],
        a[2] * x + a[6] * y + a[10] * z + a[14],
        a[3] * x + a[7] * y + a[11] * z + a[15],
    ];
}

function createWorker(self) {
    let buffer;
    let vertexCount = 0;
    let viewProj;
    const rowLength = 3 * 4 + 3 * 4 + 4 + 4;
    let lastProj = [];
    let depthIndex = new Uint32Array();
    let lastVertexCount = 0;

    var _floatView = new Float32Array(1);
    var _int32View = new Int32Array(_floatView.buffer);

    function floatToHalf(float) {
        _floatView[0] = float;
        var f = _int32View[0];

        var sign = (f >> 31) & 0x0001;
        var exp = (f >> 23) & 0x00ff;
        var frac = f & 0x007fffff;

        var newExp;
        if (exp == 0) {
            newExp = 0;
        } else if (exp < 113) {
            newExp = 0;
            frac |= 0x00800000;
            frac = frac >> (113 - exp);
            if (frac & 0x01000000) {
                newExp = 1;
                frac = 0;
            }
        } else if (exp < 142) {
            newExp = exp - 112;
        } else {
            newExp = 31;
            frac = 0;
        }

        return (sign << 15) | (newExp << 10) | (frac >> 13);
    }

    function packHalf2x16(x, y) {
        return (floatToHalf(x) | (floatToHalf(y) << 16)) >>> 0;
    }

    function generateTexture() {
        if (!buffer) return;
        const f_buffer = new Float32Array(buffer);
        const u_buffer = new Uint8Array(buffer);

        var texwidth = 1024 * 2;
        var texheight = Math.ceil((2 * vertexCount) / texwidth);
        var texdata = new Uint32Array(texwidth * texheight * 4);
        var texdata_c = new Uint8Array(texdata.buffer);
        var texdata_f = new Float32Array(texdata.buffer);

        for (let i = 0; i < vertexCount; i++) {
            texdata_f[8 * i + 0] = f_buffer[8 * i + 0];
            texdata_f[8 * i + 1] = f_buffer[8 * i + 1];
            texdata_f[8 * i + 2] = f_buffer[8 * i + 2];

            texdata_c[4 * (8 * i + 7) + 0] = u_buffer[32 * i + 24 + 0];
            texdata_c[4 * (8 * i + 7) + 1] = u_buffer[32 * i + 24 + 1];
            texdata_c[4 * (8 * i + 7) + 2] = u_buffer[32 * i + 24 + 2];
            texdata_c[4 * (8 * i + 7) + 3] = u_buffer[32 * i + 24 + 3];

            let scale = [
                f_buffer[8 * i + 3 + 0],
                f_buffer[8 * i + 3 + 1],
                f_buffer[8 * i + 3 + 2],
            ];
            let rot = [
                (u_buffer[32 * i + 28 + 0] - 128) / 128,
                (u_buffer[32 * i + 28 + 1] - 128) / 128,
                (u_buffer[32 * i + 28 + 2] - 128) / 128,
                (u_buffer[32 * i + 28 + 3] - 128) / 128,
            ];

            const M = [
                1.0 - 2.0 * (rot[2] * rot[2] + rot[3] * rot[3]),
                2.0 * (rot[1] * rot[2] + rot[0] * rot[3]),
                2.0 * (rot[1] * rot[3] - rot[0] * rot[2]),

                2.0 * (rot[1] * rot[2] - rot[0] * rot[3]),
                1.0 - 2.0 * (rot[1] * rot[1] + rot[3] * rot[3]),
                2.0 * (rot[2] * rot[3] + rot[0] * rot[1]),

                2.0 * (rot[1] * rot[3] + rot[0] * rot[2]),
                2.0 * (rot[2] * rot[3] - rot[0] * rot[1]),
                1.0 - 2.0 * (rot[1] * rot[1] + rot[2] * rot[2]),
            ].map((k, i) => k * scale[Math.floor(i / 3)]);

            const sigma = [
                M[0] * M[0] + M[3] * M[3] + M[6] * M[6],
                M[0] * M[1] + M[3] * M[4] + M[6] * M[7],
                M[0] * M[2] + M[3] * M[5] + M[6] * M[8],
                M[1] * M[1] + M[4] * M[4] + M[7] * M[7],
                M[1] * M[2] + M[4] * M[5] + M[7] * M[8],
                M[2] * M[2] + M[5] * M[5] + M[8] * M[8],
            ];

            texdata[8 * i + 4] = packHalf2x16(4 * sigma[0], 4 * sigma[1]);
            texdata[8 * i + 5] = packHalf2x16(4 * sigma[2], 4 * sigma[3]);
            texdata[8 * i + 6] = packHalf2x16(4 * sigma[4], 4 * sigma[5]);
        }

        self.postMessage({ texdata, texwidth, texheight }, [texdata.buffer]);
    }

    function runSort(viewProj) {
        if (!buffer) return;
        const f_buffer = new Float32Array(buffer);
        if (lastVertexCount == vertexCount) {
            let dot =
                lastProj[2] * viewProj[2] +
                lastProj[6] * viewProj[6] +
                lastProj[10] * viewProj[10];
            if (Math.abs(dot - 1) < 0.01) {
                return;
            }
        } else {
            generateTexture();
            lastVertexCount = vertexCount;
        }

        let maxDepth = -Infinity;
        let minDepth = Infinity;
        let sizeList = new Int32Array(vertexCount);
        for (let i = 0; i < vertexCount; i++) {
            let depth =
                ((viewProj[2] * f_buffer[8 * i + 0] +
                    viewProj[6] * f_buffer[8 * i + 1] +
                    viewProj[10] * f_buffer[8 * i + 2]) *
                    4096) |
                0;
            sizeList[i] = depth;
            if (depth > maxDepth) maxDepth = depth;
            if (depth < minDepth) minDepth = depth;
        }

        let depthInv = (256 * 256 - 1) / (maxDepth - minDepth);
        let counts0 = new Uint32Array(256 * 256);
        for (let i = 0; i < vertexCount; i++) {
            sizeList[i] = ((sizeList[i] - minDepth) * depthInv) | 0;
            counts0[sizeList[i]]++;
        }
        let starts0 = new Uint32Array(256 * 256);
        for (let i = 1; i < 256 * 256; i++)
            starts0[i] = starts0[i - 1] + counts0[i - 1];
        depthIndex = new Uint32Array(vertexCount);
        for (let i = 0; i < vertexCount; i++)
            depthIndex[starts0[sizeList[i]]++] = i;

        lastProj = viewProj;
        self.postMessage({ depthIndex, viewProj, vertexCount }, [
            depthIndex.buffer,
        ]);
    }

    function processPlyBuffer(inputBuffer) {
        const ubuf = new Uint8Array(inputBuffer);
        const header = new TextDecoder().decode(ubuf.slice(0, 1024 * 10));
        const header_end = "end_header\n";
        const header_end_index = header.indexOf(header_end);
        if (header_end_index < 0)
            throw new Error("Unable to read .ply file header");
        const vertexCount = parseInt(/element vertex (\d+)\n/.exec(header)[1]);
        let row_offset = 0,
            offsets = {},
            types = {};
        const TYPE_MAP = {
            double: "getFloat64",
            int: "getInt32",
            uint: "getUint32",
            float: "getFloat32",
            short: "getInt16",
            ushort: "getUint16",
            uchar: "getUint8",
        };
        for (let prop of header
            .slice(0, header_end_index)
            .split("\n")
            .filter((k) => k.startsWith("property "))) {
            const [p, type, name] = prop.split(" ");
            const arrayType = TYPE_MAP[type] || "getInt8";
            types[name] = arrayType;
            offsets[name] = row_offset;
            row_offset += parseInt(arrayType.replace(/[^\d]/g, "")) / 8;
        }

        let dataView = new DataView(
            inputBuffer,
            header_end_index + header_end.length,
        );
        let row = 0;
        const attrs = new Proxy(
            {},
            {
                get(target, prop) {
                    if (!types[prop]) throw new Error(prop + " not found");
                    return dataView[types[prop]](
                        row * row_offset + offsets[prop],
                        true,
                    );
                },
            },
        );

        let sizeList = new Float32Array(vertexCount);
        let sizeIndex = new Uint32Array(vertexCount);
        for (row = 0; row < vertexCount; row++) {
            sizeIndex[row] = row;
            if (!types["scale_0"]) continue;
            const size =
                Math.exp(attrs.scale_0) *
                Math.exp(attrs.scale_1) *
                Math.exp(attrs.scale_2);
            const opacity = 1 / (1 + Math.exp(-attrs.opacity));
            sizeList[row] = size * opacity;
        }

        sizeIndex.sort((b, a) => sizeList[a] - sizeList[b]);

        const rowLength = 3 * 4 + 3 * 4 + 4 + 4;
        const buffer = new ArrayBuffer(rowLength * vertexCount);

        for (let j = 0; j < vertexCount; j++) {
            row = sizeIndex[j];

            const position = new Float32Array(buffer, j * rowLength, 3);
            const scales = new Float32Array(buffer, j * rowLength + 4 * 3, 3);
            const rgba = new Uint8ClampedArray(
                buffer,
                j * rowLength + 4 * 3 + 4 * 3,
                4,
            );
            const rot = new Uint8ClampedArray(
                buffer,
                j * rowLength + 4 * 3 + 4 * 3 + 4,
                4,
            );

            if (types["scale_0"]) {
                const qlen = Math.sqrt(
                    attrs.rot_0 ** 2 +
                    attrs.rot_1 ** 2 +
                    attrs.rot_2 ** 2 +
                    attrs.rot_3 ** 2,
                );

                rot[0] = (attrs.rot_0 / qlen) * 128 + 128;
                rot[1] = (attrs.rot_1 / qlen) * 128 + 128;
                rot[2] = (attrs.rot_2 / qlen) * 128 + 128;
                rot[3] = (attrs.rot_3 / qlen) * 128 + 128;

                scales[0] = Math.exp(attrs.scale_0);
                scales[1] = Math.exp(attrs.scale_1);
                scales[2] = Math.exp(attrs.scale_2);
            } else {
                scales[0] = 0.01;
                scales[1] = 0.01;
                scales[2] = 0.01;

                rot[0] = 255;
                rot[1] = 0;
                rot[2] = 0;
                rot[3] = 0;
            }

            position[0] = attrs.x;
            position[1] = attrs.y;
            position[2] = attrs.z;

            if (types["f_dc_0"]) {
                const SH_C0 = 0.28209479177387814;
                rgba[0] = (0.5 + SH_C0 * attrs.f_dc_0) * 255;
                rgba[1] = (0.5 + SH_C0 * attrs.f_dc_1) * 255;
                rgba[2] = (0.5 + SH_C0 * attrs.f_dc_2) * 255;
            } else {
                rgba[0] = attrs.red;
                rgba[1] = attrs.green;
                rgba[2] = attrs.blue;
            }
            if (types["opacity"]) {
                rgba[3] = (1 / (1 + Math.exp(-attrs.opacity))) * 255;
            } else {
                rgba[3] = 255;
            }
        }
        return buffer;
    }

    const throttledSort = () => {
        if (!sortRunning) {
            sortRunning = true;
            let lastView = viewProj;
            runSort(lastView);
            setTimeout(() => {
                sortRunning = false;
                if (lastView !== viewProj) {
                    throttledSort();
                }
            }, 0);
        }
    };

    let sortRunning;
    self.onmessage = (e) => {
        if (e.data.ply) {
            vertexCount = 0;
            runSort(viewProj);
            buffer = processPlyBuffer(e.data.ply);
            vertexCount = Math.floor(buffer.byteLength / rowLength);
            postMessage({ buffer: buffer, save: !!e.data.save });
        } else if (e.data.buffer) {
            buffer = e.data.buffer;
            vertexCount = e.data.vertexCount;
        } else if (e.data.vertexCount) {
            vertexCount = e.data.vertexCount;
        } else if (e.data.view) {
            viewProj = e.data.view;
            throttledSort();
        }
    };
}

const vertexShaderSource = `
#version 300 es
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
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        return;
    }

    uvec4 cov = texelFetch(u_texture, ivec2(((uint(index) & 0x3ffu) << 1) | 1u, uint(index) >> 10), 0);
    vec2 u1 = unpackHalf2x16(cov.x), u2 = unpackHalf2x16(cov.y), u3 = unpackHalf2x16(cov.z);
    mat3 Vrk = mat3(u1.x, u1.y, u2.x, u1.y, u2.y, u3.x, u2.x, u3.x, u3.y);

    mat3 J = mat3(
        focal.x / cam.z, 0., -(focal.x * cam.x) / (cam.z * cam.z),
        0., -focal.y / cam.z, (focal.y * cam.y) / (cam.z * cam.z),
        0., 0., 0.
    );

    mat3 T = transpose(mat3(view)) * J;
    mat3 cov2d = transpose(T) * Vrk * T;

    float mid = (cov2d[0][0] + cov2d[1][1]) / 2.0;
    float radius = length(vec2((cov2d[0][0] - cov2d[1][1]) / 2.0, cov2d[0][1]));
    float lambda1 = mid + radius, lambda2 = mid - radius;

    if(lambda2 < 0.0) return;
    vec2 diagonalVector = normalize(vec2(cov2d[0][1], lambda1 - cov2d[0][0]));
    vec2 majorAxis = min(sqrt(2.0 * lambda1), 1024.0) * diagonalVector;
    vec2 minorAxis = min(sqrt(2.0 * lambda2), 1024.0) * vec2(diagonalVector.y, -diagonalVector.x);

    vColor = clamp(pos2d.z/pos2d.w+1.0, 0.0, 1.0) * vec4((cov.w) & 0xffu, (cov.w >> 8) & 0xffu, (cov.w >> 16) & 0xffu, (cov.w >> 24) & 0xffu) / 255.0;
    vPosition = position;

    vec2 vCenter = vec2(pos2d) / pos2d.w;
    gl_Position = vec4(
        vCenter
        + position.x * majorAxis / viewport
        + position.y * minorAxis / viewport, 0.0, 1.0);

}
`.trim();

const fragmentShaderSource = `
#version 300 es
precision highp float;

in vec4 vColor;
in vec2 vPosition;

out vec4 fragColor;

void main () {
    float A = -dot(vPosition, vPosition);
    if (A < -4.0) discard;
    float B = exp(A) * vColor.a;
    fragColor = vec4(B * vColor.rgb, B);
}

`.trim();


// Free cam state - start at y=5, x=0, z=0
let cameraPosition = [-12.25, -5.73, 9.99];
let cameraRotation = [2.2, -0.4, 0]; // yaw, pitch, roll
let mouseLocked = false;

function createViewMatrix(position, rotation) {
    const yaw = rotation[0];
    const pitch = rotation[1];
    const roll = rotation[2];
    
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    
    const forward = [-sy * cp, sp, -cy * cp];
    const right = [cy, 0, -sy];
    const up = [sy * sp, cp, cy * sp];
    
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
        -t[0] * R[0] - t[1] * R[4] - t[2] * R[8],
        -t[0] * R[1] - t[1] * R[5] - t[2] * R[9],
        -t[0] * R[2] - t[1] * R[6] - t[2] * R[10],
        1
    ];
}

let viewMatrix = createViewMatrix(cameraPosition, cameraRotation);

async function main() {
    let carousel = false; // Disabled carousel completely
    const params = new URLSearchParams(location.search);
    try {
        viewMatrix = JSON.parse(decodeURIComponent(location.hash.slice(1)));
    } catch (err) { }
    /*
    const url = new URL(
        params.get("url") || "output.splat",
        window.location.href,
    );
    */

    const url = new URL(
        // "nike.splat",
        // location.href,
        params.get("url") || "greve_havn_splat_c51e10e7-983c-42f1-a5bf-6e1411100b70.splat",
        "https://huggingface.co/fbamse1/Fbamse_Gaussian_splats/resolve/main/",
    );


    const req = await fetch(url, {
        mode: "cors",
        credentials: "omit",
    });
    console.log(req);
    if (req.status != 200)
        throw new Error(req.status + " Unable to load " + req.url);

    const rowLength = 3 * 4 + 3 * 4 + 4 + 4;
    const reader = req.body.getReader();
    let splatData = new Uint8Array(req.headers.get("content-length"));

    const downsample =
        splatData.length / rowLength > 500000 ? 1 : 1 / devicePixelRatio;
    console.log(splatData.length / rowLength, downsample);

    const worker = new Worker(
        URL.createObjectURL(
            new Blob(["(", createWorker.toString(), ")(self)"], {
                type: "application/javascript",
            }),
        ),
    );

    const canvas = document.getElementById("canvas");
    const fps = document.getElementById("fps");
    const camid = document.getElementById("camid");

    let projectionMatrix;

    const gl = canvas.getContext("webgl2", {
        antialias: false,
    });

    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexShaderSource);
    gl.compileShader(vertexShader);
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS))
        console.error(gl.getShaderInfoLog(vertexShader));

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentShaderSource);
    gl.compileShader(fragmentShader);
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS))
        console.error(gl.getShaderInfoLog(fragmentShader));

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.useProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        console.error(gl.getProgramInfoLog(program));

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
        gl.ONE_MINUS_DST_ALPHA,
        gl.ONE,
        gl.ONE_MINUS_DST_ALPHA,
        gl.ONE,
    );
    gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);

    const u_projection = gl.getUniformLocation(program, "projection");
    const u_viewport = gl.getUniformLocation(program, "viewport");
    const u_focal = gl.getUniformLocation(program, "focal");
    const u_view = gl.getUniformLocation(program, "view");

    const triangleVertices = new Float32Array([-2, -2, 2, -2, 2, 2, -2, 2]);
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, triangleVertices, gl.STATIC_DRAW);
    const a_position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(a_position);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 0, 0);

    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    var u_textureLocation = gl.getUniformLocation(program, "u_texture");
    gl.uniform1i(u_textureLocation, 0);

    const indexBuffer = gl.createBuffer();
    const a_index = gl.getAttribLocation(program, "index");
    gl.enableVertexAttribArray(a_index);
    gl.bindBuffer(gl.ARRAY_BUFFER, indexBuffer);
    gl.vertexAttribIPointer(a_index, 1, gl.INT, false, 0, 0);
    gl.vertexAttribDivisor(a_index, 1);

    const resize = () => {
        gl.uniform2fv(u_focal, new Float32Array([camera.fx, camera.fy]));

        projectionMatrix = getProjectionMatrix(
            camera.fx,
            camera.fy,
            innerWidth,
            innerHeight,
        );

        gl.uniform2fv(u_viewport, new Float32Array([innerWidth, innerHeight]));

        gl.canvas.width = Math.round(innerWidth / downsample);
        gl.canvas.height = Math.round(innerHeight / downsample);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        gl.uniformMatrix4fv(u_projection, false, projectionMatrix);
    };

    window.addEventListener("resize", resize);
    resize();

    worker.onmessage = (e) => {
        if (e.data.buffer) {
            splatData = new Uint8Array(e.data.buffer);
            if (e.data.save) {
                const blob = new Blob([splatData.buffer], {
                    type: "application/octet-stream",
                });
                const link = document.createElement("a");
                link.download = "model.splat";
                link.href = URL.createObjectURL(blob);
                document.body.appendChild(link);
                link.click();
            }
        } else if (e.data.texdata) {
            const { texdata, texwidth, texheight } = e.data;
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(
                gl.TEXTURE_2D,
                gl.TEXTURE_WRAP_S,
                gl.CLAMP_TO_EDGE,
            );
            gl.texParameteri(
                gl.TEXTURE_2D,
                gl.TEXTURE_WRAP_T,
                gl.CLAMP_TO_EDGE,
            );
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGBA32UI,
                texwidth,
                texheight,
                0,
                gl.RGBA_INTEGER,
                gl.UNSIGNED_INT,
                texdata,
            );
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
        } else if (e.data.depthIndex) {
            const { depthIndex, viewProj } = e.data;
            gl.bindBuffer(gl.ARRAY_BUFFER, indexBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, depthIndex, gl.DYNAMIC_DRAW);
            vertexCount = e.data.vertexCount;
        }
    };

    let activeKeys = new Set();
    let currentCameraIndex = 0;

    // Mouse look controls - fixed with proper sensitivity and no jump
    canvas.addEventListener("click", () => {
        canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock;
        canvas.requestPointerLock();
    });

    document.addEventListener("pointerlockchange", lockChange);
    document.addEventListener("mozpointerlockchange", lockChange);

    let lastMouseX = 0, lastMouseY = 0;

    function lockChange() {
        if (document.pointerLockElement === canvas) {
            mouseLocked = true;
            document.addEventListener("mousemove", onMouseMove);
        } else {
            mouseLocked = false;
            document.removeEventListener("mousemove", onMouseMove);
        }
    }

    function onMouseMove(e) {
        if (!mouseLocked) return;
        carousel = false;
        const sensitivity = 0.002;
        // Fixed: positive movementX turns right (add to yaw)
        cameraRotation[0] += e.movementX * sensitivity;
        // Fixed: positive movementY looks UP (subtract from pitch) - standard FPS
        cameraRotation[1] -= e.movementY * sensitivity;
        cameraRotation[1] = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, cameraRotation[1]));
        viewMatrix = createViewMatrix(cameraPosition, cameraRotation);
    }

    window.addEventListener("keydown", (e) => {
        carousel = false;
        activeKeys.add(e.code);
        
        if (/\d/.test(e.key)) {
            currentCameraIndex = parseInt(e.key);
            camera = cameras[currentCameraIndex];
            viewMatrix = getViewMatrix(camera);
            camid.innerText = "cam  " + currentCameraIndex;
            return;
        }
        if (["-", "_"].includes(e.key)) {
            currentCameraIndex = (currentCameraIndex + cameras.length - 1) % cameras.length;
            viewMatrix = getViewMatrix(cameras[currentCameraIndex]);
            camid.innerText = "cam  " + currentCameraIndex;
            return;
        }
        if (["+", "="].includes(e.key)) {
            currentCameraIndex = (currentCameraIndex + 1) % cameras.length;
            viewMatrix = getViewMatrix(cameras[currentCameraIndex]);
            camid.innerText = "cam  " + currentCameraIndex;
            return;
        }
        let isSaving = false;
        if (e.code == "KeyV") {
            isSaving = true; // Prevent hashchange from reloading
            
            // Save position and full 3x3 rotation matrix (9 values)
            const pos = cameraPosition.map(p => Math.round(p * 100) / 100);
            
            // Get the 3x3 rotation matrix from the current camera orientation
            const yaw = cameraRotation[0];
            const pitch = cameraRotation[1];
            const roll = cameraRotation[2];
            
            const cy = Math.cos(yaw);
            const sy = Math.sin(yaw);
            const cp = Math.cos(pitch);
            const sp = Math.sin(pitch);
            const cr = Math.cos(roll);
            const sr = Math.sin(roll);
            
            // Build the 3x3 rotation matrix
            const forward = [-sy * cp, sp, -cy * cp];
            const right = [cy, 0, -sy];
            const up = [sy * sp, cp, cy * sp];
            
            const rotMatrix = [
                right[0], up[0], -forward[0],
                right[1], up[1], -forward[1],
                right[2], up[2], -forward[2]
            ];
            
            // Round to 2 decimal places
            const rot = rotMatrix.map(r => Math.round(r * 100) / 100);
            
            const hashData = `[${pos[0]},${pos[1]},${pos[2]}][${rot.join(",")}]`;
            location.hash = hashData;
            camid.innerText = "saved!";
            
            setTimeout(() => {
                if (camid.innerText === "saved!") camid.innerText = "";
                isSaving = false; // Re-enable hashchange after saving
            }, 100);
        }
    });

    window.addEventListener("keyup", (e) => {
        activeKeys.delete(e.code);
    });

    window.addEventListener("blur", () => {
        activeKeys.clear();
    });

    window.addEventListener("wheel", (e) => {
        e.preventDefault();
    }, { passive: false });

    // ── Sidebar ──────────────────────────────────────────────────
    const sidebarEl = document.getElementById("splat-sidebar");
    const sidebarToggle = document.getElementById("sidebar-toggle");
    const splatListEl = document.getElementById("splat-list");
    let activeSplatIndex = 0;

    function renderSplatList() {
        splatListEl.innerHTML = "";
        splatLibrary.forEach((splat, i) => {
            const item = document.createElement("div");
            item.className = "splat-item" + (i === activeSplatIndex ? " active" : "");
            item.innerHTML = `<div class="splat-thumb">${splat.emoji || "✨"}</div>
                <div class="splat-info">
                    <div class="splat-name">${splat.name}</div>
                    <div class="splat-desc">${splat.desc || ""}</div>
                </div>`;
            item.addEventListener("click", () => {
                activeSplatIndex = i;
                renderSplatList();
                sidebarEl.classList.remove("open");
                loadSplat(splat);
            });
            splatListEl.appendChild(item);
        });
    }

    function loadSplat(splat) {
        stopLoading = true;
        vertexCount = 0;
        const splatUrl = new URL(splat.url, splat.base);
        fetch(splatUrl, { mode: "cors", credentials: "omit" }).then(async (r) => {
            if (!r.ok) { console.error("Failed to load splat:", r.status); return; }
            stopLoading = false;
            const newReader = r.body.getReader();
            const newSplatData = new Uint8Array(parseInt(r.headers.get("content-length")) || 0);
            let newBytesRead = 0;
            document.getElementById("spinner").style.display = "";
            document.getElementById("progress").style.display = "";
            while (true) {
                const { done, value } = await newReader.read();
                if (done || stopLoading) break;
                newSplatData.set(value, newBytesRead);
                newBytesRead += value.length;
                worker.postMessage({ buffer: newSplatData.buffer, vertexCount: Math.floor(newBytesRead / rowLength) });
            }
            if (!stopLoading) {
                worker.postMessage({ buffer: newSplatData.buffer, vertexCount: Math.floor(newBytesRead / rowLength) });
            }
        });
    }

    sidebarToggle.addEventListener("click", () => {
        sidebarEl.classList.toggle("open");
    });
    // Close sidebar when clicking canvas
    canvas.addEventListener("pointerdown", () => {
        sidebarEl.classList.remove("open");
    });
    renderSplatList();

    // ── Help panel ───────────────────────────────────────────────
    const helpToggle = document.getElementById("help-toggle");
    const helpPanel = document.getElementById("help-panel");
    helpToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        helpPanel.classList.toggle("show");
    });
    document.addEventListener("click", () => helpPanel.classList.remove("show"));

    // ── Mobile joysticks ─────────────────────────────────────────
    const joystickLeft  = document.getElementById("joystick-left");
    const joystickRight = document.getElementById("joystick-right");
    const knobLeft  = document.getElementById("knob-left");
    const knobRight = document.getElementById("knob-right");

    const joyRadius = 33; // max knob travel (px)
    let joyMove = { x: 0, y: 0 };  // normalised -1..1
    let joyLook = { x: 0, y: 0 };

    function setupJoystick(pad, knob, outputObj) {
        let activeTouchId = null;
        let originX = 0, originY = 0;

        pad.addEventListener("touchstart", (e) => {
            e.preventDefault();
            if (activeTouchId !== null) return;
            const t = e.changedTouches[0];
            activeTouchId = t.identifier;
            const rect = pad.getBoundingClientRect();
            originX = rect.left + rect.width / 2;
            originY = rect.top  + rect.height / 2;
        }, { passive: false });

        pad.addEventListener("touchmove", (e) => {
            e.preventDefault();
            for (const t of e.changedTouches) {
                if (t.identifier !== activeTouchId) continue;
                const dx = t.clientX - originX;
                const dy = t.clientY - originY;
                const dist = Math.hypot(dx, dy);
                const clamped = Math.min(dist, joyRadius);
                const angle = Math.atan2(dy, dx);
                const kx = Math.cos(angle) * clamped;
                const ky = Math.sin(angle) * clamped;
                knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
                outputObj.x = kx / joyRadius;
                outputObj.y = ky / joyRadius;
            }
        }, { passive: false });

        const release = (e) => {
            for (const t of e.changedTouches) {
                if (t.identifier !== activeTouchId) continue;
                activeTouchId = null;
                knob.style.transform = "translate(-50%, -50%)";
                outputObj.x = 0;
                outputObj.y = 0;
            }
        };
        pad.addEventListener("touchend",    release, { passive: false });
        pad.addEventListener("touchcancel", release, { passive: false });
    }

    setupJoystick(joystickLeft,  knobLeft,  joyMove);
    setupJoystick(joystickRight, knobRight, joyLook);

    // Expose joystick state to the frame loop via module-level refs
    window._joyMove = joyMove;
    window._joyLook = joyLook;

    let vertexCount = 0;
    let lastFrame = 0;
    let avgFps = 0;

    const moveSpeed = 0.1;

    const frame = (now) => {
        // Get camera direction vectors
        const yaw = cameraRotation[0];
        const pitch = cameraRotation[1];
        const cosYaw = Math.cos(yaw);
        const sinYaw = Math.sin(yaw);
        const cosPitch = Math.cos(pitch);
        const sinPitch = Math.sin(pitch);
        
        // Forward direction (where camera is looking)
        const forwardX = -sinYaw * cosPitch;
        const forwardZ = -cosYaw * cosPitch;
        const forwardY = sinPitch;
        
        // Right direction
        const rightX = cosYaw;
        const rightZ = -sinYaw;
        
        const moveDelta = { x: 0, z: 0, y: 0 };
        const currentSpeed = moveSpeed * (activeKeys.has("ShiftLeft") ? 2 : 1);
        
        // Keyboard movement
        if (activeKeys.has("KeyW")) {
            moveDelta.x -= forwardX * currentSpeed;
            moveDelta.z -= forwardZ * currentSpeed;
            moveDelta.y -= forwardY * currentSpeed;
        }
        if (activeKeys.has("KeyS")) {
            moveDelta.x += forwardX * currentSpeed;
            moveDelta.z += forwardZ * currentSpeed;
            moveDelta.y += forwardY * currentSpeed;
        }
        if (activeKeys.has("KeyA")) {
            moveDelta.x -= rightX * currentSpeed;
            moveDelta.z -= rightZ * currentSpeed;
        }
        if (activeKeys.has("KeyD")) {
            moveDelta.x += rightX * currentSpeed;
            moveDelta.z += rightZ * currentSpeed;
        }
        if (activeKeys.has("Space")) {
            moveDelta.y -= currentSpeed;
        }
        if (activeKeys.has("ControlLeft")) {
            moveDelta.y += currentSpeed;
        }

        // Joystick movement (left stick)
        const jm = window._joyMove;
        const jl = window._joyLook;
        if (jm && (jm.x !== 0 || jm.y !== 0)) {
            // left stick: x = strafe, y = forward/back
            moveDelta.x += (rightX * jm.x - forwardX * jm.y) * currentSpeed;
            moveDelta.z += (rightZ * jm.x - forwardZ * jm.y) * currentSpeed;
            moveDelta.y += (-forwardY * jm.y) * currentSpeed;
        }
        // Joystick look (right stick)
        if (jl && (jl.x !== 0 || jl.y !== 0)) {
            const lookSensitivity = 0.01;
            cameraRotation[0] += jl.x * lookSensitivity;
            cameraRotation[1] -= jl.y * lookSensitivity;
            cameraRotation[1] = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, cameraRotation[1]));
        }
        
        if (moveDelta.x !== 0 || moveDelta.z !== 0 || moveDelta.y !== 0 || (jl && (jl.x !== 0 || jl.y !== 0))) {
            cameraPosition[0] += moveDelta.x;
            cameraPosition[1] += moveDelta.y;
            cameraPosition[2] += moveDelta.z;
            viewMatrix = createViewMatrix(cameraPosition, cameraRotation);
        }
        
        const viewProj = multiply4(projectionMatrix, viewMatrix);
        worker.postMessage({ view: viewProj });
        
        const currentFps = 1000 / (now - lastFrame) || 0;
        avgFps = avgFps * 0.9 + currentFps * 0.1;
        
        if (vertexCount > 0) {
            document.getElementById("spinner").style.display = "none";
            gl.uniformMatrix4fv(u_view, false, viewMatrix);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, 4, vertexCount);
        } else {
            gl.clear(gl.COLOR_BUFFER_BIT);
            document.getElementById("spinner").style.display = "";
        }
        const progress = (100 * vertexCount) / (splatData.length / rowLength);
        if (progress < 100) {
            document.getElementById("progress").style.width = progress + "%";
        } else {
            document.getElementById("progress").style.display = "none";
        }
        fps.innerText = Math.round(avgFps) + " fps";
        if (isNaN(currentCameraIndex)) {
            camid.innerText = "";
        }
        lastFrame = now;
        requestAnimationFrame(frame);
    };

    frame();

    const isPly = (splatData) =>
        splatData[0] == 112 &&
        splatData[1] == 108 &&
        splatData[2] == 121 &&
        splatData[3] == 10;

    const selectFile = (file) => {
        const fr = new FileReader();
        if (/\.json$/i.test(file.name)) {
            fr.onload = () => {
                cameras = JSON.parse(fr.result);
                viewMatrix = getViewMatrix(cameras[0]);
                projectionMatrix = getProjectionMatrix(
                    camera.fx / downsample,
                    camera.fy / downsample,
                    canvas.width,
                    canvas.height,
                );
                gl.uniformMatrix4fv(u_projection, false, projectionMatrix);
                console.log("Loaded Cameras");
            };
            fr.readAsText(file);
        } else {
            stopLoading = true;
            fr.onload = () => {
                splatData = new Uint8Array(fr.result);
                console.log("Loaded", Math.floor(splatData.length / rowLength));

                if (isPly(splatData)) {
                    worker.postMessage({ ply: splatData.buffer, save: true });
                } else {
                    worker.postMessage({
                        buffer: splatData.buffer,
                        vertexCount: Math.floor(splatData.length / rowLength),
                    });
                }
            };
            fr.readAsArrayBuffer(file);
        }
    };

    window.addEventListener("hashchange", (e) => {
        if (isSaving) return; // Skip if we're the one who set the hash
        
        try {
            const hash = location.hash.slice(1);
            if (!hash) return;
            
            // Check for format: [x,y,z][r0,r1,r2,r3,r4,r5,r6,r7,r8]
            const match = hash.match(/\[([-\d.]+),([-\d.]+),([-\d.]+)\]\[([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\]/);
            
            if (match) {
                // Load position
                cameraPosition = [
                    parseFloat(match[1]),
                    parseFloat(match[2]),
                    parseFloat(match[3])
                ];
                
                // Load the full 3x3 rotation matrix (9 values)
                const rotMatrix = [
                    parseFloat(match[4]), parseFloat(match[5]), parseFloat(match[6]),
                    parseFloat(match[7]), parseFloat(match[8]), parseFloat(match[9]),
                    parseFloat(match[10]), parseFloat(match[11]), parseFloat(match[12])
                ];
                
                // Create view matrix from position and rotation matrix
                const R = rotMatrix;
                const t = cameraPosition;
                viewMatrix = [
                    R[0], R[1], R[2], 0,
                    R[3], R[4], R[5], 0,
                    R[6], R[7], R[8], 0,
                    -t[0] * R[0] - t[1] * R[3] - t[2] * R[6],
                    -t[0] * R[1] - t[1] * R[4] - t[2] * R[7],
                    -t[0] * R[2] - t[1] * R[5] - t[2] * R[8],
                    1
                ];
                
                // Also update cameraRotation from matrix for continued movement
                cameraRotation[0] = Math.atan2(R[4], R[0]); // yaw
                cameraRotation[1] = Math.asin(-R[2]); // pitch
                cameraRotation[2] = 0; // roll
                
                console.log("Loaded position:", cameraPosition);
                console.log("Loaded rotation matrix:", rotMatrix);
            }
        } catch (err) { 
            console.error("Failed to parse hash:", err);
        }
    });

    const preventDefault = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };
    document.addEventListener("dragenter", preventDefault);
    document.addEventListener("dragover", preventDefault);
    document.addEventListener("dragleave", preventDefault);
    document.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectFile(e.dataTransfer.files[0]);
    });

    let bytesRead = 0;
    let lastVertexCount = -1;
    let stopLoading = false;

    while (true) {
        const { done, value } = await reader.read();
        if (done || stopLoading) break;

        splatData.set(value, bytesRead);
        bytesRead += value.length;

        if (vertexCount > lastVertexCount) {
            if (!isPly(splatData)) {
                worker.postMessage({
                    buffer: splatData.buffer,
                    vertexCount: Math.floor(bytesRead / rowLength),
                });
            }
            lastVertexCount = vertexCount;
        }
    }
    if (!stopLoading) {
        if (isPly(splatData)) {
            worker.postMessage({ ply: splatData.buffer, save: false });
        } else {
            worker.postMessage({
                buffer: splatData.buffer,
                vertexCount: Math.floor(bytesRead / rowLength),
            });
        }
    }
}

main().catch((err) => {
    document.getElementById("spinner").style.display = "none";
    document.getElementById("message").innerText = err.toString();
});
