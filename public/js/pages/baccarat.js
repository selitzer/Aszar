(function initBcRulesModal() {
  const rulesBtn =
    document.getElementById("rulesBtn") ||
    document.querySelector(".bj-title-btn");

  if (!rulesBtn) return;

  if (document.querySelector(".bj-rules-modal")) return;

  const modal = document.createElement("div");
  modal.className = "bj-rules-modal";
  modal.innerHTML = `
    <div class="bj-rules-backdrop" data-close="1"></div>

    <div class="bj-rules-card" role="dialog" aria-modal="true" aria-labelledby="bcRulesTitle">
      <button class="bj-rules-close" type="button" aria-label="Close rules" data-close="1">✕</button>

      <div class="bj-rules-head">
        <div class="bj-rules-title" id="bcRulesTitle">Baccarat Rules</div>
        <div class="bj-rules-sub">Goal: get closest to 9 (Player vs Banker). You can also bet Tie.</div>
      </div>

      <div class="bj-rules-body">
        <ul class="bj-rules-list">
          <li><b>Card values:</b> A = 1, 2–9 = face value, 10/J/Q/K = 0.</li>
          <li><b>Hand total:</b> add cards and keep the <b>last digit</b> (e.g., 7+8 = 15 → 5).</li>
          <li><b>Bets:</b> Player, Banker, or Tie.</li>
          <li><b>Winner:</b> the hand closest to <b>9</b> wins.</li>
          <li><b>Payouts (typical):</b> Player <b>1:1</b>, Banker <b>1:1</b> (5% commission), Tie <b>8:1</b>.</li>
          <li><b>Third-card rule:</b> Player/Banker may draw a third card based on fixed rules (no player decisions).</li>
        </ul>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  function openModal() {
    modal.classList.add("is-open");
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    modal.classList.remove("is-open");
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  }

  rulesBtn.addEventListener("click", openModal);

  modal.addEventListener("click", (e) => {
    const closeTarget = e.target.closest('[data-close="1"]');
    if (closeTarget) closeModal();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("is-open")) {
      closeModal();
    }
  });
})();
(() => {
  const CREDIT_RATE = 5;

  const dealBtn = document.querySelector(".spin-btn");
  const betBtns = Array.from(document.querySelectorAll(".bac-bet-btn"));
  const chipBtns = Array.from(document.querySelectorAll(".chip-track .chip"));
  const totalBetEl = document.querySelector(".rl-bet-value");
  const currencyIcon = document.getElementById("currency");
  const quickBtns = Array.from(document.querySelectorAll(".rl-bet-qbtn"));

  if (!betBtns.length || !chipBtns.length) {
    console.warn("[baccarat2] missing .bac-bet-btn or .chip buttons");
    return;
  }

  const deckEl = document.querySelector(".bj-deck-svg");
  const surfaceEl = document.querySelector(".bj-surface");
  const backTpl = document.getElementById("card-back-tpl");
  let __bacInFlight = null;
  let isDealing = false;

  SFX.load("flipps", "/assets/sfx/flipps.wav", { volume: 0.6 });
  SFX.load("click", "/assets/sfx/wClick.wav", { volume: 0.6 });
  SFX.load("draw", "/assets/sfx/cardDraww.wav", { volume: 0.6 });

  const bcUndoStack = [];

  const bcHistoryItems = [];

  function bcHistoryEls() {
    return {
      mask: document.getElementById("bcHistoryMask"),
      row: document.getElementById("bcHistory"),
    };
  }
  async function apiPost(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body || {}),
    });
    return res.json();
  }
  function bcSyncTopbarWalletCash(balanceCash) {
    const bal = Number(balanceCash);
    if (!Number.isFinite(bal)) return;

    window.dispatchEvent(
      new CustomEvent("rollix:walletupdate", {
        detail: { balanceCash: bal },
      }),
    );
  }

  function bcSyncTopbarWalletFromState(state) {
    const bal = Number(state?.walletBalanceCash);
    if (!Number.isFinite(bal)) return;
    bcSyncTopbarWalletCash(bal);
  }
  function collectBetsCashFromButtons() {
    const bets = { player: 0, banker: 0, tie: 0 };

    betBtns.forEach((btn) => {
      const key = (btn.dataset.bet || "").toLowerCase().trim();
      const amt = Number(btn.dataset.betTotalCash || "0") || 0;
      if (!amt) return;

      if (key === "player") bets.player += amt;
      if (key === "banker") bets.banker += amt;
      if (key === "tie") bets.tie += amt;
    });

    for (const k of Object.keys(bets))
      bets[k] = Math.round(bets[k] * 100) / 100;
    return bets;
  }

  function sumBetsCash(bets) {
    return (
      Math.round(
        ((bets.player || 0) + (bets.banker || 0) + (bets.tie || 0)) * 100,
      ) / 100
    );
  }

  function bcPlayFLIP(container, firstRects, { duration = 240 } = {}) {
    [...container.children].forEach((el) => {
      const first = firstRects.get(el);
      if (!first) return;
      const last = el.getBoundingClientRect();

      const dx = first.left - last.left;
      const dy = first.top - last.top;

      if (dx || dy) {
        el.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: "translate(0,0)" },
          ],
          { duration, easing: "cubic-bezier(.2,.9,.2,1)", fill: "both" },
        );
      }
    });
  }

  function bcLabelForItem(it) {
    if (it.result === "tie") return "/";

    const s = Number(it.streak || 1);
    if (s <= 1) return "";
    return `${s}x`;
  }

  function bcClassForItem(it) {
    if (it.result === "tie") return "is-tie";
    if (it.result === "banker") return "is-red";
    if (it.result === "player") return "is-blue";
    return "";
  }

  function bcRenderHistory({ animateNew = true } = {}) {
    const { row } = bcHistoryEls();
    if (!row) return;

    const firstRects = bcRecordRects(row);

    row.innerHTML = "";

    bcHistoryItems.forEach((it, idx) => {
      const item = document.createElement("div");
      item.className = `rl-history-item ${bcClassForItem(it)}`.trim();

      if (animateNew && idx === bcHistoryItems.length - 1) {
        item.classList.add("is-new");
      }

      item.textContent = bcLabelForItem(it);
      row.appendChild(item);
    });

    requestAnimationFrame(() => {
      bcPlayFLIP(row, firstRects, { duration: 240 });
      requestAnimationFrame(() => {
        bcPlayFLIP(row, firstRects, { duration: 240 });
        bcScrollHistoryToEnd();
      });
    });
  }

  function bcFindLastNonTie() {
    for (let i = bcHistoryItems.length - 1; i >= 0; i--) {
      const it = bcHistoryItems[i];
      if (it.result !== "tie") return it;
    }
    return null;
  }

  function bcPushResultToHistory(result) {
    const r = (result || "").toString().toLowerCase();
    if (!r) return;

    if (r === "tie") {
      bcHistoryItems.push({ result: "tie" });
      if (bcHistoryItems.length > 120) bcHistoryItems.shift();
      bcRenderHistory({ animateNew: true });
      return;
    }

    const last = bcHistoryItems[bcHistoryItems.length - 1];

    const lastNonTie = bcFindLastNonTie();

    if (last && last.result === r) {
      last.streak = Number(last.streak || 1) + 1;

      bcRenderHistory({ animateNew: false });
      bcScrollHistoryToEnd();
      return;
    }

    let streak = 1;
    if (lastNonTie && lastNonTie.result === r) {
      streak = Number(lastNonTie.streak || 1) + 1;
    }

    bcHistoryItems.push({ result: r, streak });
    if (bcHistoryItems.length > 120) bcHistoryItems.shift();
    bcRenderHistory({ animateNew: true });
  }

  function bcTableHasBets() {
    return document.querySelector(".bac-bet-btn.has-bet") !== null;
  }

  function bcGetBetCells() {
    return Array.from(document.querySelectorAll(".bac-bet-btn[data-bet]"));
  }

  function bcSnapshotBoardState() {
    const cells = [];
    bcGetBetCells().forEach((btn) => {
      const total = Number(btn.dataset.betTotalCash || "0") || 0;
      if (total <= 0) return;

      cells.push({
        bet: (btn.dataset.bet || "").toString(),
        total,
        count: 1,
        denom: 1,
      });
    });

    return {
      totalBet: Number(window.totalBetCash || 0),
      cells,
    };
  }

  function bcPushUndoSnapshot() {
    bcUndoStack.push(bcSnapshotBoardState());
    if (bcUndoStack.length > 80) bcUndoStack.shift();
  }

  function bcResetAllBetsUI() {
    if (typeof clearBaccaratBets === "function") {
      clearBaccaratBets();
      return;
    }

    bcGetBetCells().forEach((btn) => {
      delete btn.dataset.betTotalCash;
      btn.classList.remove("has-bet", "is-active");
      btn.querySelector(".bac-bet-chip")?.remove();
    });
    if (typeof setTotalBetCash === "function") setTotalBetCash(0);
    if (typeof recomputeTotalBetFromButtons === "function")
      recomputeTotalBetFromButtons();
  }

  function bcApplyCellStackState(btn, totalCash) {
    const cash = Math.max(0, Number(totalCash) || 0);
    if (cash <= 0) return;

    if (typeof ensureBetChipOverlay === "function") ensureBetChipOverlay(btn);

    btn.dataset.betTotalCash = String(cash);
    btn.classList.add("has-bet", "is-active");

    if (typeof updateBetChipLabel === "function") updateBetChipLabel(btn);
  }

  function bcSetTotalBet(valCash) {
    if (typeof setTotalBetCash === "function") setTotalBetCash(valCash);
    else window.totalBetCash = Math.max(0, Number(valCash) || 0);
  }

  function bcRestoreBoardState(state) {
    bcResetAllBetsUI();

    (state?.cells || []).forEach((c) => {
      if (!c?.bet || !c?.total) return;

      const btn = document.querySelector(
        `.bac-bet-btn[data-bet="${CSS.escape(c.bet)}"]`,
      );
      if (!btn) return;

      bcApplyCellStackState(btn, c.total, c.count);
    });

    bcSetTotalBet(Number(state?.totalBet || 0));

    if (typeof recomputeTotalBetFromButtons === "function")
      recomputeTotalBetFromButtons();
  }

  function bcUndoLastAction() {
    if (!bcUndoStack.length) return;
    const prev = bcUndoStack.pop();
    bcRestoreBoardState(prev);
  }

  function bcClearAllBetsWithUndo() {
    if (!bcTableHasBets()) return;
    bcPushUndoSnapshot();
    bcResetAllBetsUI();
  }

  const bcUndoBtn = document.getElementById("bcUndoBtn");
  const bcClearBtn = document.getElementById("bcClearBtn");

  bcUndoBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    bcUndoLastAction();
  });

  bcClearBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    bcClearAllBetsWithUndo();
  });

  function cardFaceSrc(rank, suit) {
    return `/assets/cards/${rank}${suit}.svg`;
  }

  function getCenterInSurface(el) {
    if (!surfaceEl || !el) return { x: 0, y: 0 };
    const s = surfaceEl.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return {
      x: r.left - s.left + r.width / 2,
      y: r.top - s.top + r.height / 2,
    };
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function bcRecordRects(container) {
    const m = new Map();
    if (!container) return m;
    [...container.children].forEach((el) =>
      m.set(el, el.getBoundingClientRect()),
    );
    return m;
  }

  const bacSvgHands = {
    player: [],
    banker: [],
  };
  function bacGetViewBoxWH() {
    const svg = document.getElementById("bacAnimLayer");
    const vb = (svg?.getAttribute("viewBox") || "0 0 1000 500")
      .split(" ")
      .map(Number);
    return { w: vb[2] || 1000, h: vb[3] || 500 };
  }
  function bacRescaleAllSvgCards() {
    if (!window.gsap) return;

    const newW = bacCardW();
    const newH = bacCardH();

    ["player", "banker"].forEach((key) => {
      (bacSvgHands[key] || []).forEach((g) => {
        if (!g) return;

        gsap.set(g, { scale: 1, scaleX: 1, scaleY: 1, transformOrigin: "0 0" });

        const img = g.__img || g.querySelector("image");
        if (img) {
          img.setAttribute("width", String(newW));
          img.setAttribute("height", String(newH));
        }

        g.__baseW = newW;
        g.__baseH = newH;
        g.setAttribute("data-basew", String(newW));
        g.setAttribute("data-baseh", String(newH));
      });
    });

    bacRelayoutScores({ duration: 0 });
  }
  function bacHandLayoutTargets(handKey, count) {
    ensureBacSvgSizedToSurface();
    const { w, h } = bacGetViewBoxWH();

    const cardW = bacCardW();
    const cardH = bacCardH();

    let step = bacGetHandStep();

    const isMobile = window.matchMedia("(max-width: 580px)").matches;

    const playerAnchor = isMobile ? 0.28 : 0.33;
    const bankerAnchor = isMobile ? 0.71 : 0.66;

    const centerX = handKey === "player" ? w * playerAnchor : w * bankerAnchor;

    const Y_OFFSET = isMobile ? -80 : -50;
    const y = Math.max(70, h * 0.22) + Y_OFFSET;

    const laneW = w * 0.42;
    const totalW = cardW + (count - 1) * step;

    if (count > 1 && totalW > laneW) {
      step = Math.max(8, Math.floor((laneW - cardW) / (count - 1)));
    }

    const groupW = cardW + (count - 1) * step;
    const startX = centerX - groupW / 2;

    return Array.from({ length: count }, (_, i) => ({
      x: startX + i * step,
      y,
      scale: 1,
    }));
  }

  function layoutBacHand(handKey, { duration = 0.12 } = {}) {
    if (!window.gsap) return;
    const cards = bacSvgHands[handKey];
    if (!cards.length) return;

    const targets = bacHandLayoutTargets(handKey, cards.length);

    cards.forEach((card, i) => {
      if (card.getAttribute("data-inflight") === "1") return;
      gsap.killTweensOf(card);
      gsap.to(card, {
        x: targets[i].x,
        y: targets[i].y,
        scale: targets[i].scale,
        duration,
        ease: "none",
        overwrite: "auto",
      });
    });
  }

  function layoutBacHandExcept(handKey, skipCard, { duration = 0.28 } = {}) {
    const cards = bacSvgHands[handKey];
    if (!cards.length) return;

    const targets = bacHandLayoutTargets(handKey, cards.length);

    cards.forEach((card, i) => {
      if (card.getAttribute("data-inflight") === "1") return;
      if (card === skipCard) return;
      gsap.killTweensOf(card);
      gsap.to(card, {
        x: targets[i].x,
        y: targets[i].y,
        scale: targets[i].scale,
        duration,
        ease: "none",
        overwrite: "auto",
      });
    });
  }
  function createBacSvgCard({ rank, suit }) {
    const svg = document.getElementById("bacAnimLayer");
    if (!svg) throw new Error("[baccarat2] #bacAnimLayer missing");

    const w = bacCardW();
    const h = bacCardH();

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.__baseW = w;
    g.__baseH = h;
    g.setAttribute("data-basew", String(w));
    g.setAttribute("data-baseh", String(h));

    const img = document.createElementNS("http://www.w3.org/2000/svg", "image");

    const BLEED = 0.5;
    img.setAttribute("x", String(-BLEED));
    img.setAttribute("y", String(-BLEED));
    img.setAttribute("width", String(w + BLEED * 2));
    img.setAttribute("height", String(h + BLEED * 2));
    img.setAttribute("preserveAspectRatio", "none");

    img.setAttribute("href", "/assets/cards/back.png");
    img.dataset.frontHref = `/assets/cards/${rank}${suit}.svg`;

    g.appendChild(img);

    const border = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect",
    );

    const SW = 4;
    const HALF = SW / 2;

    border.setAttribute("x", String(-HALF));
    border.setAttribute("y", String(-HALF));
    border.setAttribute("width", String(w + SW));
    border.setAttribute("height", String(h + SW));

    border.setAttribute("rx", String(8 + HALF));
    border.setAttribute("ry", String(8 + HALF));

    border.setAttribute("fill", "none");
    border.setAttribute("stroke", "transparent");
    border.setAttribute("stroke-width", String(SW));
    border.setAttribute("opacity", "0");
    border.setAttribute("vector-effect", "non-scaling-stroke");

    g.__border = border;
    g.appendChild(border);
    svg.appendChild(g);

    g.__img = img;

    g.__shadow = ensureBacCardShadowFilter();
    g.setAttribute("filter", "none");

    g.style.visibility = "hidden";
    g.style.pointerEvents = "none";

    return g;
  }
  function bacSetSvgCardBorder(g, color = null) {
    if (!g?.__border || !window.gsap) return;

    const show = !!color;
    g.__border.setAttribute("stroke", show ? color : "transparent");

    try {
      gsap.killTweensOf(g.__border);
    } catch {}
    gsap.to(g.__border, {
      duration: 0.18,
      attr: { opacity: show ? 1 : 0 },
      ease: "power1.out",
    });
  }

  function bacClearOutcomeBordersAll() {
    ["player", "banker"].forEach((key) => {
      (bacSvgHands[key] || []).forEach((g) => bacSetSvgCardBorder(g, null));
    });
  }

  function bacApplyWinnerBorder(winner) {
    bacClearOutcomeBordersAll();

    if (winner !== "player" && winner !== "banker") return;

    const WIN_GREEN = "#21c55e";
    (bacSvgHands[winner] || []).forEach((g) => {
      if (!g) return;
      bacSetSvgCardBorder(g, WIN_GREEN);
    });
  }
  function bacSvgFlipUp(g, { duration = 0.12 } = {}) {
    const img = g?.__img;
    if (!img) return Promise.resolve();
    const rate = 0.96 + Math.random() * 0.08;
    const pitch = -60 + Math.random() * 60;
    SFX.play("flipps", { volume: 0.6, rate, pitch, gateMs: 10 });
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };

      gsap.to(g, {
        scaleX: 0,
        duration,
        ease: "power2.in",
        overwrite: "auto",
        onComplete: () => {
          const front = img.dataset.frontHref;
          if (front) img.setAttribute("href", front);

          gsap.to(g, {
            scaleX: 1,
            duration,
            ease: "power2.out",
            overwrite: "auto",
            onComplete: finish,
            onInterrupt: finish,
          });
        },
        onInterrupt: finish,
      });
    });
  }
  function ensureBacCardShadowFilter() {
    const svg = document.getElementById("bacAnimLayer");
    if (!svg) return null;

    let defs = svg.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      svg.appendChild(defs);
    }

    const id = "bacCardShadow";
    if (svg.querySelector(`#${id}`)) return `url(#${id})`;

    const filter = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "filter",
    );
    filter.setAttribute("id", id);
    filter.setAttribute("x", "-30%");
    filter.setAttribute("y", "-30%");
    filter.setAttribute("width", "160%");
    filter.setAttribute("height", "160%");

    const fe = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "feDropShadow",
    );
    fe.setAttribute("dx", "0");
    fe.setAttribute("dy", "10");
    fe.setAttribute("stdDeviation", "8");
    fe.setAttribute("flood-color", "#000");
    fe.setAttribute("flood-opacity", "0.45");

    filter.appendChild(fe);
    defs.appendChild(filter);
    return `url(#${id})`;
  }

  const BAC_DEAL_MS = 900;
  const BAC_FLIP_DELAY = 20;
  const BAC_PROFIT_DELAY_MS = 220;
  function gsapToPromise(target, vars) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };

      gsap.to(target, {
        ...vars,
        onComplete: finish,
        onInterrupt: finish,
      });
    });
  }
  async function dealCardTo(handKey, { rank, suit }) {
    if (!window.gsap) throw new Error("[baccarat2] GSAP not loaded");

    const svg = document.getElementById("bacAnimLayer");
    const deck = document.querySelector(".bj-deck-svg");
    if (!svg) throw new Error("[baccarat2] #bacAnimLayer missing");
    if (!deck) throw new Error("[baccarat2] .bj-deck-svg missing");

    const card = createBacSvgCard({ rank, suit });
    bacSvgHands[handKey].push(card);

    const start = getCenterInSurface(deckEl || deck);
    const CARD_W = bacCardW();
    const CARD_H = bacCardH();

    gsap.set(card, {
      x: start.x - CARD_W / 2,
      y: start.y - CARD_H / 2,
      scale: 0.9,
      rotation: 8,
      opacity: 0.98,
      transformOrigin: "50% 50%",
      scaleX: 1,
      immediateRender: true,
    });
    card.style.visibility = "visible";

    const targets = bacHandLayoutTargets(handKey, bacSvgHands[handKey].length);
    const myTarget = targets[targets.length - 1];

    layoutBacHandExcept(handKey, card, { duration: 0.28 });

    const rate = 0.97 + Math.random() * 0.06;
    SFX.play("draw", { volume: 0.6, rate, gateMs: 10 });

    card.setAttribute("data-inflight", "1");
    __bacInFlight = { card, handKey, idx: bacSvgHands[handKey].length - 1 };

    try {
      await gsapToPromise(card, {
        x: myTarget.x,
        y: myTarget.y,
        scale: myTarget.scale,
        rotation: 0,
        duration: BAC_DEAL_MS / 1000,
        ease: "sine.inOut",
        overwrite: "auto",
      });

      if (card.__shadow) card.setAttribute("filter", card.__shadow);
      await sleep(BAC_FLIP_DELAY);

      await bacSvgFlipUp(card, { duration: 0.12 });
    } finally {
      card.setAttribute("data-inflight", "0");
      if (__bacInFlight?.card === card) __bacInFlight = null;
    }
  }
  function bacRelayoutScores({ duration = 0.12 } = {}) {
    if (!window.gsap) return;

    ["player", "banker"].forEach((key) => {
      const badge = ensureBacSvgScore(key);
      if (!badge || !badge.placed) return;

      const pos = bacScorePosition(key);
      if (!pos) return;

      gsap.to(badge.g, {
        x: pos.x,
        y: pos.y,
        duration,
        ease: "none",
        overwrite: "auto",
      });
    });
  }
  function bacSyncSvgCardSizeFromCSS() {
    const px = 1 / (window.devicePixelRatio || 1);
    const snap = (v) => Math.round(v / px) * px;

    const newW = snap(bacCardW());
    const newH = snap(bacCardH());

    const BLEED = 0.5;

    ["player", "banker"].forEach((key) => {
      (bacSvgHands[key] || []).forEach((g) => {
        if (!g) return;

        gsap.set(g, { scale: 1, scaleX: 1, scaleY: 1, transformOrigin: "0 0" });

        const img = g.__img || g.querySelector("image");
        if (img) {
          img.setAttribute("x", String(-BLEED));
          img.setAttribute("y", String(-BLEED));
          img.setAttribute("width", String(newW + BLEED * 2));
          img.setAttribute("height", String(newH + BLEED * 2));
          img.setAttribute("preserveAspectRatio", "none");
        }

        const border = g.__border;
        if (border) {
          const sw = Number(border.getAttribute("stroke-width")) || 4;
          const half = sw / 2;

          border.setAttribute("x", String(-half));
          border.setAttribute("y", String(-half));
          border.setAttribute("width", String(newW + sw));
          border.setAttribute("height", String(newH + sw));

          const baseR = 8;
          border.setAttribute("rx", String(baseR + half));
          border.setAttribute("ry", String(baseR + half));
        }

        g.__baseW = newW;
        g.__baseH = newH;
        g.setAttribute("data-basew", String(newW));
        g.setAttribute("data-baseh", String(newH));
      });
    });

    bacRelayoutScores?.({ duration: 0 });
  }
  let __bacResizeRaf = 0;

  window.addEventListener("resize", () => {
    cancelAnimationFrame(__bacResizeRaf);
    __bacResizeRaf = requestAnimationFrame(() => {
      ensureBacSvgSizedToSurface();

      bacSyncSvgCardSizeFromCSS?.();

      layoutBacHand("player", { duration: 0 });
      layoutBacHand("banker", { duration: 0 });
      bacRelayoutScores({ duration: 0 });

      if (__bacInFlight?.card && __bacInFlight?.handKey) {
        const { card, handKey, idx } = __bacInFlight;

        const list = bacSvgHands[handKey] || [];
        const targets = bacHandLayoutTargets(handKey, list.length);
        const newEnd = targets[idx];

        if (newEnd) {
          gsap.to(card, {
            x: newEnd.x,
            y: newEnd.y,
            duration: 0.12,
            ease: "none",
            overwrite: "auto",
          });
        }
      }
    });
  });

  function clearBaccaratTableCards() {
    bacSvgHands.player.forEach((c) => c.remove());
    bacSvgHands.banker.forEach((c) => c.remove());
    bacSvgHands.player = [];
    bacSvgHands.banker = [];

    for (const badge of bacSvgScores.values()) {
      badge.g.remove();
    }
    bacSvgScores.clear();
  }

  function setDealHidden(hidden) {
    if (!dealBtn) return;
    dealBtn.classList.toggle("is-hidden", !!hidden);
    dealBtn.setAttribute("aria-hidden", hidden ? "true" : "false");

    if (hidden) dealBtn.blur?.();
  }
  function lockBettingUI(locked) {
    betBtns.forEach((b) => {
      b.disabled = !!locked;
      b.classList.toggle("is-disabled", !!locked);
    });
    chipBtns.forEach((c) => {
      c.disabled = !!locked;
      c.classList.toggle("is-disabled", !!locked);
    });
    quickBtns.forEach((q) => {
      q.disabled = !!locked;
      q.classList.toggle("is-disabled", !!locked);
    });
    dealBtn && (dealBtn.disabled = !!locked);
  }

  function readBacCardsFromDOM(handEl) {
    return [...(handEl?.querySelectorAll(".bac-card, .bj-card") || [])]
      .map((c) => ({ rank: c.dataset.rank, suit: c.dataset.suit }))
      .filter((c) => c.rank && c.rank !== "X");
  }
  function bacPoint(rank) {
    if (rank === "A") return 1;
    const n = Number(rank);
    if (Number.isFinite(n)) return n >= 2 && n <= 9 ? n : 0;
    return 0;
  }

  function bacTotal(cards) {
    let sum = 0;
    for (const c of cards) sum += bacPoint(c.rank);
    return sum % 10;
  }

  function bacClearScoreStyles() {
    playerScoreEl?.classList.remove("is-win");
    bankerScoreEl?.classList.remove("is-win");
  }

  let bacProfitTimer = null;

  function getOrCreateBacProfitEl() {
    let el = document.querySelector(".rl-profit.bac-profit");
    if (!el) {
      el = document.createElement("div");
      el.className = "rl-profit bac-profit";

      document.querySelector(".bj-surface")?.appendChild(el);
    }
    return el;
  }

  function fadeIn(el) {
    el.classList.remove("is-show");
    void el.offsetHeight;
    el.classList.add("is-show");
  }

  function hideBacProfit() {
    const el = document.querySelector(".rl-profit.bac-profit");
    if (!el) return;
    el.classList.remove("is-show", "is-error", "is-credits");
    el.innerHTML = "";
  }

  function cloneCurrencyIcon() {
    const unit = document.getElementById("currency");
    if (!unit) return null;
    const clone = unit.cloneNode(true);
    clone.classList.add("rl-profit-unit");
    return clone;
  }

  function formatPayout(n) {
    const v = Number(n) || 0;
    const isInt = Math.abs(v - Math.round(v)) < 1e-9;
    if (isInt) return String(Math.round(v));
    return v.toFixed(2).replace(/\.?0+$/, "");
  }

  function showBacProfit({ type, amountCash = 0 }) {
    const el = getOrCreateBacProfitEl();
    el.innerHTML = "";

    clearTimeout(bacProfitTimer);

    el.classList.remove("is-error", "is-credits", "is-draw");

    const cur = document.getElementById("currency");
    const isCredits =
      cur?.dataset?.currency === "credits" ||
      cur?.classList?.contains("credits") ||
      (cur?.textContent || "").trim().toLowerCase() === "credits";

    el.classList.toggle("is-credits", !!isCredits);

    const txt = document.createElement("span");
    txt.className = "rl-profit-text";

    if (type === "draw") {
      el.classList.add("is-draw");
      txt.textContent = "Draw (1.00x)";
      el.appendChild(txt);

      fadeIn(el);

      SFX.play("click", { volume: 0.28, gateMs: 0 });

      bacProfitTimer = setTimeout(() => {
        el.classList.remove("is-show");
      }, 2000);

      return;
    }

    if (type === "win" && amountCash > 0) {
      const shown = cashToDisplay(amountCash);
      txt.textContent = `+${formatPayout(shown)}`;
      el.appendChild(txt);

      const icon = cloneCurrencyIcon();
      if (icon) el.appendChild(icon);

      fadeIn(el);

      SFX.play("click", { volume: 0.28, gateMs: 0 });

      bacProfitTimer = setTimeout(() => {
        el.classList.remove("is-show");
      }, 2000);

      return;
    }

    hideBacProfit();
  }

  const bacSvgScores = new Map();

  function setBacScoreTotals(playerTotal, bankerTotal) {
    const p = ensureBacSvgScore("player");
    const b = ensureBacSvgScore("banker");
    if (!p || !b) return;

    const pHasCards = (bacSvgHands.player?.length || 0) > 0;
    const bHasCards = (bacSvgHands.banker?.length || 0) > 0;

    if (pHasCards) {
      p.text.textContent = String(Number(playerTotal ?? 0));
      const pos = bacScorePosition("player");
      if (pos) {
        gsap.set(p.g, {
          x: pos.x,
          y: pos.y,
          opacity: 1,
          pointerEvents: "none",
        });
        p.g.style.visibility = "visible";
        p.placed = true;
      }
    } else {
      gsap.set(p.g, { opacity: 0, pointerEvents: "none" });
    }

    if (bHasCards) {
      b.text.textContent = String(Number(bankerTotal ?? 0));
      const pos = bacScorePosition("banker");
      if (pos) {
        gsap.set(b.g, {
          x: pos.x,
          y: pos.y,
          opacity: 1,
          pointerEvents: "none",
        });
        b.g.style.visibility = "visible";
        b.placed = true;
      }
    } else {
      gsap.set(b.g, { opacity: 0, pointerEvents: "none" });
    }
  }
  const BAC_SCORE_NEUTRAL = "rgb(83, 92, 98)";
  const BAC_SCORE_WIN = "#21c55e";

  function bacSetScoreFill(key, fill) {
    const badge = ensureBacSvgScore(key);
    if (!badge) return;
    try {
      gsap.killTweensOf(badge.rect);
    } catch {}
    gsap.to(badge.rect, { duration: 0.18, attr: { fill }, ease: "power1.out" });
  }
  function bacApplyWinnerScoreColor(state, finalP, finalB) {
    bacSetScoreFill("player", BAC_SCORE_NEUTRAL);
    bacSetScoreFill("banker", BAC_SCORE_NEUTRAL);

    const raw = String(
      state?.result ?? state?.winner ?? state?.outcome ?? "",
    ).toLowerCase();

    let winner = null;
    if (raw.includes("player")) winner = "player";
    else if (raw.includes("banker")) winner = "banker";
    else if (raw.includes("tie")) winner = "tie";

    if (!winner)
      winner = finalP > finalB ? "player" : finalB > finalP ? "banker" : "tie";

    if (winner === "player") bacSetScoreFill("player", BAC_SCORE_WIN);
    else if (winner === "banker") bacSetScoreFill("banker", BAC_SCORE_WIN);

    bacApplyWinnerBorder(winner);
  }

  window.setBacScoreTotals = setBacScoreTotals;
  function ensureBacSvgScore(key) {
    const svg = document.getElementById("bacAnimLayer");
    if (!svg) return null;
    if (bacSvgScores.has(key)) return bacSvgScores.get(key);

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.style.pointerEvents = "none";
    g.style.visibility = "hidden";
    g.style.opacity = "0";

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("rx", "7");
    rect.setAttribute("ry", "7");
    rect.setAttribute("fill", "rgb(83, 92, 98)");

    const border = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect",
    );
    border.setAttribute("fill", "none");
    border.setAttribute("stroke", "transparent");
    border.setAttribute("stroke-width", "2.5");
    border.setAttribute("opacity", "0");
    border.setAttribute("rx", "7");
    border.setAttribute("ry", "7");
    border.setAttribute("vector-effect", "non-scaling-stroke");

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.setAttribute(
      "font-family",
      "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    );
    text.setAttribute("font-weight", "700");
    text.setAttribute("font-size", "13");
    text.setAttribute("fill", "#ffffff");
    text.textContent = "0";

    g.appendChild(rect);
    g.appendChild(border);
    g.appendChild(text);
    svg.appendChild(g);

    const obj = { g, rect, border, text, placed: false };
    bacSvgScores.set(key, obj);
    bacSizeScoreBadge(obj);
    return obj;
  }
  function bacSizeScoreBadge(badge) {
    if (!badge?.rect || !badge?.border || !badge?.text) return;

    const PAD_X = 12;
    const PAD_Y = 2;
    const MIN_W = 38;
    const MIN_H = 18;

    let bb;
    try {
      bb = badge.text.getBBox();
    } catch {
      bb = null;
    }

    const w = Math.max(MIN_W, (bb ? bb.width : 16) + PAD_X * 2);
    const h = Math.max(MIN_H, (bb ? bb.height : 16) + PAD_Y * 2);

    badge.rect.setAttribute("x", String(-w / 2));
    badge.rect.setAttribute("y", String(-h / 2));
    badge.rect.setAttribute("width", String(w));
    badge.rect.setAttribute("height", String(h));

    badge.border.setAttribute("x", String(-w / 2));
    badge.border.setAttribute("y", String(-h / 2));
    badge.border.setAttribute("width", String(w));
    badge.border.setAttribute("height", String(h));
    badge.border.setAttribute("rx", "7");
    badge.border.setAttribute("ry", "7");

    badge.text.setAttribute("x", "0");
    badge.text.setAttribute("y", "1");
  }
  function bacScorePosition(key) {
    const cards = bacSvgHands[key];
    if (!cards.length) return null;

    const cardW = bacCardW();
    const cardH = bacCardH();
    const PAD = Math.round(cardH * 0.28);

    const targets = bacHandLayoutTargets(key, cards.length);
    const first = targets[0];
    const last = targets[targets.length - 1];

    const centerX = (first.x + last.x + cardW) / 2;
    return { x: centerX, y: first.y + cardH + PAD };
  }

  function bacCardW() {
    return (
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--card-w"),
      ) || 78
    );
  }
  function bacCardH() {
    return (
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--card-h"),
      ) || 110
    );
  }

  function bacGetHandStep() {
    const w = bacCardW();

    if (window.matchMedia("(max-width: 580px)").matches)
      return Math.round(w * 0.36);

    if (window.matchMedia("(max-width: 720px)").matches)
      return Math.round(w * 0.42);
    return Math.round(w * 0.62);
  }

  function bacRescaleAllSvgCards() {
    if (!window.gsap) return;

    const newW = bacCardW();
    const newH = bacCardH();

    ["player", "banker"].forEach((key) => {
      (bacSvgHands[key] || []).forEach((g) => {
        if (!g) return;

        const baseW = g.__baseW || Number(g.getAttribute("data-basew")) || newW;
        const baseH = g.__baseH || Number(g.getAttribute("data-baseh")) || newH;

        const s = Math.min(newW / baseW, newH / baseH);
        gsap.set(g, { scale: s, transformOrigin: "0 0" });
      });
    });

    bacRelayoutScores({ duration: 0 });
  }
  function bacUpdateScore(key, value) {
    const badge = ensureBacSvgScore(key);
    if (!badge) return;

    badge.text.textContent = String(value);

    const bb = badge.text.getBBox();
    const w = Math.max(38, bb.width + 24);
    const h = Math.max(20, bb.height + 8);
    bacSizeScoreBadge(badge);

    const pos = bacScorePosition(key);
    if (!pos) return;

    if (!badge.placed) {
      gsap.set(badge.g, { x: pos.x, y: pos.y, opacity: 1 });
      badge.g.style.visibility = "visible";
      badge.placed = true;
    } else {
      gsap.set(badge.g, { x: pos.x, y: pos.y });
    }
  }

  async function renderBaccaratRoundFromServerState(state) {
    clearBaccaratTableCards();

    const p = state?.hands?.player || [];
    const b = state?.hands?.banker || [];

    const dealtP = [];
    const dealtB = [];

    const totalOf = (cards) => {
      let sum = 0;
      for (const c of cards) sum += bacPoint(c.rank);
      return sum % 10;
    };
    const BAC_BETWEEN_CARDS = 20;
    async function dealAndUpdate(handKey, card) {
      if (!card) return;

      await dealCardTo(handKey, card);

      if (handKey === "player") dealtP.push(card);
      else dealtB.push(card);

      const pTotal = totalOf(dealtP);
      const bTotal = totalOf(dealtB);

      if (dealtP.length) bacUpdateScore("player", pTotal);
      if (dealtB.length) bacUpdateScore("banker", bTotal);
    }

    await dealAndUpdate("player", p[0]);
    await sleep(BAC_BETWEEN_CARDS);

    await dealAndUpdate("banker", b[0]);
    await sleep(BAC_BETWEEN_CARDS);

    await dealAndUpdate("player", p[1]);
    await sleep(BAC_BETWEEN_CARDS);

    await dealAndUpdate("banker", b[1]);
    await sleep(BAC_BETWEEN_CARDS);

    if (p[2]) {
      await dealAndUpdate("player", p[2]);
      await sleep(BAC_BETWEEN_CARDS);
    }

    if (b[2]) {
      await dealAndUpdate("banker", b[2]);
      await sleep(BAC_BETWEEN_CARDS);
    }

    const finalP = Number(state?.totals?.player ?? totalOf(dealtP));
    const finalB = Number(state?.totals?.banker ?? totalOf(dealtB));
    setBacScoreTotals(finalP, finalB);

    bacApplyWinnerScoreColor(state, finalP, finalB);
  }
  function bacGetSurfaceEl() {
    return (
      document.querySelector(".bj-surface") ||
      document.getElementById("bj-surface") ||
      document.body
    );
  }
  function ensureBacSvgSizedToSurface() {
    const svg = document.getElementById("bacAnimLayer");
    const surface = bacGetSurfaceEl();
    if (!svg || !surface) return;

    const r = surface.getBoundingClientRect();
    const w = Math.max(1, r.width);
    const h = Math.max(1, r.height);

    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function waitFor(conditionFn, { timeout = 8000, interval = 60 } = {}) {
    const start = performance.now();
    return new Promise((resolve) => {
      const tick = async () => {
        let ok = false;
        try {
          ok = !!conditionFn();
        } catch {}
        if (ok) return resolve(true);
        if (performance.now() - start >= timeout) return resolve(false);
        await sleep(interval);
        tick();
      };
      tick();
    });
  }

  function preloadImages(urls = []) {
    const unique = [...new Set(urls)].filter(Boolean);
    return Promise.allSettled(
      unique.map(
        (src) =>
          new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(src);
            img.onerror = () => reject(src);
            img.src = src;
          }),
      ),
    );
  }

  function hideAppLoader() {
    const loader = document.getElementById("appLoader");
    if (!loader) return;

    loader.classList.add("is-fading");

    const finish = () => loader.classList.add("is-hidden");
    loader.addEventListener("transitionend", finish, { once: true });

    setTimeout(finish, 240);

    document.body.classList.add("app-ready");
  }

  async function gateBaccaratPageReady() {
    if (document.readyState !== "complete") {
      await new Promise((r) =>
        window.addEventListener("load", r, { once: true }),
      );
    }

    await waitFor(
      () => {
        const bal = document.getElementById("balance");
        const unit = document.querySelector(".wallet-unit");
        const hasSvg = !!unit?.querySelector("svg");
        const balText = (bal?.textContent || "").trim();

        const balanceRendered = balText !== "";

        return hasSvg && balanceRendered;
      },
      { timeout: 9000, interval: 70 },
    );

    await preloadImages([
      "/assets/logo.png",
      "/assets/q.png",
      "/assets/casino-chip.png",
    ]);

    await new Promise(requestAnimationFrame);

    hideAppLoader();
  }

  gateBaccaratPageReady();

  function getCurrencyModeSafe() {
    try {
      return typeof getMode === "function" ? getMode() : "cash";
    } catch {
      return "cash";
    }
  }
  function cashToDisplay(cashAmt) {
    const mode = getCurrencyModeSafe();
    return mode === "credits" ? cashAmt * CREDIT_RATE : cashAmt;
  }
  function displayToCash(displayAmt) {
    const mode = getCurrencyModeSafe();
    return mode === "credits" ? displayAmt / CREDIT_RATE : displayAmt;
  }

  function getPlayerBalanceCash() {
    const el = document.getElementById("balance");
    if (!el) return 0;
    const raw = (el.textContent || "").replace(/[^\d.]/g, "");
    const shown = Number(raw);
    if (!Number.isFinite(shown)) return 0;
    return displayToCash(shown);
  }

  function renderCurrencyIcon() {
    if (!currencyIcon) return;
    const mode = getCurrencyModeSafe();
    const html =
      mode === "credits"
        ? typeof creditsIcon === "function"
          ? creditsIcon()
          : `<span style="font-weight:900">CR</span>`
        : typeof cashIcon === "function"
          ? cashIcon()
          : `<span style="font-weight:900">$</span>`;
    currencyIcon.innerHTML = html;
  }

  function formatK(n) {
    if (n > 5_000_000) return "5M+";
    if (n === 5_000_000) return "5M";

    if (n >= 1_000_000) {
      const m = Math.floor(n / 1_000_000);
      const exact = m * 1_000_000;
      if (n === exact) return `${m}M`;
      return `${m}M+`;
    }

    if (n >= 1000) {
      const k = Math.floor(n / 1000);
      const exact = k * 1000;
      if (n === exact) return `${k}K`;
      return `${k}K+`;
    }

    return String(Math.round(n));
  }

  let selectedChipBtn = null;
  let selectedChipValueCash = 0;
  let totalBetCash = 0;
  let activeBetBtn = null;

  function toast(msg) {
    if (typeof showBjToast === "function") return showBjToast(msg, 3000);
    console.warn("[baccarat2]", msg);
  }
  function bcScrollHistoryToEnd() {
    const row = document.getElementById("bcHistory");
    if (!row) return;
    row.scrollLeft = row.scrollWidth;
  }

  function setTotalBetCash(val) {
    totalBetCash = Math.max(0, Number(val) || 0);
    if (!totalBetEl) return;

    const shown = cashToDisplay(totalBetCash);

    const exact = Number.isFinite(shown)
      ? Math.round(shown).toLocaleString()
      : "0";

    totalBetEl.textContent = exact;
  }
  function recomputeTotalBetFromButtons() {
    let sum = 0;
    betBtns.forEach((btn) => {
      sum += Number(btn.dataset.betTotalCash || "0") || 0;
    });
    setTotalBetCash(sum);
  }

  function ensureBetChipOverlay(btn) {
    let chip = btn.querySelector(".bac-bet-chip");
    if (chip) return chip;

    chip = document.createElement("span");
    chip.className = "bac-bet-chip";

    const img = selectedChipBtn?.querySelector("img")?.cloneNode(true) || null;
    if (img) {
      img.alt = "";
      img.draggable = false;
    }

    const label = document.createElement("span");
    label.className = "bac-chip-label";
    label.textContent = "0";

    if (img) chip.appendChild(img);
    chip.appendChild(label);
    btn.appendChild(chip);
    return chip;
  }

  const CHIP_LEVELS = [
    1, 5, 10, 25, 50, 100, 500, 1000, 5000, 10000, 50000, 100000, 200000,
    500000, 1000000, 5000000,
  ];

  function chipHueForTotalCash(totalCash) {
    const v = Math.max(0, Number(totalCash) || 0);

    let idx = 0;
    for (let i = 0; i < CHIP_LEVELS.length; i++) {
      if (v >= CHIP_LEVELS[i]) idx = i;
    }

    return -75 - idx * 5;
  }

  function applyChipFilterForTotal(btn) {
    const totalCash = Number(btn.dataset.betTotalCash || "0") || 0;
    const img = btn.querySelector(".bac-bet-chip img");
    if (!img) return;

    if (totalCash <= 0) {
      img.style.filter = "";
      return;
    }
    const hue = chipHueForTotalCash(totalCash);
    img.style.filter = `brightness(1.4) hue-rotate(${hue}deg)`;
  }

  function updateBetChipLabel(btn) {
    const chip = btn.querySelector(".bac-bet-chip");
    if (!chip) return;

    const label = chip.querySelector(".bac-chip-label");
    if (!label) return;

    const cashTotal = Number(btn.dataset.betTotalCash || "0") || 0;
    const shown = cashToDisplay(cashTotal);

    label.textContent = formatK(shown);

    applyChipFilterForTotal(btn);
  }

  function selectChip(btn) {
    chipBtns.forEach((b) => b.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    selectedChipBtn = btn;

    selectedChipValueCash = Number(btn.dataset.value) || 0;
  }

  chipBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectChip(btn);
    });
  });

  selectChip(chipBtns[0]);

  betBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      activeBetBtn = btn;

      if (!selectedChipBtn || !selectedChipValueCash) return;

      const balanceCash = getPlayerBalanceCash();
      const currentTotal = totalBetCash;
      const nextTotal = currentTotal + selectedChipValueCash;
      if (balanceCash < nextTotal) {
        toast("Insufficient funds");
        return;
      }
      bcPushUndoSnapshot();
      const prev = Number(btn.dataset.betTotalCash || "0") || 0;
      const next = prev + selectedChipValueCash;
      btn.dataset.betTotalCash = String(next);

      ensureBetChipOverlay(btn);
      updateBetChipLabel(btn);

      btn.classList.toggle("has-bet", next > 0);
      btn.classList.toggle("is-active", next > 0);

      recomputeTotalBetFromButtons();
    });
  });

  function clearBaccaratBets() {
    betBtns.forEach((btn) => {
      delete btn.dataset.betTotalCash;
      btn.classList.remove("has-bet", "is-active");
      btn.querySelector(".bac-bet-chip")?.remove();
    });
    activeBetBtn = null;
    setTotalBetCash(0);
  }
  window.clearBaccaratBets = clearBaccaratBets;

  function getBetCash(btn) {
    return Number(btn?.dataset?.betTotalCash || "0") || 0;
  }
  function setBetCash(btn, cash) {
    cash = Math.max(0, Number(cash) || 0);

    if (cash <= 0) {
      delete btn.dataset.betTotalCash;
      btn.classList.remove("has-bet", "is-active");
      btn.querySelector(".bac-bet-chip")?.remove();
      return;
    }

    btn.dataset.betTotalCash = String(cash);
    btn.classList.add("has-bet", "is-active");
    ensureBetChipOverlay(btn);
    updateBetChipLabel(btn);
  }

  function existingBetButtons() {
    return betBtns.filter((b) => getBetCash(b) > 0);
  }

  function targetsForQuick() {
    const existing = existingBetButtons();
    if (!existing.length) return [];

    if (existing.length > 1) return existing;

    return existing;
  }

  function totalCashAcross(btns) {
    return btns.reduce((sum, b) => sum + getBetCash(b), 0);
  }

  function quick2x() {
    const targets = targetsForQuick();
    if (!targets.length) return;
    bcPushUndoSnapshot();
    const currentTotal = totalCashAcross(targets);
    const extraNeeded = currentTotal;

    const balanceCash = getPlayerBalanceCash();
    if (balanceCash < totalBetCash + extraNeeded) {
      toast("Insufficient funds");
      return;
    }

    targets.forEach((btn) => {
      const oldCash = getBetCash(btn);
      if (oldCash > 0) setBetCash(btn, oldCash * 2);
    });

    recomputeTotalBetFromButtons();
  }

  function quickHalf() {
    const targets = targetsForQuick();
    if (!targets.length) return;
    bcPushUndoSnapshot();
    targets.forEach((btn) => {
      const oldCash = getBetCash(btn);
      if (oldCash <= 0) return;
      const nextCash = Math.max(1, Math.ceil(oldCash / 2));
      setBetCash(btn, nextCash);
    });

    recomputeTotalBetFromButtons();
  }

  quickBtns.forEach((btn) => {
    btn.addEventListener("pointerdown", (e) => e.preventDefault());

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const action = btn.dataset.set;
      if (action === "2x") quick2x();
      if (action === "half") quickHalf();
    });
  });

  dealBtn?.addEventListener("click", async () => {
    if (isDealing) return;

    hideBacProfit();

    const bets = collectBetsCashFromButtons();
    const totalBet = sumBetsCash(bets);

    if (totalBet <= 0) {
      toast("Place a bet first");
      return;
    }

    const balBefore = getPlayerBalanceCash();
    if (balBefore < totalBet) {
      toast("Insufficient funds");
      return;
    }

    bcSyncTopbarWalletCash(Math.max(0, balBefore - totalBet));

    try {
      isDealing = true;
      lockBettingUI(true);
      setDealHidden(true);

      const data = await apiPost("/api/baccarat/start", { bets });

      if (!data?.ok) {
        bcSyncTopbarWalletCash(balBefore);

        if (data?.error === "INSUFFICIENT_FUNDS") toast("Insufficient funds");
        else if (data?.error === "BAD_BET") toast("Invalid bet");
        else toast("Baccarat failed");
        return;
      }

      const state = data.state;

      await renderBaccaratRoundFromServerState(state);
      bcPushResultToHistory(state?.outcome);

      await sleep(BAC_PROFIT_DELAY_MS);

      bcSyncTopbarWalletFromState(state);

      const totalReturnCash = Number(state?.payout?.totalReturnCash || 0);
      const netProfitCash =
        Math.round((totalReturnCash - totalBet) * 100) / 100;

      if (netProfitCash > 0) {
        showBacProfit({ type: "win", amountCash: netProfitCash });
      } else if (netProfitCash === 0) {
        showBacProfit({ type: "draw" });
      } else {
        hideBacProfit();
        clearBaccaratBets();
        bcUndoStack.length = 0;
      }

      await sleep(250);
    } catch (err) {
      console.error("[baccarat2] FAILED:", err);
      bcSyncTopbarWalletCash(balBefore);
      toast("Baccarat failed");
    } finally {
      isDealing = false;
      setDealHidden(false);
      lockBettingUI(false);
    }
  });

  (function chipTrackScroller() {
    const chipWindow = document.querySelector(".chip-window");
    const chipTrack = document.querySelector(".chip-track");

    const navBtns = Array.from(
      document.querySelectorAll(".chip-selector .chip-nav"),
    );
    const leftBtn = navBtns[0] || null;
    const rightBtn = navBtns[1] || null;

    const VISIBLE = 4;

    let chipScrollPx = 0;
    let snapTimer = null;
    let isWheelScrolling = false;

    function clamp(n, min, max) {
      return Math.max(min, Math.min(max, n));
    }

    function getChipStepPx() {
      const first = chipTrack?.querySelector(".chip");
      if (!first) return 0;
      const rect = first.getBoundingClientRect();
      return rect.width || 44;
    }

    function getMaxIndex() {
      const total = chipTrack?.querySelectorAll(".chip")?.length || 0;
      return Math.max(0, total - VISIBLE);
    }

    function setTrackTransition(on, ms = 220) {
      if (!chipTrack) return;
      chipTrack.style.transition = on ? `transform ${ms}ms ease` : "none";
    }

    function applyTransform() {
      if (!chipTrack) return;
      chipTrack.style.transform = `translate3d(${-chipScrollPx}px, 0, 0)`;
    }

    function snapToNearestChip() {
      const step = getChipStepPx();
      if (!step) return;

      const maxIndex = getMaxIndex();
      const maxPx = maxIndex * step;

      chipScrollPx = clamp(chipScrollPx, 0, maxPx);

      const idx = clamp(Math.round(chipScrollPx / step), 0, maxIndex);
      chipScrollPx = idx * step;

      setTrackTransition(true, 180);
      applyTransform();
    }

    function scheduleSnap() {
      if (snapTimer) clearTimeout(snapTimer);
      snapTimer = setTimeout(() => {
        isWheelScrolling = false;
        snapToNearestChip();
      }, 160);
    }

    function jumpByChips(deltaChips) {
      const step = getChipStepPx();
      if (!step) return;

      const maxIndex = getMaxIndex();
      const maxPx = maxIndex * step;

      const curIdx = clamp(Math.round(chipScrollPx / step), 0, maxIndex);
      const nextIdx = clamp(curIdx + deltaChips, 0, maxIndex);

      chipScrollPx = clamp(nextIdx * step, 0, maxPx);

      setTrackTransition(true, 220);
      applyTransform();
    }

    leftBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      jumpByChips(-VISIBLE);
    });

    rightBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      jumpByChips(+VISIBLE);
    });

    chipWindow?.addEventListener(
      "wheel",
      (e) => {
        const dx = e.deltaX;
        if (!dx || Math.abs(dx) < 0.5) return;

        e.preventDefault();

        const step = getChipStepPx();
        if (!step) return;

        const maxIndex = getMaxIndex();
        const maxPx = maxIndex * step;

        if (!isWheelScrolling) {
          isWheelScrolling = true;
          setTrackTransition(false);
        }

        chipScrollPx += dx * 0.95;
        chipScrollPx = clamp(chipScrollPx, 0, maxPx);

        applyTransform();
        scheduleSnap();
      },
      { passive: false },
    );

    snapToNearestChip();
  })();

  function refreshChipLabelsForMode() {
    chipBtns.forEach((btn) => {
      const cashVal = Number(btn.dataset.value || "0") || 0;
      const shown = cashToDisplay(cashVal);
      const label = btn.querySelector(".bj-chip-label");
      if (label) label.textContent = formatK(shown);
      btn.setAttribute("aria-label", `Add ${formatK(shown)}`);
    });
  }

  function refreshAllBetLabels() {
    renderCurrencyIcon();
    refreshChipLabelsForMode();
    betBtns.forEach(updateBetChipLabel);
    recomputeTotalBetFromButtons();
  }

  window.addEventListener("rollix:modechange", refreshAllBetLabels);
  window.addEventListener("rollix:currencychange", refreshAllBetLabels);

  let lastMode = getCurrencyModeSafe();
  setInterval(() => {
    const now = getCurrencyModeSafe();
    if (now !== lastMode) {
      lastMode = now;
      refreshAllBetLabels();
    }
  }, 150);

  refreshAllBetLabels();
  recomputeTotalBetFromButtons();
})();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function waitFor(conditionFn, { timeout = 8000, interval = 60 } = {}) {
  const start = performance.now();
  return new Promise((resolve) => {
    const tick = async () => {
      let ok = false;
      try {
        ok = !!conditionFn();
      } catch {}
      if (ok) return resolve(true);
      if (performance.now() - start >= timeout) return resolve(false);
      await sleep(interval);
      tick();
    };
    tick();
  });
}

function preloadImages(urls = []) {
  const unique = [...new Set(urls)].filter(Boolean);
  return Promise.allSettled(
    unique.map(
      (src) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(src);
          img.onerror = () => reject(src);
          img.src = src;
        }),
    ),
  );
}

function hideAppLoader() {
  const loader = document.getElementById("appLoader");
  if (!loader) return;

  loader.classList.add("is-fading");

  const finish = () => loader.classList.add("is-hidden");
  loader.addEventListener("transitionend", finish, { once: true });

  setTimeout(finish, 240);

  document.body.classList.add("app-ready");
}

async function gateBaccaratPageReady() {
  if (document.readyState !== "complete") {
    await new Promise((r) =>
      window.addEventListener("load", r, { once: true }),
    );
  }

  await waitFor(
    () => {
      const bal = document.getElementById("balance");
      const unit = document.querySelector(".wallet-unit");
      const hasSvg = !!unit?.querySelector("svg");
      const balText = (bal?.textContent || "").trim();

      const balanceRendered = balText !== "";

      return hasSvg && balanceRendered;
    },
    { timeout: 9000, interval: 70 },
  );

  await preloadImages([
    "/assets/logo.png",
    "/assets/q.png",
    "/assets/casino-chip.png",
  ]);

  await new Promise(requestAnimationFrame);

  hideAppLoader();
}

gateBaccaratPageReady();
