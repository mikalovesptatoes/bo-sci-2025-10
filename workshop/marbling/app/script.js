/*
MIT License

Copyright (c) 2017 Pavel Dobryakov
Copyright (c) 2025 Masayuki Kohiyama

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

'use strict';

// Simulation section

const canvas = document.getElementsByTagName('canvas')[0];
resizeCanvas();

// SHADING（色素の影）, BLOOM（光沢）, SUNRAYS（背景からの太陽光線）などの使わない機能を削除し、デフォルト値を調整
let config = {
    SIM_RESOLUTION: 256,
    DYE_RESOLUTION: 1024,
    CAPTURE_RESOLUTION: 1024,
    DENSITY_DISSIPATION: 0,    // 密度拡散：大きいほど拡散し色素がすぐに消失　画像のα値を変動させるようなので使用しない
    VELOCITY_DISSIPATION: 0.2, // 速度拡散：大きいほど粘性で流れがすぐに停止
    PRESSURE: 0.8,             // 圧力：大きいほど液面が揺動
    PRESSURE_ITERATIONS: 20,   // 圧力場の反復更新回数：大きいほど非圧縮性流体を再現
    CURL: 0.01,                // 渦度：大きいほど乱流で渦が発生
    SPLAT_RADIUS: 0.1,         // インク（色素）を滴下するサイズ（画面サイズとの比）
    SPLAT_FORCE: 10,           // ドラッグしたときの力の大きさ
    COLORFUL: false,           // インクの色を時間更新
    COLOR_UPDATE_SPEED: 10,    // インクの色の更新速度
    PAUSED: true,                           // ポーズ中にインクの滴下、それ以外のときに流体の操作を行う
    FORE_COLOR: { r: 255, g: 0, b: 255 },   // インクの色 FORE_COLOR を追加
    BACK_COLOR: { r: 255, g: 255, b: 255 }, // 背景色は白色で固定
    FILTERS: {
        sketch: {
            enabled: false,
            edgeStrength: 0.8,
            edgeThreshold: 0.2,
            levels: 4,
            saturation: 0.8
        }
    }
}

function pointerPrototype () {
    this.id = -1;
    this.texcoordX = 0;
    this.texcoordY = 0;
    this.prevTexcoordX = 0;
    this.prevTexcoordY = 0;
    this.deltaX = 0;
    this.deltaY = 0;
    this.down = false;
    this.moved = false;
    this.color = [30, 0, 300];
}

let pointers = [];
let splatStack = [];
pointers.push(new pointerPrototype());

const { gl, ext } = getWebGLContext(canvas);

chooseResolutions(gl, ext, config);


// URL パラメータ取得の小ヘルパ
function getQueryFlag(name) {
  return new URLSearchParams(location.search).has(name);
}

/**
 * 端末能力と実行条件に応じて解像度を自動選択
 * - ベースは DYE=1024, SIM=256
 * - モバイルや能力不足では 512/128 → 256/64 へ段階的にフォールバック
 * - ?hires=1 が付与されている場合はフォールバック無効（強制高解像度）
 */
function chooseResolutions(gl, ext, config) {
  const FORCE_HIRES = getQueryFlag('hires'); // 例: ...?hires=1

  // 1) まず端末ハード制約を確認
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
  const maxRb  = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 4096;

  // 候補(上→下に安全) : [DYE, SIM]
  const ladder = [
    [1024, 256],
    [ 512, 128],
    [ 256,  64],
  ];

  // MANUAL_FILTERING になる環境（線形補間不可）はDYEを下げる方が安定
  const linOK = !!ext.supportLinearFiltering;

  // 2) まずハード制約でフィルタ
  const fitsHW = ([dye, sim]) =>
    dye <= maxTex && sim <= maxTex && dye <= maxRb && sim <= maxRb;

  let picked = ladder.find(([d, s]) => fitsHW([d, s])) || ladder[ladder.length - 1];

  // 3) モバイルは一段下げを基本（ただし ?hires=1 なら据え置き）
  if (!FORCE_HIRES && isMobile()) {
    const idx = Math.max(ladder.findIndex(([d, s]) => d === picked[0] && s === picked[1]), 0);
    picked = ladder[Math.min(idx + 1, ladder.length - 1)];
  }

  // 4) 線形補間なしは更に一段下げると安定（?hires=1 なら据え置き）
  if (!FORCE_HIRES && !linOK) {
    const idx = Math.max(ladder.findIndex(([d, s]) => d === picked[0] && s === picked[1]), 0);
    picked = ladder[Math.min(idx + 1, ladder.length - 1)];
  }

  // 5) 一旦セット
  config.DYE_RESOLUTION = picked[0];
  config.SIM_RESOLUTION = picked[1];
}

/**
 * 軽い計測で負荷が高そうなら更にダウングレード（任意/簡易）
 * - 直近フレーム dt を見て 30fps 相当より遅ければ一段下げる
 * - 既に最下段なら何もしない
 */
function maybeDowngradeOnPerf(config) {
  // しきい値: 1フレーム33ms相当
  const SLOW_DT = 1.0 / 30.0;
  const ladder = [
    [1024, 256],
    [ 512, 128],
    [ 256,  64],
  ];

  const idx = ladder.findIndex(([d, s]) => d === config.DYE_RESOLUTION && s === config.SIM_RESOLUTION);
  if (idx < 0 || idx === ladder.length - 1) return; // 未特定 or もう最下段

  if (avgDt > SLOW_DT) { // avgDt は下で更新
    const next = ladder[idx + 1];
    config.DYE_RESOLUTION = next[0];
    config.SIM_RESOLUTION = next[1];
    initFramebuffers();
  }
}


// startGUI();
setupDomControls();

function startGUI () {
    // dat.GUI UIは無効化
}

function setupDomControls() {
  // --- 2ボタンでモード切替 ---
  const btnPaint = document.getElementById('ctrl-mode-paint'); // 「絵の具を塗る」
  const btnFluid = document.getElementById('ctrl-mode-fluid'); // 「流体を動かす」

  function updateModeButtons() {
    const paintActive = !!config.PAUSED; // PAUSED=true => 塗るモード
    if (btnPaint) {
      btnPaint.classList.toggle('is-active', paintActive);
      btnPaint.setAttribute('aria-pressed', paintActive ? 'true' : 'false');
    }
    if (btnFluid) {
      btnFluid.classList.toggle('is-active', !paintActive);
      btnFluid.setAttribute('aria-pressed', !paintActive ? 'true' : 'false');
    }
  }
  function setMode(paintMode) {
    const prev = config.PAUSED;
    config.PAUSED = !!paintMode;
    updateModeButtons();
    if (prev !== config.PAUSED) {
      document.dispatchEvent(new CustomEvent(config.PAUSED ? 'fluid:pause' : 'fluid:play'));
    }
  }
  if (btnPaint) btnPaint.addEventListener('click', () => setMode(true));
  if (btnFluid) btnFluid.addEventListener('click', () => setMode(false));
  updateModeButtons(); // 初期反映

  // --- ブラシ ---
  const brush = document.getElementById('ctrl-brush');
  if (brush) {
    brush.value = config.SPLAT_RADIUS;
    brush.addEventListener('input', () => {
      config.SPLAT_RADIUS = parseFloat(brush.value);
    });
  }

  // --- 色 ---
  const foreColorInput = document.getElementById('ctrl-fore-color');
  function rgbToHex(r,g,b) {
    return '#' + [r,g,b].map(x => {
      const v = Math.max(0, Math.min(255, Math.round(Number(x))));
      return v.toString(16).padStart(2,'0');
    }).join('');
  }
  function hexToRgb(hex) {
    const s = hex.replace('#','').trim();
    if (s.length !== 6) return null;
    const r = parseInt(s.slice(0,2), 16);
    const g = parseInt(s.slice(2,4), 16);
    const b = parseInt(s.slice(4,6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b };
  }
  if (foreColorInput) {
    // 初期同期
    foreColorInput.value = rgbToHex(config.FORE_COLOR.r, config.FORE_COLOR.g, config.FORE_COLOR.b);
    foreColorInput.addEventListener('input', () => {
      const parsed = hexToRgb(foreColorInput.value);
      if (parsed) {
        config.FORE_COLOR = parsed;
        localStorage.setItem('lastColorHex', foreColorInput.value);
        if (PALETTES[paletteName].includes(foreColorInput.value)) {
          updateSwatchActive(foreColorInput.value);
        } else {
          updateSwatchActive(null);
        }
        document.dispatchEvent(new CustomEvent('color:change'));
      }
    });
  }

  // --- パレット（既存DOMを使う） ---
  const PALETTES = {
    Basic: ['#FF3B30','#FF9500','#FFCC00','#34C759','#007AFF','#5856D6','#FF2D55'],
    Pastel: ['#FFD1DC','#B5EAD7','#C7CEEA','#FFDAC1','#E2F0CB','#B5B9FF','#FFB7B2','#FF9CEE','#B28DFF'],
    Warm:   ['#FF3B30','#FF9500','#FFCC00','#FFB7B2','#FFD1DC','#FF9CEE','#FFDAC1','#FF2D55','#FF5E3A'],
    Cool:   ['#007AFF','#34C759','#5856D6','#B5EAD7','#B5B9FF','#C7CEEA','#E2F0CB','#A0CED9','#5AC8FA']
  };
  const COLOR_NAMES = {
    '#000000':'黒','#ffffff':'白','#FF3B30':'赤','#FF9500':'オレンジ','#FFCC00':'黄','#34C759':'緑','#007AFF':'青','#5856D6':'紫','#FF2D55':'ピンク',
    '#FFD1DC':'パステルピンク','#B5EAD7':'パステルグリーン','#C7CEEA':'パステルブルー','#FFDAC1':'パステルオレンジ','#E2F0CB':'パステルイエロー','#B5B9FF':'パステルパープル','#FFB7B2':'パステルレッド','#FF9CEE':'パステルライトピンク','#B28DFF':'パステルバイオレット',
    '#FF5E3A':'ライトオレンジ','#A0CED9':'ライトブルー','#5AC8FA':'ライトシアン'
  };

  const paletteSelect = document.getElementById('palette-select');
  const swatchesList  = document.getElementById('swatches');

  let paletteName  = localStorage.getItem('paletteName')  || 'Basic';
  let lastColorHex = localStorage.getItem('lastColorHex') || null;

  if (paletteSelect) paletteSelect.value = paletteName;

  function renderSwatches(palette, selectedHex) {
    if (!swatchesList) return;
    swatchesList.innerHTML = '';
    PALETTES[palette].forEach(hex => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swatch';
      btn.setAttribute('role','option');
      btn.setAttribute('tabindex','0');
      btn.setAttribute('aria-label', COLOR_NAMES[hex] || hex);
      btn.setAttribute('data-color', hex);
      btn.style.setProperty('--swatch-color', hex);
      btn.setAttribute('aria-selected', selectedHex === hex ? 'true' : 'false');
      if (selectedHex === hex) btn.classList.add('is-active');
      btn.addEventListener('click', () => {
        if (!foreColorInput) return;
        foreColorInput.value = hex;
        const rgb = hexToRgb(hex);
        if (rgb) {
          config.FORE_COLOR = rgb;
          localStorage.setItem('lastColorHex', hex);
          updateSwatchActive(hex);
          document.dispatchEvent(new CustomEvent('color:change'));
        }
      });
      btn.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault(); btn.nextElementSibling?.focus();
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault(); btn.previousElementSibling?.focus();
        }
        if (e.key === 'Enter' || e.key === ' ') btn.click();
      });
      swatchesList.appendChild(btn);
    });
  }

  function updateSwatchActive(hex) {
    if (!swatchesList) return;
    Array.from(swatchesList.children).forEach(btn => {
      const btnHex = btn.getAttribute('data-color');
      const active = (btnHex === hex);
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  if (paletteSelect) {
    paletteSelect.addEventListener('change', () => {
      paletteName = paletteSelect.value;
      localStorage.setItem('paletteName', paletteName);
      let currentHex = foreColorInput ? foreColorInput.value : null;
      if (!currentHex || !PALETTES[paletteName].includes(currentHex)) {
        currentHex = PALETTES[paletteName][0];
        if (foreColorInput) foreColorInput.value = currentHex;
        const rgb = hexToRgb(currentHex);
        if (rgb) config.FORE_COLOR = rgb;
      }
      renderSwatches(paletteName, currentHex);
      updateSwatchActive(currentHex);
      document.dispatchEvent(new CustomEvent('color:change'));
    });
  }

  // 初期描画
  if (foreColorInput) {
    let initialHex = lastColorHex || foreColorInput.value || '#FF3B30';
    if (!PALETTES[paletteName].includes(initialHex)) initialHex = PALETTES[paletteName][0];
    foreColorInput.value = initialHex;
    const rgb = hexToRgb(initialHex);
    if (rgb) config.FORE_COLOR = rgb;
    renderSwatches(paletteName, initialHex);
    updateSwatchActive(initialHex);
  }

  // --- ヘルプ ---
  const helpBtn = document.getElementById('help-btn');
  if (helpBtn) {
    helpBtn.addEventListener('click', () => {
      if (window.Tour && window.Tour.active) return;
      if (window.Tour && typeof window.Tour.start === 'function') {
        window.Tour.start('intro'); return;
      }
      let tries = 0;
      const iv = setInterval(() => {
        if (window.Tour && typeof window.Tour.start === 'function') {
          clearInterval(iv); window.Tour.start('intro');
        } else if (++tries > 20) {
          clearInterval(iv); console.warn('Tour is not loaded yet.');
        }
      }, 50);
    });
  }

  // --- 保存 ---
  const saveBtn = document.getElementById('ctrl-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      captureScreenshot();
      document.dispatchEvent(new CustomEvent('export:click'));
    });
  }
}

function getWebGLContext (canvas) {
    const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };

    let gl = canvas.getContext('webgl2', params);
    const isWebGL2 = !!gl;
    if (!isWebGL2)
        gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);

    let halfFloat;
    let supportLinearFiltering;
    if (isWebGL2) {
        gl.getExtension('EXT_color_buffer_float');
        supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
    } else {
        halfFloat = gl.getExtension('OES_texture_half_float');
        supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
    }

    gl.clearColor(0.0, 0.0, 0.0, 1.0);

    const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat.HALF_FLOAT_OES;
    let formatRGBA;
    let formatRG;
    let formatR;

    if (isWebGL2)
    {
        formatRGBA = getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType);
        formatRG = getSupportedFormat(gl, gl.RG16F, gl.RG, halfFloatTexType);
        formatR = getSupportedFormat(gl, gl.R16F, gl.RED, halfFloatTexType);
    }
    else
    {
        formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
        formatRG = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
        formatR = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
    }

    ga('send', 'event', isWebGL2 ? 'webgl2' : 'webgl', formatRGBA == null ? 'not supported' : 'supported');

    return {
        gl,
        ext: {
            formatRGBA,
            formatRG,
            formatR,
            halfFloatTexType,
            supportLinearFiltering
        }
    };
}

function getSupportedFormat (gl, internalFormat, format, type)
{
    if (!supportRenderTextureFormat(gl, internalFormat, format, type))
    {
        switch (internalFormat)
        {
            case gl.R16F:
                return getSupportedFormat(gl, gl.RG16F, gl.RG, type);
            case gl.RG16F:
                return getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type);
            default:
                return null;
        }
    }

    return {
        internalFormat,
        format
    }
}

function supportRenderTextureFormat (gl, internalFormat, format, type) {
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    return status == gl.FRAMEBUFFER_COMPLETE;
}

function startGUI () {
    // dat.GUI UIは無効化
}

function isMobile () {
    return /Mobi|Android/i.test(navigator.userAgent);
}

function captureScreenshot () {
    let res = getResolution(config.CAPTURE_RESOLUTION);
    let target = createFBO(res.width, res.height, ext.formatRGBA.internalFormat, ext.formatRGBA.format, ext.halfFloatTexType, gl.NEAREST);
    renderScreenShot(target);

    let texture = framebufferToTexture(target);
    texture = normalizeTexture(texture, target.width, target.height);

    let captureCanvas = textureToCanvas(texture, target.width, target.height);
    let datauri = captureCanvas.toDataURL();
    downloadURI('fluid.png', datauri);
    URL.revokeObjectURL(datauri);
}

function framebufferToTexture (target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    let length = target.width * target.height * 4;
    let texture = new Float32Array(length);
    gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.FLOAT, texture);
    return texture;
}

function normalizeTexture (texture, width, height) {
    let result = new Uint8Array(texture.length);
    let id = 0;
    for (let i = height - 1; i >= 0; i--) {
        for (let j = 0; j < width; j++) {
            let nid = i * width * 4 + j * 4;
            result[nid + 0] = clamp01(texture[id + 0]) * 255;
            result[nid + 1] = clamp01(texture[id + 1]) * 255;
            result[nid + 2] = clamp01(texture[id + 2]) * 255;
            result[nid + 3] = clamp01(texture[id + 3]) * 255;
            id += 4;
        }
    }
    return result;
}

function clamp01 (input) {
    return Math.min(Math.max(input, 0), 1);
}

function textureToCanvas (texture, width, height) {
    let captureCanvas = document.createElement('canvas');
    let ctx = captureCanvas.getContext('2d');
    captureCanvas.width = width;
    captureCanvas.height = height;

    let imageData = ctx.createImageData(width, height);
    imageData.data.set(texture);
    ctx.putImageData(imageData, 0, 0);

    return captureCanvas;
}

function downloadURI (filename, uri) {
    let link = document.createElement('a');
    link.download = filename;
    link.href = uri;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

class Material {
    constructor (vertexShader, fragmentShaderSource) {
        this.vertexShader = vertexShader;
        this.fragmentShaderSource = fragmentShaderSource;
        this.programs = [];
        this.activeProgram = null;
        this.uniforms = [];
    }

    setKeywords (keywords) {
        let hash = 0;
        for (let i = 0; i < keywords.length; i++)
            hash += hashCode(keywords[i]);

        let program = this.programs[hash];
        if (program == null)
        {
            let fragmentShader = compileShader(gl.FRAGMENT_SHADER, this.fragmentShaderSource, keywords);
            program = createProgram(this.vertexShader, fragmentShader);
            this.programs[hash] = program;
        }

        if (program == this.activeProgram) return;

        this.uniforms = getUniforms(program);
        this.activeProgram = program;
    }

    bind () {
        gl.useProgram(this.activeProgram);
    }
}

class Program {
    constructor (vertexShader, fragmentShader) {
        this.uniforms = {};
        this.program = createProgram(vertexShader, fragmentShader);
        this.uniforms = getUniforms(this.program);
    }

    bind () {
        gl.useProgram(this.program);
    }
}

function createProgram (vertexShader, fragmentShader) {
    let program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        console.trace(gl.getProgramInfoLog(program));

    return program;
}

function getUniforms (program) {
    let uniforms = [];
    let uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
        let uniformName = gl.getActiveUniform(program, i).name;
        uniforms[uniformName] = gl.getUniformLocation(program, uniformName);
    }
    return uniforms;
}

function compileShader (type, source, keywords) {
    source = addKeywords(source, keywords);

    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        console.trace(gl.getShaderInfoLog(shader));

    return shader;
};

function addKeywords (source, keywords) {
    if (keywords == null) return source;
    let keywordsString = '';
    keywords.forEach(keyword => {
        keywordsString += '#define ' + keyword + '\n';
    });
    return keywordsString + source;
}

const baseVertexShader = compileShader(gl.VERTEX_SHADER, `
    precision highp float;

    attribute vec2 aPosition;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform vec2 texelSize;

    void main () {
        vUv = aPosition * 0.5 + 0.5;
        vL = vUv - vec2(texelSize.x, 0.0);
        vR = vUv + vec2(texelSize.x, 0.0);
        vT = vUv + vec2(0.0, texelSize.y);
        vB = vUv - vec2(0.0, texelSize.y);
        gl_Position = vec4(aPosition, 0.0, 1.0);
    }
`);

const blurVertexShader = compileShader(gl.VERTEX_SHADER, `
    precision highp float;

    attribute vec2 aPosition;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    uniform vec2 texelSize;

    void main () {
        vUv = aPosition * 0.5 + 0.5;
        float offset = 1.33333333;
        vL = vUv - texelSize * offset;
        vR = vUv + texelSize * offset;
        gl_Position = vec4(aPosition, 0.0, 1.0);
    }
`);

const blurShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    uniform sampler2D uTexture;

    void main () {
        vec4 sum = texture2D(uTexture, vUv) * 0.29411764;
        sum += texture2D(uTexture, vL) * 0.35294117;
        sum += texture2D(uTexture, vR) * 0.35294117;
        gl_FragColor = sum;
    }
`);

const copyShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    uniform sampler2D uTexture;

    void main () {
        gl_FragColor = texture2D(uTexture, vUv);
    }
`);

const clearShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    uniform sampler2D uTexture;
    uniform float value;

    void main () {
        gl_FragColor = value * texture2D(uTexture, vUv);
    }
`);

const colorShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;

    uniform vec4 color;

    void main () {
        gl_FragColor = color;
    }
`);

const checkerboardShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform float aspectRatio;

    #define SCALE 25.0

    void main () {
        vec2 uv = floor(vUv * SCALE * vec2(aspectRatio, 1.0));
        float v = mod(uv.x + uv.y, 2.0);
        v = v * 0.1 + 0.8;
        gl_FragColor = vec4(vec3(v), 1.0);
    }
`);

const displayShaderSource = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uTexture;
    uniform sampler2D uDithering;
    uniform vec2 ditherScale;
    uniform vec2 texelSize;

    vec3 linearToGamma (vec3 color) {
        color = max(color, vec3(0));
        return max(1.055 * pow(color, vec3(0.416666667)) - 0.055, vec3(0));
    }

    void main () {
        vec3 c = texture2D(uTexture, vUv).rgb;
        float a = max(c.r, max(c.g, c.b));
        gl_FragColor = vec4(c, a);
    }
`;

const splatShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTarget;
    uniform float aspectRatio;
    uniform vec3 color;
    uniform vec2 point;
    uniform float radius;

    void main () {
        vec2 p = vUv - point.xy;
        p.x *= aspectRatio;
        vec3 splat = exp(-dot(p, p) / radius) * color;
        vec3 base = texture2D(uTarget, vUv).xyz;
        gl_FragColor = vec4(base + splat, 1.0);
    }
`);

// CMY色空間を用いてインクが減法混色するように改良
const splatCMYShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTarget;
    uniform float aspectRatio;
    uniform vec3 color;
    uniform vec2 point;
    uniform float radius;

    void main () {
        vec2 p = vUv - point.xy;
        p.x *= aspectRatio;

        // vec3 splat = exp(-dot(p, p) / radius) * color; // ガウス分布型
        // vec3 base = texture2D(uTarget, vUv).rgb;
        // gl_FragColor = vec4(base + splat, 1.0);

        // vec3 splat = ((length(p) <= radius*20.) ? 1.0 : 0.0) * color; // 円
        // vec3 base = texture2D(uTarget, vUv).rgb;
        // vec3 c = max(base, splat);
        // gl_FragColor = vec4(c, 1.0);

        // vec3 splat = ((length(p) <= radius*20.) ? 1.0 : 0.0) * color; // 円、擬似ガンマ補正
        // vec3 base = texture2D(uTarget, vUv).rgb;
        // vec3 splatl = pow(splat, vec3(2.2)); // SRGB to linear
        // vec3 basel = pow(base, vec3(2.2)); // SRGB to linear
        // vec3 c = pow(mix(basel, splatl, 0.5), vec3(1.0/2.2)); // linear to SRGB
        // gl_FragColor = vec4(c, 1.0);

        // float splatA = (length(p) <= radius*20.) ? 1.0 : 0.0; // 円、CMY変換
        // vec3 splat = splatA * (color);
        // vec3 splatCMY = vec3(1.0) - splat;
        // float baseA = texture2D(uTarget, vUv).a;
        // vec3 base = texture2D(uTarget, vUv).rgb;
        // vec3 baseCMY = vec3(1.0) - base;
        // vec3 cCMY;
        // float cA;
        // if (baseA > 0.01 && splatA < 0.01) {
        //     cCMY = baseCMY;
        //     cA = baseA;
        // } else {
        //     cCMY = splatCMY;
        //     cA = splatA;
        // }
        // vec3 c = vec3(1.0) - cCMY;
        // gl_FragColor = vec4(c, cA);

        float splatA = (length(p) <= radius*20.) ? 1.0 : 0.0; // 円、CMYK変換
        vec3 splat = (splatA > 0.01) ? color : vec3(0.0);
        float splatK = 1.0 - max(max(splat.r, splat.g), splat.b);
        float splatInvK = 1.0 - splatK;
        vec3 splatCMY = (splatInvK > 0.01) ? (vec3(1.0) - splat - vec3(splatK)) / splatInvK : vec3(1.0);
        float baseA = texture2D(uTarget, vUv).a;
        vec3 base = texture2D(uTarget, vUv).rgb;
        float baseK = 1.0 - max(max(base.r, base.g), base.b);
        float baseInvK = 1.0 - baseK;
        vec3 baseCMY = (baseInvK > 0.01) ? (vec3(1.0) - base - vec3(baseK)) / baseInvK : vec3(1.0);
        vec3 cCMY;
        float cK;
        float cA;
        if (baseA > 0.01 && splatA < 0.01) {
            cCMY = baseCMY;
            cK = baseK;
            cA = baseA;
        } else {
            cCMY = splatCMY;
            cK = splatK;
            cA = splatA;
        }
        vec3 c = clamp((vec3(1.0) - cCMY) * vec3(1.0 - cK), 0.0, 1.0);
        gl_FragColor = vec4(c, cA);
    }
`);

const advectionShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 texelSize;
    uniform vec2 dyeTexelSize;
    uniform float dt;
    uniform float dissipation;

    vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
        vec2 st = uv / tsize - 0.5;

        vec2 iuv = floor(st);
        vec2 fuv = fract(st);

        vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
        vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
        vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
        vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);

        return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
    }

    void main () {
    #ifdef MANUAL_FILTERING
        vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
        vec4 result = bilerp(uSource, coord, dyeTexelSize);
    #else
        vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
        vec4 result = texture2D(uSource, coord);
    #endif
        float decay = 1.0 + dissipation * dt;
        gl_FragColor = result / decay;
    }`,
    ext.supportLinearFiltering ? null : ['MANUAL_FILTERING']
);

const divergenceShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uVelocity;

    void main () {
        float L = texture2D(uVelocity, vL).x;
        float R = texture2D(uVelocity, vR).x;
        float T = texture2D(uVelocity, vT).y;
        float B = texture2D(uVelocity, vB).y;

        vec2 C = texture2D(uVelocity, vUv).xy;
        if (vL.x < 0.0) { L = -C.x; }
        if (vR.x > 1.0) { R = -C.x; }
        if (vT.y > 1.0) { T = -C.y; }
        if (vB.y < 0.0) { B = -C.y; }

        float div = 0.5 * (R - L + T - B);
        gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
    }
`);

const curlShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uVelocity;

    void main () {
        float L = texture2D(uVelocity, vL).y;
        float R = texture2D(uVelocity, vR).y;
        float T = texture2D(uVelocity, vT).x;
        float B = texture2D(uVelocity, vB).x;
        float vorticity = R - L - T + B;
        gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
    }
`);

const vorticityShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uVelocity;
    uniform sampler2D uCurl;
    uniform float curl;
    uniform float dt;

    void main () {
        float L = texture2D(uCurl, vL).x;
        float R = texture2D(uCurl, vR).x;
        float T = texture2D(uCurl, vT).x;
        float B = texture2D(uCurl, vB).x;
        float C = texture2D(uCurl, vUv).x;

        vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
        force /= length(force) + 0.0001;
        force *= curl * C;
        force.y *= -1.0;

        vec2 velocity = texture2D(uVelocity, vUv).xy;
        velocity += force * dt;
        velocity = min(max(velocity, -1000.0), 1000.0);
        gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
`);

const pressureShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;

    void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        float C = texture2D(uPressure, vUv).x;
        float divergence = texture2D(uDivergence, vUv).x;
        float pressure = (L + R + B + T - divergence) * 0.25;
        gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
    }
`);

const gradientSubtractShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;

    void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        vec2 velocity = texture2D(uVelocity, vUv).xy;
        velocity.xy -= vec2(R - L, T - B);
        gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
`);

const blit = (() => {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    return (target, clear = false) => {
        if (target == null)
        {
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        else
        {
            gl.viewport(0, 0, target.width, target.height);
            gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
        }
        if (clear)
        {
            gl.clearColor(0.0, 0.0, 0.0, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
        // CHECK_FRAMEBUFFER_STATUS();
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
})();

function CHECK_FRAMEBUFFER_STATUS () {
    let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status != gl.FRAMEBUFFER_COMPLETE)
        console.trace("Framebuffer error: " + status);
}

let dye;
let velocity;
let divergence;
let curl;
let pressure;
//let ditheringTexture = createTextureAsync('LDR_LLL1_0.png');

const blurProgram            = new Program(blurVertexShader, blurShader);
const copyProgram            = new Program(baseVertexShader, copyShader);
const clearProgram           = new Program(baseVertexShader, clearShader);
const colorProgram           = new Program(baseVertexShader, colorShader);
const checkerboardProgram    = new Program(baseVertexShader, checkerboardShader);
const splatProgram           = new Program(baseVertexShader, splatShader);
const splatCMYProgram        = new Program(baseVertexShader, splatCMYShader);
const advectionProgram       = new Program(baseVertexShader, advectionShader);
const divergenceProgram      = new Program(baseVertexShader, divergenceShader);
const curlProgram            = new Program(baseVertexShader, curlShader);
const vorticityProgram       = new Program(baseVertexShader, vorticityShader);
const pressureProgram        = new Program(baseVertexShader, pressureShader);
const gradienSubtractProgram = new Program(baseVertexShader, gradientSubtractShader);

const displayMaterial = new Material(baseVertexShader, displayShaderSource);

// スケッチフィルター用のシェーダーとプログラムを追加
const sketchPostShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform vec2 texelSize;
    uniform float edgeStrength;
    uniform float edgeThreshold;
    uniform int levels;
    uniform float saturation;

    float luminance(vec3 c) {
        return dot(c, vec3(0.299, 0.587, 0.114));
    }

    void main() {
        vec3 c = texture2D(uTexture, vUv).rgb;
        float l = luminance(c);

        // 近傍8点でSobel
        float gx = 0.0;
        float gy = 0.0;
        for(int i=-1;i<=1;i++) {
            for(int j=-1;j<=1;j++) {
                vec2 offset = vec2(float(i), float(j)) * texelSize;
                float sample = luminance(texture2D(uTexture, vUv + offset).rgb);
                if(i==-1) gx -= sample * float(j==0?2:1);
                if(i==1)  gx += sample * float(j==0?2:1);
                if(j==-1) gy -= sample * float(i==0?2:1);
                if(j==1)  gy += sample * float(i==0?2:1);
            }
        }
        float edge = length(vec2(gx, gy)) * edgeStrength;
        float edgeMask = smoothstep(edgeThreshold, 1.0, edge);

        // ポスタライズ
        vec3 post = floor(c * float(levels)) / float(levels);

        // 彩度調整
        float mean = dot(post, vec3(0.333));
        post = mix(vec3(mean), post, saturation);

        // エッジ合成（黒線）
        post = mix(post, vec3(0.0), edgeMask);

        // --- アルファ処理修正 ---
        float a = max(max(c.r, c.g), c.b);
        gl_FragColor = vec4(post, a);
    }
`);
const sketchProgram = new Program(baseVertexShader, sketchPostShader);

let postFBO; // グローバル宣言

function initFramebuffers () {
    let simRes = getResolution(config.SIM_RESOLUTION);
    let dyeRes = getResolution(config.DYE_RESOLUTION);

    const texType = ext.halfFloatTexType;
    const rgba    = ext.formatRGBA;
    const rg      = ext.formatRG;
    const r       = ext.formatR;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    gl.disable(gl.BLEND);

    if (dye == null)
        dye = createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
    else
        dye = resizeDoubleFBO(dye, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);

    if (velocity == null)
        velocity = createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
    else
        velocity = resizeDoubleFBO(velocity, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);

    divergence = createFBO      (simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    curl       = createFBO      (simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    pressure   = createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);

    // postFBOのリサイズ
    let width = gl.drawingBufferWidth;
    let height = gl.drawingBufferHeight;
    if (!postFBO || postFBO.width !== width || postFBO.height !== height) {
        postFBO = createFBO(width, height, ext.formatRGBA.internalFormat, ext.formatRGBA.format, ext.halfFloatTexType, gl.NEAREST);
    }
}

function createFBO (w, h, internalFormat, format, type, param) {
    gl.activeTexture(gl.TEXTURE0);
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    let texelSizeX = 1.0 / w;
    let texelSizeY = 1.0 / h;

    return {
        texture,
        fbo,
        width: w,
        height: h,
        texelSizeX,
        texelSizeY,
        attach (id) {
            gl.activeTexture(gl.TEXTURE0 + id);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            return id;
        }
    };
}

function createDoubleFBO (w, h, internalFormat, format, type, param) {
    let fbo1 = createFBO(w, h, internalFormat, format, type, param);
    let fbo2 = createFBO(w, h, internalFormat, format, type, param);

    return {
        width: w,
        height: h,
        texelSizeX: fbo1.texelSizeX,
        texelSizeY: fbo1.texelSizeY,
        get read () {
            return fbo1;
        },
        set read (value) {
            fbo1 = value;
        },
        get write () {
            return fbo2;
        },
        set write (value) {
            fbo2 = value;
        },
        swap () {
            let temp = fbo1;
            fbo1 = fbo2;
            fbo2 = temp;
        }
    }
}

function resizeFBO (target, w, h, internalFormat, format, type, param) {
    let newFBO = createFBO(w, h, internalFormat, format, type, param);
    copyProgram.bind();
    gl.uniform1i(copyProgram.uniforms.uTexture, target.attach(0));
    blit(newFBO);
    return newFBO;
}

function resizeDoubleFBO (target, w, h, internalFormat, format, type, param) {
    if (target.width == w && target.height == h)
        return target;
    target.read = resizeFBO(target.read, w, h, internalFormat, format, type, param);
    target.write = createFBO(w, h, internalFormat, format, type, param);
    target.width = w;
    target.height = h;
    target.texelSizeX = 1.0 / w;
    target.texelSizeY = 1.0 / h;
    return target;
}

function createTextureAsync (url) {
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255]));

    let obj = {
        texture,
        width: 1,
        height: 1,
        attach (id) {
            gl.activeTexture(gl.TEXTURE0 + id);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            return id;
        }
    };

    let image = new Image();
    image.onload = () => {
        obj.width = image.width;
        obj.height = image.height;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    };
    image.src = url;

    return obj;
}

function updateKeywords () {
    let displayKeywords = [];
    displayMaterial.setKeywords(displayKeywords);
}

updateKeywords();
initFramebuffers();
// multipleSplats(parseInt(Math.random() * 20) + 5);

let lastUpdateTime = Date.now();
let colorUpdateTimer = 0.0;

// 追加: dt の移動平均（軽量）
let avgDt = 1/60;
const alphaDt = 0.1; // 平滑化の強さ

update();

function update () {
    const dt = calcDeltaTime();
    if (resizeCanvas())
        initFramebuffers();
    updateColors(dt);
    applyInputs();
    if (!config.PAUSED)
        step(dt);
    render(null);
    requestAnimationFrame(update);
}

function calcDeltaTime () {
    let now = Date.now();
    let dt = (now - lastUpdateTime) / 1000;
    dt = Math.min(dt, 0.016666);
    lastUpdateTime = now;
    return dt;
}

function resizeCanvas () {
    let width = scaleByPixelRatio(canvas.clientWidth);
    let height = scaleByPixelRatio(canvas.clientHeight);
    if (canvas.width != width || canvas.height != height) {
        canvas.width = width;
        canvas.height = height;
        return true;
    }
    return false;
}

function updateColors (dt) {
    if (!config.COLORFUL) return;

    colorUpdateTimer += dt * config.COLOR_UPDATE_SPEED;
    if (colorUpdateTimer >= 1) {
        colorUpdateTimer = wrap(colorUpdateTimer, 0, 1);
        pointers.forEach(p => {
            p.color = generateColor();
        });
    }
}

function applyInputs () {
    if (splatStack.length > 0)
        multipleSplats(splatStack.pop());

    pointers.forEach(p => {
        if (p.moved) {
            p.moved = false;
            splatPointer(p);
        }
    });
}

function step (dt) {
    gl.disable(gl.BLEND);

    curlProgram.bind();
    gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(curl);

    vorticityProgram.bind();
    gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1));
    gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
    gl.uniform1f(vorticityProgram.uniforms.dt, dt);
    blit(velocity.write);
    velocity.swap();

    divergenceProgram.bind();
    gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(divergence);

    clearProgram.bind();
    gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
    gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE);
    blit(pressure.write);
    pressure.swap();

    pressureProgram.bind();
    gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
        blit(pressure.write);
        pressure.swap();
    }

    gradienSubtractProgram.bind();
    gl.uniform2f(gradienSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(gradienSubtractProgram.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(gradienSubtractProgram.uniforms.uVelocity, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();

    advectionProgram.bind();
    gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    if (!ext.supportLinearFiltering)
        gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    let velocityId = velocity.read.attach(0);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId);
    gl.uniform1i(advectionProgram.uniforms.uSource, velocityId);
    gl.uniform1f(advectionProgram.uniforms.dt, dt);
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
    blit(velocity.write);
    velocity.swap();

    if (!ext.supportLinearFiltering)
        gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
    blit(dye.write);
    dye.swap();
}

function render (target) {
    if (target == null) {
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.BLEND);
    }
    else {
        gl.disable(gl.BLEND);
    }

    drawColor(target, normalizeColor(config.BACK_COLOR));
    drawDisplay(target);
}

// 背景色を含めてスクリーンショットを取る機能を追加
function renderScreenShot (target) {
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);

    drawColor(target, normalizeColor(config.BACK_COLOR));
    // スケッチ風フィルター反映
    drawDisplay(target);
}

function drawColor (target, color) {
    colorProgram.bind();
    gl.uniform4f(colorProgram.uniforms.color, color.r, color.g, color.b, 1);
    blit(target);
}

function drawCheckerboard (target) {
    checkerboardProgram.bind();
    gl.uniform1f(checkerboardProgram.uniforms.aspectRatio, canvas.width / canvas.height);
    blit(target);
}

function drawDisplay (target) {
    let width = target == null ? gl.drawingBufferWidth : target.width;
    let height = target == null ? gl.drawingBufferHeight : target.height;

    // スケッチ風フィルター
    if (config.FILTERS.sketch.enabled && config.PAUSED) {
        // dye.read → postFBO
        copyProgram.bind();
        gl.uniform1i(copyProgram.uniforms.uTexture, dye.read.attach(0));
        blit(postFBO);

        sketchProgram.bind();
        gl.uniform1i(sketchProgram.uniforms.uTexture, postFBO.attach(0));
        // --- texelSize を postFBO の texel サイズに修正 ---
        gl.uniform2f(sketchProgram.uniforms.texelSize, postFBO.texelSizeX, postFBO.texelSizeY);
        gl.uniform1f(sketchProgram.uniforms.edgeStrength, config.FILTERS.sketch.edgeStrength);
        gl.uniform1f(sketchProgram.uniforms.edgeThreshold, config.FILTERS.sketch.edgeThreshold);
        gl.uniform1i(sketchProgram.uniforms.levels, config.FILTERS.sketch.levels);
        gl.uniform1f(sketchProgram.uniforms.saturation, config.FILTERS.sketch.saturation);
        blit(target);
    } else {
        displayMaterial.bind();
        gl.uniform1i(displayMaterial.uniforms.uTexture, dye.read.attach(0));
        blit(target);
    }
}

function blur (target, temp, iterations) {
    blurProgram.bind();
    for (let i = 0; i < iterations; i++) {
        gl.uniform2f(blurProgram.uniforms.texelSize, target.texelSizeX, 0.0);
        gl.uniform1i(blurProgram.uniforms.uTexture, target.attach(0));
        blit(temp);

        gl.uniform2f(blurProgram.uniforms.texelSize, 0.0, target.texelSizeY);
        gl.uniform1i(blurProgram.uniforms.uTexture, temp.attach(0));
        blit(target);
    }
}

// ポーズ中は流体の操作を行わないよう修正
function splatPointer (pointer) {
    let dx = pointer.deltaX * config.SPLAT_FORCE * 1000 * (config.PAUSED ? 0 : 1);
    let dy = pointer.deltaY * config.SPLAT_FORCE * 1000 * (config.PAUSED ? 0 : 1);
    splat(pointer.texcoordX, pointer.texcoordY, dx, dy, pointer.color);
}

// ポーズ中は流体の操作を行わないよう修正
function multipleSplats (amount) {
    for (let i = 0; i < amount; i++) {
        const color = generateColor();
        // const color = foreColor();
        color.r *= 10.0;
        color.g *= 10.0;
        color.b *= 10.0;
        const x = Math.random();
        const y = Math.random();
        // const dx = 1000 * (Math.random() - 0.5);
        // const dy = 1000 * (Math.random() - 0.5);
        const dx = 0;
        const dy = 0;
        splat(x, y, dx, dy, color);
    }
}

// インクの滴下と流体の操作を分離
function splat (x, y, dx, dy, color) {
    if (!config.PAUSED) {
        splatProgram.bind();
        gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
        gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
        gl.uniform2f(splatProgram.uniforms.point, x, y);
        gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0.0);
        gl.uniform1f(splatProgram.uniforms.radius, correctRadius(config.SPLAT_RADIUS / 800.0));
        blit(velocity.write);
        velocity.swap();
    } else { // ポーズしているとき
        splatCMYProgram.bind();
        gl.uniform1i(splatCMYProgram.uniforms.uTarget, velocity.read.attach(0));
        gl.uniform1f(splatCMYProgram.uniforms.aspectRatio, canvas.width / canvas.height);
        gl.uniform2f(splatCMYProgram.uniforms.point, x, y);
        gl.uniform3f(splatCMYProgram.uniforms.color, dx, dy, 0.0);
        gl.uniform1f(splatCMYProgram.uniforms.radius, correctRadius(config.SPLAT_RADIUS / 100.0));
        blit(velocity.write);
        velocity.swap();

        gl.uniform1i(splatCMYProgram.uniforms.uTarget, dye.read.attach(0));
        gl.uniform3f(splatCMYProgram.uniforms.color, color.r, color.g, color.b);
        blit(dye.write);
        dye.swap();
    }
}

function correctRadius (radius) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio > 1)
        radius *= aspectRatio;
    return radius;
}

// ★キャンバス相対座標（CSS px）→ キャンバス内部座標（デバイス px）
function canvasPointFromClientXY(clientX, clientY) {
  const rect = canvas.getBoundingClientRect(); // CSS px
  const x_css = clientX - rect.left;
  const y_css = clientY - rect.top;
  const x = x_css * (canvas.width  / rect.width);
  const y = y_css * (canvas.height / rect.height);
  return { x, y };
}

function pointFromTouch(touch) {
  return canvasPointFromClientXY(touch.clientX, touch.clientY);
}

function pointFromMouseEvent(e) {
  return canvasPointFromClientXY(e.clientX, e.clientY);
}


canvas.addEventListener('mousedown', e => {
    const { x: posX, y: posY } = pointFromMouseEvent(e);
    let pointer = pointers.find(p => p.id == -1);
    if (!pointer) pointer = new pointerPrototype();
    updatePointerDownData(pointer, -1, posX, posY);
});

canvas.addEventListener('mousemove', e => {
    const pointer = pointers[0];
    if (!pointer.down) return;
    const { x: posX, y: posY } = pointFromMouseEvent(e);
    updatePointerMoveData(pointer, posX, posY);
});


window.addEventListener('mouseup', () => {
    updatePointerUpData(pointers[0]);
});

canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const touches = e.targetTouches;
    while (touches.length >= pointers.length) pointers.push(new pointerPrototype());
    for (let i = 0; i < touches.length; i++) {
        const { x: posX, y: posY } = pointFromTouch(touches[i]);
        updatePointerDownData(pointers[i + 1], touches[i].identifier, posX, posY);
    }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const touches = e.targetTouches;
    for (let i = 0; i < touches.length; i++) {
        const pointer = pointers[i + 1];
        if (!pointer.down) continue;
        const { x: posX, y: posY } = pointFromTouch(touches[i]);
        updatePointerMoveData(pointer, posX, posY);
    }
}, { passive: false });


window.addEventListener('touchend', e => {
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++)
    {
        let pointer = pointers.find(p => p.id == touches[i].identifier);
        if (pointer == null) continue;
        updatePointerUpData(pointer);
    }
});

window.addEventListener('keydown', e => {
    if (e.code === 'KeyP')
        config.PAUSED = !config.PAUSED;
    if (e.key === ' ')
        splatStack.push(parseInt(Math.random() * 20) + 5);
});

function updatePointerDownData (pointer, id, posX, posY) {
    pointer.id = id;
    pointer.down = true;
    pointer.moved = false;
    pointer.texcoordX = posX / canvas.width;
    pointer.texcoordY = 1.0 - posY / canvas.height;
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.deltaX = 0;
    pointer.deltaY = 0;
    // pointer.color = generateColor();
    pointer.color = foreColor();
}

function updatePointerMoveData (pointer, posX, posY) {
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.texcoordX = posX / canvas.width;
    pointer.texcoordY = 1.0 - posY / canvas.height;
    pointer.deltaX = correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX);
    pointer.deltaY = correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY);
    pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
}

function updatePointerUpData (pointer) {
  pointer.down = false; // 既存
  // 直前から位置が変わっていたら「描いた」とみなす
  if (pointer.prevTexcoordX !== pointer.texcoordX || pointer.prevTexcoordY !== pointer.texcoordY) {
    document.dispatchEvent(new CustomEvent('canvas:stroke')); // ← 追加
  }
}

function correctDeltaX (delta) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio < 1) delta *= aspectRatio;
    return delta;
}

function correctDeltaY (delta) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio > 1) delta /= aspectRatio;
    return delta;
}

function generateColor () {
    let c = HSVtoRGB(Math.random(), 1.0, 1.0);
    c.r *= 0.15;
    c.g *= 0.15;
    c.b *= 0.15;
    return c;
}

// フォアカラーの設定を追加
function foreColor () {
    let c = normalizeColor(config.FORE_COLOR);
    return c;
}

function HSVtoRGB (h, s, v) {
    let r, g, b, i, f, p, q, t;
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);

    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }

    return { r, g, b };
}

function normalizeColor (input) {
    let output = {
        r: input.r / 255,
        g: input.g / 255,
        b: input.b / 255
    };
    return output;
}

function wrap (value, min, max) {
    let range = max - min;
    if (range == 0) return min;
    return (value - min) % range + min;
}

function getResolution (resolution) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1)
        aspectRatio = 1.0 / aspectRatio;

    let min = Math.round(resolution);
    let max = Math.round(resolution * aspectRatio);

    if (gl.drawingBufferWidth > gl.drawingBufferHeight)
        return { width: max, height: min };
    else
        return { width: min, height: max };
}

function getTextureScale (texture, width, height) {
    return {
        x: width / texture.width,
        y: height / texture.height
    };
}

function scaleByPixelRatio (input) {
    let pixelRatio = window.devicePixelRatio || 1;
    return Math.floor(input * pixelRatio);
}

function hashCode (s) {
    if (s.length == 0) return 0;
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
        hash = (hash << 5) - hash + s.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
};

