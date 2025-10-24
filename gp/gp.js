import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

(() => {
  const firebaseConfig = {
    apiKey: "AIzaSyAKyYY7AvQ4igwB3DATS9Wjq1ij5AlLCLw",
    authDomain: "bo-sci2025.firebaseapp.com",
    projectId: "bo-sci2025",
    storageBucket: "bo-sci2025.firebasestorage.app",
    messagingSenderId: "375176908811",
    appId: "1:375176908811:web:ea423d1547dcd34a89f70e",
    measurementId: "G-TKZJLRFGW5",
  };

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const WEBMAP_ID = "675854f3a23041a687aade82428ff8bf";

  let SURVEY_LAYER_URL = null; // ← WebMapロード後に上書きする

  const DISTRICT_ID = "gaku-01";
  const DISTRICT_NAME = "箕輪小学校";
  document.getElementById("districtName").textContent = DISTRICT_NAME;

  // 疑似的な「自分の作品」ID
  let myArtId = null;

  // UI要素
  const carouselTrack = document.getElementById("carouselTrack");
  const selectionTitle = document.getElementById("selectedTitle");
  const bubbleLayer = document.getElementById("bubbleLayer");
  const commentInput = document.getElementById("commentInput");
  const commentAnon = document.getElementById("commentAnon");
  const sendCommentBtn = document.getElementById("sendCommentBtn");
  const makeTogetherBtn = document.getElementById("makeTogetherBtn");

  const artDialog = document.getElementById("artDialog");
  const artDialogClose = document.getElementById("artDialogClose");
  const artDialogTitle = document.getElementById("artDialogTitle");
  const artDialogImage = document.getElementById("artDialogImage");
  const artDialogDesc = document.getElementById("artDialogDesc");
  const requestCollabBtn = document.getElementById("requestCollabBtn");

  const confirmDialog = document.getElementById("confirmDialog");
  const confirmText = document.getElementById("confirmText");
  const confirmOk = document.getElementById("confirmOk");
  const confirmCancel = document.getElementById("confirmCancel");

  initAccountChip();

  // 選択中
  let selected = null; // { art_id, title, desc, imgUrl, geometry, objectId }
  let artworks = [];
  let dialogTarget = null;

  // --------------------------------------
  // ArcGIS 初期化（WebMap 方式）
  // --------------------------------------
  let view = null;

  require([
    "esri/WebMap",
    "esri/views/MapView",
    "esri/widgets/Search",
    "esri/widgets/ScaleBar",
    "esri/widgets/Locate",
  ], function (WebMap, MapView, Search, ScaleBar, Locate) {
    // 1) WebMapをロード
    const webmap = new WebMap({
      portalItem: { id: WEBMAP_ID },
    });

    // --------------------------------------
    // 選択された作品を地図に反映する関数（復活）
    // --------------------------------------
    function selectArtwork(artId, opts = { flyMap: true }) {
      const a = artworks.find((x) => x.art_id === artId);
      if (!a || !view) return;
      selected = a;
      selectionTitle.textContent = a.title;

      // コメント欄の見出しを更新
      const commentBoxTitle = document.querySelector(".comment-box h3");
      if (commentBoxTitle && a.author) {
        commentBoxTitle.textContent = `💬${a.author} さんにコメントを送る`;
      } else {
        commentBoxTitle.textContent = "コメントを送る";
      }

      Array.from(carouselTrack.children).forEach((c) => {
        c.classList.toggle("active", c.dataset.artId === artId);
      });

      // (4) 選択された作品のIDで、コメントの購読を更新する
      // ▼▼▼ 以下のif-elseブロックで置き換え ▼▼▼
      if (a.art_id === "art_top") {
        // トップカードが選択されたら、artId = null で全コメントを購読
        listenCommentsRealtime(null);
      } else {
        // 通常作品なら、その作品のIDでコメントを絞り込む
        listenCommentsRealtime(a.art_id);
      }
      // ▲▲▲ 修正ここまで ▲▲▲

      // 地図をズームして中央へ
      // ▼▼▼ (a.geometry) の存在チェックを追加 ▼▼▼
      if (opts.flyMap !== false && a.geometry) {
        view.goTo(
          { target: a.geometry, zoom: 16 },
          { animate: true, duration: 800 }
        );
      }
    }
    window.selectArtwork = selectArtwork;

    // 2) MapView
    view = new MapView({
      container: "viewDiv",
      map: webmap,
      // 必要なら固定初期表示
      // center: [139.7671, 35.6812],
      // zoom: 11,
      highlightOptions: {
        color: [255, 200, 0],
        haloOpacity: 0.9,
        fillOpacity: 0.2,
      },
    });

    view.ui.add(new Search({ view }), "top-right");
    view.ui.add(new ScaleBar({ view, unit: "metric" }), "bottom-left");
    view.ui.add(new Locate({ view }), "top-left");

    // 3) WebMap・配下レイヤーがすべて準備できたら
    // ▼▼▼ "async" を削除 ▼▼▼
    webmap.loadAll().then(() => {
      // WebMap内から Survey123 レイヤーを見つける（title または URLで判定）
      // Survey123 レイヤーを WebMap 内から検出
      webmap.allLayers.forEach((layer) => {
        // Survey123レイヤー以外はポップアップをOFF
        if (
          !(
            layer.title?.includes("Layar 作品集") ||
            (layer.url &&
              layer.url.includes(
                "survey123_cff62fc5070c4f468b2c9269d5b2535f/FeatureServer"
              ))
          )
        ) {
          layer.popupEnabled = false;
        }
      });

      const surveyLayer =
        webmap.layers.find(
          (l) => l.title && l.title.includes("Layar 作品集")
        ) ||
        webmap.layers.find(
          (l) =>
            l.url &&
            l.url.includes(
              "survey123_cff62fc5070c4f468b2c9269d5b2535f/FeatureServer"
            )
        );

      if (!surveyLayer) {
        console.error("Survey123 レイヤーが WebMap 内に見つかりません。");
        return;
      }

      // 取得したレイヤーURLを添付取得で使う
      SURVEY_LAYER_URL = surveyLayer.url;

      // 4) データ取得 → カルーセル構築
      // ▼▼▼ "await" を削除し、 .then() に変更 ▼▼▼
      surveyLayer
        .queryFeatures({
          where: "1=1",
          outFields: ["*"], // 必要なフィールド（Mabling, collage, Message, field_25など）を指定する方が望ましい
          returnGeometry: true,

          // ▼▼▼ 以下の2行を追記 ▼▼▼
          orderByFields: ["CreationDate DESC"], // 「作成日(CreationDate)」の降順（新しい順）
          num: 50, // 「50件」に制限する（この数値は調整可能）
        })
        .then((result) => {
          // ▼▼▼ "await" の代わりに .then() で結果を受ける ▼▼▼

          // 1. まずフィーチャ（作品情報）をマップする（この時点では画像URLは空）

          // ▼▼▼ 12時間前のタイムスタンプを計算 ▼▼▼
          const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;

          // ▼▼▼ 重複したコメントと宣言を削除 ▼▼▼
          // (削除済み)

          artworks = result.features.map((f) => {
            // ... rest of the map function
            const attrs = f.attributes;
            const objectId =
              attrs["OBJECTID"] ?? attrs["ObjectID"] ?? attrs["objectid"];

            // ▼▼▼ 変数定義を return の前に移動 ▼▼▼
            const mabling = attrs["Mabling"] || "";
            const collage = attrs["collage"] || "";
            const message = attrs["Message"] || "無題"; // ← title にも使う
            const author =
              attrs["field_25"] ||
              attrs["nickname"] ||
              attrs["name"] ||
              "匿名の作者";

            // ▼▼▼ isNew フラグを追加 ▼▼▼
            const creationTime = attrs["CreationDate"]; // ArcGISの作成日フィールド
            const isNew = creationTime > twelveHoursAgo;

            // ▼▼▼ return するオブジェクトのプロパティを正しく定義 ▼▼▼
            return {
              art_id: "art_" + objectId,
              title: message, // Message を title に使う
              desc: mabling, // Mabling を desc に使う
              collage: collage, // collage プロパティ
              message: message, // message プロパティ
              mabling: mabling, // mabling プロパティ
              author: author, // author プロパティ
              imgUrl: "", // この時点では空
              geometry: f.geometry,
              objectId: objectId,
              isNew: isNew, // 12時間以内かどうかのフラグ
            };
          });

          // 2. 作品のObjectIDのリストを作成
          const allObjectIds = artworks
            .map((a) => a.objectId)
            .filter((id) => id !== -1);

          // 4. カルーセルの先頭に「トップカード」を追加
          // (最適化) ▼▼▼ 添付ファイル取得より *前* に実行する ▼▼▼
          artworks.unshift({
            art_id: "art_top", // 固有のID
            title: "ようこそ！",
            desc: "スクロールして作品を発見！",
            author: "システム",
            imgUrl: "", // 画像なし
            geometry: null, // 位置情報なし
            objectId: -1,
          });

          // 5. 新着サイレンの追加
          bubbleLayer
            .querySelectorAll(".orange-siren")
            .forEach((n) => n.remove());
          artworks.forEach((art) => {
            if (art.isNew && art.geometry) {
              addSirenPulse(art.geometry);
            }
          });

          // 6. (最適化) ▼▼▼ 画像URLが *空* のままカルーセルを即時構築 ▼▼▼
          if (artworks.length > 0) myArtId = artworks[0].art_id;
          buildCarousel(artworks);

          // 7. (最適化) ▼▼▼ 初期選択を「トップカード」に設定 ▼▼▼
          if (artworks[0]) {
            // buildCarousel が完了した後でないと DOM が存在しないため、
            // 初期スクロール位置調整後に selectArtwork を呼ぶ
            // (buildCarousel 内で初期スクロール位置を調整)

            // selectArtwork は window.selectArtwork になっているので、
            // buildCarousel の DOM 構築と初期スクロール設定が終わった後に呼ぶ
            setTimeout(() => {
              selectArtwork(artworks[0].art_id); // art_top を選択
            }, 100); // DOM構築とスクロール位置設定の反映待ち
          }

          // 8. (最適化) ▼▼▼ ここで *非同期* に添付ファイルの取得を開始 ▼▼▼
          if (allObjectIds.length > 0) {
            console.log(
              `[非同期] ${allObjectIds.length} 件の作品の添付ファイルを取得します...`
            );

            surveyLayer
              .queryAttachments({
                // "await" を削除
                objectIds: allObjectIds,
              })
              .then((attachmentsMap) => {
                // .then() で受ける
                console.log(
                  "✅ [非同期] 添付ファイルの取得が完了しました:",
                  attachmentsMap
                );

                // 9. 取得した画像URLを artworks 配列に書き戻し ＆ DOMを更新
                artworks.forEach((art) => {
                  if (art.objectId === -1) return; // トップカードはスキップ

                  const attachments = attachmentsMap[art.objectId];
                  if (attachments && attachments.length > 0) {
                    const sorted = attachments.sort((a, b) => b.size - a.size);
                    art.imgUrl = sorted[0].url; // (1) データモデルを更新

                    // (2) DOMを直接更新 (無限スクロールで複製されたカードも全て対象)
                    const cardElements = carouselTrack.querySelectorAll(
                      `.card[data-art-id="${art.art_id}"]`
                    );
                    cardElements.forEach((cardEl) => {
                      const placeholder =
                        cardEl.querySelector(".card-placeholder");
                      if (placeholder) {
                        const img = document.createElement("img");
                        img.src = art.imgUrl;
                        img.alt = "image";
                        img.loading = "lazy";
                        img.classList.add("lazy-loaded-image"); // CSSでフェードインさせる用
                        placeholder.replaceWith(img);
                      }
                    });
                  }
                });
                console.log(
                  "🖼️ [非同期] 画像URLの artworks への書き戻しとDOM更新が完了しました。"
                );
              })
              .catch((err) => {
                // ▼▼▼ エラーログをより詳細に ▼▼▼
                console.error(
                  "❌ [非同期] queryAttachments または画像URLの書き戻し中にエラーが発生しました:",
                  err
                );
                console.error("エラー詳細:", JSON.stringify(err, null, 2));
              });
          } else {
            console.log("添付ファイルを取得する作品がありませんでした。");
          }
        }); // ▲▲▲ queryFeatures の .then() はここまで

      // 5) ピンをクリック → 対応カードのダイアログ
      view.on("click", async (evt) => {
        const hit = await view.hitTest(evt);
        const feat = hit.results.find(
          (r) => r.graphic && r.graphic.layer === surveyLayer
        )?.graphic;
        if (feat) {
          const a = artworks.find(
            (x) =>
              x.objectId === feat.attributes.OBJECTID ||
              x.objectId === feat.attributes.ObjectID ||
              x.objectId === feat.attributes.objectid
          );
          if (a) openArtDialog(a);
        }
      });
    });

    // みんなでつくる → 自作品を発光
    makeTogetherBtn.addEventListener("click", () => {
      if (!myArtId) return;
      const mine = artworks.find((a) => a.art_id === myArtId);
      if (!mine) return;
      placeGlowPulse(mine.geometry);
    });
  });

  // // 添付ファイルのURL取得（REST 直叩き）
  // async function getAttachment(objectId) {
  //   if (!SURVEY_LAYER_URL) return "";
  //   const url = `${SURVEY_LAYER_URL}/${objectId}/attachments?f=json`;
  //   try {
  //     const res = await fetch(url);
  //     const data = await res.json();
  //     if (!data.attachmentInfos || data.attachmentInfos.length === 0) return "";

  //     const sorted = data.attachmentInfos.sort((a, b) => b.size - a.size);
  //     const attId = sorted[0].id;

  //     // ✅ パブリックデータのため、tokenクエリを削除
  //     return `${SURVEY_LAYER_URL}/${objectId}/attachments/${attId}`;
  //   } catch (e) {
  //     console.warn("添付取得エラー:", e);
  //     return "";
  //   }
  // }

  // --------------------------------------
  // Carousel & Selection（修正版）
  // --------------------------------------
  function buildCarousel(items) {
    console.log("🛠️ buildCarousel が受け取ったデータ:", items);
    carouselTrack.innerHTML = "";

    // ▼▼▼ 修正: 無限ループ用の loopedItems を廃止し、元の items を直接使用 ▼▼▼
    // const loopedItems = [...items.slice(-2), ...items, ...items.slice(0, 2)];

    for (const a of items) { //
      const el = document.createElement("article");
      el.className = "card";
      el.dataset.artId = a.art_id;
      el.dataset.title = a.title;
      el.dataset.author = a.author;
      // ▼▼▼ トップカード用のクラスを追加 ▼▼▼
      el.className = "card";
      if (a.art_id === "art_top") {
        el.classList.add("top-card");
      } else if (a.isNew) {
        // (else if) トップカードは新着扱いにしない
        el.classList.add("new-art");
      }

      // ▼▼▼ インラインスタイルをCSSクラスに置き換え ▼▼▼
      // (最適化) imgUrl が *無くても* プレースホルダーを表示
      el.innerHTML = `
      ${
        a.imgUrl
          ? `<img src="${a.imgUrl}" alt="image" loading="lazy">`
          : a.art_id === "art_top"
          ? `<div class="card-placeholder top-card-placeholder">🌟</div>`
          : `<div class="card-placeholder">No Image</div>`
      }
      <h3>${escapeHtml(a.title)}</h3>
      <p>${escapeHtml(a.desc)}</p>
    `;
      el.addEventListener("click", () => {
        // ▼▼▼ selectArtwork は flyMap: true (デフォルト) で呼び出す ▼▼▼
        selectArtwork(a.art_id);
        setTimeout(() => openArtDialog(a), 100); // 少し遅延させて確実にselected更新
      });

      carouselTrack.appendChild(el);
    }

    // === 初期位置を「トップカード」が中央に来るように設定 ===
    if (!carouselTrack.dataset.initialized) {
      // ▼▼▼ 修正: 無限ループ廃止に伴い、インデックス 2 ではなく art_top を直接探す
      const topCard = carouselTrack.querySelector(
        '.card[data-art-id="art_top"]'
      );

      if (topCard) {
        // topCard の中心がコンテナの中心に来るように scrollTop を設定
        const containerHeight = carouselTrack.clientHeight;
        const cardTop = topCard.offsetTop; // トラック内でのカードの上端位置 (親が track なので offsetTop だけでOK)
        const cardHeight = topCard.offsetHeight;

        // 目標の scrollTop = (カードの上端 + カードの高さ/2) - (コンテナの高さ/2)
        const targetScrollTop =
          cardTop + cardHeight / 2 - containerHeight / 2;

        // console.log("初期スクロール位置を計算:", {containerHeight, cardTop, cardHeight, targetScrollTop});

        carouselTrack.scrollTop = targetScrollTop;
      } else {
        // ▼▼▼ 修正: フォールバック先を 0 (先頭) に変更
        carouselTrack.scrollTop = 0;
      }
      carouselTrack.dataset.initialized = "true"; // ✅ 再実行防止
    }

    // ▼▼▼ 修正: 無限ループ挙動を削除 ▼▼▼
    carouselTrack.addEventListener(
      "scroll",
      throttle(() => {
        // const third = carouselTrack.scrollHeight / 3; // スクロール中に再計算
        // const max = carouselTrack.scrollHeight - carouselTrack.clientHeight;
        // if (carouselTrack.scrollTop > max - 50) {
        //   carouselTrack.scrollTop -= third;
        // } else if (carouselTrack.scrollTop < 50) {
        //   carouselTrack.scrollTop += third;
        // }
        updateActiveCard(); // ← 中央カードを常時検出
      }, 100)
    );

    // === スクロール停止後も確実に更新 ===
    let scrollTimer;
    carouselTrack.addEventListener("scroll", () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => updateActiveCard(), 200);
    });

    // 初期選択 (updateActiveCard) は削除
    // setTimeout(updateActiveCard, 200); // 削除 (map ロード側で art_top を明示的に選択する)
  }

  // --- 既に window.selectArtwork が存在しない場合でも fallback ---
  function callSelectArtwork(artId) {
    if (typeof window.selectArtwork === "function") {
      // ▼▼▼ 修正: スクロール追従時も地図をフライさせる (flyMap: true) ▼▼▼
      window.selectArtwork(artId, { flyMap: true });
    } else {
      console.warn("selectArtwork 未定義です");
    }
  }

  // --------------------------------------
  // 中央カードを検出して選択更新（スクロールで自動変化）
  // --------------------------------------
  function updateActiveCard() {
    const cards = Array.from(carouselTrack.children);
    if (cards.length === 0) return;

    const containerRect = carouselTrack.getBoundingClientRect();
    const centerY = containerRect.top + containerRect.height / 2;

    let closest = null;
    let minDist = Infinity;

    cards.forEach((card) => {
      const rect = card.getBoundingClientRect();
      const cardCenter = rect.top + rect.height / 2;
      const dist = Math.abs(cardCenter - centerY);
      if (dist < minDist) {
        minDist = dist;
        closest = card;
      }
    });

    if (!closest) return;
    const artId = closest.dataset.artId;
    if (selected && selected.art_id === artId) return;

    // ✅ selectArtworkを安全に呼び出す (flyMap: true で)
    callSelectArtwork(artId);
  }

  // --------------------------------------
  // Firestore コメント購読
  // --------------------------------------
  let unsubComments = null;
  function listenCommentsRealtime(artId) {
    // (1) artId を受け取る
    // 🔁 既存購読があれば解除（二重購読防止）
    if (unsubComments) {
      unsubComments();
      unsubComments = null;
    }

    // (2) artId が指定されていない場合は、泡を消して終了
    // if (!artId) { ... }  // ← このブロック(438-441行目)を削除

    // (3) クエリを動的に構築
    let q; // const を let に変更
    if (artId) {
      // (3A) artId がある場合：作品IDで絞り込む
      q = query(
        collection(db, "comments"),
        where("district_id", "==", DISTRICT_ID),
        where("art_id", "==", artId)
      );
    } else {
      // (3B) artId がない場合：学区全体で絞り込む (トップカード用)
      q = query(
        collection(db, "comments"),
        where("district_id", "==", DISTRICT_ID)
      );
    }

    unsubComments = onSnapshot(q, (snapshot) => {
      // 既存の泡を全部クリア
      bubbleLayer.querySelectorAll(".bubble").forEach((n) => n.remove());

      // Firestore上の全コメントを再描画
      snapshot.forEach((doc) => {
        const c = doc.data();
        if (c.geometry) launchBubbleToMap(c);
      });
    });
  }

  // --------------------------------------
  // コメント → 泡アニメーション
  // --------------------------------------
  sendCommentBtn.addEventListener("click", async () => {
    if (!selected) return alert("作品が選択されていません。");
    const text = commentInput.value.trim();
    if (!text) return alert("コメントを入力してください。");

    // --- ArcGIS Point → Firestore対応オブジェクトへ変換 ---
    const geom = selected.geometry;
    const geometryData = geom
      ? {
          x: geom.x,
          y: geom.y,
          spatialReference: geom.spatialReference?.wkid || 4326,
        }
      : null;

    const comment = {
      id: "c-" + crypto.randomUUID(),
      art_id: selected.art_id,
      text,
      anon: commentAnon.checked,
      author: selected.author || "匿名の作者",
      ts: Date.now(),
      geometry: geometryData, // ←ここを変換後で保存！
      district_id: DISTRICT_ID,
    };

    try {
      await addDoc(collection(db, "comments"), comment);
      showToast("💬 コメントを送信しました！");
      commentInput.value = "";
    } catch (e) {
      console.error("Firestore保存エラー:", e);
    }
  });

  // // ✅ ページ再読み込み時に全コメントを再描画
  // function redrawAllComments() {
  //   bubbleLayer.querySelectorAll(".bubble").forEach((n) => n.remove());
  //   const items = loadComments();
  //   for (const c of items) {
  //     if (!c.geometry) continue;
  //     launchBubbleToMap(c);
  //   }
  // }
  // ========================================
  // 💭 コメント → 作品位置へ飛んで漂う泡
  // ========================================
  function launchBubbleToMap(comment) {
    // ▼▼▼ geometry と x, y の存在をより厳密にチェック ▼▼▼
    if (
      !view ||
      !comment.geometry ||
      typeof comment.geometry.x !== "number" ||
      typeof comment.geometry.y !== "number"
    ) {
      return; // geometry が null または x, y が数値でない場合は泡を表示しない
    } // 🔹 ArcGISのprojectionモジュールで座標変換を行う
    // ▲▲▲ 修正ここまで ▲▲▲

    require(["esri/geometry/Point", "esri/geometry/projection"], (
      Point,
      projection
    ) => {
      const geomData = comment.geometry; // ここに来る geomData は x, y を持つはず // Firestore保存形式からArcGIS Pointへ変換

      const point = new Point({
        x: geomData.x,
        y: geomData.y,
        spatialReference: { wkid: geomData.spatialReference || 4326 },
      });
      // ... (rest of the function) ...

      // projectionエンジンをロード
      projection.load().then(() => {
        // ✅ viewの座標系(WebMercator)へ変換
        const projected = projection.project(point, view.spatialReference);

        // ---- 泡ノード作成 ----
        const node = document.createElement("div");
        node.className = "bubble float";
        node.textContent = comment.text;
        bubbleLayer.appendChild(node);

        // 作品の座標をスクリーン座標に変換
        const pt = view.toScreen(projected);

        // 少しランダムなズレを加えて「近くで漂う」
        const offsetX = (Math.random() - 0.5) * 100;
        const offsetY = (Math.random() - 0.5) * 80;
        node.style.left = `${pt.x + offsetX}px`;
        node.style.top = `${pt.y + offsetY}px`;

        // 🌬 漂うアニメーション
        animateFloatingBubble(node, pt.x + offsetX, pt.y + offsetY);

        // ビュー移動時にも追従
        const updatePos = () => {
          const p = view.toScreen(projected);
          node.style.left = `${p.x + offsetX}px`;
          node.style.top = `${p.y + offsetY}px`;
        };
        view.watch("extent", throttle(updatePos, 80));
        view.on("pointer-move", throttle(updatePos, 150));
      });
    });
  }

  // 🎈 漂うモーション
  function animateFloatingBubble(el, baseX, baseY) {
    const range = 10 + Math.random() * 10;
    const speed = 4000 + Math.random() * 2000;

    el.animate(
      [
        { transform: "translate(0, 0)", opacity: 1 },
        {
          transform: `translate(${
            Math.sin(Date.now() / speed) * range
          }px, -${range}px)`,
          opacity: 0.95,
        },
        { transform: "translate(0, 0)", opacity: 1 },
      ],
      {
        duration: speed * 2,
        iterations: Infinity,
        easing: "ease-in-out",
      }
    );
  }
  // --------------------------------------
  // 作品ダイアログ（Survey123の内容表示）
  // --------------------------------------
  // async function openArtDialog(a) {
  function openArtDialog(a) {
    dialogTarget = a;

    const mabling = a.mabling || "（説明なし）";
    const collage = a.collage || "（説明なし）";
    const message = a.message || "（メッセージなし）";
    // const imgUrl =
    //   // a.imgUrl || (a.objectId ? await getAttachment(a.objectId) : "");

    // (最適化) a.imgUrl がまだ無くても、このダイアログが開く時点では
    // データモデル (artworks 配列) にはセットされているはず
    const imgUrl = a.imgUrl || "";

    // ✅ タイトル反映
    artDialogTitle.textContent = a.title || "（タイトルなし）";

    const contentHtml = `
    <div class="art-content">
      <div class="art-image-wrap">
        ${
          imgUrl
            ? `<img id="artDialogImage" class="art-image" src="${imgUrl}" alt="作品画像">`
            : `<div class="art-image noimg">No Image</div>`
        }
      </div>
      <div class="art-info-grid">
        <div class="art-box">
          <h4>🎨 マーブリングのポイント</h4>
          <p>${escapeHtml(mabling)}</p>
        </div>
        <div class="art-box">
          <h4>🧩 コラージュのポイント</h4>
          <p>${escapeHtml(collage)}</p>
        </div>
        <div class="art-box">
          <h4>💬 メッセージ</h4>
          <p>${escapeHtml(message)}</p>
        </div>
      </div>
    </div>
  `;

    artDialog.querySelector(".art-dialog-body").innerHTML = contentHtml;
    artDialog.showModal?.();

    // --- 地図ズーム ---
    if (view && a.art_id !== "art_top" && a.geometry) {
      view.goTo(
        { target: a.geometry, zoom: 16 }, // ↓ goTo の第2引数 options の指定方法を修正
        { duration: 800, easing: "ease-in-out" }
      );
    }
  }

  // ✅ ここから次の行に続ける（artDialogCloseなど）
  artDialogClose.addEventListener("click", () => artDialog.close());

  // === 協作リクエスト開始 ===
  requestCollabBtn.addEventListener("click", () => {
    if (!dialogTarget) return;

    // ✅ 作品名ではなく「制作者」に表示を変更
    const targetAuthor = dialogTarget.author || "制作者";
    confirmText.textContent = `${targetAuthor} さんに協作をリクエストします。よろしいですか？`;

    confirmDialog.showModal();
  });

  // === キャンセル時 ===
  confirmCancel.addEventListener("click", () => confirmDialog.close());

  // === 送信時 ===
  confirmOk.addEventListener("click", () => {
    confirmDialog.close();
    artDialog.close();

    if (dialogTarget) {
      launchBubbleToMap({
        id: "req-" + crypto.randomUUID(),
        art_id: dialogTarget.art_id,
        text: "✉協作リクエスト送信",
        geometry: dialogTarget.geometry,
        ts: Date.now(),
      });

      setTimeout(() => {
        const targetAuthor = dialogTarget.author || "制作者";
        // ✅ alert → トースト通知に変更
        showToast(
          `✉${targetAuthor} さんに協作リクエストを送信しました！<br>一緒に作品をつくる準備をしましょう！`
        );
      }, 150);
    }
  });

  // --------------------------------------
  // 自作品発光
  // --------------------------------------
  function placeGlowPulse(geometry) {
    if (!view) return;
    const node = document.createElement("div");
    node.className = "glow-pulse";
    bubbleLayer.appendChild(node);
    setTimeout(() => node.remove(), 5000);

    const updatePos = () => {
      const pt = view.toScreen(geometry);
      node.style.left = `${pt.x}px`;
      node.style.top = `${pt.y}px`;
    };
    updatePos();
    view.watch("extent", throttle(updatePos, 50));
    view.on("pointer-move", throttle(updatePos, 100));
  }

  // --------------------------------------
  // 新着作品サイレン（オレンジ）
  // --------------------------------------
  function addSirenPulse(geometry) {
    if (!view) return;
    const node = document.createElement("div");
    node.className = "glow-pulse orange-siren"; // CSSクラスを変更
    bubbleLayer.appendChild(node);
    // ※ setTimeoutでの削除は行わない（常時表示）

    const updatePos = () => {
      const pt = view.toScreen(geometry);
      node.style.left = `${pt.x}px`;
      node.style.top = `${pt.y}px`;
    };
    updatePos();
    view.watch("extent", throttle(updatePos, 50));
    view.on("pointer-move", throttle(updatePos, 100));
  }

  // --------------------------------------
  // Utils
  // --------------------------------------
  function initAccountChip() {
    const initials = ["P", "M", "D", "K"][Math.floor(Math.random() * 4)];
    document.getElementById("avatar").textContent = initials;
    document.getElementById("displayName").textContent = "Guestさん";
  }
  function escapeHtml(s) {
    return (s || "").replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[m])
    );
  }
  function throttle(fn, wait) {
    let t = 0,
      saved = null;
    return function (...args) {
      const now = Date.now();
      if (!t || now - t >= wait) {
        t = now;
        fn.apply(this, args);
      } else {
        clearTimeout(saved);
        saved = setTimeout(() => {
          t = 0;
          fn.apply(this, args);
        }, wait - (now - t));
      }
    };
  }

  // ✅ トースト通知関数
  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = message;

    document.body.appendChild(toast);

    // 3秒後にフェードアウトして削除
    setTimeout(() => {
      toast.classList.add("hide");
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }
})();