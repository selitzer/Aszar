const track = document.getElementById("rlStripTrack");

const ORDER = [
  "0",
  "32",
  "15",
  "19",
  "4",
  "21",
  "2",
  "25",
  "17",
  "34",
  "6",
  "27",
  "13",
  "36",
  "11",
  "30",
  "8",
  "23",
  "10",
  "5",
  "24",
  "16",
  "33",
  "1",
  "20",
  "14",
  "31",
  "9",
  "22",
  "18",
  "29",
  "7",
  "28",
  "12",
  "35",
  "3",
  "26",
];

const REDS = new Set([
  "1",
  "3",
  "5",
  "7",
  "9",
  "12",
  "14",
  "16",
  "18",
  "19",
  "21",
  "23",
  "25",
  "27",
  "30",
  "32",
  "34",
  "36",
]);
let CHIP_BITMAP = null;
let spinning = false;
let spinRAF = null;
let spinStart = 0;
let spinDuration = 0;
let winningNumber = null;

let rlToastTimer = null;

const MAX_HISTORY = 30;
const winHistory = [];

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
SFX.load("wClick", "/assets/sfx/wClick.wav", { volume: 0.3 });
SFX.load("wSpin", "/assets/sfx/wSpin.wav", { volume: 0.22 });

(function initRlRulesModal() {
  const rulesBtn = document.getElementById("rulesBtn");
  if (!rulesBtn) return;

  if (document.querySelector(".rl-modal[data-rl-rules='1']")) return;

  const modal = document.createElement("div");
  modal.className = "rl-modal";
  modal.dataset.rlRules = "1";
  modal.setAttribute("aria-hidden", "true");

  modal.innerHTML = `
    <div class="rl-modal-backdrop" data-close="1"></div>

    <div class="rl-modal-card" role="dialog" aria-modal="true" aria-labelledby="rlRulesTitle">
      <div class="rl-modal-head">
        <div class="rl-modal-title" id="rlRulesTitle">Roulette Rules</div>
        <button class="rl-modal-x" type="button" aria-label="Close rules" data-close="1">✕</button>
      </div>

  <div class="rl-modal-body">
  <ul class="rl-rules-list">
    <li><b>Wheel:</b> European (0–36).</li>
    <li><b>Goal:</b> Predict where the ball will land.</li>
    <li><b>Straight Up:</b> Single number pays <b>35:1</b>.</li>
    <li><b>Split:</b> Two adjacent numbers pays <b>17:1</b>.</li>
    <li><b>Street:</b> Three numbers pays <b>11:1</b>.</li>
    <li><b>Corner:</b> Four numbers pays <b>8:1</b>.</li>
    <li><b>Six Line:</b> Six numbers pays <b>5:1</b>.</li>
    <li><b>Dozen / Column:</b> Pays <b>2:1</b>.</li>
    <li><b>Red/Black, Even/Odd, 1–18, 19–36:</b> Pays <b>1:1</b>.</li>
  </ul>
</div>
    </div>
  `;

  document.body.appendChild(modal);

  const open = () => {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  };

  const close = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  };

  rulesBtn.addEventListener("click", open);

  modal.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.closest && t.closest("[data-close='1']")) close();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("is-open")) close();
  });
})();

function waitFor(testFn, { timeout = 8000, interval = 60 } = {}) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const tick = () => {
      let ok = false;
      try {
        ok = !!testFn();
      } catch {}
      if (ok) return resolve(true);
      if (performance.now() - start >= timeout)
        return reject(new Error("waitFor timeout"));
      setTimeout(tick, interval);
    };
    tick();
  });
}

async function preloadImages(urls = []) {
  if (!Array.isArray(urls) || !urls.length) return;
  await Promise.all(
    urls.map(
      (src) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = src;
          if (img.decode)
            img
              .decode()
              .then(() => resolve(true))
              .catch(() => resolve(true));
        }),
    ),
  );
}

function hideAppLoaderSafe() {
  if (typeof window.hideAppLoader === "function") {
    window.hideAppLoader();
    return;
  }

  const el =
    document.getElementById("appLoader") ||
    document.querySelector(".app-loader, .page-loader, #loader");

  if (el) el.classList.add("is-hidden");
  document.documentElement.classList.add("is-ready");
  document.body.classList.add("is-ready");
}

function whenImgReady(img) {
  if (!img) return Promise.resolve();

  if (img.complete && img.naturalWidth > 0) return Promise.resolve();

  if (img.decode) {
    return img.decode().catch(() => {});
  }

  return new Promise((resolve) => {
    img.addEventListener("load", resolve, { once: true });
    img.addEventListener("error", resolve, { once: true });
  });
}

function markStackReady(stackEl) {
  if (!stackEl) return;
  stackEl.classList.remove("is-loading");
  stackEl.classList.add("is-ready");
}
async function unlockAudioOnce() {
  const ok = await SFX.unlock();

  console.log("[SFX] unlock:", ok);

  SFX.play("wClick", { volume: 0.001 });
  SFX.play("wSpin", { volume: 0.001 });
}

["touchstart", "pointerdown", "mousedown", "keydown"].forEach((evt) => {
  window.addEventListener(evt, unlockAudioOnce, { once: true, passive: true });
});

function historyColorClass(nStr) {
  if (nStr === "0") return "is-green";

  if (REDS.has(nStr)) return "is-red";
  return "is-black";
}
function updateHistoryOverflow() {
  const list = document.getElementById("rlHistory");
  const mask = document.getElementById("rlHistoryMask");
  if (!list || !mask) return;

  const overflow = list.scrollWidth > list.clientWidth + 1;
  mask.classList.toggle("is-overflowing", overflow);

  if (!overflow) {
    mask.classList.add("no-left-fade", "no-right-fade");
    return;
  }

  const atLeft = list.scrollLeft <= 1;
  const atRight = list.scrollLeft + list.clientWidth >= list.scrollWidth - 1;

  mask.classList.toggle("no-left-fade", atLeft);
  mask.classList.toggle("no-right-fade", atRight);
}

document
  .getElementById("rlHistory")
  ?.addEventListener("scroll", updateHistoryOverflow);
window.addEventListener("resize", updateHistoryOverflow);
function renderHistory(newestStr = null) {
  const el = document.getElementById("rlHistory");
  if (!el) return;

  const first = new Map();
  Array.from(el.children).forEach((node) => {
    const key = node.dataset.key;
    first.set(key, node.getBoundingClientRect());
  });

  el.innerHTML = "";

  const len = winHistory.length;

  winHistory.forEach((nStr, i) => {
    const item = document.createElement("div");
    item.className = `rl-history-item ${historyColorClass(nStr)}`;
    item.textContent = nStr;

    const key = `${nStr}-${i}`;
    item.dataset.key = key;

    const age = len - 1 - i;
    const opacity = Math.max(Math.pow(0.72, age), 0.12);
    item.style.opacity = String(opacity);

    if (newestStr !== null && i === len - 1) {
      item.classList.add("is-new");
      item.style.opacity = "0";
    }

    el.appendChild(item);
  });

  const last = new Map();
  Array.from(el.children).forEach((node) => {
    last.set(node.dataset.key, node.getBoundingClientRect());
  });

  Array.from(el.children).forEach((node) => {
    const key = node.dataset.key;
    const firstBox = first.get(key);
    const lastBox = last.get(key);
    if (!firstBox || !lastBox) return;

    const dx = firstBox.left - lastBox.left;
    if (dx === 0) return;

    node.style.transform = `translateX(${dx}px)`;
    node.style.transition = "transform 220ms ease";
    requestAnimationFrame(() => {
      node.style.transform = "";
    });
  });

  requestAnimationFrame(() => {
    el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  });

  if (typeof updateHistoryOverflow === "function") updateHistoryOverflow();
}
window.addEventListener("resize", updateHistoryOverflow);

function pushHistory(nStr) {
  const newest = String(nStr);
  winHistory.push(newest);
  if (winHistory.length > MAX_HISTORY) winHistory.shift();
  renderHistory(newest);
}

function ensureRlToast() {
  let el = document.querySelector(".rl-toast");
  if (el) return el;

  el = document.createElement("div");
  el.className = "rl-toast";
  el.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" aria-hidden="true">
      <path fill="#ff4d4f" d="M238.51 881.48A154.9 154.9 0 0 1 104.26 649l261.49-453a154.89 154.89 0 0 1 268.5 0l261.49 453a154.89 154.89 0 0 1-134.25 232.48z"/>
      <path fill="#ff4d4f" d="M443.69 241 182.2 694c-25 43.34 6.26 97.53 56.31 97.53h523c50 0 81.34-54.19 56.31-97.53L556.31 241c-25.03-43.31-87.59-43.31-112.62 0z"/>
      <path fill="#eeeeee" d="M460 354.88h80V582.7h-80z"/>
      <circle cx="500" cy="665.12" r="40" fill="#eeeeee"/>
    </svg>
    <span class="rl-toast-text">Insufficient funds</span>
  `;
  document.body.appendChild(el);
  return el;
}

function showRlToast(message = "Insufficient funds", ms = 3000) {
  const el = ensureRlToast();
  const text = el.querySelector(".rl-toast-text");
  if (text) text.textContent = message;

  clearTimeout(rlToastTimer);

  el.classList.remove("is-show");
  void el.offsetWidth;

  requestAnimationFrame(() => {
    el.classList.add("is-show");
  });

  rlToastTimer = setTimeout(() => {
    el.classList.remove("is-show");
  }, ms);
}
function getPlayerBalance() {
  const el = document.querySelector(
    ".wallet-balance, #walletBalance, .rl-wallet-balance",
  );
  if (!el) return 0;

  const raw = el.textContent.replace(/[^\d.]/g, "");
  const val = Number(raw);
  return Number.isFinite(val) ? val : 0;
}

async function preloadChipTexture() {
  const img = new Image();
  img.src = "/assets/casino-chip.png";

  await img.decode();

  CHIP_BITMAP = img;
}

preloadChipTexture();

function randomRouletteNumber() {
  return ORDER[Math.floor(Math.random() * ORDER.length)];
}
function getTileWidth() {
  const tile = track.querySelector(".rl-tile");
  return tile ? tile.getBoundingClientRect().width : 28;
}

let lastWinnerBtn = null;

function clearWinnerHighlight() {
  if (lastWinnerBtn) {
    lastWinnerBtn.classList.remove("is-winner");
    lastWinnerBtn = null;
  }
}

function applyWinnerHighlight(numStr) {
  const btn = document.querySelector(
    `.rl-board-grid button.rl-cell[data-bet="${numStr}"]`,
  );
  if (!btn) return;
  btn.classList.add("is-winner");
  lastWinnerBtn = btn;
}

function setBoardEnabled(enabled) {
  grid.classList.toggle("is-disabled", !enabled);
}

function tableHasBets() {
  return document.querySelector(".rl-cell.has-bet") !== null;
}

function tileClass(n) {
  if (n === "0") return "is-green";
  if (REDS.has(n)) return "is-red";
  return "is-black";
}

const LEFT_PAD_COPIES = 1;
const RIGHT_COPIES = 10;

function buildTrack() {
  if (!track) return;
  track.innerHTML = "";

  const nums = [
    ...Array.from({ length: LEFT_PAD_COPIES }, () => ORDER).flat(),
    ...Array.from({ length: RIGHT_COPIES }, () => ORDER).flat(),
  ];

  for (const n of nums) {
    const div = document.createElement("div");
    div.className = `rl-tile ${tileClass(n)}`;
    div.textContent = n;
    track.appendChild(div);
  }
}

buildTrack();

let currentIndex = ORDER.indexOf("0");
let currentPx = 0;

function applyTrackPx(px) {
  currentPx = px;
  track.style.transform = `translate3d(${px}px, 0, 0)`;
}

function getPointerX() {
  const pointer = document.querySelector(".rl-strip-pointer");
  const strip = document.querySelector(".rl-strip");

  return pointer.offsetLeft + pointer.offsetWidth / 2;
}

function getTileCenterX(index) {
  const tileW = getTileWidth();
  return index * tileW + tileW / 2;
}

const STRIP_LEN = ORDER.length;
const BASE_OFFSET = LEFT_PAD_COPIES * STRIP_LEN;

function alignToIndex(index) {
  const pointerX = getPointerX();
  const tileW = getTileWidth();

  const absIndex = BASE_OFFSET + index;

  const tileCenter = absIndex * tileW + tileW / 2;
  const px = pointerX - tileCenter;

  applyTrackPx(px);
  currentIndex = index;
}

alignToIndex(currentIndex);

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

let spinFromPx = 0;
let spinToPx = 0;

function startSpinFromServer(serverSpin) {
  spinning = true;
  clearWinnerHighlight();
  setBoardEnabled(false);

  const tileW = getTileWidth();

  alignToIndex(serverSpin.fromIndex);

  const travelPx = serverSpin.totalTiles * tileW;

  spinFromPx = currentPx;
  spinToPx = currentPx - travelPx;

  spinDuration = serverSpin.spinDurationMs;

  const elapsed = Math.max(
    0,
    Math.min(
      serverSpin.spinDurationMs,
      Date.now() - serverSpin.spinStartedAtMs,
    ),
  );
  spinStart = performance.now() - elapsed;

  winningNumber = String(serverSpin.winningNumber);

  cancelAnimationFrame(spinRAF);
  spinRAF = requestAnimationFrame(spinTick);

  currentIndex = serverSpin.targetIndex;
}

function spinTick(now) {
  const t = Math.min((now - spinStart) / spinDuration, 1);
  const eased = easeOutCubic(t);

  const px = spinFromPx + (spinToPx - spinFromPx) * eased;
  applyTrackPx(px);

  if (t < 1) {
    spinRAF = requestAnimationFrame(spinTick);
  } else {
    finishSpin();
  }
}
function rlHardResetUI() {
  spinning = false;
  cancelAnimationFrame(spinRAF);

  hideProfit();
  clearWinner();
  clearWinnerHighlight();
  clearHL();

  rlUndoStack.length = 0;
  resetAllBetsUI();

  winHistory.length = 0;
  renderHistory(null);

  winningNumber = null;
  currentIndex = ORDER.indexOf("0");
  alignToIndex(currentIndex);

  spinBtn?.classList.remove("is-hidden");
  setBoardEnabled(true);
}
async function finishSpin() {
  spinning = false;

  alignToIndex(currentIndex);

  applyWinnerHighlight(winningNumber);
  setWinnerOnBoard(winningNumber);
  pushHistory(winningNumber);

  const totalReturn = computeWinningReturn(winningNumber);
  const netProfit = totalReturn - totalBet;
  if (netProfit > 0) showProfit(netProfit);
  else hideProfit();

  await rlSyncAfterFinish();

  setTimeout(() => {
    spinBtn.classList.remove("is-hidden");
    setBoardEnabled(true);
  }, 900);
}

const board = document.querySelector(".rl-board");
const cells = Array.from(document.querySelectorAll(".rl-board .rl-cell"));
const numCells = Array.from(document.querySelectorAll(".rl-board .rl-num"));

const RED = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);
const BLACK = new Set([
  2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35,
]);

function clearHL() {
  board?.classList.remove("is-group-hover");
  cells.forEach((c) => c.classList.remove("is-hl"));
}
function applyMobileBoardLayout() {
  const isMobile = window.matchMedia("(max-width: 875px)").matches;
  const nums = document.querySelectorAll(".rl-board .rl-num");

  if (!isMobile) {
    nums.forEach((btn) => {
      btn.style.removeProperty("grid-column");
      btn.style.removeProperty("grid-row");
    });
    return;
  }

  nums.forEach((btn) => {
    const n = Number(btn.dataset.bet);
    if (!Number.isFinite(n) || n < 1 || n > 36) return;

    const idx = n - 1;
    const col = (idx % 3) + 3;
    const row = Math.floor(idx / 3) + 2;

    btn.style.gridColumn = String(col);
    btn.style.gridRow = String(row);
  });
}

applyMobileBoardLayout();
window.addEventListener("resize", applyMobileBoardLayout);
function hlNumbers(predicate) {
  if (!board) return;
  board.classList.add("is-group-hover");

  numCells.forEach((btn) => {
    const n = Number(btn.dataset.bet);
    if (Number.isFinite(n) && predicate(n)) btn.classList.add("is-hl");
  });
}

function hl2to1(which) {
  if (!board) return;
  board.classList.add("is-group-hover");

  const colBtn = document.querySelector(`[data-bet="2to1_${which}"]`);
  if (colBtn) colBtn.classList.add("is-hl");

  numCells.forEach((btn) => {
    const n = Number(btn.dataset.bet);
    if (!Number.isFinite(n)) return;

    const mod = n % 3;
    const match =
      (which === "top" && mod === 0) ||
      (which === "mid" && mod === 2) ||
      (which === "bot" && mod === 1);

    if (match) btn.classList.add("is-hl");
  });
}
const grid = document.querySelector(".rl-board-grid");

function isGroupBet(bet) {
  return (
    bet === "1_12" ||
    bet === "13_24" ||
    bet === "25_36" ||
    bet === "1_18" ||
    bet === "19_36" ||
    bet === "even" ||
    bet === "odd" ||
    bet === "red" ||
    bet === "black" ||
    bet === "2to1_top" ||
    bet === "2to1_mid" ||
    bet === "2to1_bot"
  );
}

function handleHover(bet) {
  clearHL();

  if (bet === "1_12") return hlNumbers((n) => n >= 1 && n <= 12);
  if (bet === "13_24") return hlNumbers((n) => n >= 13 && n <= 24);
  if (bet === "25_36") return hlNumbers((n) => n >= 25 && n <= 36);

  if (bet === "1_18") return hlNumbers((n) => n >= 1 && n <= 18);
  if (bet === "19_36") return hlNumbers((n) => n >= 19 && n <= 36);
  if (bet === "even") return hlNumbers((n) => n !== 0 && n % 2 === 0);
  if (bet === "odd") return hlNumbers((n) => n % 2 === 1);

  if (bet === "red") return hlNumbers((n) => RED.has(n));
  if (bet === "black") return hlNumbers((n) => BLACK.has(n));

  if (bet === "2to1_top") return hl2to1("top");
  if (bet === "2to1_mid") return hl2to1("mid");
  if (bet === "2to1_bot") return hl2to1("bot");
}

const chipSelectorEl = document.querySelector(".chip-selector");
const chipButtons = Array.from(document.querySelectorAll(".chip-track .chip"));

const chipWindow = document.querySelector(".chip-window");
const chipTrack = document.querySelector(".chip-track");

const chipNavBtns = Array.from(
  document.querySelectorAll(".chip-selector .chip-nav"),
);
const chipLeftBtn = chipNavBtns[0] || null;
const chipRightBtn = chipNavBtns[1] || null;

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
  return rect.width || 44.5;
}

function getMaxIndex() {
  const total = chipTrack?.querySelectorAll(".chip")?.length || 0;
  return Math.max(0, total - VISIBLE);
}

function setTrackTransition(on, ms = 220) {
  if (!chipTrack) return;
  chipTrack.style.transition = on ? `transform ${ms}ms ease` : "none";
}

function applyChipTransform() {
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
  applyChipTransform();
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
  applyChipTransform();
}

function getOrCreateProfitEl() {
  let el = document.querySelector(".rl-profit");
  if (!el) {
    el = document.createElement("div");
    el.className = "rl-profit";

    document.querySelector(".rl-surface")?.appendChild(el);
  }
  return el;
}

function hideProfit() {
  const el = document.querySelector(".rl-profit");
  if (!el) return;
  el.classList.remove("is-show");
  el.innerHTML = "";
}

function rlWalletAmountEl() {
  return (
    document.getElementById("balance") ||
    document.querySelector("#walletToggleBtn .wallet-amount") ||
    document.querySelector(".wallet-amount")
  );
}

function rlWalletUnitEl() {
  return (
    document.getElementById("balanceUnit") ||
    document.querySelector("#walletToggleBtn .wallet-unit") ||
    document.querySelector(".wallet-unit")
  );
}

function getPlayerBalanceCash() {
  const el = rlWalletAmountEl();
  if (!el) return 0;

  const raw = (el.textContent || "").replace(/[^\d.]/g, "");
  const shown = Number(raw);
  if (!Number.isFinite(shown)) return 0;

  const mode = getCurrencyModeSafe();
  return mode === "credits" ? shown / RL_CREDIT_RATE : shown;
}

function setWalletBalanceCash(cash) {
  const el = rlWalletAmountEl();
  if (!el) return;

  const mode = getCurrencyModeSafe();
  const shown = mode === "credits" ? cash * RL_CREDIT_RATE : cash;
  el.textContent = Math.round(shown).toLocaleString();
}

function cloneCurrencyIcon() {
  const unit = rlWalletUnitEl();
  if (!unit) return null;

  const clone = unit.cloneNode(true);
  clone.classList.add("rl-profit-unit");
  return clone;
}
function fadeIn(el) {
  el.classList.remove("is-show");

  void el.offsetHeight;

  el.classList.add("is-show");
}
function showProfit(amount) {
  if (amount <= 0) {
    hideProfit();
    return;
  }

  const el = getOrCreateProfitEl();
  el.innerHTML = "";

  clearTimeout(profitTimer);

  el.classList.remove("is-error");

  const cur = document.getElementById("currency");
  const isCredits =
    cur?.dataset?.currency === "credits" ||
    cur?.classList?.contains("credits") ||
    (cur?.textContent || "").trim().toLowerCase() === "credits";

  el.classList.toggle("is-credits", !!isCredits);

  const txt = document.createElement("span");
  txt.className = "rl-profit-text";
  txt.textContent = `+${Math.round(amount)}`;
  el.appendChild(txt);

  const icon = cloneCurrencyIcon();
  if (icon) el.appendChild(icon);

  fadeIn(el);
  SFX.play("wClick", { volume: 0.3, gateMs: 0 });

  profitTimer = setTimeout(() => {
    el.classList.remove("is-show");
  }, 2000);
}
function makeInsufficientIcon() {
  const wrap = document.createElement("span");
  wrap.className = "rl-profit-icon";
  wrap.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" aria-hidden="true" focusable="false">
      <g>
        <path fill="#ff4d4f" d="M238.51 881.48A154.9 154.9 0 0 1 104.26 649l261.49-453a154.89 154.89 0 0 1 268.5 0l261.49 453a154.89 154.89 0 0 1-134.25 232.48z"></path>
        <path fill="#ff4d4f" d="M443.69 241 182.2 694c-25 43.34 6.26 97.53 56.31 97.53h523c50 0 81.34-54.19 56.31-97.53L556.31 241c-25.03-43.31-87.59-43.31-112.62 0z"></path>
        <g fill="#eee">
          <path d="M460 354.88h80V582.7h-80z"></path>
          <circle cx="500" cy="665.12" r="40"></circle>
        </g>
      </g>
    </svg>
  `;
  return wrap;
}
let profitTimer = null;
let profitHideTimer = null;

function showError(message) {
  const el = getOrCreateProfitEl();
  el.innerHTML = "";

  clearTimeout(profitTimer);
  clearTimeout(profitHideTimer);

  el.classList.remove("is-credits");
  el.classList.add("is-error");

  const icon = makeInsufficientIcon();
  el.appendChild(icon);

  const txt = document.createElement("span");
  txt.className = "rl-profit-text";
  txt.textContent = message;
  el.appendChild(txt);

  fadeIn(el);

  profitTimer = setTimeout(() => {
    el.classList.remove("is-show");

    profitHideTimer = setTimeout(() => {
      el.classList.remove("is-error");
      el.innerHTML = "";
    }, 180);
  }, 2000);
}

function getCellStake(btn) {
  return Number(btn.dataset.stackTotal || "0");
}
function resetAllBetsUI() {
  setTotalBet(0);

  document.querySelectorAll(".rl-board-grid .rl-cell").forEach((btn) => {
    btn.classList.remove("has-bet");

    const stack = btn.querySelector(".rl-chip-stack");
    if (stack) stack.remove();

    const original = btn.dataset.originalLabel;
    if (original != null) btn.textContent = original;

    delete btn.dataset.stackTotal;
    delete btn.dataset.stackCount;
    delete btn.dataset.stackDenom;
  });

  document.querySelectorAll(".rl-num").forEach((b) => {
    const n = Number(b.dataset.bet);
    if (!Number.isFinite(n)) return;
    b.classList.toggle("is-green", n === 0);
    b.classList.toggle("is-red", n !== 0 && RED.has(n));
    b.classList.toggle("is-black", n !== 0 && !RED.has(n));
  });
}

function isWinningBet(betKey, winNumStr) {
  const winNum = Number(winNumStr);

  if (betKey === winNumStr) return true;

  if (betKey === "1_12") return winNum >= 1 && winNum <= 12;
  if (betKey === "13_24") return winNum >= 13 && winNum <= 24;
  if (betKey === "25_36") return winNum >= 25 && winNum <= 36;

  if (betKey === "1_18") return winNum >= 1 && winNum <= 18;
  if (betKey === "19_36") return winNum >= 19 && winNum <= 36;
  if (betKey === "even") return winNum !== 0 && winNum % 2 === 0;
  if (betKey === "odd") return winNum % 2 === 1;

  if (betKey === "red") return RED.has(winNum);
  if (betKey === "black") return BLACK.has(winNum);

  if (betKey === "2to1_top") return winNum !== 0 && winNum % 3 === 0;
  if (betKey === "2to1_mid") return winNum !== 0 && winNum % 3 === 2;
  if (betKey === "2to1_bot") return winNum !== 0 && winNum % 3 === 1;

  return false;
}

function betReturnMultiplier(betKey) {
  if (/^\d+$/.test(betKey)) return 36;
  if (betKey === "1_12" || betKey === "13_24" || betKey === "25_36") return 3;
  if (betKey.startsWith("2to1_")) return 3;

  return 2;
}

function computeWinningReturn(winNumStr) {
  let totalReturn = 0;

  document.querySelectorAll(".rl-board-grid .rl-cell").forEach((btn) => {
    const stake = Number(btn.dataset.stackTotal || "0");
    if (!stake) return;

    const betKey = btn.dataset.bet;
    if (!betKey) return;

    if (isWinningBet(betKey, winNumStr)) {
      totalReturn += stake * betReturnMultiplier(betKey);
    }
  });

  return totalReturn;
}
function clearWinner() {
  document
    .querySelectorAll(".rl-cell.is-winner")
    .forEach((b) => b.classList.remove("is-winner"));
}

function setWinnerOnBoard(winNumStr) {
  const btn = document.querySelector(
    `.rl-board-grid .rl-cell[data-bet="${winNumStr}"]`,
  );
  if (btn) btn.classList.add("is-winner");
}

chipLeftBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  jumpByChips(-VISIBLE);
});

chipRightBtn?.addEventListener("click", (e) => {
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

    applyChipTransform();
    scheduleSnap();
  },
  { passive: false },
);

window.addEventListener("resize", () => {
  snapToNearestChip();
});

snapToNearestChip();

let selectedChipBtn = null;
let selectedChipValue = 0;
let totalBet = 0;

const totalBetEl = document.querySelector(".rl-bet-value");
const RL_CREDIT_RATE = 5;

function getCurrencyModeSafe() {
  try {
    return typeof getMode === "function" ? getMode() : "cash";
  } catch {
    return "cash";
  }
}

function cashToDisplayAmount(cashAmt) {
  const mode = getCurrencyModeSafe();
  return mode === "credits" ? cashAmt * RL_CREDIT_RATE : cashAmt;
}

function formatK(n) {
  if (n >= 1_000_000) {
    const m = Math.floor(n / 1_000_000);
    const exact = m * 1_000_000;
    if (n === exact) return `${m}M`;
    if (n > 5_000_000) return "5M+";
    return `${m}M+`;
  }
  if (n >= 1000) {
    const k = Math.floor(n / 1000);
    const exact = k * 1000;
    if (n === exact) return `${k}K`;
    if (n > 5000) return "5K+";
    return `${k}K+`;
  }
  return String(Math.round(n));
}

function setTotalBet(val) {
  totalBet = val;

  if (totalBetEl) {
    const shown = cashToDisplayAmount(totalBet);

    totalBetEl.textContent = Math.round(shown).toLocaleString();
  }
}

function selectChip(btn) {
  chipButtons.forEach((b) => b.classList.remove("is-selected"));
  btn.classList.add("is-selected");
  selectedChipBtn = btn;
  selectedChipValue = Number(btn.dataset.value) || 0;
}

chipButtons.forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    selectChip(btn);
  });
});

function buildPlacedChipFromSelected() {
  const chip = document.createElement("span");
  chip.className = "rl-placed-chip";

  const label = selectedChipBtn
    ?.querySelector(".bj-chip-label")
    ?.cloneNode(true);
  const img = selectedChipBtn?.querySelector("img")?.cloneNode(true);

  if (img) {
    img.setAttribute("alt", "");
    img.removeAttribute("draggable");
  }

  if (label) chip.appendChild(label);
  if (img) chip.appendChild(img);

  return chip;
}

const CHIP_DENOMS = [
  1, 5, 10, 25, 50, 100, 500, 1000, 5000, 10000, 50000, 100000, 200000, 500000,
  1000000, 5000000,
];
const STACK_VISUAL_MAX = 5;

function denomForTotal(total) {
  let d = 1;
  for (const v of CHIP_DENOMS) {
    if (total >= v) d = v;
  }
  return d;
}

function chipClassForDenom(denom) {
  return `chip${denom}`;
}
function refreshChipSelectorLabels() {
  const mode = getCurrencyModeSafe();

  document.querySelectorAll(".chip-track .chip").forEach((btn) => {
    const cashVal = Number(btn.dataset.value || "0") || 0;

    const shown = cashToDisplayAmount(cashVal);

    const labelEl = btn.querySelector(".bj-chip-label");
    if (labelEl) {
      labelEl.textContent = formatK(shown);
    }

    btn.setAttribute("aria-label", `Bet ${Math.round(shown)}`);
  });
}
function refreshBoardLabels() {
  document
    .querySelectorAll(".rl-board-grid .rl-cell.has-bet")
    .forEach((cellBtn) => {
      const cashTotal = Number(cellBtn.dataset.stackTotal || "0") || 0;
      const stack = cellBtn.querySelector(".rl-chip-stack");
      if (!stack) return;
      setStackLabel(stack, cashTotal);
    });

  setTotalBet(totalBet);
}

function formatStackTotal(totalCash) {
  const shown = cashToDisplayAmount(totalCash);

  if (shown >= 1_000_000) {
    if (shown > 5_000_000) return "5M+";
    if (shown === 5_000_000) return "5M";

    const m = Math.floor(shown / 1_000_000);
    const exact = m * 1_000_000;

    if (shown === exact) return `${m}M`;
    return `${m}M+`;
  }

  if (shown >= 1000) {
    const k = Math.floor(shown / 1000);
    const exact = k * 1000;

    if (shown === exact) return `${k}K`;
    return `${k}K+`;
  }

  return String(Math.round(shown));
}

function getSelectedChipValue() {
  return Number(selectedChipBtn?.dataset.value || 0);
}

function getOrCreateStack(cellBtn) {
  if (!cellBtn) return null;

  let stack = cellBtn.querySelector(".rl-chip-stack");

  if (!stack) {
    if (!cellBtn.dataset.originalLabel) {
      cellBtn.dataset.originalLabel = (cellBtn.textContent || "").trim();
    }

    cellBtn.innerHTML = "";

    stack = document.createElement("span");
    stack.className = "rl-chip-stack is-loading";

    const label = document.createElement("span");
    label.className = "rl-stack-label";
    label.textContent = "0";
    stack.appendChild(label);

    cellBtn.appendChild(stack);

    cellBtn.dataset.stackTotal = "0";
    cellBtn.dataset.stackCount = "0";
    cellBtn.dataset.stackDenom = "1";
  } else {
    stack.classList.add("is-loading");
  }

  return stack;
}

function ensureVisualChip(stackEl, index, denomClass) {
  let chipEl = stackEl.querySelector(`.rl-placed-chip[data-i="${index}"]`);
  if (!chipEl) {
    chipEl = document.createElement("span");
    chipEl.className = "rl-placed-chip";
    chipEl.dataset.i = String(index);
    chipEl.style.setProperty("--i", String(index));

    const img = CHIP_BITMAP.cloneNode();
    img.className = denomClass;
    img.alt = "";
    img.draggable = false;

    if (index === 0) {
      whenImgReady(img).then(() => markStackReady(stackEl));
    }
    chipEl.appendChild(img);
    stackEl.appendChild(chipEl);
  } else {
    const img = chipEl.querySelector("img");
    if (img) {
      img.className = denomClass;
    }
  }
}

function updateAllStackChipClasses(stackEl, denomClass) {
  stackEl.querySelectorAll(".rl-placed-chip img").forEach((img) => {
    img.className = denomClass;
  });
}

function setStackLabel(stackEl, total) {
  const label = stackEl.querySelector(".rl-stack-label");
  if (label) label.textContent = formatStackTotal(total);
}

function setStackLabelPosition(stackEl, visibleCount) {
  const steps = Math.max(0, Math.min(visibleCount, STACK_VISUAL_MAX) - 1);
  const px = steps * 4;
  stackEl.style.setProperty("--label-shift", `${-px}px`);
}
function placeChipVisual(cellBtn) {
  if (!selectedChipBtn) return;
  if (!CHIP_BITMAP) return;
  const addValue = getSelectedChipValue();
  if (!addValue) return;

  const stack = getOrCreateStack(cellBtn);

  const prevTotal = Number(cellBtn.dataset.stackTotal || "0");
  const newTotal = prevTotal + addValue;
  cellBtn.dataset.stackTotal = String(newTotal);
  cellBtn.classList.add("has-bet");

  const denom = denomForTotal(newTotal);
  cellBtn.dataset.stackDenom = String(denom);
  const denomClass = chipClassForDenom(denom);

  const prevCount = Number(cellBtn.dataset.stackCount || "0");
  const newCount = Math.min(prevCount + 1, STACK_VISUAL_MAX);

  cellBtn.dataset.stackCount = String(newCount);

  for (let i = 0; i < newCount; i++) {
    ensureVisualChip(stack, i, denomClass);
  }

  updateAllStackChipClasses(stack, denomClass);

  setStackLabelPosition(stack, newCount);

  setStackLabel(stack, newTotal);
}

function applyCellStackState(cellBtn, newTotal, desiredVisibleCount) {
  const stack = getOrCreateStack(cellBtn);

  cellBtn.dataset.stackTotal = String(newTotal);

  if (newTotal <= 0) {
    cellBtn.classList.remove("has-bet");
    const st = cellBtn.querySelector(".rl-chip-stack");
    if (st) st.remove();
    delete cellBtn.dataset.stackTotal;
    delete cellBtn.dataset.stackCount;
    delete cellBtn.dataset.stackDenom;

    const original = cellBtn.dataset.originalLabel;
    if (original != null) cellBtn.textContent = original;
    return;
  }

  const denom = denomForTotal(newTotal);
  cellBtn.dataset.stackDenom = String(denom);
  const denomClass = chipClassForDenom(denom);

  const visibleCount = Math.max(
    1,
    Math.min(STACK_VISUAL_MAX, desiredVisibleCount | 0),
  );
  cellBtn.dataset.stackCount = String(visibleCount);

  for (let i = 0; i < visibleCount; i++) {
    ensureVisualChip(stack, i, denomClass);
  }

  stack.querySelectorAll(".rl-placed-chip").forEach((el) => {
    const i = Number(el.dataset.i);
    if (Number.isFinite(i) && i >= visibleCount) el.remove();
  });

  updateAllStackChipClasses(stack, denomClass);

  setStackLabelPosition(stack, visibleCount);
  setStackLabel(stack, newTotal);

  cellBtn.classList.add("has-bet");
}

function recalcTotalBetFromBoard() {
  let sum = 0;
  document
    .querySelectorAll(".rl-board-grid .rl-cell.has-bet")
    .forEach((btn) => {
      sum += Number(btn.dataset.stackTotal || "0") || 0;
    });
  setTotalBet(sum);
}

function quickBetDouble() {
  if (spinning) return;

  const betCells = Array.from(
    document.querySelectorAll(".rl-board-grid .rl-cell.has-bet"),
  );
  if (!betCells.length) return;

  pushUndoSnapshot();
  betCells.forEach((cellBtn) => {
    const oldTotal = Number(cellBtn.dataset.stackTotal || "0") || 0;
    if (oldTotal <= 0) return;

    const newTotal = oldTotal * 2;

    const oldCount = Number(cellBtn.dataset.stackCount || "1") || 1;
    const newCount = Math.min(STACK_VISUAL_MAX, oldCount + 1);

    applyCellStackState(cellBtn, newTotal, newCount);
  });

  recalcTotalBetFromBoard();
}

function quickBetHalf() {
  if (spinning) return;

  const betCells = Array.from(
    document.querySelectorAll(".rl-board-grid .rl-cell.has-bet"),
  );
  if (!betCells.length) return;

  pushUndoSnapshot();
  betCells.forEach((cellBtn) => {
    const oldTotal = Number(cellBtn.dataset.stackTotal || "0") || 0;
    if (oldTotal <= 0) return;

    const newTotal = Math.max(1, Math.ceil(oldTotal / 2));

    const oldCount = Number(cellBtn.dataset.stackCount || "1") || 1;
    let newCount = oldCount;

    if (oldCount > 1) {
      if (oldCount % 2 === 0) {
        newCount = Math.max(1, oldCount / 2);
      } else {
        newCount = Math.max(1, oldCount - 1);
      }
    }

    applyCellStackState(cellBtn, newTotal, newCount);
  });

  recalcTotalBetFromBoard();
}

function visibleCountForTotal(totalCash) {
  const denom = denomForTotal(totalCash);
  const approx = Math.ceil(totalCash / Math.max(1, denom));
  return Math.max(1, Math.min(STACK_VISUAL_MAX, approx));
}

function restoreBetsFromServer(bets) {
  resetAllBetsUI();

  if (!Array.isArray(bets)) {
    setTotalBet(0);
    return;
  }

  bets.forEach((b) => {
    const betKey = String(b.bet ?? "");
    const total = Number(b.total ?? 0) || 0;
    if (!betKey || total <= 0) return;

    const btn = document.querySelector(
      `.rl-board-grid .rl-cell[data-bet="${CSS.escape(betKey)}"]`,
    );
    if (!btn) return;

    const count = Number(b.count ?? 0) || visibleCountForTotal(total);

    applyCellStackState(btn, total, count);
  });

  recalcTotalBetFromBoard();
}

const rlUndoStack = [];
async function rlSyncAfterFinish() {
  try {
    const r = await rlApiGetState();
    if (!r?.ok) return;
    if (Number.isFinite(r.walletBalanceCash))
      setWalletBalanceCash(r.walletBalanceCash);
  } catch {}
}
function snapshotBoardState() {
  const cells = [];
  document
    .querySelectorAll(".rl-board-grid .rl-cell.has-bet")
    .forEach((btn) => {
      cells.push({
        bet: btn.dataset.bet,
        total: Number(btn.dataset.stackTotal || "0") || 0,
        count: Number(btn.dataset.stackCount || "1") || 1,

        denom: Number(btn.dataset.stackDenom || "1") || 1,
      });
    });

  return {
    totalBet: Number(totalBet || 0),
    cells,
  };
}

function restoreBoardState(state) {
  resetAllBetsUI();

  (state?.cells || []).forEach((c) => {
    const btn = document.querySelector(
      `.rl-board-grid .rl-cell[data-bet="${c.bet}"]`,
    );
    if (!btn) return;
    if (!c.total) return;
    applyCellStackState(btn, c.total, c.count);
  });

  setTotalBet(Number(state?.totalBet || 0));
}

function pushUndoSnapshot() {
  rlUndoStack.push(snapshotBoardState());

  if (rlUndoStack.length > 80) rlUndoStack.shift();
}

function undoLastAction() {
  if (spinning) return;
  if (!rlUndoStack.length) return;

  const prev = rlUndoStack.pop();
  restoreBoardState(prev);
}

function clearAllBetsWithUndo() {
  if (spinning) return;

  if (!tableHasBets()) return;

  pushUndoSnapshot();
  resetAllBetsUI();
}
async function gateRoulettePageReady() {
  if (document.readyState !== "complete") {
    await new Promise((r) =>
      window.addEventListener("load", r, { once: true }),
    );
  }

  await waitFor(
    () => {
      const balEl =
        document.getElementById("balance") ||
        document.getElementById("walletBalance") ||
        document.querySelector(".wallet-balance, .rl-wallet-balance");

      const balText = (balEl?.textContent || "").trim();
      const balIsReady = balText !== "";

      const currencyEl = document.getElementById("currency");
      const hasCurrency = !!currencyEl;

      const unit = document.querySelector(".wallet-unit");
      const hasSvg = !!unit?.querySelector("svg");

      return balIsReady && hasCurrency && (hasSvg || true);
    },
    { timeout: 8000, interval: 60 },
  );

  await waitFor(
    () => {
      const track = document.getElementById("rlStripTrack");
      const pointer = document.querySelector(".rl-strip-pointer");
      const strip = document.querySelector(".rl-strip");
      const grid = document.querySelector(".rl-board-grid");
      return !!track && !!pointer && !!strip && !!grid;
    },
    { timeout: 8000, interval: 60 },
  );

  await preloadImages(["/assets/casino-chip.png", "/assets/logo.png"]);

  await waitFor(
    () => {
      return (
        !!window.CHIP_BITMAP ||
        (typeof CHIP_BITMAP !== "undefined" && !!CHIP_BITMAP)
      );
    },
    { timeout: 8000, interval: 60 },
  );

  await new Promise(requestAnimationFrame);

  hideAppLoaderSafe();
}

gateRoulettePageReady();

document.getElementById("rlClearBtn")?.addEventListener("click", (e) => {
  e.preventDefault();
  clearAllBetsWithUndo();
});

document.getElementById("rlUndoBtn")?.addEventListener("click", (e) => {
  e.preventDefault();
  undoLastAction();
});

document
  .querySelector('[data-quick="2x"], .rl-quick-2x, #rlQuick2x')
  ?.addEventListener("click", (e) => {
    e.preventDefault();
    quickBetDouble();
  });

document
  .querySelector('[data-quick="half"], .rl-quick-half, #rlQuickHalf')
  ?.addEventListener("click", (e) => {
    e.preventDefault();
    quickBetHalf();
  });

document.querySelector(".rl-board-grid")?.addEventListener("click", (e) => {
  if (spinning) return;

  const btn = e.target.closest("button.rl-cell");
  if (!btn) return;

  if (!selectedChipBtn || !selectedChipValue) return;

  pushUndoSnapshot();

  placeChipVisual(btn);
  setTotalBet(totalBet + selectedChipValue);
});

async function rouletteBootRejoin() {
  try {
    const r = await rlApiGetState();
    if (!r?.ok || !r.state) return;

    if (Number.isFinite(r.walletBalanceCash)) {
      setWalletBalanceCash(r.walletBalanceCash);
    }

    const st = r.state;

    if (st.phase === "spinning" || st.phase === "should_resolve") {
      restoreBetsFromServer(st.spin?.bets || []);

      spinBtn.classList.add("is-hidden");
      setBoardEnabled(false);

      startSpinFromServer({
        winningNumber: st.spin.winningNumber,
        spinStartedAtMs: st.spin.spinStartedAtMs,
        spinDurationMs: st.spin.spinDurationMs,
        fromIndex: st.spin.fromIndex,
        targetIndex: st.spin.targetIndex,
        totalTiles: st.spin.totalTiles,
      });

      return;
    }

    if (st.phase === "resolved") {
      rlHardResetUI();
      return;
    }

    if (st.phase === "idle" || st.phase === "ready") {
      rlHardResetUI();
      return;
    }
  } catch (e) {
    console.warn("rouletteBootRejoin failed", e);
  }
}

(async () => {
  try {
    await gateRoulettePageReady();
  } finally {
    rouletteBootRejoin();
  }
})();

grid?.addEventListener("pointerover", (e) => {
  const btn = e.target.closest("button.rl-cell");
  if (!btn) return;

  const bet = btn.dataset.bet;
  if (!bet) return;

  if (btn.classList.contains("rl-num") || btn.classList.contains("rl-zero")) {
    clearHL();
    return;
  }

  if (isGroupBet(bet)) {
    handleHover(bet);
    btn.classList.add("is-hl");
  } else {
    clearHL();
  }
});
grid?.addEventListener("pointerout", (e) => {
  const fromBtn = e.target.closest("button.rl-cell");
  if (!fromBtn) return;

  const fromBet = fromBtn.dataset.bet;
  if (!fromBet || !isGroupBet(fromBet)) return;

  const toBtn = e.relatedTarget?.closest?.("button.rl-cell");

  if (toBtn) return;

  clearHL();
});

document.querySelectorAll(".rl-num").forEach((btn) => {
  const n = Number(btn.dataset.bet);
  if (!Number.isFinite(n)) return;

  if (n === 0) btn.classList.add("is-green");
  else if (RED.has(n)) btn.classList.add("is-red");
  else btn.classList.add("is-black");
});

const spinBtn = document.querySelector(".spin-btn");
spinBtn?.addEventListener("click", async () => {
  if (spinning) return;

  clearWinner();
  hideProfit();

  if (!tableHasBets()) {
    spinBtn.classList.add("is-error");
    setTimeout(() => spinBtn.classList.remove("is-error"), 450);
    return;
  }

  const balanceCash = getPlayerBalanceCash();
  if (balanceCash < totalBet) {
    showRlToast("Insufficient funds", 3000);
    return;
  }

  spinBtn.classList.add("is-hidden");

  const payload = exportBetsForServer();
  const r = await rlApiSpin(payload);

  if (!r?.ok) {
    spinBtn.classList.remove("is-hidden");
    if (r?.error === "INSUFFICIENT_FUNDS")
      showRlToast("Insufficient funds", 3000);
    else showError("Spin failed");
    return;
  }

  if (Number.isFinite(r.walletBalanceCash)) {
    setWalletBalanceCash(r.walletBalanceCash);
  }

  const st = r.state;
  startSpinFromServer({
    winningNumber: st.spin.winningNumber,
    spinStartedAtMs: st.spin.spinStartedAtMs,
    spinDurationMs: st.spin.spinDurationMs,
    fromIndex: st.spin.fromIndex,
    targetIndex: st.spin.targetIndex,
    totalTiles: st.spin.totalTiles,
  });
});

window.addEventListener("rollix:modechange", () => {
  refreshChipSelectorLabels();
  refreshBoardLabels();
});
window.addEventListener("rollix:currencychange", () => {
  refreshChipSelectorLabels();
  refreshBoardLabels();
});

async function rlApiGetState() {
  const res = await fetch("/api/roulette/state", { credentials: "include" });
  return await res.json();
}

async function rlApiSpin(payload) {
  const res = await fetch("/api/roulette/spin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  return await res.json();
}

function exportBetsForServer() {
  const bets = [];
  document
    .querySelectorAll(".rl-board-grid .rl-cell.has-bet")
    .forEach((btn) => {
      const bet = btn.dataset.bet;
      const total = Number(btn.dataset.stackTotal || "0") || 0;
      if (!bet || !total) return;
      bets.push({ bet, total });
    });

  return { bets };
}
