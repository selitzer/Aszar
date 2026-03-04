const dealBtn = document.querySelector(".bj-deal-btn");
const betInput = document.querySelector(".bj-bet-field");
const betPanel = document.querySelector(".bj-bet-panel");

const deckEl = document.querySelector(".bj-deck-svg");
const surfaceEl = document.querySelector(".bj-surface");
let __bjHydrating = false;

const __handsRoots = [...document.querySelectorAll(".bj-hands")];
const handsRoot = __handsRoots.length
  ? __handsRoots[__handsRoots.length - 1]
  : document;

const dealerHand = handsRoot.querySelector(".bj-hand--dealer");
const playerHand =
  handsRoot.querySelector(".bj-hand--p1") ||
  handsRoot.querySelector(".bj-hand--player");
const playerHand2 = handsRoot.querySelector(".bj-hand--p2");

const dealerScoreEl =
  dealerHand?.querySelector(".bj-score") ||
  document.querySelector(".bj-score--dealer");
const playerScoreEl =
  playerHand?.querySelector(".bj-score") ||
  document.querySelector(".bj-score--player");
const playerScore2El = playerHand2?.querySelector(".bj-score");
const hitBtn = document.querySelector('[data-action="hit"]');
const standBtn = document.querySelector('[data-action="stand"]');
const doubleBtn = document.querySelector('[data-action="double"]');
const splitBtn = document.querySelector('[data-action="split"]');
let insuranceModalOpen = false;
hideDomScoresInstant();

let canDoubleHand = [false, false];
let canSplit = false;
let splitActive = false;
let activeHandIndex = 0;

const handDone = [false, false];

const BJ_CREDIT_RATE = 5;

const dealText = document.querySelector(".bj-deal-text");
const dealSpinner = document.querySelector(".bj-deal-spinner");

function setDealLoading(on) {
  if (!dealBtn) return;

  dealBtn.disabled = on;

  if (dealText) dealText.style.display = on ? "none" : "";

  dealSpinner?.classList.toggle("is-on", on);
}

let inputLocked = false;
(function injectHandMoveTransition() {
  const id = "bj-hand-move-transition";
  if (document.getElementById(id)) return;

  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    .bj-hand--p1, .bj-hand--player, .bj-hand--p2{
      transition: left 260ms cubic-bezier(.2,.9,.2,1),
                  transform 260ms cubic-bezier(.2,.9,.2,1);
      will-change: left, transform;
    }
  `;
  document.head.appendChild(style);
})();

(function initBjRulesModal() {
  const rulesBtn =
    document.getElementById("rulesBtn") ||
    document.querySelector(".bj-title-btn");
  if (!rulesBtn) return;

  if (document.querySelector(".bj-rules-modal")) return;

  const modal = document.createElement("div");
  modal.className = "bj-rules-modal";
  modal.innerHTML = `
    <div class="bj-rules-backdrop" data-close="1"></div>

    <div class="bj-rules-card" role="dialog" aria-modal="true" aria-labelledby="bjRulesTitle">
      <button class="bj-rules-close" type="button" aria-label="Close rules" data-close="1">✕</button>

      <div class="bj-rules-head">
        <div class="bj-rules-title" id="bjRulesTitle">Blackjack Rules</div>
        <div class="bj-rules-sub">Goal: get as close to 21 as possible without going over.</div>
      </div>

      <div class="bj-rules-body">
        <ul class="bj-rules-list">
          <li><b>Card values:</b> 2–10 = face value, J/Q/K = 10, A = 1 or 11.</li>
          <li><b>Blackjack:</b> Ace + 10-value on first two cards. Pays <b>3:2</b>.</li>
          <li><b>Dealer:</b> Dealer hits until 17 (house rules may vary on soft 17).</li>
          <li><b>Hit:</b> take another card.</li>
          <li><b>Stand:</b> keep your hand.</li>
          <li><b>Double:</b> double your bet, take exactly one card, then stand.</li>
          <li><b>Split:</b> if your first two cards match, split into two hands (each gets a new card).</li>
          <li><b>Insurance:</b> if dealer shows an Ace, you may buy insurance. Pays <b>2:1</b> if dealer has Blackjack.</li>
          <li><b>Bust:</b> if you go over 21 you lose that hand.</li>
        </ul>

        <div class="bj-rules-note">
       Blackjack uses a standard 52-card deck and reshuffles frequently to keep every round independent.
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const styleId = "bj-rules-modal-styles";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .bj-rules-modal{
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: none;
      }
      .bj-rules-modal.is-open{ display:block; }

      .bj-rules-backdrop{
        position:absolute;
        inset:0;
        background: rgb(0 0 0 / 32%);
       
      }

      .bj-rules-card{
        position:absolute;
        left:50%;
        top:50%;
        transform: translate(-50%, -50%);
        width: min(520px, calc(100% - 28px));
        border-radius: 10px;
        background: #1a2125;
        color: rgb(252 242 224);
        box-shadow: 0 22px 60px rgba(0,0,0,.55);
        padding: 18px 16px 14px;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      }

      .bj-rules-close{
        position:absolute;
         right: 10px; 
        top: 10px;
        width: 34px;
        height: 34px;
        border-radius: 9px;
        border:none;
        background: transparent;
        color: rgba(230,237,243,.9);
        cursor: pointer;
        font-weight: 900;
        line-height: 1;
      }
      .bj-rules-close:hover{ filter: brightness(1.1); }

          .bj-rules-head{ padding-left: 0; padding-right: 44px; }
      .bj-rules-title{
        font-weight: 900;
        letter-spacing: .2px;
        font-size: 16px;
      }
      .bj-rules-sub{
        margin-top: 4px;
        font-size: 13px;
        color: rgb(255 255 253 / 60%);
      }

      .bj-rules-body{ margin-top: 14px; }
      .bj-rules-list{
        margin: 0;
        padding-left: 18px;
        display: grid;
        gap: 8px;
        font-size: 13px;
        line-height: 1.35;
        color: rgb(255 255 253 / 60%);
      }
      .bj-rules-list b{ color: rgb(252 242 224); }

      .bj-rules-note{
        margin-top: 12px;
        font-size: 12px;
        color: rgb(255 255 253 / 60%);
        padding-top: 10px;
        border-top: 1px solid rgba(42,54,66,.6);
      }
    `;
    document.head.appendChild(style);
  }

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

  rulesBtn.addEventListener("click", () => {
    openModal();
  });

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

const BJ_API_BASE = "/api/blackjack";

function bjSyncTopbarWallet(state) {
  const bal = Number(state?.walletBalanceCash);
  if (!Number.isFinite(bal)) return;

  window.dispatchEvent(
    new CustomEvent("rollix:walletupdate", {
      detail: { balanceCash: bal },
    }),
  );
}

async function bjApi(path, body = null) {
  const res = await fetch(`${BJ_API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : "{}",
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data?.ok === false) {
    const msg =
      data?.error || data?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data.state;
}

let bjPrevState = null;
let bjState = null;

function getBetCashFromInput() {
  syncBetCashFromInput();
  return betCashState;
}

const bjSvg = document.getElementById("bjAnimLayer");

function bjCardW() {
  return (
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--card-w"),
    ) || 78
  );
}
function bjCardH() {
  return (
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--card-h"),
    ) || 110
  );
}

function ensureSvgSizedToSurface() {
  if (!bjSvg || !surfaceEl) return;
  const r = surfaceEl.getBoundingClientRect();

  bjSvg.setAttribute("viewBox", `0 0 ${r.width} ${r.height}`);
  bjSvg.setAttribute("preserveAspectRatio", "none");
}
window.addEventListener("resize", () => {
  ensureSvgSizedToSurface();
  if (splitActive) applySplitLayout(true);
  relayoutAllHandsSvg({ duration: 0.18 });
});
requestAnimationFrame(ensureSvgSizedToSurface);

function svgEl(tag) {
  return document.createElementNS("http://www.w3.org/2000/svg", tag);
}
function bjMoveSvgCardBetweenHands(fromHand, toHand, cardIndex) {
  const from = bjGetSvgHandList(fromHand);
  const to = bjGetSvgHandList(toHand);
  const g = from.splice(cardIndex, 1)[0];
  if (g) to.push(g);
  return g;
}

async function animateSvgHandToLayout(handEl, { duration = 0.18 } = {}) {
  const list = bjGetSvgHandList(handEl);
  const targets = bjComputeHandLayout(handEl, list.length);
  list.forEach((g, i) => {
    gsap.to(g, {
      x: targets[i].x,
      y: targets[i].y,
      duration,
      ease: "power2.out",
    });
  });
  await sleep(Math.round(duration * 1000));
}

let __bjSvgCardId = 0;

function createSvgCard({ rank = "A", suit = "S", faceUp = false } = {}) {
  if (!bjSvg) return null;

  const w = bjCardW();
  const h = bjCardH();

  const id = `bjc-${++__bjSvgCardId}`;

  const clipId = ensureSharedCardClipPath();
  const shadow = ensureBjCardShadowFilter();

  const g = svgEl("g");
  g.setAttribute("data-id", id);
  g.setAttribute("data-rank", rank);
  g.setAttribute("data-suit", suit);
  g.setAttribute("data-faceup", faceUp ? "1" : "0");
  g.setAttribute("data-hidden", "0");
  g.__baseW = w;
  g.__baseH = h;
  g.setAttribute("data-basew", String(w));
  g.setAttribute("data-baseh", String(h));

  g.style.visibility = "hidden";
  g.style.pointerEvents = "none";

  g.__shadow = shadow;
  g.setAttribute("filter", "none");

  const bg = svgEl("rect");
  bg.setAttribute("x", "0");
  bg.setAttribute("y", "0");
  bg.setAttribute("width", String(w));
  bg.setAttribute("height", String(h));
  bg.setAttribute("rx", "8");
  bg.setAttribute("ry", "8");
  bg.setAttribute("fill", "#111a22");
  g.appendChild(bg);

  const img = svgEl("image");
  const BLEED = 0.5;

  img.setAttribute("x", String(-BLEED));
  img.setAttribute("y", String(-BLEED));
  img.setAttribute("width", String(w + BLEED * 2));
  img.setAttribute("height", String(h + BLEED * 2));
  if (clipId) img.setAttribute("clip-path", `url(#${clipId})`);
  img.setAttribute("preserveAspectRatio", "none");

  const backSrc = "/assets/cards/back.png";
  const frontSrc = cardFaceSrc(rank, suit);
  const src = faceUp ? frontSrc : backSrc;

  img.setAttribute("href", src);
  img.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", src);

  g.__img = img;
  g.__src = src;

  g.appendChild(img);

  const border = svgEl("rect");

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

  bjSvg.appendChild(g);

  gsap.set(g, {
    x: -9999,
    y: -9999,
    opacity: 0,
    scale: 1,
    rotation: 0,
    transformOrigin: "50% 50%",
  });

  return g;
}
function bjSetSvgCardBorder(g, color = null) {
  if (!g?.__border) return;

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

function bjApplyOutcomeBorderToHand(handEl, outcomeLower) {
  if (!handEl) return;

  const o = String(outcomeLower || "").toLowerCase();
  let color = null;

  if (o === "win") color = "#21c55e";
  else if (o === "loss" || o === "bust") color = "#f4233c";

  const list = bjSvgHands.get(handEl) || [];
  list.forEach((g) => {
    if (!g) return;
    if (g.getAttribute("data-hidden") === "1") return;
    bjSetSvgCardBorder(g, color);
  });
}

function bjClearOutcomeBordersAll() {
  [playerHand, playerHand2, dealerHand].forEach((handEl) => {
    const list = bjSvgHands.get(handEl) || [];
    list.forEach((g) => bjSetSvgCardBorder(g, null));
  });
}
function svgSetCardFace(g, rank, suit) {
  if (!g) return;
  g.setAttribute("data-rank", rank);
  g.setAttribute("data-suit", suit);
  const src = cardFaceSrc(rank, suit);
  if (g.__img) g.__img.setAttribute("href", src);
  g.__src = src;
}
function relayoutAllHandsSvg({ duration = 0.18 } = {}) {
  if (!bjSvg || !surfaceEl) return;

  ensureSvgSizedToSurface();

  [dealerHand, playerHand, playerHand2].forEach((handEl) => {
    if (!handEl) return;
    if (handEl === playerHand2 && !splitActive) return;

    const list = bjGetSvgHandList(handEl);
    if (!list?.length) return;

    const targets = bjComputeHandLayout(handEl, list.length);

    list.forEach((g, i) => {
      if (!g) return;
      if (duration <= 0) {
        gsap.set(g, { x: targets[i].x, y: targets[i].y });
      } else {
        gsap.to(g, {
          x: targets[i].x,
          y: targets[i].y,
          duration,
          ease: "power2.out",
        });
      }
    });
  });

  bjRelayoutAllScores({ duration: Math.max(0, duration) });
}

async function svgFlipUp(g) {
  if (!g || g.getAttribute("data-faceup") === "1") return;
  g.setAttribute("data-faceup", "1");

  await new Promise((resolve) => {
    gsap.to(g, {
      duration: 0.18,
      scaleX: 0.02,
      ease: "power2.in",
      onComplete: () => {
        const r = g.getAttribute("data-rank");
        const s = g.getAttribute("data-suit");
        const src = cardFaceSrc(r, s);
        if (g.__img) g.__img.setAttribute("href", src);
        g.__src = src;
        gsap.to(g, {
          duration: 0.22,
          scaleX: 1,
          ease: "power2.out",
          onComplete: resolve,
        });
      },
    });
  });

  const rate = 0.96 + Math.random() * 0.08;
  const pitch = -60 + Math.random() * 60;

  SFX.play("flipps", {
    volume: 0.6,
    rate,
    pitch,
    gateMs: 10,
  });
}

const bjSvgHands = new Map();
function bjGetSvgHandList(handEl) {
  if (!bjSvgHands.has(handEl)) bjSvgHands.set(handEl, []);
  return bjSvgHands.get(handEl);
}
function waitForHandMoveEnd(timeoutMs = 320) {
  return new Promise((resolve) => {
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      playerHand?.removeEventListener("transitionend", onEnd);
      playerHand2?.removeEventListener("transitionend", onEnd);
      resolve();
    };

    const onEnd = (e) => {
      if (e.propertyName !== "left" && e.propertyName !== "transform") return;
      finish();
    };

    playerHand?.addEventListener("transitionend", onEnd);
    playerHand2?.addEventListener("transitionend", onEnd);

    setTimeout(finish, timeoutMs);
  });
}

function bjGetHandStep(handEl) {
  const w = bjCardW();

  if (window.matchMedia("(max-width: 580px)").matches) {
    return Math.round(w * 0.52);
  }

  if (window.matchMedia("(max-width: 720px)").matches) {
    return Math.round(w * 0.42);
  }

  return Math.round(w * 0.62);
}
function bjGetHandDrop(handEl) {
  const h = bjCardH();

  if (window.matchMedia("(max-width: 580px)").matches)
    return Math.round(h * 0.12);
  if (window.matchMedia("(max-width: 720px)").matches)
    return Math.round(h * 0.1);
  return Math.round(h * 0.08);
}
function bjRescaleAllSvgCards() {
  const newW = bjCardW();
  const newH = bjCardH();

  for (const list of bjSvgHands.values()) {
    for (const g of list) {
      if (!g) continue;

      const baseW = g.__baseW || Number(g.getAttribute("data-basew")) || newW;
      const baseH = g.__baseH || Number(g.getAttribute("data-baseh")) || newH;

      const sx = newW / baseW;
      const sy = newH / baseH;
      const s = Math.min(sx, sy);

      gsap.set(g, { scale: s, transformOrigin: "0 0" });
    }
  }

  bjRelayoutAllScores({ duration: 0 });
}
function bjComputeHandLayout(handEl, count) {
  const center = getCenterInSurface(handEl);
  const w = bjCardW();
  const h = bjCardH();
  const step = bjGetHandStep(handEl);

  const span = (count - 1) * step;
  const minOffset = Math.min(0, span);
  const maxOffset = Math.max(0, span);

  const groupW = w + (maxOffset - minOffset);

  const baseX = center.x - groupW / 2 - minOffset;
  const y = center.y - h / 2;

  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({ x: baseX + i * step, y });
  }
  return out;
}

function bjComputeLandingXY(handEl, index) {
  const targets = bjComputeHandLayout(handEl, index + 1);
  return targets[index];
}
let scoreLayerEl = null;

function ensureScoreLayer() {
  if (!surfaceEl) return null;
  if (scoreLayerEl) return scoreLayerEl;

  scoreLayerEl = document.createElement("div");
  scoreLayerEl.className = "bj-score-layer";
  surfaceEl.appendChild(scoreLayerEl);

  if (dealerScoreEl) scoreLayerEl.appendChild(dealerScoreEl);
  if (playerScoreEl) scoreLayerEl.appendChild(playerScoreEl);
  if (playerScore2El) scoreLayerEl.appendChild(playerScore2El);

  return scoreLayerEl;
}

async function dealCardToSvg(
  handEl,
  { rank = "A", suit = "S", faceDown = false, awaitFlip = false } = {},
) {
  if (!handEl || !bjSvg || !surfaceEl || !deckEl) return null;

  ensureSvgSizedToSurface();

  const g = createSvgCard({ rank, suit, faceUp: false });
  if (!g) return null;

  const backSrc = "/assets/cards/back.png";

  if (g.__img) g.__img.setAttribute("href", backSrc);
  g.__src = backSrc;
  g.setAttribute("data-faceup", "0");

  if (faceDown) {
    g.setAttribute("data-hidden", "1");
  } else {
    g.setAttribute("data-hidden", "0");
  }

  {
    const initialSrc = g.__src || g.__img?.getAttribute("href");
    await ensureImgDecoded(initialSrc, 1400);
  }

  if (!faceDown) {
    const faceSrc = cardFaceSrc(rank, suit);
    await ensureImgDecoded(faceSrc, 1400);
  }

  const list = bjGetSvgHandList(handEl);
  const idx = list.length;
  list.push(g);

  const targets = bjComputeHandLayout(handEl, list.length);

  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const REFLOW_SEC = prefersReduced ? 0 : 0.28;
  const REFLOW_EASE = "sine.inOut";

  for (let i = 0; i < idx; i++) {
    const card = list[i];
    if (!card) continue;

    gsap.killTweensOf(card);

    gsap.to(card, {
      duration: REFLOW_SEC,
      x: targets[i].x,
      y: targets[i].y,
      ease: REFLOW_EASE,
      overwrite: "auto",
    });
  }

  const start = getDealStartPoint();
  const end = targets[idx];

  playDrawSfx();

  await bjRevealAndAnimateCard(g, start, end, BJ_DEAL_MS / 1000);

  if (g.__shadow) g.setAttribute("filter", g.__shadow);

  if (!faceDown) {
    if (awaitFlip) await svgFlipUp(g);
    else svgFlipUp(g);
  }

  return g;
}

async function applySplitLayoutAndRelayoutSvg(on, { duration = 0.18 } = {}) {
  applySplitLayout(!!on);

  await new Promise(requestAnimationFrame);

  await waitForHandMoveEnd(340);

  ensureSvgSizedToSurface();
  relayoutAllHandsSvg({ duration });
}
function isSmallScreen() {
  return window.matchMedia("(max-width: 890px)").matches;
}
function handCardCount(handEl) {
  return (bjSvgHands.get(handEl) || []).filter(
    (g) => g?.getAttribute("data-hidden") !== "1",
  ).length;
}
function resetScoreEl(scoreEl) {
  if (!scoreEl) return;
  scoreEl.classList.remove("is-pill", "is-win", "is-lost");
  scoreEl.textContent = "0";
}

const bjSvgScores = new Map();
const BJ_ACTIVE_SCORE_BORDER = "#d4af37";

function bjSetScoreActiveOutline(handEl, on) {
  if (!handEl) return;

  if (!on && !bjSvgScores.has(handEl)) return;

  const badge = on ? ensureSvgScore(handEl) : bjSvgScores.get(handEl);
  if (!badge?.border) return;

  const show = !!on;
  badge.border.setAttribute(
    "stroke",
    show ? BJ_ACTIVE_SCORE_BORDER : "transparent",
  );

  try {
    gsap.killTweensOf(badge.border);
  } catch {}
  gsap.to(badge.border, {
    duration: 0.18,
    attr: { opacity: show ? 1 : 0 },
    ease: "power1.out",
  });
}

function bjClearActiveScoreOutlines() {
  if (playerHand) bjSetScoreActiveOutline(playerHand, false);
  if (playerHand2) bjSetScoreActiveOutline(playerHand2, false);
}

function bjRefreshActiveScoreOutlineFromState(state) {
  bjClearActiveScoreOutlines();

  if (!(splitActive && playerHand2)) return;

  if (state?.phase && state.phase !== "player") return;

  if (areAllPlayerHandsDone(state)) return;

  const idx =
    state?.player?.activeHandIndex ??
    state?.activeHandIndex ??
    activeHandIndex ??
    0;

  if (isHandDoneFromState(state, idx)) return;

  const handEl = idx === 0 ? playerHand : playerHand2;
  if (handEl) bjSetScoreActiveOutline(handEl, true);
}
function ensureSvgScore(handEl) {
  if (!bjSvg || !handEl) return null;
  if (bjSvgScores.has(handEl)) return bjSvgScores.get(handEl);

  const g = svgEl("g");
  g.setAttribute("data-kind", "bj-score-badge");
  g.style.pointerEvents = "none";
  g.style.userSelect = "none";

  g.style.opacity = "0";
  g.style.visibility = "hidden";
  g.setAttribute("transform", "translate(-9999 -9999)");

  const rect = svgEl("rect");
  rect.setAttribute("rx", "7");
  rect.setAttribute("ry", "7");
  rect.setAttribute("fill", "rgba(21,30,39,.85)");
  rect.setAttribute("stroke", "none");

  const border = svgEl("rect");
  border.setAttribute("fill", "none");
  border.setAttribute("stroke", "transparent");
  border.setAttribute("opacity", "0");
  border.setAttribute("vector-effect", "non-scaling-stroke");
  border.setAttribute("rx", "7");
  border.setAttribute("ry", "7");
  border.setAttribute("stroke-width", "2.5");

  const t = svgEl("text");
  t.setAttribute("text-anchor", "middle");
  t.setAttribute("dominant-baseline", "middle");
  t.setAttribute(
    "font-family",
    "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  );
  t.setAttribute("font-weight", "700");
  t.setAttribute("font-size", "13");
  t.setAttribute("fill", "#ffffff");
  t.textContent = "0";

  g.appendChild(rect);
  g.appendChild(border);
  g.appendChild(t);

  bjSvg.appendChild(g);

  const obj = { g, rect, border, text: t, w: 44, h: 28, __placed: false };
  bjSvgScores.set(handEl, obj);

  bjSizeScoreBadge(obj);

  gsap.set(g, { opacity: 0, x: -9999, y: -9999, immediateRender: true });

  return obj;
}
function bjSizeScoreBadge(obj) {
  if (!obj?.rect || !obj?.text) return;

  const PAD_X = 12;
  const PAD_Y = 2;
  const MIN_W = 38;
  const MIN_H = 18;

  let bb;
  try {
    bb = obj.text.getBBox();
  } catch {
    bb = null;
  }

  const w = Math.max(MIN_W, (bb ? bb.width : 16) + PAD_X * 2);
  const h = Math.max(MIN_H, (bb ? bb.height : 16) + PAD_Y * 2);

  obj.w = w;
  obj.h = h;

  obj.rect.setAttribute("x", String(-w / 2));
  obj.rect.setAttribute("y", String(-h / 2));
  obj.rect.setAttribute("width", String(w));
  obj.rect.setAttribute("height", String(h));

  if (obj.border) {
    obj.border.setAttribute("x", String(-w / 2));
    obj.border.setAttribute("y", String(-h / 2));
    obj.border.setAttribute("width", String(w));
    obj.border.setAttribute("height", String(h));
    obj.border.setAttribute("rx", "7");
    obj.border.setAttribute("ry", "7");
  }

  obj.text.setAttribute("x", "0");
  obj.text.setAttribute("y", "1");
}

function ensureBjScoreTextFilter() {
  if (!bjSvg) return null;

  let defs = bjSvg.querySelector("defs");
  if (!defs) {
    defs = svgEl("defs");
    bjSvg.appendChild(defs);
  }

  if (defs.querySelector("#bjScoreTextShadow")) return "bjScoreTextShadow";

  const filter = svgEl("filter");
  filter.setAttribute("id", "bjScoreTextShadow");
  filter.setAttribute("x", "-50%");
  filter.setAttribute("y", "-50%");
  filter.setAttribute("width", "200%");
  filter.setAttribute("height", "200%");

  const fe = svgEl("feDropShadow");
  fe.setAttribute("dx", "0");
  fe.setAttribute("dy", "2");
  fe.setAttribute("stdDeviation", "2");
  fe.setAttribute("flood-color", "#000");
  fe.setAttribute("flood-opacity", "0.55");

  filter.appendChild(fe);
  defs.appendChild(filter);
  return "bjScoreTextShadow";
}

function bjScoreTargetForHand(handEl) {
  const list = bjSvgHands?.get(handEl) || [];
  const visible = list.filter(
    (g) => g && g.getAttribute("data-hidden") !== "1",
  );
  const count = visible.length;
  if (!count) return null;

  const w = bjCardW();
  const h = bjCardH();
  const PAD = 30;

  const targets = bjComputeHandLayout(handEl, count);
  const firstX = targets[0].x;
  const lastX = targets[count - 1].x;

  const cx = (firstX + lastX + w) / 2;

  const top = targets[0].y;
  const bottom = targets[0].y + h;

  const isDealer = handEl.classList.contains("bj-hand--dealer");
  const y = isDealer ? bottom + PAD : top - PAD;

  return { x: cx, y };
}

function bjRelayoutScoreForHand(handEl, { duration = 0.18 } = {}) {
  const badge = ensureSvgScore(handEl);
  if (!badge) return;

  const pos = bjScoreTargetForHand(handEl);

  if (!pos) {
    if (duration <= 0) gsap.set(badge.g, { opacity: 0 });
    else
      gsap.to(badge.g, {
        opacity: 0,
        duration: Math.min(0.12, duration),
        ease: "power1.out",
      });
    return;
  }

  if (!badge.__placed) {
    gsap.set(badge.g, { x: pos.x, y: pos.y });
    badge.__placed = true;

    if (duration <= 0) return;

    return;
  }

  if (duration <= 0) gsap.set(badge.g, { x: pos.x, y: pos.y });
  else gsap.to(badge.g, { x: pos.x, y: pos.y, duration, ease: "power2.out" });
}

function bjRelayoutAllScores({ duration = 0.18 } = {}) {
  [dealerHand, playerHand, playerHand2].forEach((handEl) => {
    if (!handEl) return;
    if (handEl === playerHand2 && !splitActive) return;
    bjRelayoutScoreForHand(handEl, { duration });
  });
}

function bjShowScoresSvg() {
  [dealerHand, playerHand, playerHand2].forEach((handEl) => {
    if (!handEl) return;
    if (handEl === playerHand2 && !splitActive) return;

    const badge = ensureSvgScore(handEl);
    if (!badge) return;

    bjRelayoutScoreForHand(handEl, { duration: 0 });
    badge.g.style.visibility = "visible";

    gsap.to(badge.g, { opacity: 1, duration: 0.12, ease: "power1.out" });
  });
}

function bjHideScoresSvg() {
  for (const badge of bjSvgScores.values()) {
    try {
      gsap.killTweensOf(badge.g);
    } catch {}
    try {
      gsap.to(badge.g, {
        opacity: 0,
        duration: 0.1,
        ease: "power1.out",
        onComplete: () => {
          badge.__placed = false;
          bjResetScoreBadgeToNeutral(badge);
        },
      });
    } catch {}
  }
}
function bjClearScoresSvg() {
  for (const badge of bjSvgScores.values()) {
    badge.__placed = false;
    try {
      badge.text.textContent = "0";
    } catch {}
    try {
      badge.rect.setAttribute("fill", "#2e414e");
    } catch {}
    try {
      bjSizeScoreBadge(badge);
    } catch {}
    try {
      gsap.set(badge.g, { opacity: 0 });
    } catch {}
  }
}

function bjSetHandScoreSvg(handEl, numberText, outcomeLower) {
  const badge = ensureSvgScore(handEl);
  if (!badge) return;

  const txt = String(numberText ?? "0");
  badge.text.textContent = txt;
  bjSizeScoreBadge(badge);

  const o = String(outcomeLower || "").toLowerCase();

  const isDealer = handEl.classList.contains("bj-hand--dealer");

  if (isDealer) {
    bjResetScoreBadgeToNeutral(badge);
    return;
  }

  if (!o) {
    bjResetScoreBadgeToNeutral(badge);
    return;
  }

  let target = BJ_SCORE_NEUTRAL;
  if (o === "win") target = "#21c55e";
  else if (o === "loss" || o === "bust") target = "#f4233c";

  bjAnimateScoreFill(badge, target, { duration: 0.35 });
}
function bjAnimateScoreFill(badge, fill, { duration = 0.35 } = {}) {
  if (!badge?.rect) return;
  try {
    gsap.killTweensOf(badge.rect);
  } catch {}
  gsap.to(badge.rect, {
    duration,
    attr: { fill },
    ease: "power1.out",
  });
}
function positionScoreBadges() {
  ensureScoreLayer();
  if (!surfaceEl) return;

  const surfaceRect = surfaceEl.getBoundingClientRect();
  const PAD = 10;

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  const getLayoutBounds = (handEl) => {
    const list = bjSvgHands?.get(handEl) || [];
    const visible = list.filter(
      (g) => g && g.getAttribute("data-hidden") !== "1",
    );
    const count = visible.length;
    if (!count) return null;

    const w = bjCardW();
    const h = bjCardH();

    const targets = bjComputeHandLayout(handEl, count);
    const firstX = targets[0].x;
    const lastX = targets[count - 1].x;

    const cx = (firstX + lastX + w) / 2;

    const top = targets[0].y;
    const bottom = targets[0].y + h;

    return { cx, top, bottom, w, h };
  };

  const place = (scoreEl, handEl, where) => {
    if (!scoreEl || !handEl) return;

    const b = getLayoutBounds(handEl);
    if (!b) return;

    const x = b.cx;
    const y = where === "above" ? b.top - PAD : b.bottom + PAD;

    const wEl = scoreEl.offsetWidth || 44;
    const hEl = scoreEl.offsetHeight || 26;

    const safeX = clamp(x, wEl / 2 + 8, surfaceRect.width - wEl / 2 - 8);
    const safeY = clamp(y, hEl / 2 + 8, surfaceRect.height - hEl / 2 - 8);

    scoreEl.classList.toggle("is-above", where === "above");
    scoreEl.classList.toggle("is-below", where === "below");

    scoreEl.style.left = `${safeX}px`;
    scoreEl.style.top = `${safeY}px`;
    scoreEl.style.opacity = "1";
  };

  place(dealerScoreEl, dealerHand, "below");
  place(playerScoreEl, playerHand, "above");

  if (playerHand2 && playerScore2El) {
    const hasCards2 = (bjSvgHands?.get(playerHand2) || []).some(
      (g) => g?.getAttribute("data-hidden") !== "1",
    );
    if (splitActive || hasCards2) place(playerScore2El, playerHand2, "above");
  }
}
function canDoubleActiveHand() {
  const idx = splitActive ? activeHandIndex : 0;
  const handEl = getActiveHandEl();
  if (!handEl) return false;
  return !!canDoubleHand[idx] && handCardCount(handEl) === 2;
}
function applySplitLayout(on) {
  if (!playerHand) return;

  const small = isSmallScreen();

  if (on) {
    playerHand.style.left = small ? "25%" : "36%";
    playerHand.style.transform = "translateX(-50%)";

    if (playerHand2) {
      playerHand2.style.left = small ? "73%" : "64%";
      playerHand2.style.transform = "translateX(-50%)";
    }
  } else {
    playerHand.style.left = "50%";
    playerHand.style.transform = "translateX(-50%)";

    if (playerHand2) {
      playerHand2.style.left = "50%";
      playerHand2.style.transform = "translateX(-50%)";
    }
  }
}
window.addEventListener("resize", () => {
  ensureSvgSizedToSurface();

  bjRescaleAllSvgCards();

  if (splitActive) applySplitLayout(true);

  relayoutAllHandsSvg({ duration: 0.18 });
});
function getCurrencyModeSafe() {
  try {
    return typeof getMode === "function" ? getMode() : "cash";
  } catch {
    return "cash";
  }
}

function cashToDisplay(cashAmt) {
  const mode = getCurrencyModeSafe();
  return mode === "credits" ? cashAmt * BJ_CREDIT_RATE : cashAmt;
}

function displayToCash(displayAmt) {
  const mode = getCurrencyModeSafe();
  return mode === "credits" ? displayAmt / BJ_CREDIT_RATE : displayAmt;
}

const SFX = (() => {
  const sounds = new Map();
  let ctx = null;
  let master = null;
  let unlocked = false;
  let decoding = false;

  const hasWebAudio = () =>
    typeof window !== "undefined" &&
    (window.AudioContext || window.webkitAudioContext);

  function ensureCtx() {
    if (!hasWebAudio()) return null;
    if (ctx) return ctx;

    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: "interactive" });

    master = ctx.createGain();
    master.gain.value = 1.0;
    master.connect(ctx.destination);

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        try {
          ctx.resume();
        } catch {}
      }
    });

    window.addEventListener("focus", () => {
      try {
        ctx.resume();
      } catch {}
    });

    return ctx;
  }

  async function decodeUrlToBuffer(url) {
    const c = ensureCtx();
    if (!c) return null;

    const res = await fetch(url, { cache: "force-cache" });
    const arr = await res.arrayBuffer();

    if (c.decodeAudioData.length === 1) {
      return await c.decodeAudioData(arr);
    }
    return await new Promise((resolve, reject) => {
      c.decodeAudioData(arr, resolve, reject);
    });
  }

  function load(name, url, opts = {}) {
    sounds.set(name, {
      url,
      volume: typeof opts.volume === "number" ? opts.volume : 1,
      buffer: null,

      pool: null,
      idx: 0,
      htmlPoolSize: opts.htmlPoolSize || 6,
    });

    if (hasWebAudio() && unlocked) {
      decodeUrlToBuffer(url)
        .then((buf) => {
          const s = sounds.get(name);
          if (s) s.buffer = buf;
        })
        .catch(() => {});
    } else if (!hasWebAudio()) {
      const s = sounds.get(name);
      if (s) {
        s.pool = Array.from({ length: s.htmlPoolSize }, () => {
          const a = new Audio(url);
          a.preload = "auto";
          a.volume = s.volume;
          return a;
        });
      }
    }
  }

  async function unlock() {
    if (unlocked) return true;

    const c = ensureCtx();

    if (!c) {
      unlocked = true;

      return true;
    }

    try {
      await c.resume();
    } catch {}

    try {
      const osc = c.createOscillator();
      const g = c.createGain();
      g.gain.value = 0.0001;
      osc.connect(g);
      g.connect(master);
      osc.start();
      osc.stop(c.currentTime + 0.01);
    } catch {}

    if (!decoding) {
      decoding = true;
      const jobs = [];
      for (const [_, s] of sounds.entries()) {
        if (!s.buffer && s.url) {
          jobs.push(
            decodeUrlToBuffer(s.url)
              .then((buf) => (s.buffer = buf))
              .catch(() => {}),
          );
        }
      }
      await Promise.all(jobs);
      decoding = false;
    }

    unlocked = true;
    return true;
  }

  function playBuffer(name, { volume = null, rate = 1, pitch = 0 } = {}) {
    const c = ensureCtx();
    if (!c) return;

    const s = sounds.get(name);
    if (!s || !s.buffer) return;

    const src = c.createBufferSource();
    src.buffer = s.buffer;

    src.playbackRate.value = rate;
    src.detune.value = pitch;

    const g = c.createGain();
    g.gain.value = volume == null ? s.volume : volume;

    src.connect(g);
    g.connect(master);

    try {
      src.start(0);
    } catch {}
  }

  function playHtml(name, { volume = null, rate = 1 } = {}) {
    const s = sounds.get(name);
    if (!s || !s.pool || !s.pool.length) return;

    const a = s.pool[s.idx % s.pool.length];
    s.idx++;

    try {
      a.pause();
      a.currentTime = 0;
      a.volume = volume == null ? s.volume : volume;
      a.playbackRate = rate;
      const p = a.play();
      if (p?.catch) p.catch(() => {});
    } catch {}
  }

  const lastPlayAt = new Map();
  function play(name, opts = {}) {
    const gateMs = typeof opts.gateMs === "number" ? opts.gateMs : 0;

    if (gateMs > 0) {
      const now = performance.now();
      const last = lastPlayAt.get(name) || 0;
      if (now - last < gateMs) return;
      lastPlayAt.set(name, now);
    }

    if (hasWebAudio()) {
      ensureCtx();
      if (ctx && ctx.state === "suspended") {
        if (unlocked) {
          try {
            ctx.resume();
          } catch {}
        }
      }
    }

    if (ctx && sounds.get(name)?.buffer) {
      playBuffer(name, opts);
    } else {
      playHtml(name, opts);
    }
  }

  function setMasterVolume(v) {
    if (!master) return;
    master.gain.value = Math.max(0, Math.min(1, Number(v) || 0));
  }

  return { load, unlock, play, setMasterVolume };
})();

SFX.load("flipps", "/assets/sfx/flipps.wav", { volume: 0.6 });
SFX.load("draw", "/assets/sfx/cardDraww.wav", { volume: 0.6 });
async function unlockAudioOnce() {
  const ok = await SFX.unlock();

  console.log("[SFX] unlock:", ok);

  SFX.play("flipps", { volume: 0.001 });
  SFX.play("draw", { volume: 0.001 });
}

["touchstart", "pointerdown", "mousedown", "keydown"].forEach((evt) => {
  window.addEventListener(evt, unlockAudioOnce, { once: true, passive: true });
});

let bjToastTimer = null;
function playDrawSfx() {
  const rate = 0.97 + Math.random() * 0.06;
  SFX.play("draw", { volume: 0.6, rate, gateMs: 10 });
}
function ensureBjToast() {
  let el = document.querySelector(".bj-toast");
  if (el) return el;

  el = document.createElement("div");
  el.className = "bj-toast";
  el.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" aria-hidden="true">
      <path fill="#ff4d4f" d="M238.51 881.48A154.9 154.9 0 0 1 104.26 649l261.49-453a154.89 154.89 0 0 1 268.5 0l261.49 453a154.89 154.89 0 0 1-134.25 232.48z"/>
      <path fill="#ff4d4f" d="M443.69 241 182.2 694c-25 43.34 6.26 97.53 56.31 97.53h523c50 0 81.34-54.19 56.31-97.53L556.31 241c-25.03-43.31-87.59-43.31-112.62 0z"/>
      <path fill="#eeeeee" d="M460 354.88h80V582.7h-80z"/>
      <circle cx="500" cy="665.12" r="40" fill="#eeeeee"/>
    </svg>
    <span class="bj-toast-text">Insufficient funds</span>
  `;
  document.body.appendChild(el);
  return el;
}

function showBjToast(message = "Insufficient funds", ms = 3000) {
  const el = ensureBjToast();
  const text = el.querySelector(".bj-toast-text");
  if (text) text.textContent = message;

  clearTimeout(bjToastTimer);
  el.classList.remove("is-show");

  void el.offsetWidth;

  requestAnimationFrame(() => {
    el.classList.add("is-show");
  });

  bjToastTimer = setTimeout(() => {
    el.classList.remove("is-show");
  }, ms);
}
function bjSetNoAnim(on) {
  document.body.classList.toggle("bj-no-anim", !!on);
}
function addCardToSvgInstant(
  handEl,
  { rank = "A", suit = "S", faceDown = false, faceUp = true } = {},
) {
  if (!handEl || !bjSvg || !surfaceEl) return null;

  ensureSvgSizedToSurface();

  const g = createSvgCard({ rank, suit, faceUp: false });
  if (!g) return null;

  g.setAttribute("data-hidden", faceDown ? "1" : "0");

  const src = faceDown ? "/assets/cards/back.png" : cardFaceSrc(rank, suit);
  if (g.__img) {
    g.__img.setAttribute("href", src);
    g.__img.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", src);
  }
  g.__src = src;
  g.setAttribute("data-faceup", faceDown ? "0" : faceUp ? "1" : "0");

  const list = bjGetSvgHandList(handEl);
  list.push(g);

  g.style.visibility = "visible";
  gsap.set(g, { opacity: 1, scale: 1, rotation: 0 });

  if (g.__shadow) g.setAttribute("filter", g.__shadow);

  return g;
}
function setInputLocked(locked) {
  inputLocked = locked;
  if (locked) {
    setInRoundUI(false);
  } else {
    setInRoundUI(roundActive);
  }
}
function setInRoundUI(isInRound) {
  const setBtn = (btn, enabled) => {
    if (!btn) return;
    btn.disabled = !enabled;
    btn.classList.toggle("is-disabled", !enabled);
  };

  setBtn(hitBtn, isInRound);
  setBtn(standBtn, isInRound);

  setBtn(doubleBtn, isInRound && canDoubleActiveHand());

  setBtn(splitBtn, isInRound && canSplit && !splitActive);
}
(function injectHydrateNoAnimStyles() {
  const id = "bj-hydrate-no-anim";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    body.bj-no-anim *{
      transition: none !important;
      animation: none !important;
    }
  `;
  document.head.appendChild(style);
})();
(function injectBetLockStyles() {
  const id = "bj-bet-lock-styles";
  if (document.getElementById(id)) return;

  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    .bj-bet-panel.is-locked{
      opacity: .55;
      pointer-events: none;
      filter: grayscale(.15);
    }
    .bj-bet-panel.is-locked .bj-bet-field{
      caret-color: transparent;
    }
  `;
  document.head.appendChild(style);
})();

function setBetPanelLocked(locked) {
  if (!betPanel) return;

  betPanel.classList.toggle("is-locked", !!locked);

  betPanel.querySelectorAll("input, button, textarea, select").forEach((el) => {
    el.disabled = !!locked;
  });

  if (locked && document.activeElement === betInput) betInput.blur();
}
function hideDealButton() {
  dealBtn.classList.add("no-transition");
  dealBtn.classList.add("is-hidden");

  requestAnimationFrame(() => {
    dealBtn.classList.remove("no-transition");
  });
}

function showDealButton() {
  dealBtn.classList.remove("is-hidden");
}

async function revealDealerHoleCardSvg(realCard) {
  if (!realCard?.rank || !realCard?.suit) return;

  const list = bjSvgHands.get(dealerHand) || [];

  const hole =
    list.find((g) => g?.getAttribute("data-hidden") === "1") || list[1];
  if (!hole) return;

  hole.setAttribute("data-hidden", "0");
  hole.setAttribute("data-rank", realCard.rank);
  hole.setAttribute("data-suit", realCard.suit);

  if (hole.__img)
    hole.__img.setAttribute("href", cardFaceSrc(realCard.rank, realCard.suit));
  await svgFlipUp(hole);
  updateDealerScoreLiveFromSvg();
}

let roundActive = false;
let isAnimating = false;

function getActiveHandEl() {
  return splitActive && playerHand2
    ? activeHandIndex === 0
      ? playerHand
      : playerHand2
    : playerHand;
}
function getScoreElForHand(index) {
  if (splitActive && playerHand2)
    return index === 0 ? playerScoreEl : playerScore2El;
  return playerScoreEl;
}
function clearActiveHands() {
  playerHand?.classList.remove("is-active");
  playerHand2?.classList.remove("is-active");
  bjClearActiveScoreOutlines();
}
function setActiveHand(index) {
  activeHandIndex = index;
  if (!playerHand2) return;

  if (!splitActive) {
    playerHand.classList.remove("is-active");
    playerHand2.classList.remove("is-active");
    return;
  }

  playerHand.classList.toggle("is-active", index === 0);
  playerHand2.classList.toggle("is-active", index === 1);

  setInRoundUI(roundActive && !inputLocked);

  if (bjState) bjRefreshActiveScoreOutlineFromState(bjState);
}
function ensureBjCardShadowFilter() {
  if (!bjSvg) return null;

  let defs = bjSvg.querySelector("defs");
  if (!defs) {
    defs = svgEl("defs");
    bjSvg.appendChild(defs);
  }

  const id = "bjCardShadow";
  if (bjSvg.querySelector(`#${id}`)) return `url(#${id})`;

  const filter = svgEl("filter");
  filter.setAttribute("id", id);
  filter.setAttribute("x", "-30%");
  filter.setAttribute("y", "-30%");
  filter.setAttribute("width", "160%");
  filter.setAttribute("height", "160%");

  const fe = svgEl("feDropShadow");
  fe.setAttribute("dx", "0");
  fe.setAttribute("dy", "10");
  fe.setAttribute("stdDeviation", "8");
  fe.setAttribute("flood-color", "#000");
  fe.setAttribute("flood-opacity", "0.45");

  filter.appendChild(fe);
  defs.appendChild(filter);

  return `url(#${id})`;
}
function resetSplitState() {
  applySplitLayout(false);

  splitActive = false;
  canSplit = false;
  activeHandIndex = 0;
  handDone[0] = false;
  handDone[1] = false;

  surfaceEl?.classList.remove("is-split");
  playerHand?.classList.remove("is-active");
  playerHand2?.classList.remove("is-active");

  playerHand2?.classList.add("is-hidden");
  playerHand2?.classList.remove("is-score-visible");

  requestAnimationFrame(() => {
    ensureSvgSizedToSurface();
    relayoutAllHandsSvg({ duration: 0.18 });
  });

  bjClearActiveScoreOutlines();
}

function setPillForHand(index, tagText = "Stand") {
  const scoreEl = index === 0 ? playerScoreEl : playerScore2El;
  if (!scoreEl) return;

  const numText =
    index === 0
      ? (bjState?.playerScoreText ?? "0")
      : (bjState?.player2ScoreText ?? "0");

  scoreEl.classList.add("is-pill");
  scoreEl.classList.remove("is-win", "is-lost");
  scoreEl.innerHTML = `
    <span class="bj-pill-num">${numText}</span>
    <span class="bj-pill-tag">${tagText}</span>
  `;
}

function setPillTagForHand(index, text) {
  const scoreEl = index === 0 ? playerScoreEl : playerScore2El;
  const tag = scoreEl?.querySelector(".bj-pill-tag");
  if (tag) tag.textContent = text;
}
function setPlayerPill(tagText = "Stand") {
  setPillForHand(0, tagText);
}
function setPlayerPillTag(text) {
  setPillTagForHand(0, text);
}

function resetScoreBadges() {
  if (playerScoreEl) {
    playerScoreEl.classList.remove("is-lost", "is-win", "is-pill");
    playerScoreEl.textContent = "0";
  }
  if (dealerScoreEl) {
    dealerScoreEl.classList.remove("is-lost", "is-win", "is-pill");
    dealerScoreEl.textContent = "0";
  }
}

function hideScores() {
  bjHideScoresSvg();
}

function showScores() {
  bjRelayoutAllScores({ duration: 0 });
  requestAnimationFrame(() => {
    bjShowScoresSvg();
  });
}

function cardFaceSrc(rank, suit) {
  return `/assets/cards/${rank}${suit}.svg`;
}

let __bjAssetsReady = false;
let __bjAssetsPromise = null;

async function preloadAndDecodeImages(urls = []) {
  const unique = [...new Set(urls)].filter(Boolean);
  const jobs = unique.map(
    (src) =>
      new Promise((resolve) => {
        const img = new Image();
        img.decoding = "async";
        img.loading = "eager";
        img.onload = async () => {
          try {
            if (img.decode) await img.decode();
          } catch {}
          resolve(true);
        };
        img.onerror = () => resolve(false);
        img.src = src;
      }),
  );
  await Promise.allSettled(jobs);
}

async function warmUpWebAnimations() {
  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.left = "-9999px";
  el.style.top = "-9999px";
  el.style.width = "10px";
  el.style.height = "10px";
  document.body.appendChild(el);

  try {
    el.animate(
      [{ transform: "translateX(0px)" }, { transform: "translateX(1px)" }],
      {
        duration: 1,
        iterations: 1,
      },
    );
  } catch {}
  await new Promise(requestAnimationFrame);
  el.remove();
}

function setDealReadyUI(ready) {
  __bjAssetsReady = !!ready;
  if (!dealBtn) return;
  dealBtn.disabled = !ready;
  dealBtn.classList.toggle("is-disabled", !ready);
}

function ensureBjAssetsReady() {
  if (__bjAssetsPromise) return __bjAssetsPromise;

  __bjAssetsPromise = (async () => {
    setDealReadyUI(false);

    const critical = [
      "/assets/cards/back.png",
      "/assets/cards/AS.svg",
      "/assets/cards/KH.svg",
      "/assets/cards/10D.svg",
      "/assets/cards/7C.svg",
    ];

    await preloadAndDecodeImages(critical);

    await warmUpWebAnimations();

    try {
      if (window.bjPixi?.preload) await window.bjPixi.preload();
    } catch {}

    __bjAssetsReady = true;
    setDealReadyUI(true);
    return true;
  })();

  return __bjAssetsPromise;
}
function ensureSharedCardClipPath() {
  if (!bjSvg) return null;

  let defs = bjSvg.querySelector("defs");
  if (!defs) {
    defs = svgEl("defs");
    bjSvg.appendChild(defs);
  }

  const w = bjCardW();
  const h = bjCardH();
  const id = `bjCardClip-${Math.round(w)}x${Math.round(h)}`;

  if (defs.querySelector(`#${id}`)) return id;

  const clip = svgEl("clipPath");
  clip.setAttribute("id", id);

  const rr = svgEl("rect");
  rr.setAttribute("x", 0);
  rr.setAttribute("y", 0);
  rr.setAttribute("width", w);
  rr.setAttribute("height", h);
  rr.setAttribute("rx", 8);
  rr.setAttribute("ry", 8);

  clip.appendChild(rr);
  defs.appendChild(clip);
  return id;
}

(function kickoffPreload() {
  const start = () => ensureBjAssetsReady();
  if ("requestIdleCallback" in window)
    requestIdleCallback(start, { timeout: 1500 });
  else setTimeout(start, 0);
})();

function getCenterInSurface(el) {
  const s = surfaceEl.getBoundingClientRect();
  const r = el.getBoundingClientRect();

  let dy = 0;
  if (el.classList.contains("bj-hand--dealer"))
    dy = getCssPxVar("--bj-dealer-y", 0);
  else dy = getCssPxVar("--bj-player-y", 0);

  return {
    x: r.left - s.left + r.width / 2,
    y: r.top - s.top + r.height / 2 + dy,
  };
}
function getCssPxVar(name, fallback = 0) {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function getDealStartPoint() {
  const p = getCenterInSurface(deckEl);
  return {
    x: p.x + getCssPxVar("--deal-start-x", 0),
    y: p.y + getCssPxVar("--deal-start-y", 0),
  };
}

function recordRects(hand) {
  const m = new Map();
  [...hand.children].forEach((el) => m.set(el, el.getBoundingClientRect()));
  return m;
}

function playReflow(hand, firstRects, { duration = 240 } = {}) {
  [...hand.children].forEach((el) => {
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

const BJ_DEAL_MS = 600;
const BJ_FLIP_MS = 220;
const BJ_FLIP_DELAY = 1;
const BJ_HOLE_REVEAL_DELAY = 300;
const BJ_HOLE_REVEAL_DELAY_BJ = 500;
const BJ_DEALER_TURN_START_MS = 50;
const BJ_AFTER_HOLE_FLIP_MS = 20;
const BJ_DEALER_HIT_GAP_MS = 20;

function bestTotalFromScoreText(txt) {
  const s = String(txt || "").trim();
  if (!s) return null;

  if (/bust/i.test(s)) return 99;

  if (s.includes("/")) {
    const parts = s
      .split("/")
      .map((x) => parseInt(x, 10))
      .filter(Number.isFinite);
    return parts.length ? parts[parts.length - 1] : null;
  }

  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}
function cardValue(rank) {
  if (!rank) return 0;
  if (rank === "A") return 11;
  if (["K", "Q", "J"].includes(rank)) return 10;
  const n = parseInt(rank, 10);
  return Number.isFinite(n) ? n : 0;
}

function computeBestTotal(ranks) {
  let total = 0;
  let aces = 0;

  for (const r of ranks) {
    if (r === "A") aces++;
    total += cardValue(r);
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return total;
}

function updateDealerScoreFromState(state) {
  if (!dealerScoreEl) return;

  const cards = (state?.dealer?.cards || [])
    .filter((c) => !c?.hidden)
    .map((c) => c.rank)
    .filter((r) => r && r !== "X");

  dealerScoreEl.textContent = cards.length
    ? String(computeBestTotal(cards))
    : "0";
}

function formatHandScoreText(state, idx, rawText) {
  const hands = state?.player?.hands || state?.hands || [];
  const cards = hands?.[idx]?.cards || [];
  const raw = String(rawText || "");

  const best = bestTotalFromScoreText(raw);
  const isTwoCard21 = cards.length === 2 && best === 21;

  if (isTwoCard21 && raw.includes("/")) return "21";

  return raw;
}
function isHandDoneFromState(state, idx) {
  const hands = state?.player?.hands || state?.hands || [];
  const h = hands[idx];
  if (!h) return false;

  const tag = String(h.tag || "").toLowerCase();
  const out = String(h.outcome || "").toLowerCase();

  if (tag === "stand" || tag === "double" || tag === "bust") return true;

  if (out === "win" || out === "loss" || out === "push") return true;

  return false;
}

function clearActiveForDoneHands(state) {
  if (!splitActive) return;

  if (isHandDoneFromState(state, 0)) playerHand?.classList.remove("is-active");
  if (isHandDoneFromState(state, 1)) playerHand2?.classList.remove("is-active");
}
function formatDealerScoreText(state, rawText) {
  const cards = state?.dealer?.cards || [];
  const raw = String(rawText || "");
  const best = bestTotalFromScoreText(raw);
  const isTwoCard21 = cards.length === 2 && best === 21;

  if (isTwoCard21 && raw.includes("/")) return "21";
  return raw;
}
function normalizeCardKey(c) {
  return `${c.rank}${c.suit}${c.hidden ? "H" : "U"}`;
}
function hideDomScoresInstant() {
  [dealerScoreEl, playerScoreEl, playerScore2El].forEach((el) => {
    if (!el) return;
    el.style.opacity = "0";
    el.style.pointerEvents = "none";

    el.style.left = "-9999px";
    el.style.top = "-9999px";
  });
}

function showDomScores() {
  [dealerScoreEl, playerScoreEl, playerScore2El].forEach((el) => {
    if (!el) return;
    el.style.opacity = "";
    el.style.pointerEvents = "";
  });
}
async function renderHandsDiff(prev, next) {
  const nextDealer = next?.dealer?.cards || [];
  const nextHands = next?.player?.hands || next?.hands || [];
  const nextP1 = nextHands[0]?.cards || [];
  const nextP2 = nextHands[1]?.cards || [];

  const prevDealer = prev?.dealer?.cards || [];
  const prevHands = prev?.player?.hands || prev?.hands || [];
  const prevP1 = prevHands[0]?.cards || [];
  const prevP2 = prevHands[1]?.cards || [];

  const prevDealerCount = prevDealer.length;
  const prevP1Count = prevP1.length;
  const prevP2Count = prevP2.length;

  const prevWasSplit = !!(prev?.player?.isSplit ?? prev?.splitActive);
  const nextIsSplit = !!(next?.player?.isSplit ?? next?.splitActive);

  splitActive = nextIsSplit;

  if (splitActive) {
    surfaceEl?.classList.add("is-split");
    playerHand2?.classList.remove("is-hidden");
    playerHand2?.classList.add("is-score-visible");
    applySplitLayout(true);
    requestAnimationFrame(() => applySplitLayout(true));
  } else {
    surfaceEl?.classList.remove("is-split");
    playerHand2?.classList.add("is-hidden");
    playerHand2?.classList.remove("is-score-visible");
    applySplitLayout(false);
  }

  if (!prevWasSplit && nextIsSplit) {
    surfaceEl?.classList.add("is-split");
    playerHand2?.classList.remove("is-hidden");
    playerHand2?.classList.add("is-score-visible");

    await applySplitLayoutAndRelayoutSvg(true, { duration: 0.18 });

    const p1List = bjGetSvgHandList(playerHand);
    if (playerHand && playerHand2 && p1List.length >= 2) {
      bjMoveSvgCardBetweenHands(playerHand, playerHand2, 1);

      await Promise.all([
        animateSvgHandToLayout(playerHand, { duration: 0.18 }),
        animateSvgHandToLayout(playerHand2, { duration: 0.18 }),
      ]);

      updatePlayerScoreLiveFromSvg(playerHand);

      {
        const badge2 = ensureSvgScore(playerHand2);
        if (badge2) {
          gsap.killTweensOf(badge2.g);
          bjRelayoutScoreForHand(playerHand2, { duration: 0 });
          badge2.g.style.visibility = "visible";
          gsap.set(badge2.g, { opacity: 1 });
        }

        updatePlayerScoreLiveFromSvg(playerHand2);

        bjRelayoutAllScores({ duration: 0.12 });
      }
    } else {
      clearAllSvgHands();
      await hardRenderHandsSvg(next);
      return;
    }

    const nextHands = next?.player?.hands || next?.hands || [];
    const nextP1 = nextHands[0]?.cards || [];
    const nextP2 = nextHands[1]?.cards || [];

    for (let i = 1; i < nextP1.length; i++) {
      const c = nextP1[i];
      await dealCardToSvg(playerHand, {
        rank: c.rank,
        suit: c.suit,
        faceDown: !!c.hidden,
      });
      updatePlayerScoreLiveFromSvg(playerHand);
    }
    for (let i = 1; i < nextP2.length; i++) {
      const c = nextP2[i];
      await dealCardToSvg(playerHand2, {
        rank: c.rank,
        suit: c.suit,
        faceDown: !!c.hidden,
      });
      updatePlayerScoreLiveFromSvg(playerHand2);
    }
    return;
  }

  const isInitialDeal =
    !splitActive &&
    prevDealerCount === 0 &&
    prevP1Count === 0 &&
    nextDealer.length >= 2 &&
    nextP1.length >= 2;

  if (isInitialDeal) {
    const dealerUp = nextDealer[0];
    const dealerHole = nextDealer[1];

    await dealCardToSvg(playerHand, {
      rank: nextP1[0].rank,
      suit: nextP1[0].suit,
      faceDown: !!nextP1[0].hidden,
    });
    updatePlayerScoreLiveFromSvg(playerHand);

    await dealCardToSvg(dealerHand, {
      rank: dealerUp.rank,
      suit: dealerUp.suit,
      faceDown: false,
    });

    await dealCardToSvg(playerHand, {
      rank: nextP1[1].rank,
      suit: nextP1[1].suit,
      faceDown: !!nextP1[1].hidden,
    });
    updatePlayerScoreLiveFromSvg(playerHand);

    await dealCardToSvg(dealerHand, { rank: "X", suit: "X", faceDown: true });

    const serverWantsHoleUp = dealerHole && dealerHole.hidden !== true;
    if (serverWantsHoleUp) {
      const isBJ = dealerHasTwoCardBJ(next);
      const delay = isBJ ? BJ_HOLE_REVEAL_DELAY_BJ : BJ_HOLE_REVEAL_DELAY;
      await sleep(delay);
      await revealDealerHoleCardSvg(dealerHole);
    }

    return;
  }

  for (let i = prevP1Count; i < nextP1.length; i++) {
    const c = nextP1[i];
    await dealCardToSvg(playerHand, {
      rank: c.rank,
      suit: c.suit,
      faceDown: !!c.hidden,
    });
    updatePlayerScoreLiveFromSvg(playerHand);
  }

  if (splitActive && playerHand2) {
    for (let i = prevP2Count; i < nextP2.length; i++) {
      const c = nextP2[i];
      await dealCardToSvg(playerHand2, {
        rank: c.rank,
        suit: c.suit,
        faceDown: !!c.hidden,
      });
      updatePlayerScoreLiveFromSvg(playerHand2);
    }
  }

  const prevHadHidden = prevDealer.some((c) => c?.hidden);
  const nextHasHidden = nextDealer.some((c) => c?.hidden);

  if (prevHadHidden && !nextHasHidden && nextDealer.length >= 2) {
    await sleep(BJ_DEALER_TURN_START_MS);

    const extra = isDealerBlackjackReveal(prev, next)
      ? Math.max(0, BJ_HOLE_REVEAL_DELAY_BJ - BJ_HOLE_REVEAL_DELAY)
      : 0;

    await sleep(BJ_HOLE_REVEAL_DELAY + extra);

    let revealIdx = -1;
    for (let i = 0; i < Math.min(prevDealer.length, nextDealer.length); i++) {
      if (prevDealer[i]?.hidden && !nextDealer[i]?.hidden) {
        revealIdx = i;
        break;
      }
    }
    if (revealIdx === -1) revealIdx = 1;

    await revealDealerHoleCardSvg(nextDealer[revealIdx]);

    await sleep(BJ_AFTER_HOLE_FLIP_MS);
  }

  for (let i = prevDealerCount; i < nextDealer.length; i++) {
    const c = nextDealer[i];

    await sleep(BJ_DEALER_HIT_GAP_MS);

    await dealCardToSvg(dealerHand, {
      rank: c.rank,
      suit: c.suit,
      faceDown: !!c.hidden,
      awaitFlip: true,
    });
    updateDealerScoreLiveFromSvg();
  }
}
function clearSvgHand(handEl) {
  const list = bjSvgHands.get(handEl) || [];

  try {
    gsap.killTweensOf(list);
  } catch {}
  list.forEach((g) => {
    try {
      g.remove();
    } catch {}
  });
  bjSvgHands.set(handEl, []);
}
function clearAllSvgHands() {
  [dealerHand, playerHand, playerHand2].forEach((h) => h && clearSvgHand(h));
}
function isTwoCardBlackjackFromState(state, idx) {
  const hands = state?.player?.hands || state?.hands || [];
  const cards = hands?.[idx]?.cards || [];
  if (cards.length !== 2) return false;

  const raw = idx === 0 ? state?.playerScoreText : state?.player2ScoreText;
  const best = bestTotalFromScoreText(raw);
  return best === 21;
}
function dealerHasTwoCardBJ(state) {
  const d = state?.dealer?.cards || [];
  if (d.length < 2) return false;

  const r0 = d[0]?.rank;
  const r1 = d[1]?.rank;

  const isTen = (r) => r === "10" || r === "J" || r === "Q" || r === "K";
  return (r0 === "A" && isTen(r1)) || (r1 === "A" && isTen(r0));
}
async function autoStandSplitBlackjacks(state) {
  if (!splitActive) return state;
  if (!(state?.phase === "player" || state?.roundActive === true)) return state;

  const bj0 = isTwoCardBlackjackFromState(state, 0);
  const bj1 = isTwoCardBlackjackFromState(state, 1);

  const standHand = async (idx) => {
    const next = await bjApi("/action", { action: "stand", handIndex: idx });
    bjSyncTopbarWallet(next);
    await applyState(next);
    return next;
  };

  let s = state;

  if (bj0 && !isHandDoneFromState(s, 0)) {
    s = await standHand(0);
  }

  if (bj0 && bj1 && !isHandDoneFromState(s, 1)) {
    s = await standHand(1);
    return s;
  }

  return s;
}
async function hardRenderHandsSvg(state) {
  clearAllSvgHands();

  bjSetNoAnim(true);

  const dealerCards = state?.dealer?.cards || [];
  const hands = state?.player?.hands || state?.hands || [];
  const p1 = hands?.[0]?.cards || [];
  const p2 = hands?.[1]?.cards || [];

  splitActive = !!(state?.player?.isSplit ?? state?.splitActive);

  if (splitActive) {
    surfaceEl?.classList.add("is-split");
    playerHand2?.classList.remove("is-hidden");
    playerHand2?.classList.add("is-score-visible");
    applySplitLayout(true);
  } else {
    surfaceEl?.classList.remove("is-split");
    playerHand2?.classList.add("is-hidden");
    playerHand2?.classList.remove("is-score-visible");
    applySplitLayout(false);
  }

  await new Promise(requestAnimationFrame);
  ensureSvgSizedToSurface();

  for (const c of dealerCards) {
    if (c?.hidden)
      addCardToSvgInstant(dealerHand, { rank: "X", suit: "X", faceDown: true });
    else
      addCardToSvgInstant(dealerHand, {
        rank: c.rank,
        suit: c.suit,
        faceDown: false,
      });
  }

  for (const c of p1) {
    addCardToSvgInstant(playerHand, {
      rank: c.rank,
      suit: c.suit,
      faceDown: !!c.hidden,
    });
  }

  if (playerHand2 && (splitActive || p2.length)) {
    for (const c of p2) {
      addCardToSvgInstant(playerHand2, {
        rank: c.rank,
        suit: c.suit,
        faceDown: !!c.hidden,
      });
    }
  }

  relayoutAllHandsSvg({ duration: 0 });

  renderScoresFromState(state);
  bjRelayoutAllScores({ duration: 0 });
  bjShowScoresSvg();

  const idx = state?.player?.activeHandIndex ?? state?.activeHandIndex ?? 0;
  setActiveHand(idx);

  bjRefreshActiveScoreOutlineFromState(state);

  bjSetNoAnim(false);
}
function applyUiFromState(state) {
  roundActive =
    typeof state.roundActive === "boolean"
      ? state.roundActive
      : state?.phase
        ? state.phase !== "resolved"
        : true;

  setBetPanelLocked(roundActive);

  activeHandIndex =
    state?.player?.activeHandIndex ?? state?.activeHandIndex ?? 0;
  setActiveHand(activeHandIndex);

  const a = state.allowedActions || {};
  canSplit = !!a.split && !splitActive;
  canDoubleHand = [!!a.doubleHand0, !!a.doubleHand1];

  setInRoundUI(roundActive && !inputLocked);

  clearActiveForDoneHands(state);

  if (splitActive && areAllPlayerHandsDone(state)) {
    clearActiveHands();
  }

  if (splitActive && state?.phase && state.phase !== "player") {
    clearActiveHands();
  }

  bjRefreshActiveScoreOutlineFromState(state);
}

function bjGetAllSvgCardsFlat() {
  const out = [];
  [dealerHand, playerHand, playerHand2].forEach((handEl) => {
    if (!handEl) return;
    const list = bjSvgHands.get(handEl) || [];
    list.forEach((g) => g && out.push(g));
  });
  return out;
}
function bjSnapLayoutToSingleInstant() {
  bjSetNoAnim(true);

  splitActive = false;
  surfaceEl?.classList.remove("is-split");
  playerHand2?.classList.add("is-hidden");
  playerHand2?.classList.remove("is-score-visible");

  applySplitLayout(false);

  ensureSvgSizedToSurface();
  relayoutAllHandsSvg({ duration: 0 });
  bjRelayoutAllScores({ duration: 0 });

  requestAnimationFrame(() => bjSetNoAnim(false));
}

function bjGetAllScoreBadgeGs() {
  const out = [];
  const bDealer = bjSvgScores.get(dealerHand);
  const bP1 = bjSvgScores.get(playerHand);
  const bP2 = bjSvgScores.get(playerHand2);

  if (bDealer?.g) out.push(bDealer.g);
  if (bP1?.g) out.push(bP1.g);
  if (splitActive && bP2?.g) out.push(bP2.g);

  return out;
}

function bjFadeOutTableauAllAtOnce({
  duration = 0.5,
  scaleTo = 0.985,
  yTo = 6,
} = {}) {
  const cards = bjGetAllSvgCardsFlat();
  const badges = bjGetAllScoreBadgeGs();

  if (!cards.length && !badges.length) return Promise.resolve();

  try {
    gsap.killTweensOf(cards);
  } catch {}
  try {
    gsap.killTweensOf(badges);
  } catch {}

  if (cards.length)
    gsap.set(cards, {
      opacity: 1,
      scale: 1,
      rotation: 0,
      transformOrigin: "50% 50%",
    });
  if (badges.length)
    gsap.set(badges, { opacity: 1, scale: 1, transformOrigin: "50% 50%" });

  return new Promise((resolve) => {
    gsap.to([...cards, ...badges], {
      opacity: 0,
      scale: scaleTo,
      y: yTo ? `+=${yTo}` : undefined,
      duration,
      ease: "power2.out",
      overwrite: true,
      onComplete: () => {
        cards.forEach((g) => {
          try {
            g.remove();
          } catch {}
        });

        [dealerHand, playerHand, playerHand2].forEach((handEl) => {
          if (!handEl) return;
          bjSvgHands.set(handEl, []);
        });

        for (const badge of bjSvgScores.values()) {
          try {
            gsap.set(badge.g, { opacity: 0, scale: 1 });
          } catch {}
          try {
            badge.text.textContent = "0";
          } catch {}
          try {
            bjResetScoreBadgeToNeutral(badge);
          } catch {}
          try {
            bjSizeScoreBadge(badge);
          } catch {}
        }

        resolve();
      },
    });
  });
}

function clearAllSvgHandsAnimated() {
  return bjFadeOutTableauAllAtOnce({ duration: 0.18, scaleTo: 0.985, yTo: 6 });
}

function setOptimisticTag(action) {
  const idx = splitActive ? activeHandIndex : 0;

  if (action === "stand") setPillForHand(idx, "Stand");
  if (action === "double") setPillForHand(idx, "Double");
}
function applyPillsFromState(state) {
  const hands = state?.player?.hands || state?.hands || [];
  const resolved = state?.phase === "resolved" || state?.roundActive === false;

  const applyOne = (idx) => {
    const h = hands[idx];
    const scoreEl = idx === 0 ? playerScoreEl : playerScore2El;
    if (!h || !scoreEl) return;

    let tag = h.tag || null;
    const o = String(h.outcome || "").toLowerCase();
    const isBust = tag === "Bust";

    if (isBust) tag = null;

    if (!isBust && resolved && (tag === "Stand" || tag === "Double")) {
      if (o === "push") tag = "Push";
      if (o === "win") tag = "Win";
    }

    if (!isBust && resolved && !tag) {
      if (o === "push") tag = "Push";
      if (o === "win") tag = "Win";
    }

    if (!tag) {
      scoreEl.classList.remove("is-pill");

      const txt =
        idx === 0
          ? (state?.playerScoreText ?? "0")
          : (state?.player2ScoreText ?? "0");

      scoreEl.textContent = String(txt);
    } else {
      if (!scoreEl.classList.contains("is-pill")) setPillForHand(idx, tag);
      else setPillTagForHand(idx, tag);
    }

    scoreEl.classList.remove("is-win", "is-lost");
    if (isBust || o === "loss") scoreEl.classList.add("is-lost");
    if (o === "win") scoreEl.classList.add("is-win");
  };

  applyOne(0);
  if (splitActive) applyOne(1);

  requestAnimationFrame(positionScoreBadges);
}
async function applyState(nextState, { reset = false } = {}) {
  if (!nextState) return;

  if (reset) {
    clearHands();
    hideScores();

    bjState = nextState;

    await hardRenderHandsSvg(nextState);

    applyUiFromState(nextState);
    bjPrevState = nextState;

    const afterInsurance = await maybeHandleInsurance(nextState);
    if (afterInsurance && afterInsurance !== nextState) {
      bjState = afterInsurance;

      clearAllSvgHands();
      await hardRenderHandsSvg(afterInsurance);

      showScores();
      renderScoresFromState(afterInsurance);

      applyUiFromState(afterInsurance);

      bjPrevState = afterInsurance;
      nextState = afterInsurance;
    }
    const isResolved =
      nextState?.phase === "resolved" || nextState?.roundActive === false;

    if (isResolved) endRound();

    return;
  }

  if (!bjPrevState) {
    bjPrevState = {
      dealer: { cards: [] },
      player: { hands: [{ cards: [] }, { cards: [] }], isSplit: false },
    };
  }

  bjState = nextState;

  await renderHandsDiff(bjPrevState, nextState);

  showScores();
  renderScoresFromState(nextState);
  applyPillsFromState(nextState);
  applyUiFromState(nextState);

  bjPrevState = nextState;

  const afterInsurance = await maybeHandleInsurance(nextState);
  if (afterInsurance && afterInsurance !== nextState) {
    bjState = afterInsurance;

    await renderHandsDiff(bjPrevState, afterInsurance);

    showScores();
    renderScoresFromState(afterInsurance);
    applyPillsFromState(afterInsurance);
    applyUiFromState(afterInsurance);

    bjPrevState = afterInsurance;
    nextState = afterInsurance;
  }
  const isResolved =
    nextState?.phase === "resolved" || nextState?.roundActive === false;

  if (isResolved) endRound();

  bjPrevState = nextState;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function bjRevealAndAnimateCard(g, start, end, durationSec) {
  g.style.visibility = "hidden";

  gsap.set(g, {
    x: start.x,
    y: start.y,
    scale: 0.92,
    rotation: 8,
    opacity: 0.98,
    transformOrigin: "50% 50%",
    immediateRender: true,
  });

  await new Promise(requestAnimationFrame);
  g.style.visibility = "visible";

  await new Promise(requestAnimationFrame);

  return new Promise((resolve) => {
    gsap.to(g, {
      duration: durationSec,
      x: end.x,
      y: end.y,
      scale: 1,
      rotation: 0,
      opacity: 1,
      ease: "sine.inOut",
      overwrite: true,
      onComplete: resolve,
    });
  });
}

function clearHands() {
  clearAllSvgHands();
  hideDomScoresInstant();
  updateHandUI(dealerHand);
  updateHandUI(playerHand);
  if (playerHand2) updateHandUI(playerHand2);

  hideScores();
  resetSplitState();

  resetScoreEl(playerScoreEl);
  resetScoreEl(playerScore2El);
  resetScoreEl(dealerScoreEl);
  bjClearScoresSvg();
  bjClearOutcomeBordersAll();

  const alreadyLocked = betPanel?.classList.contains("is-locked");
  if (!alreadyLocked && !isBetLocked()) lockBetPanel(false);

  playerHand2?.classList.add("is-hidden");
  playerHand2?.classList.remove("is-score-visible");

  roundActive = false;
  setInRoundUI(false);
}

function setBetAmountCash(cashValue) {
  cashValue = Number(cashValue) || 0;
  betCashState = cashValue;

  const shown = cashToDisplay(cashValue);
  betInput.value = String(Math.round(shown * 100) / 100);
  sanitizeBetInput();
}
function refreshBjChipLabels() {
  document.querySelectorAll(".bj-chip").forEach((chip) => {
    const cashVal = Number(chip.dataset.value || "0") || 0;
    const shown = cashToDisplay(cashVal);

    const label = chip.querySelector(".bj-chip-label");
    if (label) label.textContent = String(Math.round(shown));
    else
      chip.childNodes.length
        ? (chip.textContent = String(Math.round(shown)))
        : null;

    chip.setAttribute("aria-label", `Add ${Math.round(shown)}`);
  });
}
function ensureInsuranceModal() {
  let modal = document.querySelector(".bj-insurance-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.className = "bj-insurance-modal";
  modal.innerHTML = `
  <div class="bj-insurance-backdrop"></div>
  <div class="bj-insurance-card" role="dialog" aria-modal="true">
    <div class="bj-insurance-title">Pay Insurance?</div>

    <div class="bj-insurance-sub">
      <span class="bj-insurance-label">Price:</span>

      <!-- NEW: icon slot -->
      <span class="bj-insurance-icon" aria-hidden="true"></span>

      <span class="bj-insurance-amt"></span>
    </div>

    <div class="bj-insurance-row">
      <button class="bj-insurance-btn bj-insurance-yes" type="button">Yes</button>
      <button class="bj-insurance-btn bj-insurance-no" type="button">No</button>
    </div>
  </div>
`;
  document.body.appendChild(modal);

  const style = document.createElement("style");
  style.textContent = `
    .bj-insurance-modal{ position:fixed; inset:0; z-index:9999; display:none; }
    .bj-insurance-modal.is-open{ display:block; }
    .bj-insurance-backdrop{ position:absolute; inset:0; background:rgba(0,0,0,.55); backdrop-filter: blur(6px); }
    .bj-insurance-card{
      position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
      width:min(360px, calc(100% - 32px));
      border-radius:7px;
      border:1px solid rgba(42,54,66,.85);
      background: rgba(21,30,39,.95);
      padding:16px;
      box-shadow: 0 18px 40px rgba(0,0,0,.45);
      color: rgba(230,237,243,.92);
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      text-align:center;
    }
    .bj-insurance-title{ font-weight:900; letter-spacing:.2px; font-size:15px; margin-bottom:6px; }
    .bj-insurance-sub{ 
    font-size:13px; 
    color: rgba(230,237,243,.78); 
    line-height:1.35; 
    display:flex;
  justify-content:center;
  align-items:center;
  gap:6px;
  }
    .bj-insurance-row{ display:flex; gap:10px; margin-top:14px; }
    .bj-insurance-btn{
      flex:1; height:38px; border-radius:7px; font-weight:900; cursor:pointer;
      border:1px solid rgba(42,54,66,.85);
      background: rgba(28,38,49,.65);
      color: rgba(230,237,243,.9);
    }
    .bj-insurance-yes{ background: rgba(212,175,55,.95); color:#0b0f14; border-color: rgba(212,175,55,.85); }
   .bj-insurance-yes:hover{ background: rgba(212,175,55,.95); }
    .bj-insurance-label{ color: rgba(230,237,243,.65); font-weight:700; }
.bj-insurance-amt{ color: rgba(230,237,243,.95); font-weight:900; }
  `;
  document.head.appendChild(style);

  return modal;
}

function showInsurancePopup(amtText) {
  const modal = ensureInsuranceModal();

  const mode = getCurrencyModeSafe();
  const iconEl = modal.querySelector(".bj-insurance-icon");
  const amtEl = modal.querySelector(".bj-insurance-amt");

  const iconHtml =
    mode === "credits"
      ? typeof creditsIcon === "function"
        ? creditsIcon()
        : `<span style="font-weight:900;" id="credits">CR</span>`
      : typeof cashIcon === "function"
        ? cashIcon()
        : `<span style="font-weight:900;"id="cash">$</span>`;

  if (iconEl) iconEl.innerHTML = iconHtml;
  if (amtEl) amtEl.textContent = amtText;

  return new Promise((resolve) => {
    const yes = modal.querySelector(".bj-insurance-yes");
    const no = modal.querySelector(".bj-insurance-no");

    const cleanup = () => {
      yes.removeEventListener("click", onYes);
      no.removeEventListener("click", onNo);
      modal.classList.remove("is-open");
    };

    const onYes = () => {
      cleanup();
      resolve(true);
    };
    const onNo = () => {
      cleanup();
      resolve(false);
    };

    yes.addEventListener("click", onYes);
    no.addEventListener("click", onNo);

    modal.classList.add("is-open");
  });
}

async function maybeHandleInsurance(state) {
  const pending = !!state?.insurance?.pending;
  if (!pending) return state;

  if (insuranceModalOpen) return state;
  insuranceModalOpen = true;

  try {
    setInputLocked(true);

    const insCash = Number(state?.insurance?.betCash || 0);
    const shown = cashToDisplay(insCash);

    const amtText = Number.isFinite(shown) ? shown : 0;
    const pretty = (Math.round(amtText * 100) / 100).toFixed(2);

    const takeIt = await showInsurancePopup(pretty);

    const action = takeIt ? "insurance_yes" : "insurance_no";
    const next = await bjApi("/action", { action });

    if (next?.insurance) next.insurance.pending = false;
    bjSyncTopbarWallet(next);

    return next;
  } catch (err) {
    showBjToast(err?.message || "Insurance failed", 3000);
    return state;
  } finally {
    insuranceModalOpen = false;
    setInputLocked(false);
  }
}

function sanitizeBetInput() {
  let v = betInput.value;

  v = v.replace(/[^\d.]/g, "");

  const firstDot = v.indexOf(".");
  if (firstDot !== -1) {
    v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");

    const [intPart, decPart] = v.split(".");
    if (decPart !== undefined) v = intPart + "." + decPart.slice(0, 2);
  }

  betInput.value = v;
}

function updateHandUI(handEl) {
  const hasSvg = (bjSvgHands.get(handEl) || []).length > 0;
  handEl?.classList.toggle("has-cards", hasSvg);
}
function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

async function waitImgReady(img, timeoutMs = 1200) {
  if (!img) return;

  if (img.complete && img.naturalWidth > 0) {
    try {
      if (img.decode) await img.decode();
    } catch {}
    return;
  }

  await Promise.race([
    new Promise((resolve) => {
      const done = async () => {
        img.removeEventListener("load", done);
        img.removeEventListener("error", done);
        try {
          if (img.decode) await img.decode();
        } catch {}
        resolve();
      };
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    }),
    sleep(timeoutMs),
  ]);
}

const __bjImgReady = new Map();

function ensureImgDecoded(src, timeoutMs = 1400) {
  if (!src) return Promise.resolve();
  if (__bjImgReady.has(src)) return __bjImgReady.get(src);

  const p = new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";

    let done = false;
    const finish = async () => {
      if (done) return;
      done = true;
      try {
        if (img.decode) await img.decode();
      } catch {}
      resolve();
    };

    img.onload = finish;
    img.onerror = finish;
    img.src = src;

    setTimeout(finish, timeoutMs);
  });

  __bjImgReady.set(src, p);
  return p;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function areAllPlayerHandsDone(state) {
  const isSplit = !!(
    state?.player?.isSplit ??
    state?.splitActive ??
    splitActive
  );

  if (!isSplit) return isHandDoneFromState(state, 0);

  const h0 = isHandDoneFromState(state, 0);
  const h1 = isHandDoneFromState(state, 1);
  return h0 && h1;
}
function isDealerBlackjackReveal(prev, next) {
  const prevDealer = prev?.dealer?.cards || [];
  const nextDealer = next?.dealer?.cards || [];

  const prevHadHidden = prevDealer.some((c) => c?.hidden);
  const nextHasHidden = nextDealer.some((c) => c?.hidden);
  if (!(prevHadHidden && !nextHasHidden)) return false;

  const c0 = nextDealer[0];
  const c1 = nextDealer[1];
  if (!c0 || !c1) return false;

  const r0 = c0.rank,
    r1 = c1.rank;

  const isAce10 =
    (r0 === "A" && ["10", "J", "Q", "K"].includes(r1)) ||
    (r1 === "A" && ["10", "J", "Q", "K"].includes(r0));

  const best = bestTotalFromScoreText(next?.dealerScoreText);
  if (best === 21) return true;

  return isAce10;
}

function isBetLocked() {
  return roundActive || inputLocked;
}
function updatePlayerScoreLiveFromSvg(handEl) {
  if (!handEl) return;

  const list = bjSvgHands.get(handEl) || [];
  const visibleRanks = list
    .filter((g) => g && g.getAttribute("data-hidden") !== "1")
    .map((g) => g.getAttribute("data-rank"))
    .filter((r) => r && r !== "X");

  const total = visibleRanks.length ? computeBestTotal(visibleRanks) : 0;

  bjSetHandScoreSvg(handEl, String(total), "");
}
function updateDealerScoreLiveFromSvg() {
  const list = bjSvgHands.get(dealerHand) || [];
  const visibleRanks = list
    .filter((g) => g && g.getAttribute("data-hidden") !== "1")
    .map((g) => g.getAttribute("data-rank"))
    .filter((r) => r && r !== "X");

  const total = visibleRanks.length ? computeBestTotal(visibleRanks) : 0;
  bjSetHandScoreSvg(dealerHand, String(total), "");
}
function shouldAutoStandAfterHit(state, handIdx) {
  const hands = state?.player?.hands || state?.hands || [];
  const cards = hands?.[handIdx]?.cards || [];

  if (cards.length <= 2) return false;

  const raw = handIdx === 0 ? state?.playerScoreText : state?.player2ScoreText;
  const best = bestTotalFromScoreText(raw);

  return (
    best === 21 && (state?.phase === "player" || state?.roundActive === true)
  );
}
function renderScoresFromState(state) {
  const resolved = state?.phase === "resolved" || state?.roundActive === false;

  let dealerNum = "0";
  {
    const cards = (state?.dealer?.cards || [])
      .filter((c) => !c?.hidden)
      .map((c) => c.rank)
      .filter((r) => r && r !== "X");

    dealerNum = cards.length ? String(computeBestTotal(cards)) : "0";
  }

  const p1Best = bestTotalFromScoreText(state?.playerScoreText);
  const p2Best = bestTotalFromScoreText(state?.player2ScoreText);

  const hands = state?.player?.hands || state?.hands || [];
  const h0 = hands[0] || {};
  const h1 = hands[1] || {};

  const tag0 = String(h0.tag || "").toLowerCase();
  const tag1 = String(h1.tag || "").toLowerCase();

  const o0 = String(h0.outcome || "").toLowerCase();
  const o1 = String(h1.outcome || "").toLowerCase();

  const o0Final = tag0 === "bust" ? "bust" : o0;
  const o1Final = tag1 === "bust" ? "bust" : o1;

  const c0 = resolved ? o0Final : "";
  const c1 = resolved ? o1Final : "";

  if (resolved) {
    bjApplyOutcomeBorderToHand(playerHand, o0Final);
    if (playerHand2 && (splitActive || (hands[1]?.cards || []).length)) {
      bjApplyOutcomeBorderToHand(playerHand2, o1Final);
    }
  } else {
    bjApplyOutcomeBorderToHand(playerHand, "");
    if (playerHand2) bjApplyOutcomeBorderToHand(playerHand2, "");
  }

  bjSetHandScoreSvg(dealerHand, dealerNum, "");
  bjSetHandScoreSvg(playerHand, Number.isFinite(p1Best) ? p1Best : 0, c0);

  if (playerHand2 && (splitActive || (hands[1]?.cards || []).length)) {
    bjSetHandScoreSvg(playerHand2, Number.isFinite(p2Best) ? p2Best : 0, c1);
  }

  bjRelayoutAllScores({ duration: 0.18 });
}

function updateScores() {
  if (bjState) renderScoresFromState(bjState);
}

let betCashState = 0;

function syncBetCashFromInput() {
  const raw = (betInput?.value || "").trim();
  const shown = Number(raw);
  if (!Number.isFinite(shown)) return;

  const mode = getCurrencyModeSafe();
  betCashState = mode === "credits" ? shown / BJ_CREDIT_RATE : shown;
}
function refreshBjBetDisplay({ force = false } = {}) {
  if (!force) {
    const editing =
      document.activeElement === betInput &&
      !betInput.readOnly &&
      !betInput.disabled;
    if (editing) return;
  }

  setBetAmountCash(betCashState);
}

let __bjLastMode = getCurrencyModeSafe();

function bjSyncCurrencyUI() {
  refreshBjChipLabels();

  const locked = betPanel?.classList.contains("is-locked") || roundActive;
  refreshBjBetDisplay({ force: locked });
}

function bjCheckModeChange() {
  const now = getCurrencyModeSafe();
  if (now !== __bjLastMode) {
    __bjLastMode = now;
    bjSyncCurrencyUI();
  }
}

function waitFor(conditionFn, { timeout = 6000, interval = 50 } = {}) {
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

  setTimeout(finish, 220);

  document.body.classList.add("app-ready");
}
function lockBetPanel(locked, betValueCash = null) {
  if (!betInput || !betPanel) return;

  if (betValueCash != null) {
    setBetAmountCash(Number(betValueCash) || 0);
  }

  betPanel.classList.toggle("is-locked", !!locked);

  betPanel.querySelectorAll("input, button, textarea, select").forEach((el) => {
    el.disabled = !!locked;
  });

  betInput.readOnly = !!locked;

  if (locked && document.activeElement === betInput) betInput.blur();
}
async function bjHydrateFromServer() {
  __bjHydrating = true;
  try {
    const res = await fetch(`${BJ_API_BASE}/state`, {
      method: "GET",
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    const state = data?.state || null;

    if (!state) {
      lockBetPanel(false);
      clearHands();
      showDealButton();
      setBetPanelLocked?.(false);
      return;
    }

    const bet =
      Number(state?.hands?.[0]?.betCash) || Number(state?.betCash) || 0;
    betCashState = bet;
    setBetAmountCash(bet);

    lockBetPanel(true, bet);

    hideDealButton();

    await applyState(state, { reset: true });

    const isResolved =
      state?.phase === "resolved" || state?.roundActive === false;
    if (isResolved) {
      endRound();
    }
  } catch (e) {
    showDealButton();
    lockBetPanel(false);
  } finally {
    __bjHydrating = false;
  }
}

window.addEventListener("load", bjHydrateFromServer);
async function gateBlackjackPageReady() {
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
      const balIsNotZero = balText !== "" && balText !== "0";
      return hasSvg && balIsNotZero;
    },
    { timeout: 8000, interval: 60 },
  );

  await preloadImages([
    "/assets/q.png",
    "/assets/casino-chip.png",
    "/assets/cards/back.png",
    "/assets/logo.png",
  ]);

  await new Promise(requestAnimationFrame);

  hideAppLoader();
}

gateBlackjackPageReady();

window.addEventListener("rollix:modechange", bjSyncCurrencyUI);
window.addEventListener("rollix:currencychange", bjSyncCurrencyUI);

setInterval(bjCheckModeChange, 150);

document.addEventListener("click", (e) => {
  const t = e.target.closest(
    ".currency-toggle, .wallet-toggle, #currencyToggle",
  );
  if (!t) return;
  setTimeout(bjCheckModeChange, 0);
});

window.addEventListener("load", () => {
  __bjLastMode = getCurrencyModeSafe();
  bjSyncCurrencyUI();
});
betInput.addEventListener("input", () => {
  sanitizeBetInput();
  syncBetCashFromInput();
});

betInput.addEventListener("paste", (e) => {
  const paste = (e.clipboardData || window.clipboardData).getData("text");
  if (!/^\d*\.?\d*$/.test(paste)) e.preventDefault();
});

function clearBetError() {
  betPanel.classList.remove("is-error");
}

function endRound() {
  roundActive = false;
  lockBetPanel(false);
  setBetPanelLocked(false);
  setInRoundUI(false);

  clearActiveHands();

  setTimeout(() => {
    showDealButton();
  }, 50);
}

betInput.addEventListener("focus", clearBetError);
betInput.addEventListener("input", clearBetError);

(function injectDealSpinnerStyles() {
  const id = "bj-deal-spinner-styles";
  if (document.getElementById(id)) return;

  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    .bj-deal-btn{ position: relative; }
    .bj-deal-btn .bj-deal-label{ display:inline-flex; align-items:center; gap:10px; }
    .bj-deal-btn .bj-deal-spin{
      width: 16px; height: 16px;
      display:inline-block;
      border-radius:999px;
    border: 2px solid rgba(0,0,0,.25);
      border-top-color: rgba(0,0,0,.95);
      animation: bjDealSpin .8s linear infinite;
      opacity: 0;
      transform: translateY(0.5px);
    }
    .bj-deal-btn.is-loading .bj-deal-spin{ opacity: 1; }
    .bj-deal-btn.is-loading{ pointer-events:none; }
    @keyframes bjDealSpin { to { transform: rotate(360deg); } }
  `;
  document.head.appendChild(style);
})();

let __bjDealBtnLabelHTML = null;
const BJ_SCORE_NEUTRAL = "#535c62";

function bjResetScoreBadgeToNeutral(badge) {
  if (!badge?.rect) return;
  try {
    gsap.killTweensOf(badge.rect);
  } catch {}

  gsap.set(badge.rect, { attr: { fill: BJ_SCORE_NEUTRAL } });
}
function setDealBtnLoading(on, { showSpinnerAfterMs = 150 } = {}) {
  if (!dealBtn) return;

  if (__bjDealBtnLabelHTML == null) {
    __bjDealBtnLabelHTML = dealBtn.innerHTML;
  }

  if (!on) {
    dealBtn.classList.remove("is-loading");
    dealBtn.disabled = false;
    if (__bjDealBtnLabelHTML != null) dealBtn.innerHTML = __bjDealBtnLabelHTML;
    return;
  }

  dealBtn.disabled = true;

  const text = dealBtn.textContent.trim() || "DEAL";
  dealBtn.innerHTML = `
    <span class="bj-deal-label">
      <span class="bj-deal-text">${text}</span>
      <span class="bj-deal-spin" aria-hidden="true"></span>
    </span>
  `;

  dealBtn.classList.remove("is-loading");
  const token = Symbol("dealLoading");
  dealBtn.__loadingToken = token;

  setTimeout(() => {
    if (dealBtn.__loadingToken === token) {
      dealBtn.classList.add("is-loading");
    }
  }, showSpinnerAfterMs);
}

async function waitSvgImageReady(svgImageEl, timeoutMs = 1400) {
  if (!svgImageEl) return;

  const href =
    svgImageEl.getAttribute("href") || svgImageEl.getAttribute("xlink:href");
  if (!href) return;

  await ensureImgDecoded(href, timeoutMs);
}

dealBtn?.addEventListener("click", async () => {
  if (__bjHydrating) return;
  if (roundActive || inputLocked || isAnimating) return;

  setDealLoading(true);

  try {
    await ensureBjAssetsReady();

    await nextFrame();
    ensureSvgSizedToSurface();
    await nextFrame();

    const betCash = getBetCashFromInput();
    if (!betCash || betCash <= 0) {
      betPanel?.classList.remove("is-error");
      void betPanel.offsetWidth;
      betPanel?.classList.add("is-error");
      setDealLoading(false);
      return;
    }

    betCashState = betCash;
    setBetAmountCash(betCash);
    lockBetPanel(true);

    setInputLocked(true);

    await clearAllSvgHandsAnimated();
    hideScores();
    bjClearOutcomeBordersAll();

    bjSnapLayoutToSingleInstant();

    splitActive = false;
    canSplit = false;
    activeHandIndex = 0;
    handDone[0] = false;
    handDone[1] = false;

    surfaceEl?.classList.remove("is-split");
    playerHand?.classList.remove("is-active");
    playerHand2?.classList.remove("is-active");

    playerHand2?.classList.add("is-hidden");
    playerHand2?.classList.remove("is-score-visible");

    bjClearActiveScoreOutlines();

    hideScores();
    bjClearOutcomeBordersAll();

    bjPrevState = {
      dealer: { cards: [] },
      player: { hands: [{ cards: [] }, { cards: [] }], isSplit: false },
    };
    bjState = null;

    const state = await bjApi("/start", { betCash });
    bjSyncTopbarWallet(state);

    const dealerCards = state?.dealer?.cards || [];
    const hands = state?.player?.hands || state?.hands || [];
    const p1 = hands?.[0]?.cards || [];

    const urls = [
      "/assets/cards/back.png",
      p1[0] ? cardFaceSrc(p1[0].rank, p1[0].suit) : null,
      dealerCards[0]
        ? cardFaceSrc(dealerCards[0].rank, dealerCards[0].suit)
        : null,
      p1[1] ? cardFaceSrc(p1[1].rank, p1[1].suit) : null,
    ].filter(Boolean);

    await Promise.all(urls.map((u) => ensureImgDecoded(u, 1600)));

    hideDealButton();

    await applyState(state, { reset: false });
  } catch (err) {
    lockBetPanel(false);
    showDealButton();
    showBjToast(err?.message || "Deal failed", 3000);
  } finally {
    setInputLocked(false);
    setDealLoading(false);
  }
});

document.querySelector(".bj-chips")?.addEventListener("click", (e) => {
  if (isBetLocked()) return;
  const chip = e.target.closest(".bj-chip");
  if (!chip) return;

  const addCash = Number(chip.dataset.value || 0);
  if (!addCash) return;

  const currentCash = getBetNumberCash();
  const nextCash = currentCash + addCash;

  setBetAmountCash(nextCash);
  betPanel?.classList.remove("is-error");
});

function restorePillFromState() {
  if (!bjState) return;
  renderScoresFromState(bjState);
  applyPillsFromState(bjState);
}

function bjIsResolved(state) {
  if (state?.phase) return state.phase === "resolved";
  if (typeof state?.roundActive === "boolean")
    return state.roundActive === false;
  return false;
}

async function bjSyncWalletAfterVisual(state) {
  await new Promise(requestAnimationFrame);

  await sleep(120);
  bjSyncTopbarWallet(state);
}
async function doAction(action) {
  if (insuranceModalOpen) return;
  if (inputLocked || isAnimating) return;

  const handIndex = splitActive ? activeHandIndex : 0;

  if (action === "double" && !canDoubleActiveHand()) {
    showBjToast("Insufficient funds", 2000);
    return;
  }

  if (action === "split" && !(canSplit && !splitActive)) {
    return;
  }

  const isResolvedState = (st) =>
    st?.phase === "resolved" || st?.roundActive === false;

  const syncWalletSmart = (st, whenResolved) => {
    if (!st) return;
    const resolved = isResolvedState(st);
    if (!resolved) {
      bjSyncTopbarWallet(st);
      return;
    }
    if (whenResolved === "after") {
      bjSyncTopbarWallet(st);
    }
  };

  try {
    isAnimating = true;
    setInputLocked(true);

    if (action !== "double") setOptimisticTag(action);

    let state = await bjApi("/action", { action, handIndex });

    syncWalletSmart(state, "before");

    await applyState(state);

    syncWalletSmart(state, "after");

    if (action === "split") {
      state = await autoStandSplitBlackjacks(state);

      if (isResolvedState(state)) {
        syncWalletSmart(state, "after");
      }
    }

    if (action === "hit" && shouldAutoStandAfterHit(state, handIndex)) {
      const state2 = await bjApi("/action", { action: "stand", handIndex });
      setInputLocked(true);

      setOptimisticTag("stand");

      const dealerHasHidden = (state?.dealer?.cards || []).some(
        (c) => c?.hidden,
      );
      if (dealerHasHidden) await sleep(BJ_HOLE_REVEAL_DELAY);

      syncWalletSmart(state2, "before");

      await applyState(state2);

      syncWalletSmart(state2, "after");
    }
  } catch (err) {
    restorePillFromState();
    showBjToast(err.message || "Action failed", 3000);
  } finally {
    isAnimating = false;
    setInputLocked(false);
  }
}

hitBtn?.addEventListener("click", () => doAction("hit"));
standBtn?.addEventListener("click", () => doAction("stand"));
splitBtn?.addEventListener("click", () => doAction("split"));
doubleBtn?.addEventListener("click", () => doAction("double"));
function playerCardCount() {
  return (bjSvgHands.get(playerHand) || []).length;
}

function setBetNumberCash(nCash) {
  nCash = Math.max(0, Number(nCash) || 0);
  setBetAmountCash(nCash);
  betPanel?.classList.remove("is-error");
}
function getBetNumberCash() {
  return getBetCashFromInput();
}

betPanel?.querySelectorAll(".bj-bet-qbtn").forEach((btn) => {
  btn.addEventListener("pointerdown", (e) => e.preventDefault());
});

betPanel?.addEventListener("click", (e) => {
  if (isBetLocked()) return;
  const btn = e.target.closest(".bj-bet-qbtn");
  if (!btn) return;

  const label = btn.textContent.trim();
  const currentCash = getBetNumberCash();

  let nextCash = currentCash;
  if (label === "1/2") nextCash = currentCash / 2;
  if (label === "2x") nextCash = currentCash * 2;

  setBetNumberCash(nextCash);
});
