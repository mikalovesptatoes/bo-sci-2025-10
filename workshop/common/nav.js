// workshop/common/nav.js
(function () {
  // 各ページで window.WS_STEP を定義しておく
  var S = window.WS_STEP || { index: 0, total: 1, title: '', mission: '', next: null };
  // ★追加：オプションのデフォルト
  S.hideBack  = S.hideBack === true;                   // 戻るボタンを隠すか
  S.nextLabel = (typeof S.nextLabel === 'string' && S.nextLabel.trim()) ? S.nextLabel : null;

    // ▼ タイマーデフォルト（ページで未指定ならここが効く）
  // ▼ タイマーデフォルト
  S.timer = Object.assign({
    enabled: true,       // ← 追加：既定は有効。ページ側で false にできる
    minutes: 15,
    mode: 'down',
    autostart: true,
    showClock: true,
    showBar: true,
    showControls: false,
    warnAtSec: 60
  }, S.timer || {});

  // ▼ 目安時間（文字）も enabled のときだけ作る
  var TIMER_LABEL = S.timer.enabled ? ('目安 ' + (S.timer.minutes|0) + '分') : '';


  // --- ヘッダー ---
  var header = document.createElement('header');
    // ★追加：ボタンHTMLをフラグで切り替え
  var backBtnHtml = S.hideBack ? '' : '<button class="btn" id="backBtn">◀ 戻る</button>';
  var nextText    = S.nextLabel ? S.nextLabel : '次へ ▶';
  var nextBtnHtml = S.next ? ('<button class="btn accent" id="nextBtn">' + nextText + '</button>') : '';

  header.className = 'ws-header';
  header.innerHTML =
    // 1) 左
    '<div class="left">防災×市民科学×アート WS ' +
          // ▼ タイマーは right の中に、enabled のときだけ
      (S.timer.enabled ? (
        '<div class="ws-timer" aria-label="セクションタイマー">' +
          '<span class="ws-timer__badge" id="timerLabel">' + TIMER_LABEL + '</span>' +
          (S.timer.showClock ? '<span class="ws-timer__clock" id="timerClock">--:--</span>' : '') +
          (S.timer.showControls
            ? '<button class="btn ghost" id="timerPlay"  title="開始/再開" aria-label="開始">▶</button>' +
              '<button class="btn ghost" id="timerPause" title="一時停止" aria-label="一時停止">⏸</button>' +
              '<button class="btn ghost" id="timerReset" title="リセット" aria-label="リセット">↺</button>'
            : ''
          ) +
        '</div>'
      ) : '') +
    '</div>' +

    // 2) センター（タイトル）
    '<div class="center">ステップ' + S.index + '/' + S.total + '：' + (S.title || '') + '</div>' +

    // 3) 右（説明・地図・ワークシート → タイマー → 戻る/次へ の順）
    '<div class="right">' +
      (S.mission   ? '<button class="btn" id="helpBtn">❓ 説明</button>' : '') +
      (S.mapUrl    ? '<button class="btn" id="mapBtn">🗺 地図</button>' : '') +
      (S.surveyUrl ? '<button class="btn" id="sheetBtn">📝 防災ワークシート</button>' : '') +



      // 戻る / 次へ（変数を使っている前提。未導入なら元の固定HTMLに戻してOK）
      backBtnHtml +
      nextBtnHtml +
    '</div>' +

    // 4) タイムバー（enabled && showBar のときのみ）
    (S.timer.enabled && S.timer.showBar ? '<div class="timerbar" id="timerbar"></div>' : '');

  document.body.prepend(header);

  // --- 説明オーバーレイ ---
  if (S.mission) {   // ←★ 追加：missionがあるページだけ生成する
    var overlay = document.createElement('div');
    overlay.className = 'help-overlay';
    overlay.innerHTML =
    '<div class="help-card">' +
      '<h2>🧩 このセクションのミッション</h2>' +
      (S.mission ? `
        <h3>目的</h3>
        <p>${S.mission.purpose}</p>

        <h3>手順</h3>
        <ol>${(S.mission.steps || []).map(s => `<li>${s}</li>`).join('')}</ol>

        <h3>✅ 完了条件</h3>
        <p>${S.mission.goal}</p>

        ${
          S.mission.examples ? `
          <div class="examples">
            ${S.mission.examples.actions ? `
              <details open>
                <summary>💡 ${S.mission.examples.actions.title}</summary>
                <ul>${S.mission.examples.actions.items.map(x => `<li>${x}</li>`).join('')}</ul>
              </details>` : ''}

            ${S.mission.examples.actors ? `
              <details>
                <summary>👥 ${S.mission.examples.actors.title}</summary>
                <ul>${S.mission.examples.actors.items.map(x => `<li>${x}</li>`).join('')}</ul>
              </details>` : ''}
          </div>` : ''
        }
      ` : '<p>このステップで行うことを確認しましょう。</p>') +
      '<div class="actions"><button id="helpClose">閉じる</button></div>' +
    '</div>';

    document.body.appendChild(overlay);

    function openHelp(){ overlay.style.display = 'grid'; }
    function closeHelp(){ overlay.style.display = 'none'; }
    var helpBtn = document.getElementById('helpBtn');
    if (helpBtn) helpBtn.addEventListener('click', openHelp);
    var helpClose = document.getElementById('helpClose');
    if (helpClose) helpClose.addEventListener('click', closeHelp);

    // ステップ入室時に自動表示（不要なら次行をコメントアウト）
    openHelp();
  }

  // --- お知らせ（登録完了など） ---
  if (S.notice) {
    var onceOkay = !(S.notice.onceKey && localStorage.getItem(S.notice.onceKey));
    var needBtn  = S.notice.showButton !== false;                 // 既定: ボタン出す
    var autoOpen = S.notice.autoOpen !== false && onceOkay;       // 既定: 初回は自動表示

    // ヘッダーの右側に🔔ボタンを出す
    if (needBtn) {
      var right = header.querySelector('.right');
      var nbtn = document.createElement('button');
      nbtn.className = 'btn';
      nbtn.id = 'noticeBtn';
      nbtn.textContent = '🔔 お知らせ';
      right.insertBefore(nbtn, right.firstChild);
    }

    // オーバーレイ（help-overlay の見た目を共用）
    var nlay = document.createElement('div');
    nlay.className = 'help-overlay'; // 既存スタイルを使い回し
    nlay.innerHTML =
      '<div class="help-card">' +
        '<h2>' + (S.notice.title || 'お知らせ') + '</h2>' +
        '<div class="content">' + (S.notice.message || '') + '</div>' +
        '<div class="actions" id="noticeActions"></div>' +
      '</div>';
    document.body.appendChild(nlay);

    function openNotice(){
      nlay.style.display = 'grid';
      if (S.notice.onceKey) localStorage.setItem(S.notice.onceKey, 'shown');
    }
    function closeNotice(){ nlay.style.display = 'none'; }

    // アクションボタン
    var actWrap = nlay.querySelector('#noticeActions');
    var acts = S.notice.actions || [{ label:'閉じる', type:'close' }];
    acts.forEach(function(a){
      var b = document.createElement('button');
      b.className = 'btn' + (a.accent ? ' accent' : '');
      b.textContent = a.label || 'OK';
      b.addEventListener('click', function(){
        if (a.type === 'close') { closeNotice(); return; }
        if (a.type === 'map')   { var mb = document.getElementById('mapBtn'); if (mb) mb.click(); closeNotice(); return; }
        if (a.type === 'sheet') { var sb = document.getElementById('sheetBtn'); if (sb) sb.click(); closeNotice(); return; }
        if (a.type === 'next')  { var nb = document.getElementById('nextBtn'); if (nb) nb.click(); closeNotice(); return; }
        if (a.href) { location.href = a.href; return; }
        closeNotice();
      });
      actWrap.appendChild(b);
    });

    // ボタン/自動オープン
    var nbtnEl = document.getElementById('noticeBtn');
    if (nbtnEl) nbtnEl.addEventListener('click', openNotice);
    if (autoOpen) openNotice();
  }

  // --- 地図スライドイン ---
  if (S.mapUrl) {
    var mapPanel = document.createElement('aside');
    mapPanel.className = 'panel';
    mapPanel.id = 'mapPanel';
    mapPanel.innerHTML =
      '<header><div>ハザードマップ</div><button id="mapClose" class="btn">×</button></header>' +
      '<div class="body"><iframe src="' + S.mapUrl + '" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe></div>' +
    document.body.appendChild(mapPanel);
    var mapBtn = document.getElementById('mapBtn');
    if (mapBtn) mapBtn.addEventListener('click', function(){ mapPanel.classList.add('open'); });
    var mapClose = document.getElementById('mapClose');
    if (mapClose) mapClose.addEventListener('click', function(){ mapPanel.classList.remove('open'); });
  }

  // --- ワークシート（Survey123）スライドイン ---
  if (S.surveyUrl) {
    var sheet = document.createElement('aside');
    sheet.className = 'panel';
    sheet.id = 'sheetPanel';
    sheet.innerHTML =
      '<header><div>ワークシート</div><button id="sheetClose" class="btn">×</button></header>' +
      '<div class="body"><iframe src="' + S.surveyUrl + '" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe></div>' +
      '<div class="footer" style="display:flex;gap:8px;align-items:center;">' +
        (S.surveyHint ? '<div style="font-size:.9rem;opacity:.8;">' + S.surveyHint + '</div>' : '') +
        '<span style="flex:1"></span>' +
      '</div>';
    document.body.appendChild(sheet);

    var sheetBtn = document.getElementById('sheetBtn');
    if (sheetBtn) sheetBtn.addEventListener('click', function(){ sheet.classList.add('open'); });
    var sheetClose = document.getElementById('sheetClose');
    if (sheetClose) sheetClose.addEventListener('click', function(){ sheet.classList.remove('open'); });
  }

  // --- 次へ（ゲート未完なら警告） ---
  var nextBtn = document.getElementById('nextBtn');
  if (nextBtn) nextBtn.addEventListener('click', function(){
    if (S.next) location.href = S.next;
  });

  // --- 戻る ---
  var backBtn = document.getElementById('backBtn');
  if (backBtn) backBtn.addEventListener('click', function(){
    if (S.prev) {                         // 明示された戻り先がある場合
      location.href = S.prev;
      return;
    }
    if (document.referrer) {              // 履歴がある場合は通常の戻る
      history.back();
      return;
    }
    // フォールバック：1つ上の階層のトップへ
    var here = location.pathname.replace(/\/+$/,'');
    location.href = here.substring(0, here.lastIndexOf('/')) || '/';
  });

  // --- 便利: ← / → キーで 戻る / 次へ ---
  window.addEventListener('keydown', function(ev){
    if (ev.key === 'ArrowLeft' && backBtn) { backBtn.click(); }
    if (ev.key === 'ArrowRight' && nextBtn) { nextBtn.click(); }
  });

  // --- 簡易タイマー ---
  // --- 高機能タイマー（ページごとの設定に対応） ---
  (function(){
    var cfg = S.timer || {};
    var totalMs  = Math.max(0, (cfg.minutes || 0) * 60 * 1000);
    var modeDown = (cfg.mode || 'down') === 'down';
    var autostart = !!cfg.autostart;

    // 状態
    var startAt = null;    // 計測開始の時刻（ms）
    var paused  = !autostart;
    var accMs   = 0;       // これまでの累積（pauseまでの経過）
    var clockEl = document.getElementById('timerClock');
    var barEl   = document.getElementById('timerbar');

    // ヘルパ：mm:ss 表示
    function fmt(ms){
      ms = Math.max(0, Math.floor(ms/1000));
      var m = Math.floor(ms / 60);
      var s = ms % 60;
      return (''+m).padStart(2, '0') + ':' + (''+s).padStart(2, '0');
    }

    // 描画
    function render(now){
      // 経過ms
      var elapsed = accMs + (startAt ? (now - startAt) : 0);
      if (modeDown) {
        var remain = Math.max(0, totalMs - elapsed);
        if (clockEl) clockEl.textContent = fmt(remain);
        if (barEl && totalMs > 0) {
          var p = Math.min(1, elapsed / totalMs);      // 0→1
          barEl.style.width = (100 - p*100) + '%';     // 右→左に減る
        }
        // 0に到達したら止める（ビジュアル強調）
        if (remain <= 0 && startAt){
          paused = true;
          accMs = totalMs;
          startAt = null;
          // 目立たせたい場合は点滅など（簡易にクラス付与でもOK）
          if (barEl) barEl.style.background = '#f43f5e';
        }
      } else {
        // up（経過時間）
        if (clockEl) clockEl.textContent = fmt(elapsed);
        if (barEl && totalMs > 0) {
          var p2 = Math.min(1, elapsed / totalMs);
          barEl.style.width = (100 - p2*100) + '%';
        }
      }
    }

    // ループ
    function loop(){
      render(Date.now());
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    // コントロール
    function play(){
      if (!startAt){ startAt = Date.now(); }
      paused = false;
    }
    function pause(){
      if (startAt){
        accMs += Date.now() - startAt;
        startAt = null;
      }
      paused = true;
    }
    function reset(){
      accMs = 0;
      startAt = autostart ? Date.now() : null;
      paused = !autostart;
      if (barEl && totalMs > 0) barEl.style.width = '100%';
    }

    // 初期状態
    if (autostart) play(); else pause();
    render(Date.now());

    // ボタン（任意）
    var bPlay  = document.getElementById('timerPlay');
    var bPause = document.getElementById('timerPause');
    var bReset = document.getElementById('timerReset');
    if (bPlay)  bPlay.addEventListener('click', play);
    if (bPause) bPause.addEventListener('click', pause);
    if (bReset) bReset.addEventListener('click', reset);

    // 画面非表示中は計測ずれを抑える（復帰時にaccumulate）
    document.addEventListener('visibilitychange', function(){
      if (document.hidden) {
        if (!paused) pause();
      } else {
        if (!paused && autostart) play();
      }
    });
  })();

  requestAnimationFrame(tick);
})();
