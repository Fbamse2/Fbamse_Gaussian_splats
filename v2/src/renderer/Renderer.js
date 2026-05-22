import { state }    from '../app/State.js';
import { CAMERA }   from '../app/Config.js';
import { getProjectionMatrix } from '../utils/math.js';
import { initWorker }          from '../gaussian/GaussianWorker.js';
import { hideProgress }        from '../ui/LoadingScreen.js';

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
out float vLinearDepth;
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
    vLinearDepth = cam.z;   // cam.z is positive for objects in front (left-handed projection)
    vec2 vCenter = vec2(pos2d) / pos2d.w;
    gl_Position = vec4(vCenter + position.x * majorAxis / viewport + position.y * minorAxis / viewport, 0.0, 1.0);
}`.trim();

const fragmentShaderSource = `#version 300 es
precision highp float;
uniform int u_shaderMode;
uniform float u_depthScale;
in vec4 vColor;
in vec2 vPosition;
in float vLinearDepth;
out vec4 fragColor;
vec3 hue2rgb(float h) {
    h = fract(h);
    return clamp(vec3(
        abs(h*6.0-3.0)-1.0,
        2.0-abs(h*6.0-2.0),
        2.0-abs(h*6.0-4.0)), 0.0, 1.0);
}
void main () {
    float A = -dot(vPosition, vPosition);
    if (A < -4.0) discard;
    float B = exp(A) * vColor.a;
    vec3 rgb = vColor.rgb;
    float depth = clamp(vLinearDepth * u_depthScale, 0.0, 1.0);
    if (u_shaderMode == 1) {
        // Grayscale
        float g = dot(rgb, vec3(0.299, 0.587, 0.114));
        rgb = vec3(g);
    } else if (u_shaderMode == 2) {
        // Sepia
        float g = dot(rgb, vec3(0.299, 0.587, 0.114));
        rgb = vec3(g*1.2, g*0.85, g*0.55);
    } else if (u_shaderMode == 3) {
        // Rainbow Depth — blue near, cyan, green, yellow, red far
        rgb = hue2rgb(0.66 - depth * 0.66);
    } else if (u_shaderMode == 4) {
        // Thermal — cold (dark blue) far, hot (white) near
        float t = 1.0 - depth;
        if      (t < 0.25) rgb = mix(vec3(0.0,0.0,0.3), vec3(0.0,0.0,1.0), t/0.25);
        else if (t < 0.5)  rgb = mix(vec3(0.0,0.0,1.0), vec3(0.0,1.0,0.5), (t-0.25)/0.25);
        else if (t < 0.75) rgb = mix(vec3(0.0,1.0,0.5), vec3(1.0,0.7,0.0), (t-0.5)/0.25);
        else               rgb = mix(vec3(1.0,0.7,0.0), vec3(1.0,1.0,1.0), (t-0.75)/0.25);
    } else if (u_shaderMode == 5) {
        // Neon — extreme saturation + gamma lift
        float L = dot(rgb, vec3(0.299, 0.587, 0.114));
        rgb = clamp(mix(vec3(L), rgb*2.0, 2.8), 0.0, 1.0);
        rgb = pow(rgb, vec3(0.6));
    } else if (u_shaderMode == 6) {
        // Night Vision — green mono, scanlines, noise
        float g = dot(rgb, vec3(0.299, 0.587, 0.114));
        float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)))*43758.5453);
        g = clamp(g*1.6+(noise-0.5)*0.08, 0.0, 1.0);
        float scan = 0.8+0.2*sin(gl_FragCoord.y*3.14159*0.66);
        rgb = vec3(0.02, g*scan*1.15, 0.04);
    } else if (u_shaderMode == 7) {
        // Toon / Cel — posterize to 5 levels
        rgb = floor(rgb*5.0+0.5)/5.0;
    } else if (u_shaderMode == 8) {
        // X-Ray — depth-driven blue glow, brighter near edges of gaussians
        float g = dot(rgb, vec3(0.299, 0.587, 0.114));
        float edge = 1.0-exp(-dot(vPosition,vPosition)*0.4);
        rgb = (edge*0.6+(1.0-depth)*0.4+g*0.2) * vec3(0.45, 0.82, 1.0);
    } else if (u_shaderMode == 9) {
        // Psychedelic — hue-shifted by luma + depth
        float luma = dot(rgb, vec3(0.299, 0.587, 0.114));
        float h = fract(luma*1.2 + depth*0.7 + 0.1);
        rgb = hue2rgb(h) * (0.6 + luma*0.8);
    } else if (u_shaderMode == 10) {
        // Infrared glow — depth-colored halo effect
        vec3 base = hue2rgb(0.8 - depth*0.8);
        float luma = dot(rgb, vec3(0.299, 0.587, 0.114));
        rgb = mix(base, vec3(1.0), luma*0.4);
    } else if (u_shaderMode == 11) {
        // Fog — objects blend into white-blue haze with distance
        float fogAmt = smoothstep(0.3, 1.0, depth);
        rgb = mix(rgb, vec3(0.85, 0.9, 1.0), fogAmt);
    }
    fragColor = vec4(B * rgb, B);
}`.trim();

// ── Module-level WebGL state ──────────────────────────────────────
let gl, program, canvasEl;
let u_projection, u_viewport, u_focal, u_view, u_shaderMode, u_depthScale;
let vertexBuffer, indexBuffer, texture;
let shaderMode = parseInt(localStorage.getItem('shader-mode') || '0');
let depthScale = parseFloat(localStorage.getItem('depth-scale') || '0.02');

export const SHADER_MODES = ['Normal','Grayscale','Sepia','Rainbow Depth','Thermal','Neon','Night Vision','Toon','X-Ray','Psychedelic','Infrared','Fog'];

export function setShaderMode(mode) {
    shaderMode = mode;
    if (gl) {
        gl.useProgram(program);
        gl.uniform1i(u_shaderMode, mode);
    }
    state.viewDirty = true;
}

export function setDepthScale(scale) {
    depthScale = scale;
    if (gl) {
        gl.useProgram(program);
        gl.uniform1f(u_depthScale, scale);
    }
    state.viewDirty = true;
}

export function getDepthScale() { return depthScale; }

function _updateProjection() {
    const fx = CAMERA.fx * state.fovScale;
    const fy = CAMERA.fy * state.fovScale;
    gl.useProgram(program);
    gl.uniform2fv(u_focal, [fx, fy]);
    state.projectionMatrix = getProjectionMatrix(fx, fy, innerWidth, innerHeight);
    gl.uniform2fv(u_viewport, [innerWidth, innerHeight]);
    gl.uniformMatrix4fv(u_projection, false, state.projectionMatrix);
}

export function setFovScale(scale) {
    state.fovScale = scale;
    if (gl) _updateProjection();
    state.viewDirty = true;
}

export function getCanvas() { return canvasEl; }

function compileShader(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(sh));
    return sh;
}

export function init(canvas) {
    gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    canvasEl = canvas;
    if (!gl) throw new Error('WebGL2 not supported');

    program = gl.createProgram();
    gl.attachShader(program, compileShader(gl.VERTEX_SHADER,   vertexShaderSource));
    gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(program));
    gl.useProgram(program);

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE_MINUS_DST_ALPHA, gl.ONE, gl.ONE_MINUS_DST_ALPHA, gl.ONE);
    gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);

    u_projection = gl.getUniformLocation(program, 'projection');
    u_viewport   = gl.getUniformLocation(program, 'viewport');
    u_focal      = gl.getUniformLocation(program, 'focal');
    u_view       = gl.getUniformLocation(program, 'view');
    u_shaderMode = gl.getUniformLocation(program, 'u_shaderMode');
    u_depthScale = gl.getUniformLocation(program, 'u_depthScale');
    gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
    gl.uniform1i(u_shaderMode, shaderMode);
    gl.uniform1f(u_depthScale, depthScale);

    vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-2,-2, 2,-2, 2,2, -2,2]), gl.STATIC_DRAW);
    const a_position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(a_position);
    gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 0, 0);

    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    indexBuffer = gl.createBuffer();
    const a_index = gl.getAttribLocation(program, 'index');
    gl.enableVertexAttribArray(a_index);
    gl.bindBuffer(gl.ARRAY_BUFFER, indexBuffer);
    gl.vertexAttribIPointer(a_index, 1, gl.INT, false, 0, 0);
    gl.vertexAttribDivisor(a_index, 1);

    // Wire up worker message handlers
    initWorker({ onTex: handleTex, onSort: handleSort });

    resize(canvas);
    window.addEventListener('resize', () => resize(canvas));
}

function resize(canvas) {
    gl.canvas.width  = Math.round(innerWidth);
    gl.canvas.height = Math.round(innerHeight);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    _updateProjection();
}

function handleTex({ texdata, texwidth, texheight }) {
    // vertexCount is NOT updated here — only 'sort' updates it atomically with the index buffer.
    // Setting it here while the index buffer still has the old count causes GL_INVALID_OPERATION.
    gl.bindTexture(gl.TEXTURE_2D, texture);
    if (texwidth === state.texAllocWidth && texheight <= state.texAllocHeight) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, texwidth, texheight, gl.RGBA_INTEGER, gl.UNSIGNED_INT, texdata);
    } else {
        const allocH = Math.ceil(texheight * 1.5);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32UI, texwidth, allocH, 0, gl.RGBA_INTEGER, gl.UNSIGNED_INT, null);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, texwidth, texheight, gl.RGBA_INTEGER, gl.UNSIGNED_INT, texdata);
        state.texAllocWidth  = texwidth;
        state.texAllocHeight = allocH;
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
}

function handleSort({ depthIndex, vertexCount }) {
    state.vertexCount = vertexCount;
    gl.bindBuffer(gl.ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, depthIndex, gl.DYNAMIC_DRAW);
    hideProgress();
    state.viewDirty = true; // camera may have moved while sorting
}

export function draw() {
    gl.useProgram(program);
    gl.uniformMatrix4fv(u_view, false, state.viewMatrix);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, 4, state.vertexCount);
}

export function clearFrame() {
    gl.useProgram(program);
    gl.clear(gl.COLOR_BUFFER_BIT);
}
