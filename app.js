(function () {
  "use strict";

  const WORDS = [
    "Me Enamora","Me Sorprende","Infancia Feliz","Retro","Futurista",
    "Automático","Manual","Portátil","Fijo","Energía Solar",
    "Hazlo Tú Mismo","Abstracto","Desmaterializar","Natural","Expansible",
    "Formas Básicas","Fractal","Ondas","Panel","Orgánico",
    "Seguro","Cúbico","Lineal","Plus","Reducir",
    "XL","Ultra mini","Yin Yang","Desequilibrado","Fugaz",
    "Potencia","Capas","Espacial","Espiral","Tierno",
    "Sexy","Larga Duración","Frágil","Ultrarresistente","Luz",
    "Agujero Negro","Imán","Metálico","Neuronal","Textil",
    "Cilíndrico","Absorbente","Mimetizado","Día","Noche",
    "Llamativo","Degradado","Contraste","Clásico","Alegre",
    "Esbelto","Caliente","Frío","Liso","Transparente",
    "Lujo","Minimalista","Dulce","Universal","Modular",
    "Rápido","Infantil","Divertido","Red","Central",
    "Periférico","Metamorfosis","Nube","Refractario","Abrazo",
    "Elegante","Exterior","Interior","Retráctil","Pixel",
    "3D","Puntos","Wearables","Rueda",
  ];

  const SUITS = [
    { sym: "♠", red: false },
    { sym: "♥", red: true  },
    { sym: "♦", red: true  },
    { sym: "♣", red: false },
  ];

  const T = {
    DEAL_DUR:        3200,
    DEAL_STAGGER:    3000,
    REVEAL_OFFSET:     0,   // antes 30
    REVEAL_STAGGER:   18,   // antes 40
    SHAKE_DUR:       700,
    SHAKE_STAGGER:    30,
    FLIP_BACK:       160,   // antes 260
    FLIP_STAGGER:     24,   // antes 50
    SWEEP_DUR:       500,
    SWEEP_STAGGER:    55,
  };

  const countInput  = document.getElementById("count");
  const countOut    = document.getElementById("countOut");
  const btnGenerate = document.getElementById("btnGenerate");
  const btnShuffle  = document.getElementById("btnShuffle");
  const tableArea   = document.getElementById("tableArea");
  const emptyState  = document.getElementById("emptyState");
  const bgScene     = document.getElementById("bgScene");

  let busy = false;

  const raf  = () => new Promise(r => requestAnimationFrame(r));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function easeInExpo(t)  { return t === 0 ? 0 : Math.pow(2, 10 * t - 10); }
  function easeInCubic(t) { return t * t * t; }

  function shuffleArr(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function pickWords(n, exclude) {
    const cap = clamp(n, 1, WORDS.length);
    const excSet = new Set(exclude || []);
    let pool = WORDS.filter(w => !excSet.has(w));
    if (pool.length < cap) pool = [...WORDS];
    return shuffleArr(pool).slice(0, cap);
  }

  function suitAt(i) {
    return SUITS[i % SUITS.length];
  }

  function setLock(v) {
    busy = v;
    btnGenerate.disabled = v;
    btnShuffle.disabled  = v;
  }

  function setGenerateUsed(v) {
    btnGenerate.classList.toggle("btn--generate-used", v);
    btnGenerate.disabled = v;
  }

  function buildCard(word, index) {
    const s = suitAt(index);
    const cc = s.red ? "card-corner--red" : "card-corner--black";

    const wrap = document.createElement("article");
    wrap.className = "card-wrap";
    wrap.innerHTML =
      '<div class="card-motion">' +
        '<div class="card-tilt">' +
          '<div class="card-flipper">' +
            '<div class="card-face card-face--back">' +
              '<div class="card-back__pattern"><span class="card-back__emblem">♠ ♥</span></div>' +
            '</div>' +
            '<div class="card-face card-face--front">' +
              '<span class="card-corner card-corner--tl ' + cc + '">' + s.sym + '</span>' +
              '<span class="card-corner card-corner--br ' + cc + '">' + s.sym + '</span>' +
              '<div class="card-word-wrap"><p class="card-word"></p></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    wrap.querySelector(".card-word").textContent = word;
    return wrap;
  }

  function attachTilt(wrap) {
    wrap.addEventListener("mousemove", e => {
      if (wrap.classList.contains("animating")) return;

      const r = wrap.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);

      wrap.style.setProperty("--tilt-x", dy * 7 + "deg");
      wrap.style.setProperty("--tilt-y", dx * -7 + "deg");
    });

    wrap.addEventListener("mouseleave", () => {
      wrap.style.setProperty("--tilt-x", "0deg");
      wrap.style.setProperty("--tilt-y", "0deg");
    });
  }

  const STATES = ["s-stacked","s-shake","s-deal","s-rest"];

  function setState(wrap, state) {
    wrap.classList.remove(...STATES, "animating");
    if (state !== "s-rest") wrap.classList.add("animating");
    wrap.classList.add(state);
  }

  function calcStackOffset(wrap) {
    const aRect = tableArea.getBoundingClientRect();
    const wRect = wrap.getBoundingClientRect();

    return {
      tx: (aRect.left + aRect.width / 2) - (wRect.left + wRect.width / 2),
      ty: (aRect.top + aRect.height / 2) - (wRect.top + wRect.height / 2),
    };
  }

  function computeCols(n) {
    const containerW = tableArea.getBoundingClientRect().width || 900;
    const minCol = Math.min(containerW, 220);
    const gapPx = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--grid-gap")
    ) || 21.6;

    const maxCols = Math.floor((containerW + gapPx) / (minCol + gapPx));
    return clamp(Math.min(n, maxCols), 1, n);
  }

  function renderSlots(n) {
    const cols = computeCols(n);
    tableArea.style.setProperty("--cols", cols);

    for (let i = 0; i < n; i++) {
      const slot = document.createElement("div");
      slot.className = "card-slot";
      slot.style.gridColumn = String((i % cols) + 1);
      slot.style.gridRow = String(Math.floor(i / cols) + 1);
      tableArea.appendChild(slot);
    }
  }

  function positionCards(wraps, cols) {
    wraps.forEach((wrap, i) => {
      wrap.style.gridColumn = String((i % cols) + 1);
      wrap.style.gridRow = String(Math.floor(i / cols) + 1);
    });
  }

  function animateSweepOut(wraps) {
    return new Promise(resolve => {
      const travelX = window.innerWidth + 240;
      const driftY = wraps.map(() => rand(-14, 14));
      const globalStart = performance.now();
      let resolved = false;

      function tick(now) {
        if (resolved) return;

        const globalElapsed = now - globalStart;
        let finishedCount = 0;

        wraps.forEach((wrap, i) => {
          const cardElapsed = globalElapsed - i * T.SWEEP_STAGGER;

          if (cardElapsed <= 0) return;

          const t = Math.min(cardElapsed / T.SWEEP_DUR, 1);

          if (t >= 1) {
            wrap.style.opacity = "0";
            wrap.style.transform =
              "translate(" + travelX + "px," + driftY[i] + "px) rotate(6deg) scale(0.9)";
            finishedCount++;
            return;
          }

          const tx = easeInExpo(t) * travelX;
          const op = 1 - easeInCubic(t);
          const ry = driftY[i] * t;
          const rot = 6 * easeInExpo(t);
          const sc = 1 - 0.1 * t;

          wrap.style.opacity = String(Math.max(0, op));
          wrap.style.transform =
            "translate(" + tx + "px," + ry + "px) rotate(" + rot + "deg) scale(" + sc + ")";
        });

        if (finishedCount === wraps.length) {
          requestAnimationFrame(() => {
            resolved = true;
            wraps.forEach(w => w.remove());
            resolve();
          });
        } else {
          requestAnimationFrame(tick);
        }
      }

      requestAnimationFrame(tick);
    });
  }

  async function revealCardsFast(wraps) {
    wraps.forEach((wrap, i) => {
      setTimeout(() => {
        wrap.classList.add("is-revealed");
      }, i * T.REVEAL_STAGGER);
    });

    await wait((wraps.length - 1) * T.REVEAL_STAGGER + 260);
  }

  async function dealSequence(wraps) {
    const cols = computeCols(wraps.length);
    positionCards(wraps, cols);

    await raf();
    await raf();

    wraps.forEach((wrap, i) => {
      const { tx, ty } = calcStackOffset(wrap);

      wrap.style.setProperty("--stack-tx", tx + "px");
      wrap.style.setProperty("--stack-ty", ty + "px");
      wrap.style.setProperty("--stack-r", rand(-10, 10) + "deg");
      wrap.style.setProperty("--rest-r", rand(-2.5, 2.5) + "deg");
      wrap.style.setProperty("--deal-delay", i * T.DEAL_STAGGER + "ms");
      wrap.style.setProperty("--deal-dur", (T.DEAL_DUR + rand(-30, 40)) + "ms");
      wrap.style.zIndex = String(10 + i);
      wrap.style.transform = "";
      wrap.style.opacity = "";

      setState(wrap, "s-stacked");
    });

    await wait(40);

    wraps.forEach((wrap, i) => {
      setTimeout(() => {
        wrap.classList.remove("s-stacked");
        wrap.style.setProperty("--shake-dur", (T.SHAKE_DUR + rand(-80, 80)) + "ms");
        wrap.classList.add("s-shake", "animating");
      }, i * T.SHAKE_STAGGER);
    });

    await wait(T.SHAKE_DUR * 0.6);

    await raf();
    wraps.forEach(wrap => setState(wrap, "s-deal"));

    const totalDeal = (wraps.length - 1) * T.DEAL_STAGGER + T.DEAL_DUR;
    const revealStart = 100 + Math.random() * 40;

    await wait(revealStart);

    wraps.forEach(wrap => setState(wrap, "s-rest"));
    await wait(T.REVEAL_OFFSET);
    await revealCardsFast(wraps);

    tableArea.classList.add("interactive");
    setLock(false);
  }

  async function shuffleSequence() {
    const wraps = Array.from(tableArea.querySelectorAll(".card-wrap"));
    if (!wraps.length) return;

    setLock(true);
    tableArea.classList.remove("interactive");

    const n = wraps.length;
    const prev = wraps.map(w => (w.querySelector(".card-word") || {}).textContent || "");
    const newWords = pickWords(n, prev);

    wraps.forEach(w => {
      w.style.transform = "";
      w.style.opacity = "";
    });

    wraps.forEach((wrap, i) => {
      setTimeout(() => {
        wrap.classList.add("animating");
        wrap.classList.remove("is-revealed");
        wrap.classList.add("is-flipping-back");
      }, i * T.FLIP_STAGGER);
    });

    await wait((wraps.length - 1) * T.FLIP_STAGGER + T.FLIP_BACK + 30);
    wraps.forEach(w => w.classList.remove("is-flipping-back"));

    wraps.forEach(w => {
      const m = w.querySelector(".card-motion");
      if (m) m.style.transition = "none";
    });

    await raf();
    await raf();

    await animateSweepOut(wraps);

    const newWraps = [];
    newWords.forEach((word, i) => {
      const wrap = buildCard(word, i);
      wrap.style.visibility = "hidden";
      tableArea.appendChild(wrap);
      newWraps.push(wrap);
      attachTilt(wrap);
    });

    await raf();
    await raf();

    const cols = computeCols(n);
    positionCards(newWraps, cols);
    await raf();

    newWraps.forEach((wrap, i) => {
      const offset = calcStackOffset(wrap);

      wrap.style.setProperty("--stack-tx", offset.tx + "px");
      wrap.style.setProperty("--stack-ty", offset.ty + "px");
      wrap.style.setProperty("--stack-r", rand(-10, 10) + "deg");
      wrap.style.setProperty("--rest-r", rand(-2.5, 2.5) + "deg");
      wrap.style.setProperty("--deal-delay", i * T.DEAL_STAGGER + "ms");
      wrap.style.setProperty("--deal-dur", (T.DEAL_DUR + rand(-30, 40)) + "ms");
      wrap.style.zIndex = String(10 + i);

      wrap.classList.remove("s-rest", "s-deal", "s-shake", "animating");
      wrap.classList.add("s-stacked", "animating");
    });

    await raf();

    newWraps.forEach(w => {
      w.style.visibility = "";
    });

    await wait(24);

    Array.from(tableArea.querySelectorAll(".card-slot")).forEach(s => s.remove());

    newWraps.forEach((wrap, i) => {
      setTimeout(() => {
        wrap.classList.remove("s-stacked");
        wrap.style.setProperty("--shake-dur", (T.SHAKE_DUR + rand(-80, 80)) + "ms");
        wrap.classList.add("s-shake", "animating");
      }, i * T.SHAKE_STAGGER);
    });

    await wait((newWraps.length - 1) * T.SHAKE_STAGGER + T.SHAKE_DUR + 40);

    await raf();
    newWraps.forEach(wrap => {
      wrap.classList.remove("s-stacked", "s-shake");
      wrap.classList.add("s-deal", "animating");
    });

    const totalDeal = (newWraps.length - 1) * T.DEAL_STAGGER + T.DEAL_DUR;
    const revealStart = 100 + Math.random() * 40;

    await wait(revealStart);

    newWraps.forEach(wrap => {
      wrap.classList.remove("s-deal", "animating");
      wrap.classList.add("s-rest");
    });

    await wait(T.REVEAL_OFFSET);
    await revealCardsFast(newWraps);

    tableArea.classList.add("interactive");
    setLock(false);
  }

  function renderCards(words) {
    tableArea.innerHTML = "";
    tableArea.classList.remove("interactive");
    tableArea.style.removeProperty("--cols");

    if (!words.length) {
      emptyState.classList.remove("is-hidden");
      return;
    }

    emptyState.classList.add("is-hidden");
    renderSlots(words.length);

    const wraps = [];
    words.forEach((word, i) => {
      const wrap = buildCard(word, i);
      tableArea.appendChild(wrap);
      wraps.push(wrap);
      attachTilt(wrap);
    });

    requestAnimationFrame(() =>
      requestAnimationFrame(() => dealSequence(wraps))
    );
  }

  function getCount() {
    return clamp(parseInt(countInput.value, 10) || 1, 1, 5);
  }

  function syncOutput() {
    const c = getCount();
    countInput.setAttribute("aria-valuenow", c);
    countOut.textContent = c;
  }

  countInput.addEventListener("input", () => {
    syncOutput();
    setGenerateUsed(false);
  });

  btnGenerate.addEventListener("click", () => {
    if (busy || btnGenerate.disabled) return;
    setLock(true);
    setGenerateUsed(true);
    renderCards(pickWords(getCount()));
  });

  btnShuffle.addEventListener("click", () => {
    if (busy) return;
    shuffleSequence();
  });

  if (bgScene) {
    document.addEventListener("mousemove", e => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;

      bgScene.style.setProperty("--px", x * 14 + "px");
      bgScene.style.setProperty("--py", y * 11 + "px");
    }, { passive: true });
  }

  syncOutput();
})();