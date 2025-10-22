document.addEventListener("DOMContentLoaded", function() {

require([
  "esri/WebMap",
  "esri/views/MapView",
  "esri/layers/FeatureLayer",
  "esri/widgets/Legend"
], function(WebMap, MapView, FeatureLayer, Legend) {

  // フロー全体で使う変数をここで定義します
  let currentStep = 1; // 現在の鑑賞ステップ
  let featureAttributes = null; // 作品の属性情報（解説文など）
  let originalFeature = null; // 作品のフィーチャ（ジオメトリを含む）を保存
  let relatedHazardCheckboxes = []; // Step1で操作対象となるチェックボックスのリスト
  let clickedCheckboxes = new Set(); // Step1でクリック済みのチェックボックスを記録

  // 既存の要素への参照（先にまとめて取得）
  let instructionTitle, interactionPanel, nextButton, backToTopButton, 
      artPanel, artworkInfo, mapPanel, rightColumn, leftColumn, filterWidget, buttonWrapper;
  let step1PanelHTML = null; // ★Step 1 のパネルHTMLを保存する変数

  const objectId = parseInt(new URLSearchParams(window.location.search).get("id"));
  if (!objectId) return;

  // ★★★ ハザード情報をグローバルスコープに移動 ★★★
  const allHazardsInfo = {
      "下水があふれる洪水（内水氾濫）": { layerTitle: "naisui_R7_clip", checkboxId: "naisui_R7-filter" },
      "川の水があふれる洪水（外水氾濫）": { layerTitle: "gaisui_clip", checkboxId: "gaisui-filter" },
      "土砂災害マップ": { layerTitle: "kyukeisha_R7_clip", checkboxId: "kyukeisha_R7-filter" },
      "高潮（浸水深）": { layerTitle: "takashio_clip", checkboxId: "takashio-filter" },
      "津波（浸水深、慶長型地震）": { layerTitle: "tsunami_clip", checkboxId: "tsunami-filter" },
      "震度情報（元禄型関東地震）": { layerTitle: "jishindo_clip", checkboxId: "jishindo-filter" },
      "地震火災（元禄型関東地震）": { layerTitle: "shoshitsu_clip", checkboxId: "shoshitsu-filter" },
      "地盤の液状化（元禄型関東地震）": { layerTitle: "ekijyouka_clip", checkboxId: "ekijyoukakiken-filter" }
  };

  const artPinsLayer = new FeatureLayer({
    url: "https://services2.arcgis.com/xpOLkBdwWTLJMFA7/arcgis/rest/services/survey123_cff62fc5070c4f468b2c9269d5b2535f/FeatureServer/0"
  });

  const webmap = new WebMap({ portalItem: { id: "fae46914acba46b98226dd452fee9e8f" } });
  const view = new MapView({ container: "surrounding-map", map: webmap, ui: { components: ["zoom"] } });

  artPinsLayer.queryFeatures({
    where: `objectid = ${objectId}`,
    outFields: ["*"],
    returnGeometry: true
  }).then(results => {

    // --- DOM要素を変数に格納 ---
    instructionTitle = document.querySelector(".instruction-title");
    interactionPanel = document.querySelector(".interaction-panel");
    nextButton = document.getElementById("next-button");
    backToTopButton = document.getElementById("back-to-top-button");
    artPanel = document.querySelector(".art-panel");
    artworkInfo = document.getElementById("artwork-info");
    mapPanel = document.querySelector(".map-panel");
    rightColumn = document.querySelector('.right-column');
    leftColumn = document.querySelector('.left-column');
    filterWidget = document.getElementById("filter-widget");
    buttonWrapper = document.querySelector('.button-wrapper');
    step1PanelHTML = interactionPanel.innerHTML; // ★Step 1 のHTMLを保存
    
    if (results.features.length === 0) return;

    // --- 作品データをセット ---
    originalFeature = results.features[0]; 
    featureAttributes = originalFeature.attributes;
    
    document.getElementById("artwork-info").innerHTML = `<div class="info-label">作者: ${featureAttributes.field_25}</div>`;
    artPinsLayer.queryAttachments({ objectIds: [objectId] }).then(attachments => {
      if (attachments[objectId] && attachments[objectId].length > 0) {
        document.getElementById("art-image").src = attachments[objectId][0].url;
      }
    });

    // --- 地図とレイヤーの準備 ---
    view.when(() => {
      const artPinsLayerOnMap = webmap.allLayers.find(layer => layer.title === "survey");
      if (artPinsLayerOnMap) artPinsLayerOnMap.definitionExpression = `objectid = ${objectId}`;
      view.goTo({ target: originalFeature.geometry, zoom: 15 });

      // ハザードレイヤーを一旦すべて非表示に
      Object.values(allHazardsInfo).forEach(info => {
          const layer = webmap.allLayers.find(l => l.title === info.layerTitle);
          if (layer) layer.visible = false;
      });

      // --- チェックボックスを生成 ---
      const hazardTypeString = featureAttributes.field_24; 
      if (hazardTypeString) {
        const hazardNames = hazardTypeString.split(',').map(name => name.trim());
        filterWidget.innerHTML = '<h3>表示するハザードマップ</h3>';

        hazardNames.forEach(name => {
            const hazardInfo = allHazardsInfo[name];
            if (hazardInfo) {
                const optionDiv = document.createElement("div");
                optionDiv.className = "filter-option";
                optionDiv.innerHTML = `<input type="checkbox" id="${hazardInfo.checkboxId}" value="${hazardInfo.layerTitle.replace('_clip','')}"><label for="${hazardInfo.checkboxId}">${name}</label>`;
                filterWidget.appendChild(optionDiv);
                
                // Step1の対象となるチェックボックスをリストに追加
                relatedHazardCheckboxes.push(document.getElementById(hazardInfo.checkboxId));
            }
        });
        
        // ★ 凡例の初回生成を呼び出す
        createLegend();
        
        // ★ 凡例生成時にレイヤーを非表示にする処理もここに移動
        hazardNames.forEach(name => {
          const layerInfo = allHazardsInfo[name];
          const layer = layerInfo ? webmap.allLayers.find(l => l.title === layerInfo.layerTitle) : null;
          if(layer) {
              layer.visible = false;
              const checkbox = document.getElementById(layerInfo.checkboxId);
              if (checkbox) checkbox.checked = false;
          }
        });
      }
      
      // --- チェックボックスのイベントリスナー ---
      document.querySelectorAll('#filter-widget input[type="checkbox"]').forEach(checkbox => {
          const matchingHazard = Object.values(allHazardsInfo).find(info => info.checkboxId === checkbox.id);
          if (matchingHazard) {
              const layer = webmap.allLayers.find(l => l.title === matchingHazard.layerTitle);
              if (layer) {
                  checkbox.addEventListener('change', () => { 
                      layer.visible = checkbox.checked;
                      
                      // Step1の作業チェック
                      if (currentStep === 1) {
                          checkStep1Completion(checkbox);
                      }
                  });
              }
          }
      });
      
      // --- Step1の初期化 ---
      initializeStep1();
    });

    // --- メインのボタンイベントリスナー ---

    // 「戻る」ボタンのメインの動作を、新しい関数で管理する
    backToTopButton.addEventListener("click", handleBackButtonClick);

    function handleBackButtonClick() {
      if (currentStep === 1) {
        // Step 1 の時はトップページへ
        window.location.href = "index.html";
      } else {
        // Step 2以降は前のステップへ
        goToPreviousStep();
      }
    }

    // 「次へ」ボタン
    nextButton.addEventListener("click", () => {
      goToNextStep();
    });

  }); // queryFeatures の .then() の終わり

  // ★★★ 凡例を（再）生成する関数 ★★★
  function createLegend() {
    console.log("凡例を（再）生成します...");
    
    const hazardTypeString = featureAttributes.field_24; 
    if (!hazardTypeString) return; // ハザードがなければ何もしない

    const hazardNames = hazardTypeString.split(',').map(name => name.trim());
    
    const legendLayerInfos = hazardNames.map(name => {
      const layerInfo = allHazardsInfo[name]; // グローバル変数を参照
      const layer = layerInfo ? webmap.allLayers.find(l => l.title === layerInfo.layerTitle) : null;
      return layer ? { layer: layer, title: name } : null;
    }).filter(info => info !== null);

    if (legendLayerInfos.length > 0) {
      const legendContainer = document.getElementById("legend-container");
      if (legendContainer) {
        legendContainer.innerHTML = ''; // 既存の凡例をクリア
      } else {
        // Step 1 以外のパネル（凡例コンテナがない）の場合はここで終了
        return; 
      }
      
      new Legend({ 
        view: view, 
        layerInfos: legendLayerInfos, 
        container: legendContainer
      });
    }
  }

  /**
   * Step 1（危険当て作業）の初期設定
   */
  function initializeStep1() {
    instructionTitle.textContent = "このアート作品が示す「危険」は何でしょう？ ハザードマップを操作して危険を確認してみましょう。";
    
    // 1. ボタンの状態をリセット
    nextButton.disabled = true; // まずは無効化
    backToTopButton.textContent = "トップに戻る";
    nextButton.textContent = "次へ→";

    // 2. パネルの中身を、保存しておいた Step 1 のHTMLに戻す
    interactionPanel.innerHTML = step1PanelHTML;
    interactionPanel.classList.remove("expanded");
    
    // 3. 凡例を再生成する
    createLegend();
    
    // 4. レイヤーのチェックボックスと表示をリセットする
    document.querySelectorAll('#filter-widget input[type="checkbox"]').forEach(checkbox => {
      const matchingHazard = Object.values(allHazardsInfo).find(info => info.checkboxId === checkbox.id);
      if (matchingHazard) {
          const layer = webmap.allLayers.find(l => l.title === matchingHazard.layerTitle);
          if (layer) {
              layer.visible = false;
              checkbox.checked = false;
          }
      }
    });

    // 5. Step 1 の完了チェック状態もリセット
    clickedCheckboxes.clear();

    // 6. もし関連するチェックボックスが0個だったら（＝ハザード紐付けなし作品）
    if (relatedHazardCheckboxes.length === 0) {
        nextButton.disabled = false;
    }
  }

  /**
   * Step 1の作業完了をチェックする関数
   */
  function checkStep1Completion(clickedCheckbox) {
    // クリックされたチェックボックスをSetに追加
    clickedCheckboxes.add(clickedCheckbox.id);
    
    // クリックされた数が、関連するチェックボックスの総数と同じになったら
    if (clickedCheckboxes.size === relatedHazardCheckboxes.length) {
      // 「次へ」ボタンを有効化
      nextButton.disabled = false;
    }
  }

  /**
   * 「次へ」ボタンが押された時に、ステップを進めるメインの関数
   */
  function goToNextStep() {
    currentStep++; // ステップを次に進める

    // Step 2 以降に進んだら、ボタンのテキストを「前に戻る」に変更
    if (currentStep > 1) {
      backToTopButton.textContent = "前のステップに戻る";
    }
    
    switch (currentStep) {
      case 2: // Step 2: 危険の答え合わせ
        showStep2_DangerExplanation();
        break;
      case 3: // Step 3: 行動の作業
        showStep3_ActionTask();
        break;
      case 4: // Step 4: 行動の答え合わせ
        showStep4_ActionExplanation();
        break;
      case 5: // Step 5: 共感（メッセージ）＆ 周辺の作品への分岐
        // Step 5 はパネル内に専用ボタンがあるので、メインのボタンは非表示
        buttonWrapper.style.display = 'none';
        showStep5_MessageAndNearby(featureAttributes);
        break;
      case 6: // Step 6: 制作への誘い
        showCreationPrompt();
        break;
    }
  }

  /**
   * 「前に戻る」ボタンが押された時に、ステップを戻すメインの関数
   */
  function goToPreviousStep() {
    currentStep--; // ステップを一つ戻す
    
    // ★ 戻る処理の共通設定 ★
    // メインのボタンラッパーを再表示
    buttonWrapper.style.display = 'flex';
    // interactionPanel を再表示（Step 5 で非表示にされているため）
    interactionPanel.style.display = 'block';
    
    switch (currentStep) {
      case 1:
        initializeStep1(); // Step 1 の関数（テキストも「トップに戻る」に戻る）
        
        // ★ 戻ってきた時は、Step 1 の作業（チェックボックス）をスキップできるようにする
        nextButton.disabled = false;
        
        break;
      case 2:
        showStep2_DangerExplanation();
        break;
      case 3:
        showStep3_ActionTask();
        break;
      case 4:
        showStep4_ActionExplanation();
        break;
    }

    // Step 1 以外は「戻る」ボタンのテキストを設定
    if (currentStep > 1) {
      backToTopButton.textContent = "前のステップに戻る";
    }
  }

  /**
   * Step 2: 危険の解説を表示
   */
  function showStep2_DangerExplanation() {
    instructionTitle.textContent = "作者が注目した『危険』";
    interactionPanel.innerHTML = `
      <div class="explanation-panel">
        <h4>公式の危険（行政目線）</h4>
        <p>この作品は、主に「${featureAttributes.field_24}」をテーマにしています。</p>
        <h4>住民目線の危険（マーブリング解説）</h4>
        <p>${featureAttributes.Mabling}</p>
      </div>
    `;
    // 「次へ」ボタンのテキストを更新
    nextButton.textContent = "防災行動を考える →";
  }

  /**
   * Step 3: 行動の作業を表示
   */
  function showStep3_ActionTask() {
    instructionTitle.textContent = "この『リアルな危険』に対し、どんな行動がとれるでしょう？ コラージュの形から想像して、下のキーワードを選んでみてください";
    
    const actionKeywords = ["高いところへ逃げる", "頑丈な建物に入る", "物を準備する", "周りの人と助け合う"];
    
    let buttonsHTML = '<div class="action-keywords-container">';
    actionKeywords.forEach(keyword => {
      buttonsHTML += `<button class="emotion-button action-keyword">${keyword}</button>`;
    });
    buttonsHTML += '</div>';
    
    interactionPanel.innerHTML = buttonsHTML;

    // 「次へ」ボタンを再度無効化
    nextButton.disabled = true;
    nextButton.textContent = "行動の解説を見る →";

    // キーワードボタンにイベントリスナーを追加
    document.querySelectorAll('.action-keyword').forEach(button => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.action-keyword').forEach(btn => btn.classList.remove('selected'));
        button.classList.add('selected');
        nextButton.disabled = false;
      }, { once: false });
    });
  }

  /**
   * Step 4: 行動の解説を表示
   */
  function showStep4_ActionExplanation() {
    instructionTitle.textContent = "作者が考えた『防災行動』";
    
    // Mabling が null (未入力) の場合に備える
    let dangerSummary = "（危険の解説はありません）";
    if (featureAttributes.Mabling && featureAttributes.Mabling.length > 0) {
      dangerSummary = featureAttributes.Mabling.substring(0, 40) + "...";
    }
    const collageText = featureAttributes.collage || "（行動の解説はありません）";
    
    interactionPanel.innerHTML = `
      <div class="explanation-panel">
        <div class="related-danger-summary">
          <strong>関連する危険:</strong> ${dangerSummary}
        </div>
        <h4>住民目線の行動（コラージュ解説）</h4>
        <p>${collageText}</p>
      </div>
    `;
    nextButton.textContent = "作者の想いを見る →";
  }

  /**
   * Step 5: 共感（メッセージ）と 周辺の作品への分岐
   */
  function showStep5_MessageAndNearby(attributes) {

    // 左カラムもリセット（周辺の作品リストを消す）
    leftColumn.innerHTML = '';

    // メインのボタンラッパーを「先に」非表示にする
    buttonWrapper.style.display = 'none';

    // --- ① 最初にレイアウトをリセットする ---
    rightColumn.innerHTML = ''; 
    rightColumn.appendChild(mapPanel); 
    rightColumn.appendChild(interactionPanel); 
    interactionPanel.style.display = 'block'; // ★非表示になっていたら表示に戻す
    rightColumn.appendChild(buttonWrapper);

    // 左カラムのアートと情報を再表示
    artworkInfo.style.display = 'block';
    artPanel.style.display = 'flex';
    leftColumn.appendChild(artworkInfo);
    leftColumn.appendChild(artPanel);

    // --- ② タイトルと解説をセット ---
    instructionTitle.textContent = "作者の解説を見てみましょう！";
    interactionPanel.classList.add("expanded");

      // null チェック
      const messageText = attributes.Message || "（メッセージはありません）";
      const authorText = attributes.field_25 || "（作者情報はありません）";
      const mablingText = attributes.Mabling || "（危険の解説はありません）";
      const collageText = attributes.collage || "（行動の解説はありません）";

      // 感想ボタンのHTML
      const reactionButtonsHTML = `
        <hr>
        <p class="reaction-prompt">この作品に共感したら、感想を送ってみましょう</p>
        <div class="reaction-buttons-container">
          <button class="emotion-button reaction-btn">ありがとう</button>
          <button class="emotion-button reaction-btn">新しい発見</button>
          <button class="emotion-button reaction-btn">役に立った</button>
          <button class="emotion-button reaction-btn">実践してみたい</button>
        </div>
        <hr style="margin-top: 20px;">
      `;

      // 解説パネルの中身をHTMLで組み立てます。
      const explanationHTML = `<div class="explanation-panel">
        <h4>メッセージ</h4><p>${messageText}</p>
        <h4>作者</h4><p>${authorText}</p>
        <h4>住民目線の危険（マーブリング解説）</h4><p>${mablingText}</p>
        <h4>住民目線の行動（コラージュ解説）</h4><p>${collageText}</p>
        
        ${reactionButtonsHTML}
        
        <div class="creation-buttons" style="margin-top: 20px; justify-content: flex-end;">
          <button id="back-to-step4-button" class="nav-button btn-secondary">前に戻る</button>
          <button id="summary-button" class="nav-button btn-primary">周辺の作品を見る</button>
        </div>
        </div>`;
      interactionPanel.innerHTML = explanationHTML; // ★解説をセット
      
      // 感想ボタンにクリックイベントを設定
      document.querySelectorAll('.reaction-btn').forEach(button => {
        button.addEventListener('click', () => {
          document.querySelectorAll('.reaction-btn').forEach(btn => btn.classList.remove('selected'));
          button.classList.add('selected');
          console.log("感想:", button.textContent);
        });
      });

      // Step 5 -> Step 4 に戻るボタンのリスナー
      document.getElementById("back-to-step4-button").addEventListener("click", () => {
        goToPreviousStep();
      });

      // --- ③ 「周辺の作品を見る」ボタンのイベントリスナーを設定 ---
      document.getElementById("summary-button").addEventListener("click", () => {
        
        instructionTitle.textContent = "周辺の作品を見てみましょう";
        buttonWrapper.style.display = 'none';
        interactionPanel.style.display = 'none';
        leftColumn.innerHTML = '<p style="text-align: center; margin-top: 20px;">周辺の作品を検索中...</p>'; 

        artPinsLayer.queryFeatures({
          geometry: originalFeature.geometry, 
          distance: 5, 
          units: "kilometers",
          num: 4, 
          where: `objectid <> ${objectId}`, 
          outFields: ["*"]
        }).then(nearbyResults => {
          
          const allFeatures = [originalFeature].concat(nearbyResults.features);
          view.goTo(allFeatures);
          const artPinsLayerOnMap = webmap.allLayers.find(layer => layer.title === "survey");
          if (artPinsLayerOnMap) artPinsLayerOnMap.definitionExpression = null;
          
          if (nearbyResults.features.length > 0) {
            
            // 1. 画像を取得する「試み」
            artPinsLayer.queryAttachments({ 
              objectIds: nearbyResults.features.map(f => f.attributes.objectid) 
            }).then(attachmentsMap => {
              // 2A. 画像取得に「成功」した場合
              console.log("画像の取得に成功しました。");
              displayNearbyWorks(nearbyResults.features, attachmentsMap);
            }).catch(err => {
              // 2B. 画像取得に「失敗」した場合
              console.error("作品画像の読み込みに失敗しました:", err);
              // 画像なし（空っぽの attachmentsMap）でリスト表示を強行
              displayNearbyWorks(nearbyResults.features, {}); 
            });

          } else {
            // 3. 周辺に作品が「0件」だった場合
            displayNearbyWorks_NoResults();
          }
        }).catch(err => {
          // 4. 周辺作品の「検索自体」に失敗した場合
          console.error("周辺の作品の検索に失敗しました:", err);
          leftColumn.innerHTML = `<div class="list-wrapper-left">
              <p class="no-nearby-works">エラー: 周辺の作品を読み込めませんでした。</p>
              <div class="panel-footer-buttons">
                <button id="back-to-explanation-button" class="nav-button btn-secondary">解説に戻る</button>
              </div>
            </div>`;
          document.getElementById("back-to-explanation-button").addEventListener("click", () => showStep5_MessageAndNearby(featureAttributes));
        });
      }); // 「周辺の作品を見る」ボタンのリスナー終わり
  } // showStep5_MessageAndNearby 関数の終わり

  /**
   * 周辺の作品リストを（画像あり or なしで）表示する
   */
  function displayNearbyWorks(features, attachmentsMap) {
    let nearbyWorksHTML = '<div class="list-wrapper-left">';
    nearbyWorksHTML += '<div class="nearby-works-list-vertical">'; // リスト本体

    const viewedIds = JSON.parse(localStorage.getItem("viewedArtIds")) || [];

    features.forEach(nearbyFeature => {
      const nearbyId = nearbyFeature.attributes.objectid;
      const attachments = attachmentsMap[nearbyId] || []; 
      const imageUrl = (attachments.length > 0) ? attachments[0].url : "";
      const author = nearbyFeature.attributes.field_25 || "（作者情報なし）"; 
      const isViewed = viewedIds.includes(nearbyId);
      const viewedClass = isViewed ? ' viewed' : '';
      const viewedLabel = isViewed ? `<span class="viewed-label">鑑賞済み</span>` : '';

      nearbyWorksHTML += `
        <a href="detail.html?id=${nearbyId}" class="nearby-work-item-vertical${viewedClass}">
          <img src="${imageUrl}" alt="アート作品${imageUrl ? '' : '（画像なし）'}">
          <div class="nearby-work-info">
            <p class="nearby-author">作者: ${author}</p>
            ${viewedLabel}
          </div>
        </a>`;
    });
    nearbyWorksHTML += '</div>';

    const buttonsHTML = `<div class="panel-footer-buttons">
        <button id="back-to-explanation-button" class="nav-button btn-secondary">解説に戻る</button>
        <button id="finish-button" class="nav-button btn-primary">鑑賞を終わる</button>
      </div>`;
    nearbyWorksHTML += buttonsHTML + '</div>';

    leftColumn.innerHTML = nearbyWorksHTML;
    document.getElementById("back-to-explanation-button").addEventListener("click", () => showStep5_MessageAndNearby(featureAttributes));
    document.getElementById("finish-button").addEventListener("click", goToNextStep); 
  }

  /**
   * 周辺の作品が「0件」だった場合に表示する
   */
  function displayNearbyWorks_NoResults() {
    const noNearbyHTML = `
      <div class="list-wrapper-left">
        <p class="no-nearby-works">周辺に他の作品はありませんでした。</p>
        <div class="panel-footer-buttons">
          <button id="back-to-explanation-button" class="nav-button btn-secondary">解説に戻る</button>
          <button id="finish-button" class="nav-button btn-primary">鑑賞を終わる</button>
        </div>
      </div>`;
    leftColumn.innerHTML = noNearbyHTML;

    document.getElementById("back-to-explanation-button").addEventListener("click", () => showStep5_MessageAndNearby(featureAttributes));
    document.getElementById("finish-button").addEventListener("click", goToNextStep);
  }


  /**
   * Step 6: 制作への誘い
   */
  function showCreationPrompt() {

    // 1. メインの案内文を更新する
    instructionTitle.textContent = "この地域の情報をアートで共有しませんか？";

    // 2. プロンプトのHTMLを作成（まずローディング表示）
    // ★ rightColumn にセット
    rightColumn.innerHTML = `
      <div class="creation-prompt">
        <p>作品数を読み込み中...</p>
      </div>`;
    
    // 3. 作品総数を取得
    artPinsLayer.queryFeatureCount().then(count => {
      
      const creationPromptHTML = `
        <div class="creation-prompt">
          <div class="artwork-count">
            現在 <strong>${count}</strong> 作品が集まっています！
          </div>
          <p>あなたが見つけた地域の危険や、とるべき避難行動をアート作品にして、他の人に共有することができます。</p>
          
          <div class="creation-buttons-vertical"> 
            <button id="create-yes-button" class="nav-button btn-primary">はい、アートを作る</button>
            <button id="create-simple-button" class="nav-button btn-primary">まずは簡易体験をしてみる</button>
            <button id="create-no-button" class="nav-button btn-secondary">いいえ、マップに戻る</button>
          </div>
        </div>`;

      // 4.「rightColumn」の中身を入れ替える
      rightColumn.innerHTML = creationPromptHTML;

      // 5. 新しく作ったボタンに、クリックされたときの動作を設定する
      document.getElementById("create-yes-button").addEventListener("click", () => {
        alert("アート作成機能は準備中です！");
      });
      document.getElementById("create-simple-button").addEventListener("click", () => {
        alert("簡易体験ツールは準備中です！");
      });
      document.getElementById("create-no-button").addEventListener("click", () => {
        const viewedIds = JSON.parse(localStorage.getItem("viewedArtIds")) || [];
        if (!viewedIds.includes(objectId)) {
          viewedIds.push(objectId);
          localStorage.setItem("viewedArtIds", JSON.stringify(viewedIds));
        }
        window.location.href = "index.html";
      });

    }).catch(err => {
      console.error("作品数のカウントに失敗しました:", err);
      showCreationPrompt_NoCount(); // カウントなしで表示
    });
  }

  /**
   * カウント取得に失敗した場合の予備関数
   */
  function showCreationPrompt_NoCount() {
    instructionTitle.textContent = "この地域の情報をアートで共有しませんか？";

    const creationPromptHTML = `
      <div class="creation-prompt">
        <p>あなたが見つけた地域の危険や、とるべき避難行動をアート作品にして、他の人に共有することができます。</p>
        <div class="creation-buttons-vertical"> 
          <button id="create-yes-button" class="nav-button btn-primary">はい、アートを作る</button>
          <button id="create-simple-button" class="nav-button btn-primary">まずは簡易体験をしてみる</button>
          <button id="create-no-button" class="nav-button btn-secondary">いいえ、マップに戻る</button>
        </div>
      </div>`;

    // rightColumn にセット
    rightColumn.innerHTML = creationPromptHTML;
    
    // ボタンの動作設定
    document.getElementById("create-yes-button").addEventListener("click", () => alert("アート作成機能は準備中です！"));
    document.getElementById("create-simple-button").addEventListener("click", () => alert("簡易体験ツールは準備中です！"));
    document.getElementById("create-no-button").addEventListener("click", () => {
      const viewedIds = JSON.parse(localStorage.getItem("viewedArtIds")) || [];
      if (!viewedIds.includes(objectId)) {
        viewedIds.push(objectId);
        localStorage.setItem("viewedArtIds", JSON.stringify(viewedIds));
      }
      window.location.href = "index.html";
    });
  }
});
}); // require の終わり