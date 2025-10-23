// tour.js
import { GUIDE } from "./tour-config.js";

const LS = {
  done: id => `tour.${id}.done`
};

class Tour {
  constructor() {
    this.chapters = GUIDE.chapters;
    this.ci = 0;
    this.si = 0;
    this.active = false;
    this.overlay = null;
    this.pop = null;
    this.outline = null;
    this.cleanupFns = [];
    this.keyHandler = this.onKey.bind(this);
  }

  start(chapterId = null) {
    // 既に完了した章はスキップして次へ
    if (chapterId) {
      this.ci = this.chapters.findIndex(c => c.id === chapterId);
      if (this.ci < 0) this.ci = 0;
    } else {
      this.ci = 0;
      // introが終わっていれば次の未完了章に飛ぶ
      for (let i = 0; i < this.chapters.length; i++) {
        if (!localStorage.getItem(LS.done(this.chapters[i].id))) { this.ci = i; break; }
      }
    }
    this.si = 0;
    this.active = true;
    this.buildUI();
    document.addEventListener("keydown", this.keyHandler);
    this.runStep();
  }

  end() {
    this.active = false;
    document.removeEventListener("keydown", this.keyHandler);
    this.teardownUI();
  }
  skip() {
    // 現在の章をスキップ
    const chapter = this.chapters[this.ci];
    localStorage.setItem(LS.done(chapter.id), "1");
    this.end();
  }

  nextChapter() {
    this.si = 0;
    this.ci++;
    if (this.ci >= this.chapters.length) return this.end();
    this.runStep();
  }

  nextStep() {
    const chapter = this.chapters[this.ci];
    this.si++;
    if (this.si >= chapter.steps.length) {
      localStorage.setItem(LS.done(chapter.id), "1");
      return this.nextChapter();
    }
    this.runStep();
  }

  // Tour クラスのどこでも良い（runStepより上が見通し良い）
    canPrev() {
    return !(this.ci === 0 && this.si === 0);
    }
    prevStep() {
    this.clearStep();
    if (this.si > 0) {
        this.si--;
    } else if (this.ci > 0) {
        this.ci--;
        const prevChapter = this.chapters[this.ci];
        this.si = prevChapter.steps.length - 1;
    }
    this.runStep();
    }

  runStep() {
    this.clearStep();
    const chapter = this.chapters[this.ci];
    const step = chapter.steps[this.si];

    // ターゲットの取得（modalなら不要）
    let target = null;
    if (step.type !== "modal" && step.target) {
      target = document.querySelector(step.target);
      if (!target || !this.isVisible(target)) {
        // 無ければスキップ
        return this.nextStep();
      }
      target.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    }

    // UI表示
    this.showOverlay();
    this.showPopover(step.content, {
        showSkip: true,
        onNext: () => this.nextStep(),
        onSkip: () => this.skip(),
    });


    if (target) this.highlight(target);

    // 進行条件
    const adv = step.advance || { mode: "next" };
    switch (adv.mode) {
      case "next":
        // Nextボタンで進む（上のonNextで処理）
        break;
      case "click-cta":
        // ポップオーバーの「はじめる/閉じる」で進行
        break;
      case "click": {
        const el = document.querySelector(adv.selector || step.target);
        if (el) {
          const h = () => { el.removeEventListener("click", h); this.nextStep(); };
          el.addEventListener("click", h, { once: true });
          this.cleanupFns.push(() => el.removeEventListener("click", h));
        } else {
          this.nextStep();
        }
        break;
      }
      case "event": {
        const h = () => { document.removeEventListener(adv.name, h); this.nextStep(); };
        document.addEventListener(adv.name, h, { once: true });
        this.cleanupFns.push(() => document.removeEventListener(adv.name, h));
        // フォールバック：クリックでもOKにする指定があれば
        if (adv.fallbackClickSelector) {
          const el = document.querySelector(adv.fallbackClickSelector);
          if (el) {
            const hc = () => { el.removeEventListener("click", hc); this.nextStep(); };
            el.addEventListener("click", hc, { once: true });
            this.cleanupFns.push(() => el.removeEventListener("click", hc));
          }
        }
        break;
      }
      case "timer": {
        const id = setTimeout(() => this.nextStep(), adv.ms || 1000);
        this.cleanupFns.push(() => clearTimeout(id));
        break;
      }
      case "either": {
        // eventsのどれか or 指定時間 or クリックで進む
        let advanced = false;
        const done = () => { if (advanced) return; advanced = true; this.nextStep(); };
        if (adv.events) {
          const hs = adv.events.map(n => {
            const h = () => done();
            document.addEventListener(n, h, { once: true });
            return () => document.removeEventListener(n, h);
          });
          this.cleanupFns.push(...hs);
        }
        if (adv.timerMs) {
          const id = setTimeout(done, adv.timerMs);
          this.cleanupFns.push(() => clearTimeout(id));
        }
        if (adv.onClickSelector) {
          const el = document.querySelector(adv.onClickSelector);
          if (el) {
            const hc = () => done();
            el.addEventListener("click", hc, { once: true });
            this.cleanupFns.push(() => el.removeEventListener("click", hc));
          }
        }
        break;
      }
      case "gate": {
        // 1) Nextを無効化
        this.setGateEnabled(false);
        let unlocked = false;
        const done = () => {
          if (unlocked) return;
          unlocked = true;
          // 2) OK表示＆Next有効化（自動では進めない）
          this.setGateEnabled(true);
        };
        const cleanups = [];
        if (adv.events && adv.events.length) {
          adv.events.forEach(name => {
            const h = () => done();
            document.addEventListener(name, h, { once: true });
            cleanups.push(() => document.removeEventListener(name, h));
          });
          }
        if (adv.clickSelector) {
           const el = document.querySelector(adv.clickSelector);
          if (el) {
            const hc = () => done();
            el.addEventListener('click', hc, { once: true });
            cleanups.push(() => el.removeEventListener('click', hc));
          }
        }
        const cleanup = () => cleanups.splice(0).forEach(fn => { try{fn()}catch{} });
        this.cleanupFns.push(cleanup);
        break;
      }
    }
  }

  // ========== UI ==========
  buildUI() {
    // スクロールロック
    document.documentElement.dataset.tourScroll = "locked";
    document.body.style.overflow = "hidden";

    this.overlay = document.createElement("div");
    this.overlay.className = "tour-overlay";
    document.body.appendChild(this.overlay);

    this.pop = document.createElement("div");
    this.pop.className = "tour-popover";
    this.pop.innerHTML = `
      <div class="tour-popover__title"></div>
      <div class="tour-popover__body"></div>
      <div class="tour-popover__actions">
        <button data-act="prev" disabled>戻る</button>
        <button data-act="next">次へ</button>
        <button data-act="skip" aria-label="スキップ">スキップ</button>
      </div>`;
    document.body.appendChild(this.pop);

    this.outline = document.createElement("div");
    this.outline.className = "tour-outline";
    document.body.appendChild(this.outline);
  }

  teardownUI() {
    document.body.style.overflow = "";
    this.overlay?.remove();
    this.pop?.remove();
    this.outline?.remove();
    this.overlay = this.pop = this.outline = null;
  }

  showOverlay() {
    this.overlay.style.display = "block";
  }

  showPopover(content, { showSkip, onNext, onSkip }) {
    this.pop.querySelector(".tour-popover__title").textContent = content?.title || "";
    this.pop.querySelector(".tour-popover__body").textContent  = content?.body || "";
    const btnPrev = this.pop.querySelector('button[data-act="prev"]');
    const btnNext = this.pop.querySelector('button[data-act="next"]');
    const btnSkip = this.pop.querySelector('button[data-act="skip"]');

    btnNext.onclick = onNext;
    btnSkip.onclick = onSkip;

    // ← Prevの活性/無効化＋クリック動作
    if (this.canPrev()) {
      btnPrev.disabled = false;
      btnPrev.onclick = () => this.prevStep();
    } else {
      btnPrev.disabled = true;
      btnPrev.onclick = null;
    }

    btnSkip.style.display = showSkip ? "" : "none";
    // 位置（モバイルは下固定）
    this.pop.style.position = "fixed";
    this.pop.style.bottom = "16px";
    this.pop.style.left   = "50%";
    this.pop.style.transform = "translateX(-50%)";
  }

  highlight(target) {
    const rect = target.getBoundingClientRect();
    Object.assign(this.outline.style, {
      display: "block",
      position: "fixed",
      top: `${rect.top - 8}px`,
      left:`${rect.left - 8}px`,
      width: `${rect.width + 16}px`,
      height:`${rect.height + 16}px`,
      border: "3px solid #22c55e",
      borderRadius: "12px",
      zIndex: 10001,
      pointerEvents: "none",
      boxShadow: "0 0 0 9999px rgba(0,0,0,.5)"
    });
  }

  clearStep() {
    // 前ステップの後片付け
    this.cleanupFns.splice(0).forEach(fn => { try { fn(); } catch {} });
    if (this.outline) this.outline.style.display = "none";
  }

  isVisible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  onKey(e) {
    if (!this.active) return;
    if (e.key === "Escape") this.end();
    if (e.key === "Enter" || e.key === "ArrowRight") this.nextStep();
  }
}

// 末尾（exportあたり）を差し替え
const TourInstance = new Tour();   // ← インスタンス名を変える
export { TourInstance };           // ← 必要ならモジュールとしても使える

// グローバル公開（コンソールや他スクリプトから使う用）
window.Tour = TourInstance;

window.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => window.Tour.start("intro"), 300); // ←常に起動
});



// 右上にヘルプボタンを付けたい場合（任意）
// const help = document.createElement('button');
// help.textContent = "?";
// Object.assign(help.style, { position:'fixed', right:'12px', top:'12px', zIndex:10002 });
// help.onclick = () => Tour.start();
// document.body.appendChild(help);
