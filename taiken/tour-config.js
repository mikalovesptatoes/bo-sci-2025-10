// tour-config.js
export const GUIDE = {
  chapters: [
    {
      id: "intro",
      title: "導入",
      steps: [
        {
          id: "welcome",
          type: "modal",
          content: {
            title: "ようこそ！マーブリングの世界へ！",
            body: "マーブリング作品制作を体験しましょう。途中でスキップもできます。"
          },
          cta: { primary: "はじめる", secondary: "スキップ" },
          advance: { mode: "click-cta" }
        }
      ]
    },
    {
      id: "draw",
      title: "描画",
      steps: [
        {
          id: "pick-color",
          type: "spotlight",
          target: "#ctrl-fore-color",
          content: { title: "色を選ぼう", body: "ここで色を選びます。" },
          advance: { mode: "event", name: "color:change", fallbackClickSelector: "#ctrl-fore-color" }
        },
        {
          id: "brush",
          type: "spotlight",
          target: "#ctrl-brush",
          content: { title: "太さを調整", body: "スライダーで線の太さを変えます。" },
          advance: { mode: "next" }
        },
        {
          id: "stroke",
          type: "spotlight",
          target: "main#stage canvas",
          content: { title: "線を描こう", body: "キャンバス上をドラッグして1本描きます。" },
          advance: { mode: "next" }
        }
      ]
    },
    {
      id: "fluid",
      title: "流体",
      steps: [
        {
          id: "play",
          type: "spotlight",
          target: "#ctrl-paint-toggle",
          content: { title: "流してみよう", body: "このボタンで再生/停止を切り替えます。" },
          advance: { mode: "next" }
        },
        {
          id: "splat",
          type: "spotlight",
          target: "#ctrl-random-splat",
          content: { title: "滴を落とす", body: "ランダムに絵の具を落とします。" },
          advance: { mode: "event", name: "fluid:splat" }
        }
      ]
    },
    {
      id: "export",
      title: "保存",
      steps: [
        {
          id: "save",
          type: "spotlight",
          target: "#ctrl-save",
          content: { title: "保存しよう", body: "作品をPNGとして保存します。" },
          advance: { mode: "event", name: "export:click" }
        },
        {
          id: "done",
          type: "modal",
          content: {
            title: "完了！",
            body: "おつかれさま。左上の「?」からいつでもチュートリアルを開けます。"
          },
          cta: { primary: "閉じる" },
          advance: { mode: "click-cta" }
        }
      ]
    }
  ]
};
