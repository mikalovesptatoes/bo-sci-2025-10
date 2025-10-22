// 画面・コンテキスト
let dpr = Math.max(1, window.devicePixelRatio || 1);
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const stageWrap = document.getElementById('stageWrap');
let cssW = canvas.clientWidth, cssH = canvas.clientHeight;

function resizeCanvasToCSS() {
  const rect = (stageWrap || canvas).getBoundingClientRect(); // ← wrap基準
  dpr = Math.max(1, window.devicePixelRatio || 1);            // ← 毎回更新
  cssW = rect.width; cssH = rect.height;
  canvas.width  = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(dpr, dpr);  // 以降はCSSピクセルで描画
}
resizeCanvasToCSS();
window.addEventListener('resize', () => { resizeCanvasToCSS(); computeContain(); render(); });
window.addEventListener('orientationchange', () => { resizeCanvasToCSS(); computeContain(); render(); });

// ステージ上のスクロール/ズーム/ダブルタップズームを止める
if (stageWrap) {
  stageWrap.addEventListener('touchmove', (e) => {
    e.preventDefault();               // スクロール抑止
  }, { passive: false });
}

// iOSのピンチズーム・ジェスチャ保険
['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => {
  document.addEventListener(ev, e => e.preventDefault(), { passive: false });
});

// ダブルタップズーム防止
let __lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - __lastTouchEnd <= 300) e.preventDefault();
  __lastTouchEnd = now;
}, { passive: false });



// 写真の状態
let baseImg = null;
let fit = { x:0, y:0, w:cssW, h:cssH, scale:1 };

function loadImage(src){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload = ()=> resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function computeContain(){
  const W = canvas.width  / dpr;  // 実キャンバスサイズ（CSS px）
  const H = canvas.height / dpr;

  if (!baseImg) { fit = {x:0,y:0,w:W,h:H,scale:1}; return; }

  const iw = baseImg.naturalWidth, ih = baseImg.naturalHeight;

  // ★ ここを contain → cover に変える：全面に広げて中央トリミング
  const scale = Math.max(W/iw, H/ih);   // ← cover は max
  const w = Math.round(iw * scale), h = Math.round(ih * scale);
  const x = Math.round((W - w)/2),  y = Math.round((H - h)/2);
  fit = { x, y, w, h, scale };
}


// ======== スタンプの状態管理（アップロードより前に置く） ========
const stamps = [];          // 配置したスタンプの配列
let selectedIndex = -1;     // 選択中スタンプのインデックス

function ensureFlipProps() {
  for (const s of stamps) {
    if (s.flipX === undefined) s.flipX = false;
    if (s.flipY === undefined) s.flipY = false;
  }
}

// Undo/Redo ヒストリ
const history = { stack: [], index: -1 };
function pushHistory() {
  const snapshot = stamps.map(s => ({ ...s }));
  history.stack.splice(history.index + 1);
  history.stack.push(snapshot);
  history.index = history.stack.length - 1;
  refreshUndoRedo();
}
function loadHistory(dir) {
  const next = history.index + dir;
  if (next < 0 || next >= history.stack.length) return;
  const snap = history.stack[next];
  stamps.length = 0;
  snap.forEach(s => stamps.push({ ...s }));
  selectedIndex = -1;
  history.index = next;
  render();
  refreshUndoRedo();
}

// ボタンがない環境でも落ちないように防御
const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const saveWorkBtn = document.getElementById('saveWorkBtn');


function refreshUndoRedo() {
  if (!undoBtn || !redoBtn) return;
  if (undoBtn)  undoBtn.disabled  = history.index <= 0;
  if (redoBtn)  redoBtn.disabled  = history.index >= history.stack.length - 1;
  if (deleteSelectedBtn) deleteSelectedBtn.disabled = (selectedIndex < 0);
  if (clearAllBtn) clearAllBtn.disabled = (stamps.length === 0);
  if (saveWorkBtn) saveWorkBtn.disabled = (!baseImg && stamps.length === 0);
}

// --- Undo / Redo ボタンクリックを接続 ---
if (undoBtn) {
  undoBtn.addEventListener('click', () => {
    loadHistory(-1); // 1つ戻す
  });
}
if (redoBtn) {
  redoBtn.addEventListener('click', () => {
    loadHistory(+1); // 1つ進める
  });
}
if (deleteSelectedBtn) {
  deleteSelectedBtn.addEventListener('click', () => {
    if (selectedIndex < 0) return;
    stamps.splice(selectedIndex, 1);
    selectedIndex = -1;
    render();
    pushHistory();
    refreshUndoRedo();
  });
}
if (clearAllBtn) {
  clearAllBtn.addEventListener('click', () => {
    if (!stamps.length) return;

    // 誤操作防止（簡易確認ダイアログ）
    const ok = confirm('本当に全部のスタンプを消しますか？');
    if (!ok) return;

    stamps.length = 0;           // すべて削除（写真は残す）
    selectedIndex = -1;
    render();
    pushHistory();               // Undoで戻せるように履歴に積む
    refreshUndoRedo();
  });
}
if (saveWorkBtn) {
  saveWorkBtn.addEventListener('click', () => {
    // 選択枠を一時非表示でレンダリング
    const prevSel = selectedIndex;
    selectedIndex = -1;
    render();

    // 作品名：collage-YYYYMMDD-HHMMSS.png
    const now = new Date();
    const pad = n => String(n).padStart(2,'0');
    const fname = `collage-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`;

    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // 選択表示を戻す
    selectedIndex = prevSel;
    render();
  });
}

// アップロード
const fileInput = document.getElementById('fileInput');
fileInput.addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  baseImg = await loadImage(url);
  computeContain();
  stamps.length = 0; selectedIndex = -1; history.stack=[]; history.index=-1;
  render(); refreshUndoRedo();
});

// 画像×色 の結果をキャッシュ
const tintCache = new Map();

/** 白ベースPNGを任意色でティントしたキャンバスを返す */
function getTintedImage(img, color){
  const key = (img.src || img) + '|' + color;
  const cached = tintCache.get(key);
  if (cached) return cached;

  const w = img.naturalWidth  || img.width  || 1;
  const h = img.naturalHeight || img.height || 1;

  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const octx = off.getContext('2d');

  // 元画像 → その上に色をsource-atopでのせる（透明部は塗られない）
  octx.clearRect(0,0,w,h);
  octx.drawImage(img, 0, 0, w, h);
  octx.globalCompositeOperation = 'source-atop';
  octx.fillStyle = color || '#ffffff';
  octx.fillRect(0, 0, w, h);
  octx.globalCompositeOperation = 'source-over';

  tintCache.set(key, off);
  return off;
}


// ★ ADD: handle constants & drag state
const HANDLE_SIZE = 10;     // screen px
const ROTATE_DIST = 28;     // screen px above top edge
const ROTATE_R    = 10;     // screen px radius

let dragMode = 'none';      // 'none' | 'move' | 'resize' | 'rotate'
let dragHandleIndex = -1;   // 0:TL,1:TR,2:BR,3:BL
let dragStart = null;       // { sx, sy, x, y, scale, angleRad, angle0, dist0 }

// ★ ADD: local rect of selected stamp (center-origin, after scale)
function localRectOf(s) {
  const w = s.w * s.scale;
  const h = s.h * s.scale;
  return { x: -w/2, y: -h/2, w, h };
}

// ★ ADD: local -> screen (consider rotation and dpr)
function localToScreen(s, pt) {
  const rad = (s.angleDeg || 0) * Math.PI / 180;
  const c = Math.cos(rad), si = Math.sin(rad);
  const wx = s.x + pt.x * c - pt.y * si; // CSS px
  const wy = s.y + pt.x * si + pt.y * c; // CSS px
  return { x: wx * dpr, y: wy * dpr };   // screen px
}

// ★ ADD: screen -> local
function screenToLocal(s, sx, sy) {
  const x = sx / dpr, y = sy / dpr;      // CSS px
  const dx = x - s.x, dy = y - s.y;
  const rad = (s.angleDeg || 0) * Math.PI / 180;
  const c = Math.cos(-rad), si = Math.sin(-rad);
  return { x: dx * c - dy * si, y: dx * si + dy * c };
}

// ★ ADD: primitives in screen space (no current transform)
function drawScreenSquare(cx, cy, size, color) {
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle = color;
  ctx.fillRect(cx - size/2, cy - size/2, size, size);
  ctx.restore();
}
function drawScreenCircle(cx, cy, r, color) {
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}
function drawScreenLine(x1, y1, x2, y2, color) {
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.strokeStyle = color;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.restore();
}

const HANDLE_HIT_PAD = 12; // ← 触りやすさ向上ぶん
// ハンドルのヒットテスト（優先度：回転 > 角ハンドル > なし）
// 引数 sx, sy は「スクリーンpx」（= clientX * devicePixelRatio）

function hitTestHandles(s, sx, sy) {
  const r = localRectOf(s);

  // 回転ハンドル（上辺から距離 ROTATE_DIST）
  const topCenter = { x: r.x + r.w/2, y: r.y };
  const rotPosLocal = { x: topCenter.x, y: topCenter.y - (ROTATE_DIST / dpr) };
  const rotPos = localToScreen(s, rotPosLocal);
  const dx = rotPos.x - sx, dy = rotPos.y - sy;
  if (Math.hypot(dx, dy) <= (ROTATE_R + HANDLE_HIT_PAD)) {
    return { mode: 'rotate' };
  }

  // 角ハンドル（四角）…描画10pxだがヒットは広め
  const corners = [
    { x: r.x,       y: r.y       }, // 0:TL
    { x: r.x+r.w,   y: r.y       }, // 1:TR
    { x: r.x+r.w,   y: r.y+r.h   }, // 2:BR
    { x: r.x,       y: r.y+r.h   }, // 3:BL
  ];
  const halfHit = (HANDLE_SIZE/2) + HANDLE_HIT_PAD; // ← 実ヒット半径
  for (let i=0;i<corners.length;i++){
    const p = localToScreen(s, corners[i]);
    if (Math.abs(p.x - sx) <= halfHit && Math.abs(p.y - sy) <= halfHit) {
      return { mode: 'resize', handleIndex: i };
    }
  }

  return { mode: 'none' };
}

// 追加：選択枠の“周辺”ヒット（外しても新規配置しない用）
function isNearSelectionScreen(s, sx, sy) {
  const r = localRectOf(s);
  // ローカル矩形の4隅をスクリーンに
  const pTL = localToScreen(s, {x:r.x,       y:r.y});
  const pTR = localToScreen(s, {x:r.x+r.w,   y:r.y});
  const pBR = localToScreen(s, {x:r.x+r.w,   y:r.y+r.h});
  const pBL = localToScreen(s, {x:r.x,       y:r.y+r.h});
  // 軽量化のため“外接AABB”で判定（ねじれ少ないので十分）
  const minX = Math.min(pTL.x, pTR.x, pBR.x, pBL.x) - (HANDLE_HIT_PAD*2);
  const maxX = Math.max(pTL.x, pTR.x, pBR.x, pBL.x) + (HANDLE_HIT_PAD*2);
  const minY = Math.min(pTL.y, pTR.y, pBR.y, pBL.y) - (HANDLE_HIT_PAD*2);
  const maxY = Math.max(pTL.y, pTR.y, pBR.y, pBL.y) + (HANDLE_HIT_PAD*2);
  return (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY);
}


function render(){
  ctx.clearRect(0,0,cssW,cssH);

  if (baseImg) {
    ctx.drawImage(baseImg, fit.x, fit.y, fit.w, fit.h);
  } else {
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0,0,cssW,cssH);
  }

  for (const s of stamps) {
    // 念のため後方互換の初期化
    if (s.flipX === undefined) s.flipX = false;
    if (s.flipY === undefined) s.flipY = false;
    const w = s.w * s.scale, h = s.h * s.scale;
    ctx.globalAlpha = s.alpha;
    // 色が指定されていればティント画像、なければ元画像
    const src = (s.color && s.color.toLowerCase() !== '#ffffff')
                  ? getTintedImage(s.tex, s.color)
                  : s.tex;
    ctx.save();
    ctx.translate(s.x, s.y);
    const rad = (s.angleDeg || 0) * Math.PI / 180;
    ctx.rotate(rad);

    // 反転は符号付きスケールで表現（拡大率は既存の s.scale のまま）
    const sx = s.flipX ? -1 : 1;
    const sy = s.flipY ? -1 : 1;
    ctx.scale(sx, sy);

    ctx.drawImage(src, -w/2, -h/2, w, h);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  if (selectedIndex >= 0) {
    const s = stamps[selectedIndex];
    const r = localRectOf(s);

    // 緑枠（ローカル空間で描画）
    ctx.save();
    ctx.translate(s.x, s.y);
    const rad = (s.angleDeg || 0) * Math.PI / 180;
    ctx.rotate(rad);
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.restore();

    // 角ハンドル（画面空間で固定サイズ）
    const corners = [
      { x: r.x,       y: r.y       }, // TL
      { x: r.x+r.w,   y: r.y       }, // TR
      { x: r.x+r.w,   y: r.y+r.h   }, // BR
      { x: r.x,       y: r.y+r.h   }, // BL
    ];
    for (const c of corners) {
      const p = localToScreen(s, c);
      drawScreenSquare(p.x, p.y, HANDLE_SIZE, '#22c55e');
    }

    // 回転ハンドル（上辺の外）
    const topCenter = { x: r.x + r.w/2, y: r.y };
    const rotPosLocal = { x: topCenter.x, y: topCenter.y - (ROTATE_DIST / dpr) };
    const a = localToScreen(s, topCenter);
    const b = localToScreen(s, rotPosLocal);
    drawScreenLine(a.x, a.y, b.x, b.y, '#22c55e');
    drawScreenCircle(b.x, b.y, ROTATE_R, '#22c55e');
  }
}

// 既存のすぐ上/下どこでもOK
const ALPHA_MIN = 0.2;
const ALPHA_MAX = 1.0;


// UI（あれば反映、無ければ安全にスキップ）
const alphaEl = document.getElementById('alpha');
const alphaOut = document.getElementById('alphaOut');
const colorEl  = document.getElementById('color');
const colorOut = document.getElementById('colorOut');


// ▼ 既存 colorEl / colorOut を利用する前提
const colorPreview = document.getElementById('colorPreview');
const swatchesEl   = document.getElementById('swatches');

// スウォッチに色を塗る
if (swatchesEl) {
  swatchesEl.querySelectorAll('.swatch').forEach(btn => {
    const c = btn.getAttribute('data-color');
    btn.style.background = c;
    btn.addEventListener('click', () => {
      if (!colorEl) return;
      colorEl.value = c;
      // 既存の着色ロジックを流用
      colorEl.dispatchEvent(new Event('input', { bubbles: true }));
      colorEl.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}

// 表示（テキスト＆丸プレビュー）を同期
function updateColorUI(hex) {
  if (colorOut)     colorOut.textContent = hex.toUpperCase();
  if (colorPreview) colorPreview.style.background = hex;
}
// 初期反映
if (colorEl) updateColorUI(colorEl.value);

// 既存の colorEl リスナーはそのまま使用（render/pushHistory は既に書いてある）
// もし colorEl の input リスナー内で colorOut を更新しているなら、下行だけ追加：
if (colorEl) {
  colorEl.addEventListener('input', () => updateColorUI(colorEl.value));
}


if (alphaEl) {
  alphaEl.addEventListener('change', () => {
    if (selectedIndex >= 0) pushHistory();
  });
}


// ======== キャンバス座標ユーティリティ ========
function clientToCanvas(ev){
  const r = canvas.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}
function imageSizeFromTex(img){
  const w = img.naturalWidth  || 200;
  const h = img.naturalHeight || 200;
  return { w, h };
}
function hitTest(x, y, s){
  const hw = (s.w * s.scale) / 2;
  const hh = (s.h * s.scale) / 2;
  const rad = (s.angleDeg || 0) * Math.PI / 180;
  // キャンバス座標→スタンプのローカル座標（中心原点）へ逆回転
  const dx = x - s.x;
  const dy = y - s.y;
  const cos = Math.cos(-rad), sin = Math.sin(-rad);
  const lx = cos * dx - sin * dy;
  const ly = sin * dx + cos * dy;
  return (lx >= -hw && lx <= hw && ly >= -hh && ly <= hh);
}

function selectIndex(i){
  stamps.forEach(s => s.selected = false);
  selectedIndex = i;
  if (i>=0){
    stamps[i].selected = true;
    
  if (alphaEl){
    // 透明度スライダーは「右ほど透明」＝ alpha を反転してつまみ位置に
    const s = (ALPHA_MIN + ALPHA_MAX) - stamps[i].alpha; // スライダー値
    alphaEl.value = String(s);
    const t = (s - ALPHA_MIN) / (ALPHA_MAX - ALPHA_MIN); // 透明度(0..1)
    if (alphaOut) alphaOut.textContent = Math.round(t * 100) + '%';
  }    

  if (colorEl){
      colorEl.value = stamps[i].color || '#ffffff';
      if (colorOut) colorOut.textContent = (stamps[i].color || '#ffffff').toUpperCase();
  }
  }
  refreshUndoRedo();
}

// ======== スライダー（サイズ／不透明度）参照＆反映 ========
if (alphaEl){
  alphaEl.addEventListener('input', () => {
    // %表示は常に更新（未選択でも反映）
    const s = Number(alphaEl.value);
    const t = (s - ALPHA_MIN) / (ALPHA_MAX - ALPHA_MIN); // 透明度(0..1)
    if (alphaOut) alphaOut.textContent = Math.round(t * 100) + '%';

    // スタンプ選択中のみ描画alphaを更新
    if (selectedIndex >= 0){
      stamps[selectedIndex].alpha = (ALPHA_MIN + ALPHA_MAX) - s; // 1.2 - s
      render();
    }
  });
}

// カラー反映
if (colorEl){
  colorEl.addEventListener('input', () => {
    if (selectedIndex >= 0){
      const s = stamps[selectedIndex];
      s.color = colorEl.value;
      if (colorOut) colorOut.textContent = colorEl.value.toUpperCase();
      render();
    }
  });
  // 履歴に1回だけ積む
  colorEl.addEventListener('change', () => {
    if (selectedIndex >= 0) pushHistory();
  });
}

const flipXBtn = document.getElementById('flipXBtn');
const flipYBtn = document.getElementById('flipYBtn');
const flipResetBtn = document.getElementById('flipResetBtn');

function toggleFlip(axis) {
  if (selectedIndex < 0) return;
  ensureFlipProps();
  const s = stamps[selectedIndex];
  if (axis === 'x') s.flipX = !s.flipX;
  if (axis === 'y') s.flipY = !s.flipY;
  render();
  pushHistory();           // 履歴に積む
}

if (flipXBtn) flipXBtn.addEventListener('click', () => toggleFlip('x'));
if (flipYBtn) flipYBtn.addEventListener('click', () => toggleFlip('y'));
if (flipResetBtn) flipResetBtn.addEventListener('click', () => {
  if (selectedIndex < 0) return;
  ensureFlipProps();
  const s = stamps[selectedIndex];
  s.flipX = false; s.flipY = false;
  render();
  pushHistory();
});

// キーボードショートカット：H / V
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (selectedIndex < 0) return;
  if (e.key === 'h' || e.key === 'H') { toggleFlip('x'); }
  if (e.key === 'v' || e.key === 'V') { toggleFlip('y'); }
});


// --- 配置＆ドラッグ ---
let dragging = false;
let dragDX = 0, dragDY = 0;

canvas.addEventListener('pointerdown', (ev)=>{
  //if (!baseImg) return;
  canvas.setPointerCapture(ev.pointerId);
  const p  = clientToCanvas(ev);
  // キャンバス相対のスクリーンpxに統一
  const sx = p.x * dpr;
  const sy = p.y * dpr;

  // check handles from top-most
  for (let i = stamps.length - 1; i >= 0; i--) {
    const s = stamps[i];
    const h = hitTestHandles(s, sx, sy);
    if (h.mode !== 'none') {
      selectIndex(i);
      dragMode = h.mode;
      dragHandleIndex = h.handleIndex ?? -1;
      dragStart = {
        sx, sy,
        x: s.x, y: s.y,
        scale: s.scale,
        angleRad: (s.angleDeg || 0) * Math.PI / 180,
        angle0: Math.atan2((sy/dpr) - s.y, (sx/dpr) - s.x),
        dist0: Math.hypot((sx/dpr) - s.x, (sy/dpr) - s.y)
      };
      render();
      return;
    }
    // body move (existing logic)
    if (hitTest(p.x, p.y, s)) {
      selectIndex(i);
      dragMode = 'move';
      dragHandleIndex = -1;
      dragging = true; // keep existing flag
      dragDX = p.x - s.x;
      dragDY = p.y - s.y;
      dragStart = { sx, sy, x: s.x, y: s.y };
      render();
      return;
    }
  }

  // 枠の近くで外しただけなら、新規配置しない（誤配置防止）
  if (selectedIndex >= 0) {
    const sSel = stamps[selectedIndex];
    if (isNearSelectionScreen(sSel, sx, sy)) {
      return; // 何もしない
    }
  }

  // no hit -> create new stamp (keep your existing new-stamp block unchanged)
  // (Your existing new-stamp code here; do not duplicate)
  if (!currentStampTex) return;
  const { w: iw, h: ih } = imageSizeFromTex(currentStampTex);
  const baseScale = defaultScaleForTex(currentStampTex);
  const multiplier = 1.0;
  const scale = baseScale * multiplier;
  // 透明度スライダー値 s を alpha に反転
  const s = alphaEl ? Number(alphaEl.value) : ALPHA_MAX; // 右端=1→透明度100%
  const alpha = (ALPHA_MIN + ALPHA_MAX) - s;
  const stamp = {
    id: `${currentStampId || 'stamp'}-${Date.now()}`,
    tex: currentStampTex,
    x: p.x, y: p.y,
    w: iw, h: ih,
    baseScale,
    scale,
    multiplier,
    alpha,
    color: (colorEl ? colorEl.value : '#ffffff'),
    angleDeg: 0,
    selected: false,
    flipX: false,
    flipY: false
  };

  stamps.push(stamp);
  selectIndex(stamps.length - 1);
  render();
  pushHistory();
});

// ======== 初期スケール算出（「良い感じ」の大きさ） ========
const BASE_RATIO = 0.08;

function defaultScaleForTex(img){
  const baseW = baseImg ? fit.w : (canvas.width / dpr);
  const targetDisplayWidth = Math.max(64, Math.round(baseW * BASE_RATIO));
  const iw = img.naturalWidth || 200;
  return targetDisplayWidth / iw;
}

// 角ハンドルに応じたカーソル（回転は考慮せずシンプルに）
function getResizeCursorByHandleIndex(handleIndex) {
  // 0:TL, 1:TR, 2:BR, 3:BL
  return (handleIndex === 0 || handleIndex === 2) ? 'nwse-resize' : 'nesw-resize';
}


canvas.addEventListener('pointermove', (ev)=>{
  if (dragMode === 'none') {
    if (selectedIndex >= 0) {
      const s  = stamps[selectedIndex];
      const p  = clientToCanvas(ev);   // CSS px
      const sx = p.x * dpr;            // 画面px（ハンドル判定用）
      const sy = p.y * dpr;

      const h = hitTestHandles(s, sx, sy);
      if (h.mode === 'resize') {
        // 角ハンドル上：対角線リサイズカーソル
        canvas.style.cursor = getResizeCursorByHandleIndex(h.handleIndex ?? -1);
      } else if (h.mode === 'rotate') {
        // 回転ハンドル上：回転カーソル
        canvas.style.cursor = 'grab'; 
      } else if (hitTest(p.x, p.y, s)) {
        // 本体の上：移動カーソル
        canvas.style.cursor = 'move';
      } else {
        canvas.style.cursor = 'default';
      }
    } else {
      canvas.style.cursor = 'default';
    }
  }

  if (selectedIndex < 0) return;

  const s = stamps[selectedIndex];
  const p  = clientToCanvas(ev);
  const sx = p.x * dpr;
  const sy = p.y * dpr;

  if (dragMode === 'rotate') {
    const angle = Math.atan2((sy/dpr) - s.y, (sx/dpr) - s.x);
    const delta = angle - dragStart.angle0;
    const rad = dragStart.angleRad + delta;
    s.angleDeg = (rad * 180 / Math.PI) % 360;
    render();
    return;
  }

  if (dragMode === 'resize') {
    const dist = Math.hypot((sx/dpr) - s.x, (sy/dpr) - s.y);
    const ratio = dist / Math.max(1e-6, dragStart.dist0);
    const newScale = dragStart.scale * ratio;

    const minScaleW = 16 / s.w;
    const minScaleH = 16 / s.h;
    s.scale = Math.max(newScale, Math.max(minScaleW, minScaleH));

    render();
    return;
  }

  if (dragMode === 'move' && dragging) {
    const p = clientToCanvas(ev);
    s.x = p.x - dragDX;
    s.y = p.y - dragDY;
    render();
  }
});

canvas.addEventListener('pointerleave', ()=>{
  if (dragMode === 'none') canvas.style.cursor = 'default';
});

canvas.addEventListener('pointerup', (ev)=>{
  if (dragMode !== 'none' || dragging) {
    pushHistory();
  }
  dragging = false;
  dragMode = 'none';
  dragHandleIndex = -1;
  dragStart = null;
  canvas.releasePointerCapture?.(ev.pointerId);
});

const saveBtn = document.getElementById('saveBtn');
if (saveBtn) {
  saveBtn.addEventListener('click', () => {
    // 選択枠を含めずに書き出したい場合：一時的に選択解除で描画→出力→元に戻す
    const prevSel = selectedIndex;
    selectedIndex = -1;
    render();

    // PNG データURLを作ってダウンロード
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'collage.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // 表示を元に戻す
    selectedIndex = prevSel;
    render();
  });
}

const clearBtn = document.getElementById('clearBtn');
if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    // スタンプのみ全削除（写真は残す）
    stamps.length = 0;
    selectedIndex = -1;
    render();
    pushHistory();
  });
}

// === PNGスタンプの定義（asset/stamps 配下） ===
const STAMP_BASE = './asset/stamps/';
// ここにファイル名（拡張子なし）を並べるだけでOK
const STAMP_NAMES = [
  'ashiato_white',
  'bag_white',
  'hanen_white',
  'happa_white',
  'hashiru_white',
  'heart_white',
  'hito_white',
  'honyuubin_white',
  'hoshi_white',
  'ie_white',
  'inu_white',
  'kaidan_white',
  'kouyouju_white',
  'kuruma_white',
  'maru_white',
  'ryukku2_white',
  'sankaku_white',
  'shikaku_white',
  'shizuku_white',
  'sinyouju_white',
  'te_white',
  'te2_white',
  'tori_white'
];

// id/src を自動生成
const STAMP_ASSETS = STAMP_NAMES.map(name => ({
  id: name,
  src: `${STAMP_BASE}${name}.png`
}));

const thumbsEl = document.getElementById('thumbs');
let currentStampTex = null;
let currentStampId  = null;

// サムネ＆選択挙動
STAMP_ASSETS.forEach(asset => {
  const img = new Image();
  img.src = asset.src;

  const cell = document.createElement('div');
  cell.className = 'thumb';

  const tag = document.createElement('img');
  tag.src = asset.src;
  tag.alt = asset.id;
  cell.appendChild(tag);

  cell.addEventListener('click', () => {
    currentStampTex = img;
    currentStampId  = asset.id;
    document.querySelectorAll('.thumb').forEach(t => t.classList.remove('selected'));
    cell.classList.add('selected');
  });

  thumbsEl.appendChild(cell);
});

// 初期選択（最初の1個）
if (STAMP_ASSETS.length > 0) {
  const first = STAMP_ASSETS[0];
  currentStampTex = new Image();
  currentStampTex.src = first.src;
  currentStampId = first.id;
  thumbsEl.firstElementChild?.classList.add('selected');
}

// キーボードでサムネ選択（← → ↑ ↓）
window.addEventListener('keydown', (ev) => {
  const cells = Array.from(document.querySelectorAll('.thumbs .thumb'));
  if (!cells.length) return;

  let idx = cells.findIndex(c => c.classList.contains('selected'));
  if (idx < 0) idx = 0;

  const cols = 4; // 4列固定
  const rows = Math.ceil(cells.length / cols);

  let next = idx;
  if (ev.key === 'ArrowRight') next = Math.min(idx + 1, cells.length - 1);
  if (ev.key === 'ArrowLeft')  next = Math.max(idx - 1, 0);
  if (ev.key === 'ArrowDown')  next = Math.min(idx + cols, cells.length - 1);
  if (ev.key === 'ArrowUp')    next = Math.max(idx - cols, 0);
  if (next === idx) return;

  // 見た目の選択状態と、実際の currentStamp を更新
  cells.forEach(c => c.classList.remove('selected'));
  const nextCell = cells[next];
  nextCell.classList.add('selected');
  nextCell.scrollIntoView({ block: 'nearest' });

  // 背景imgのsrcから currentStampTex / currentStampId を復元
  const tag = nextCell.querySelector('img');
  if (tag) {
    const asset = STAMP_ASSETS.find(a => a.src === tag.src || tag.src.endsWith(a.src));
    if (asset) {
      const img = new Image();
      img.src = asset.src;
      currentStampTex = img;
      currentStampId  = asset.id;
    }
  }
});
