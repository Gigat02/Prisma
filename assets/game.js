// Prisma — interfaccia: menu, livelli, partita, guida, negozio. Le regole stanno in core.js,
// il disegno della griglia in render.js, legenda e guida nei loro file, i suggerimenti in shop.js.
(function () {
  "use strict";

  const core = window.PrismaCore;
  const R = window.PrismaRender;
  const Shop = window.PrismaShop;
  const { chapters, levels } = window.PRISMA_LEVELS;
  const { FILL, LAMP_NAMES } = R;
  const $ = (id) => document.getElementById(id);
  // Vibrazione breve al tocco (solo dove il telefono la supporta: Android sì, iPhone no).
  // Il browser la permette solo dopo un tocco vero: prima non la si chiede nemmeno.
  const buzz = (pattern) => {
    const ua = navigator.userActivation;
    if (!navigator.vibrate || (ua && !ua.hasBeenActive)) return;
    try { navigator.vibrate(pattern); } catch { /* ignorata */ }
  };
  const store = (() => { try { return window.localStorage; } catch { return null; } })();
  Shop.attachStorage(store);

  // Prima e ultima posizione di ogni capitolo, per i suggerimenti e i messaggi di fine capitolo.
  const chapterStart = new Map();
  const chapterEnd = new Map();
  levels.forEach((l, i) => {
    if (!chapterStart.has(l.chapter)) chapterStart.set(l.chapter, i);
    chapterEnd.set(l.chapter, i);
  });

  const HINTS = {
    0: "Tocca una casella per piazzare la sorgente rossa. Deve accendere esattamente le caselle col quadratino rosso.",
    1: "Le caselle col quadratino scuro devono restare al buio. I muri fermano la luce.",
    2: "Due sorgenti. Tocca una sorgente già piazzata per toglierla.",
  };
  const CHAPTER_HINTS = [
    null,
    "Nuovo colore: il blu. Dove rosso e blu si incrociano la luce diventa magenta.",
    "Arriva il verde. Rosso + verde = giallo, verde + blu = ciano, tutti e tre = bianco.",
    "Sorgenti composte: la gialla emette rosso e verde insieme, la magenta rosso e blu, la ciano verde e blu.",
    "La sorgente bianca accende tutti e tre i colori: potente, e proprio per questo pericolosa.",
    "Griglie grandi e molte sorgenti. Da qui in poi, niente aiuti.",
    "Orizzonte: griglie 9×9. Stessi colori, molto più spazio per sbagliare.",
    "Specchi: deviano il raggio di 90°. Seguilo con il dito prima di piazzare la sorgente.",
    "Tanti specchi: un raggio può tornare indietro e accendere caselle lontanissime.",
    "Vetri colorati: lasciano passare solo i colori che contengono. Un vetro giallo ferma il blu.",
    "Vetri e specchi insieme: ogni deviazione può costare un colore.",
    "Il prisma scompone la luce: il verde prosegue dritto, il rosso gira a sinistra e il blu a destra, rispetto a dove va il raggio.",
    "Prismi e specchi: i colori si separano e si ritrovano altrove.",
    "Caselle velate (?): il loro colore non si sa e va bene qualsiasi. Meno indizi, stesse regole.",
    "Fari: sorgenti già accese, a forma di rombo. Non si spostano: lavora attorno a loro.",
    "La griglia cambia forma: dove mancano le caselle, la luce si ferma.",
    "Labirinto: corridoi stretti e specchi ovunque.",
    "Controluce: scomponi la luce con i prismi, poi filtrala con i vetri.",
    "Nebbia: veli, vetri e specchi nello stesso livello.",
    "Costellazioni: forme irregolari con fari già accesi.",
    "Caleidoscopio: tutti gli elementi insieme.",
    "Rifrazioni: più prismi, e ogni colore prende la sua strada.",
    "Eclissi totale: fino a un terzo delle caselle è velato. Fidati di quello che vedi.",
    "Abisso: griglie 10×10.",
    "Aurora: 10×10, con i fari.",
    "Zenit: l'ultima vetta. Niente aiuti.",
  ];
  function hintFor(i) {
    if (HINTS[i]) return HINTS[i];
    const ch = levels[i].chapter;
    if (chapterStart.get(ch) === i && CHAPTER_HINTS[ch]) return CHAPTER_HINTS[ch];
    if (chapterEnd.get(ch) === i && ch > 0 && ch < chapters.length - 1) return "Ultimo livello del capitolo: occhio alle insidie.";
    return "";
  }

  // ---------- Salvataggio (solo comodità locale: se manca, il gioco funziona lo stesso) ----------
  const KEY = "prisma.v1";
  const progress = (() => {
    let raw = null;
    try { raw = JSON.parse(store.getItem(KEY)); } catch { /* storage assente o corrotto */ }
    const solved = new Set(Array.isArray(raw && raw.solved) ? raw.solved.filter((i) => Number.isInteger(i) && i >= 0 && i < levels.length) : []);
    const draft = raw && raw.draft && Number.isInteger(raw.draft.level) && Array.isArray(raw.draft.lamps) ? raw.draft : null;
    const last = raw && Number.isInteger(raw.last) && raw.last >= 0 && raw.last < levels.length ? raw.last : 0;
    return { solved, draft, last };
  })();
  function save() {
    try {
      store.setItem(KEY, JSON.stringify({ solved: [...progress.solved], draft: progress.draft, last: progress.last }));
    } catch { /* niente da fare */ }
  }
  const unlocked = (i) => i === 0 || progress.solved.has(i) || progress.solved.has(i - 1);
  const firstUnsolved = () => {
    for (let i = 0; i < levels.length; i++) if (!progress.solved.has(i)) return i;
    return -1;
  };
  // Livello da cui "Gioca" riparte: l'ultimo aperto se non è risolto, altrimenti il primo da risolvere.
  const resumeLevel = () => {
    if (!progress.solved.has(progress.last) && unlocked(progress.last)) return progress.last;
    return firstUnsolved();
  };

  // ---------- Allenatore: tutorial e fumetti dei primi livelli ----------
  const Coach = window.PrismaCoach;
  const COACH_KEY = "prisma.coach.v1";
  const GUIDED = 10; // nei primi 10 livelli ogni errore viene spiegato sulla griglia
  const coachState = (() => {
    let raw = null;
    try { raw = JSON.parse(store.getItem(COACH_KEY)); } catch { /* niente */ }
    return {
      tutorial: raw && typeof raw.tutorial === "string" ? raw.tutorial : null,
      intro: new Set(raw && Array.isArray(raw.intro) ? raw.intro.filter(Number.isInteger) : []),
    };
  })();
  function saveCoach() {
    try { store.setItem(COACH_KEY, JSON.stringify({ tutorial: coachState.tutorial, intro: [...coachState.intro] })); } catch { /* niente */ }
  }
  // Primo livello in cui compare ogni tipo di sorgente (per presentare il blu, il verde...).
  const firstLamp = [];
  levels.forEach((l, i) => { for (const ch of Object.keys(l.lamps || {})) { const m = core.CHARS.indexOf(ch); if (firstLamp[m] == null) firstLamp[m] = i; } });

  // Fumetti di presentazione per il livello: tutto ciò che compare qui per la prima volta.
  function introsFor(idx) {
    const { b, view } = game;
    const cells = view.cells;
    const f = window.PrismaLegend.firstSeen();
    const fresh = (k) => f[k] === idx;
    const cellWhere = (pred) => { const i = b.floor.find(pred); return i == null ? null : cells[i]; };
    const kindCell = (...ks) => { for (let i = 0; i < b.n; i++) if (ks.includes(b.kind[i])) return cells[i]; return null; };
    const chip = (m) => paletteEl.querySelector(`.chip[data-m="${m}"]`);
    const out = [];
    if (idx === 0) {
      out.push([chip(game.types[0]), "Questa è la tua sorgente <b>rossa</b>. Il numero dice quante ne hai: una."]);
      out.push([cellWhere((i) => b.target[i] === 1), "Le caselle con il quadratino <b>rosso</b> vanno accese di rosso."]);
      out.push([cellWhere((i) => b.target[i] === 0), "Quelle con il quadratino <b>scuro</b> devono restare al buio."]);
      out.push([boardEl, "Tocca la casella giusta: la sorgente illumina la sua riga e la sua colonna. Se sbagli, ti dico dove."]);
    }
    if (fresh("wall")) out.push([kindCell(core.WALL), "Questo è un <b>muro</b>: la luce si ferma qui."]);
    if (idx === 2) out.push([chip(1), "Ora le sorgenti sono <b>due</b>: devi usarle entrambe."]);
    for (const m of [4, 2]) if (firstLamp[m] === idx) out.push([chip(m), `Nuovo colore: la sorgente <b>${R.LAMP_NAMES[m]}</b>. Toccala qui per sceglierla.`]);
    const MIXES = [["mix-m", 5, "rosso + blu"], ["mix-y", 3, "rosso + verde"], ["mix-c", 6, "verde + blu"], ["mix-w", 7, "rosso + verde + blu"]];
    for (const [k, m, how] of MIXES) {
      if (!fresh(k)) continue;
      const name = R.COLOR_NAMES[m];
      out.push([cellWhere((i) => b.target[i] === m),
        `<b>${name[0].toUpperCase() + name.slice(1)}</b> = ${how}: qui devono arrivare ${m === 7 ? "tutte e tre le luci" : "entrambe le luci"}.`]);
    }
    const EMITS = { 3: "rosso e verde", 5: "rosso e blu", 6: "verde e blu", 7: "rosso, verde e blu" };
    for (const m of [3, 5, 6, 7]) if (fresh(`lamp-${m}`)) out.push([chip(m), `Nuova sorgente <b>${R.LAMP_NAMES[m]}</b>: emette ${EMITS[m]} insieme, lungo la stessa riga e colonna.`]);
    if (fresh("mirror")) out.push([kindCell(core.MIRROR_A, core.MIRROR_B), "Uno <b>specchio</b>: devia il raggio di 90°, da entrambi i lati."]);
    if (fresh("glass")) out.push([kindCell(core.GLASS), "Un <b>vetro</b>: lascia passare solo i colori che contiene."]);
    if (fresh("prism")) out.push([kindCell(core.PRISM), "Un <b>prisma</b>: il verde prosegue, il rosso gira a sinistra, il blu a destra."]);
    if (fresh("veil")) out.push([cellWhere((i) => b.veil[i]), "Casella <b>velata</b>: il colore richiesto è nascosto, va bene qualsiasi."]);
    if (fresh("fixed")) out.push([cells[[...b.fixed.keys()][0]], "Un <b>faro</b>: sorgente già accesa, non si sposta e non si toglie."]);
    if (fresh("void")) out.push([kindCell(core.VOID) ? boardEl : null, "Questa griglia ha dei <b>buchi</b>: dove mancano le caselle la luce si ferma."]);
    return out.filter(([el]) => el);
  }
  function runIntro(list, k = 0) {
    if (!game || k >= list.length) return;
    const last = k === list.length - 1;
    Coach.show(list[k][0], list[k][1], { button: last ? "Ho capito" : "Avanti", onNext: () => runIntro(list, k + 1) });
  }
  function startIntro() {
    if (!game || game.won || coachState.intro.has(game.idx)) return;
    const list = introsFor(game.idx);
    if (!list.length) return;
    coachState.intro.add(game.idx);
    saveCoach();
    runIntro(list);
  }
  // Dopo ogni mossa, nei primi livelli: l'errore indicato sulla casella che lo mostra.
  function coachMove() {
    if (!game || game.won || game.idx >= GUIDED) return;
    const left = game.types.reduce((a, m) => a + remaining(m), 0);
    const fb = Coach.feedback(game.b, game.lamps, game.view.lit, left);
    if (!fb || fb.kind === "ok") { Coach.clear(); return; }
    game.mistakes = (game.mistakes || 0) + 1;
    const extra = game.mistakes >= 3 ? " Se sei bloccato, prova <b>Suggerimento</b> qui sotto." : "";
    Coach.show(game.view.cells[fb.cell], fb.html + extra);
  }

  // ---------- Navigazione (con l'hash, così il tasto indietro del telefono funziona) ----------
  const screens = { menu: $("screen-menu"), levels: $("screen-levels"), game: $("screen-game"), guide: $("screen-guide"), shop: $("screen-shop"), tutorial: $("screen-tutorial") };
  function show(name) {
    for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
    if (name === "guide") window.PrismaGuide.start($("guide-body"));
    else window.PrismaGuide.stop();
    if (name !== "tutorial") window.PrismaTutorial.stop();
    Coach.clear();
    window.scrollTo(0, 0);
  }
  function go(hash, replace) {
    if (location.hash === hash || (!location.hash && hash === "#")) return route();
    if (replace) { history.replaceState(null, "", hash === "#" ? location.pathname + location.search : hash); route(); }
    else location.hash = hash;
  }
  function route() {
    closeDialogs();
    const h = location.hash;
    const m = /^#l(\d+)$/.exec(h);
    if (m) {
      const i = Number(m[1]) - 1;
      if (i >= 0 && i < levels.length && unlocked(i)) { show("game"); startLevel(i); fitBoard(); return; }
      history.replaceState(null, "", "#livelli");
    }
    if (location.hash === "#livelli") { show("levels"); renderLevels(); return; }
    if (location.hash === "#guida") { show("guide"); return; }
    if (location.hash === "#tutorial") {
      $("tut-start").textContent = newPlayer() ? "Inizia il livello 1" : "Torna al menu";
      show("tutorial");
      window.PrismaTutorial.start(tutorialDone);
      return;
    }
    if (location.hash === "#negozio") { renderShop(); show("shop"); return; }
    renderMenu();
    show("menu");
  }
  window.addEventListener("hashchange", route);
  document.querySelectorAll("[data-go]").forEach((b) =>
    b.addEventListener("click", () => go(b.dataset.go === "menu" ? "#" : "#livelli")));

  // ---------- Menu ----------
  function renderMenu() {
    const n = progress.solved.size;
    const next = resumeLevel();
    $("btn-play").textContent = next < 0 ? "Rigioca" : n || progress.draft ? `Continua · livello ${next + 1}` : "Gioca";
    $("menu-progress").textContent = n ? `${n} di ${levels.length} livelli risolti` : `${levels.length} livelli, ${chapters.length} capitoli`;
    const w = Shop.snapshot();
    $("menu-hints").textContent = `Suggerimenti usati in tutto: ${w.used}` + (w.paid ? ` · ne restano ${w.balance}` : "");
  }
  Shop.onChange(() => { if (!screens.menu.hidden) renderMenu(); if (!screens.shop.hidden) renderShop(); renderHintButton(); });
  $("btn-play").addEventListener("click", () => {
    // Prima partita in assoluto: si passa dal tutorial (che si può saltare).
    if (!coachState.tutorial && progress.solved.size === 0 && !progress.draft) return go("#tutorial");
    const next = resumeLevel();
    go(next < 0 ? "#livelli" : `#l${next + 1}`);
  });
  $("btn-tutorial").addEventListener("click", () => go("#tutorial"));
  $("btn-guide-tutorial").addEventListener("click", () => go("#tutorial"));
  // Fine del tutorial (completato o saltato). Chi non ha ancora giocato va al livello 1;
  // chi l'ha riaperto dal menu per ripassare torna al menu.
  const newPlayer = () => progress.solved.size === 0 && !progress.draft;
  function tutorialDone(completed) {
    coachState.tutorial = completed ? "fatto" : (coachState.tutorial || "saltato");
    saveCoach();
    go(newPlayer() ? "#l1" : "#", true);
  }
  $("btn-levels").addEventListener("click", () => go("#livelli"));
  $("btn-guide").addEventListener("click", () => go("#guida"));
  $("btn-shop").addEventListener("click", () => go("#negozio"));

  // ---------- Elenco livelli ----------
  const DONE_COLORS = ["var(--r)", "var(--b)", "var(--g)", "var(--y)", "var(--w)", "var(--m)"];
  function renderLevels() {
    const list = $("level-list");
    const blocks = [];
    let focus = null;
    const next = firstUnsolved();
    chapters.forEach((name, ci) => {
      const sec = document.createElement("section");
      sec.className = "chapter";
      const h = document.createElement("h3");
      h.textContent = `${ci + 1} · ${name}`;
      const grid = document.createElement("div");
      grid.className = "grid";
      levels.forEach((l, i) => {
        if (l.chapter !== ci) return;
        const b = document.createElement("button");
        b.className = "lvl";
        b.textContent = i + 1;
        const done = progress.solved.has(i);
        if (done) { b.classList.add("done"); b.style.setProperty("--sw", DONE_COLORS[ci % DONE_COLORS.length]); }
        if (i === next) { b.classList.add("next"); focus = sec; }
        b.disabled = !unlocked(i);
        b.setAttribute("aria-label", `Livello ${i + 1}${done ? ", risolto" : b.disabled ? ", bloccato" : ""}`);
        b.addEventListener("click", () => go(`#l${i + 1}`));
        grid.append(b);
      });
      sec.append(h, grid);
      blocks.push(sec);
    });
    list.replaceChildren(...blocks);
    // Si parte dal capitolo del prossimo livello da giocare.
    const target = focus || blocks[blocks.length - 1];
    list.scrollTop = Math.max(0, target.offsetTop - list.offsetTop - 8);
  }

  // ---------- Partita ----------
  const boardEl = $("board");
  const paletteEl = $("palette");
  let game = null; // { idx, b, view, lamps: Map, history, sel, types, won, sol, hintsUsed }

  function startLevel(idx) {
    if (game && game.idx === idx && !game.won) return; // già aperto (es. ritorno dalla legenda)
    clearTimeout(game && game.winTimer);
    const level = levels[idx];
    const b = core.parse(level);
    const lamps = new Map();
    // Riprende la bozza solo se è di questo livello e ancora coerente con le sorgenti disponibili.
    if (progress.draft && progress.draft.level === idx && !progress.solved.has(idx)) {
      const used = new Array(8).fill(0);
      for (const pair of progress.draft.lamps) {
        const [p, m] = Array.isArray(pair) ? pair : [];
        if (!Number.isInteger(p) || !Number.isInteger(m) || p < 0 || p >= b.n || b.wall[p] || b.fixed.has(p) || m < 1 || m > 7) continue;
        if (lamps.has(p) || used[m] >= b.inv[m]) continue;
        used[m]++;
        lamps.set(p, m);
      }
    }
    const types = core.LAMP_ORDER.filter((m) => b.inv[m] > 0);
    const view = R.build(boardEl, b, true);
    game = { idx, b, view, lamps, history: [], sel: types[0], types, won: false, sol: null, hintsUsed: 0 };
    progress.last = idx;
    save();

    $("game-level").textContent = `Livello ${idx + 1}`;
    $("game-chapter").textContent = `${chapters[level.chapter]} · ${idx + 1}/${levels.length}`;
    setHint(hintFor(idx));
    pickNextType();
    renderPalette();
    renderHintButton();
    R.update(view, lamps, null);
    // Presentazioni dopo che la griglia ha preso le sue misure.
    setTimeout(startIntro, 120);
  }

  const remaining = (m) => {
    let used = 0;
    for (const v of game.lamps.values()) if (v === m) used++;
    return game.b.inv[m] - used;
  };
  const pickNextType = () => {
    if (remaining(game.sel) > 0) return;
    const alt = game.types.find((m) => remaining(m) > 0);
    if (alt) game.sel = alt;
  };

  function renderPalette() {
    paletteEl.textContent = "";
    game.types.forEach((m, k) => {
      const b = document.createElement("button");
      b.className = "chip" + (m === game.sel ? " sel" : "");
      b.dataset.m = m;
      b.style.setProperty("--l", FILL[m]);
      const left = remaining(m);
      b.disabled = left <= 0 || game.won;
      b.setAttribute("aria-pressed", String(m === game.sel));
      b.setAttribute("aria-label", `Sorgente ${LAMP_NAMES[m]}, ${left} rimast${left === 1 ? "a" : "e"}`);
      b.title = `Sorgente ${LAMP_NAMES[m]} (${k + 1})`;
      const i = document.createElement("i");
      const n = document.createElement("b");
      n.textContent = `×${left}`;
      b.append(i, n);
      b.addEventListener("click", () => select(m));
      paletteEl.append(b);
    });
  }
  function select(m) {
    if (!game || game.won || remaining(m) <= 0) return;
    game.sel = m;
    renderPalette();
  }

  function commit(origin) {
    clearHintMarks();
    setHint(hintFor(game.idx));
    progress.draft = { level: game.idx, lamps: [...game.lamps] };
    save();
    pickNextType();
    renderPalette();
    R.update(game.view, game.lamps, origin);
    if (core.isSolved(game.b, game.view.lit)) win();
    else coachMove();
  }

  boardEl.addEventListener("click", (e) => {
    const c = e.target.closest(".cell");
    if (!c || !game || game.won || c.dataset.i == null) return;
    const p = Number(c.dataset.i);
    if (game.b.fixed.has(p)) { nudge(c); flashHint("Questo è un faro: è fisso, non si può togliere."); return; }
    if (game.lamps.has(p)) {
      const m = game.lamps.get(p);
      game.lamps.delete(p);
      game.history.push({ op: "del", p, m });
      buzz(6);
      game.sel = m; // chi toglie una sorgente di solito vuole rimetterla altrove
    } else {
      if (remaining(game.sel) <= 0) { nudge(paletteEl); return; }
      game.lamps.set(p, game.sel);
      game.history.push({ op: "add", p, m: game.sel });
      buzz(12);
    }
    commit(p);
  });

  function undo() {
    if (!game || game.won) return;
    const h = game.history.pop();
    if (!h) { nudge($("btn-undo")); return; }
    if (h.op === "add") game.lamps.delete(h.p);
    else if (h.op === "del") { game.lamps.set(h.p, h.m); game.sel = h.m; }
    else if (h.op === "reset") game.lamps = new Map(h.lamps);
    commit(h.op === "reset" ? null : h.p);
  }
  function reset() {
    if (!game || game.won || game.lamps.size === 0) return;
    game.history.push({ op: "reset", lamps: [...game.lamps] });
    game.lamps.clear();
    game.sel = game.types[0];
    commit(null);
  }
  // Sulla griglia la pressione lunga non deve aprire menu o selezioni.
  boardEl.addEventListener("contextmenu", (e) => e.preventDefault());
  $("btn-undo").addEventListener("click", undo);
  $("btn-reset").addEventListener("click", reset);

  // Riga dei messaggi sopra la griglia: suggerimento del livello, avvisi brevi, spiegazione dell'aiuto.
  let hintTimer = 0;
  function setHint(text) {
    clearTimeout(hintTimer);
    $("hint").textContent = text;
  }
  function flashHint(text) {
    setHint(text);
    hintTimer = setTimeout(() => { if (game) $("hint").textContent = hintFor(game.idx); }, 2600);
  }

  function nudge(el) {
    buzz(30);
    el.classList.remove("shake");
    void el.offsetWidth; // riavvia l'animazione
    el.classList.add("shake");
  }

  // ---------- Suggerimento ----------
  function renderHintButton() {
    const btn = $("btn-hint");
    const w = Shop.snapshot();
    $("hint-count").textContent = w.paid ? String(w.balance) : "";
    $("hint-count").hidden = !w.paid;
    btn.disabled = !game || game.won;
  }
  function clearHintMarks() {
    if (!game) return;
    for (const c of game.view.cells) c.classList.remove("hint-here", "hint-why", "hint-remove");
  }
  function useHint() {
    if (!game || game.won) return;
    Coach.clear();
    // Stessa griglia dell'ultimo suggerimento: lo si rimostra senza contarlo (né farlo pagare) di nuovo.
    const key = [...game.lamps].sort((a, b) => a[0] - b[0]).join(";");
    if (game.lastHint && game.lastHint.key === key) { showHint(game.lastHint.h); return; }
    if (!Shop.canUseHint()) {
      setHint("Hai finito i suggerimenti: ne trovi altri nel negozio.");
      nudge($("btn-hint"));
      return;
    }
    if (!game.sol) game.sol = core.solve(game.b, null, 1).solutions[0] || null;
    const h = core.hint(game.b, game.lamps, game.sol);
    if (!h) return;
    // Il suggerimento si conta solo quando viene mostrato davvero.
    if (!Shop.consumeHint()) return;
    game.hintsUsed++;
    game.lastHint = { key, h };
    showHint(h);
    buzz(10);
  }
  function showHint(h) {
    clearHintMarks();
    const cells = game.view.cells;
    if (h.op === "remove") {
      cells[h.p].classList.add("hint-remove");
      setHint(`Suggerimento: la sorgente ${LAMP_NAMES[h.m]} evidenziata è nel posto sbagliato. Toglila.`);
    } else {
      game.sel = h.m;
      renderPalette();
      cells[h.p].style.setProperty("--hl", FILL[h.m]);
      cells[h.p].classList.add("hint-here");
      if (h.why != null && h.why !== h.p) cells[h.why].classList.add("hint-why");
      setHint(h.why != null && h.why !== h.p
        ? `Suggerimento: una sorgente ${LAMP_NAMES[h.m]} nella casella che pulsa. È l'unico modo di dare alla casella tratteggiata il colore che le manca.`
        : `Suggerimento: una sorgente ${LAMP_NAMES[h.m]} nella casella che pulsa.`);
    }
  }
  $("btn-hint").addEventListener("click", useHint);

  function win() {
    Coach.clear();
    game.won = true;
    progress.solved.add(game.idx);
    progress.draft = null;
    save();
    const { b, view } = game;
    // Onda di festa che parte dall'angolo in alto a sinistra.
    for (let i = 0; i < b.n; i++) view.cells[i].style.setProperty("--wdelay", `${((i % b.w) + ((i / b.w) | 0)) * 40 + 250}ms`);
    boardEl.classList.add("won");
    buzz([18, 60, 18, 60, 40]);
    renderPalette();
    renderHintButton();

    const idx = game.idx;
    const ch = levels[idx].chapter;
    const last = idx === levels.length - 1;
    const allDone = progress.solved.size === levels.length;
    let text = `${chapters[ch]} · ${idx + 1} di ${levels.length}`;
    if (chapterEnd.get(ch) === idx && !last) text = `Capitolo «${chapters[ch]}» completato. Prossimo: «${chapters[ch + 1]}».`;
    if (last) text = allDone ? "Hai risolto tutte le griglie di Prisma. Nessuna scorciatoia, solo luce." : "Ultimo livello risolto. Ne restano altri indietro: li trovi nell'elenco.";
    if (game.hintsUsed) text += `${/[.!]$/.test(text) ? "" : "."} Con ${game.hintsUsed} suggeriment${game.hintsUsed === 1 ? "o" : "i"}.`;
    $("win-title").textContent = last ? "Fine" : `Livello ${idx + 1} completato`;
    $("win-text").textContent = text;
    $("btn-next").hidden = last;
    const delay = matchMedia("(prefers-reduced-motion: reduce)").matches ? 150 : 900 + (b.w + b.h) * 45;
    game.winTimer = setTimeout(() => {
      if (game && game.idx === idx && !screens.game.hidden) openDialog("dlg-win");
    }, delay);
  }
  $("btn-next").addEventListener("click", () => {
    const n = game.idx + 1;
    if (n < levels.length) go(`#l${n + 1}`, true);
  });
  $("btn-win-menu").addEventListener("click", () => go("#livelli"));

  // ---------- Legenda ----------
  let legendPager = null;
  function openLegend() {
    if (!game) return;
    if (!legendPager) legendPager = window.PrismaPager($("legend-body"), $("legend-nav"), { minCol: 300, maxCols: 2, gap: 10 });
    $("legend-title").textContent = `Legenda · livello ${game.idx + 1}`;
    openDialog("dlg-legend");
    legendPager.setItems(window.PrismaLegend.build(game.idx));
  }
  $("btn-legend").addEventListener("click", openLegend);

  // ---------- Dimensione della griglia ----------
  function fitBoard() {
    if (!game || screens.game.hidden) return;
    const wrap = $("board-wrap");
    // Su tablet le caselle possono crescere di più: sono toccate con il dito ma guardate da più lontano.
    const tablet = window.innerWidth >= 700 && window.innerHeight >= 600;
    if (wrap.clientWidth && wrap.clientHeight) R.fit(game.view, wrap.clientWidth, wrap.clientHeight, tablet ? 104 : 76);
    Coach.place();
  }
  if (window.ResizeObserver) new ResizeObserver(fitBoard).observe($("board-wrap"));
  window.addEventListener("resize", fitBoard);

  // ---------- Negozio ----------
  const REASONS = {
    "not-available": "I pagamenti non sono ancora attivi. Per ora i suggerimenti sono gratuiti e illimitati.",
    cancelled: "Acquisto annullato.",
    unverified: "Non è stato possibile confermare il pagamento: nessun addebito è stato registrato qui.",
    "unknown-package": "Pacchetto non trovato.",
    failed: "Qualcosa è andato storto. Riprova più tardi.",
  };
  function renderShop() {
    const w = Shop.snapshot();
    $("shop-balance").textContent = w.paid ? `${w.balance}` : "∞";
    $("shop-balance-note").textContent = w.paid
      ? `suggeriment${w.balance === 1 ? "o" : "i"} disponibil${w.balance === 1 ? "e" : "i"}`
      : "Per ora i suggerimenti sono gratuiti e illimitati.";
    $("shop-used").textContent = `Usati in tutto: ${w.used}`;
    const list = $("shop-list");
    if (list.childElementCount) return; // i pacchetti non cambiano: si costruiscono una volta
    const base = Shop.PACKAGES[0].cents / Shop.PACKAGES[0].hints;
    for (const pkg of Shop.PACKAGES) {
      const card = document.createElement("article");
      card.className = "pack";
      const save = Math.round((1 - pkg.cents / pkg.hints / base) * 100);
      card.innerHTML = `
        ${pkg.badge ? `<span class="pack-badge">${pkg.badge}</span>` : ""}
        <div class="pack-n"><b>${pkg.hints}</b><span>suggerimenti</span></div>
        <div class="pack-price">${Shop.price(pkg.cents)}</div>
        <div class="pack-unit muted small">${Shop.price(Math.round(pkg.cents / pkg.hints * 10) / 10)} l'uno${save > 0 ? ` · −${save}%` : ""}</div>`;
      const btn = document.createElement("button");
      btn.className = "btn primary";
      btn.textContent = "Acquista";
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        $("shop-status").textContent = "Un attimo…";
        const res = await Shop.buy(pkg.id);
        $("shop-status").textContent = res.ok ? `Fatto: +${res.hints} suggerimenti.` : REASONS[res.reason] || REASONS.failed;
        btn.disabled = false;
      });
      card.append(btn);
      list.append(card);
    }
  }

  // ---------- Finestre ----------
  function openDialog(id) {
    const d = $(id);
    d.hidden = false;
    const f = d.querySelector(".btn.primary:not([hidden])");
    if (f) f.focus({ preventScroll: true });
  }
  function closeDialogs() {
    Coach.clear();
    let closed = false;
    for (const d of document.querySelectorAll(".overlay")) if (!d.hidden) { d.hidden = true; closed = true; }
    return closed;
  }
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeDialogs));
  for (const id of ["dlg-legend", "dlg-install"]) $(id).addEventListener("click", (e) => { if (e.target === e.currentTarget) closeDialogs(); });

  // ---------- Installazione come app ----------
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let installPrompt = null;
  const installBtn = $("btn-install");
  // Android/Chrome: il browser offre il suo dialogo, lo si richiama dal pulsante.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e;
    installBtn.hidden = false;
  });
  window.addEventListener("appinstalled", () => { installPrompt = null; installBtn.hidden = true; });
  // iPhone/iPad: nessun dialogo programmabile, si mostrano i due passaggi in Safari.
  if (ios && !standalone) installBtn.hidden = false;
  installBtn.addEventListener("click", async () => {
    if (installPrompt) {
      installPrompt.prompt();
      try { await installPrompt.userChoice; } catch { /* annullato */ }
      installPrompt = null;
      installBtn.hidden = true;
    } else if (ios) openDialog("dlg-install");
  });

  // Copia offline: in locale si salta, così le modifiche si vedono subito (si forza con ?sw).
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && !/[?&]sw(=|&|$)/.test(location.search);
  if ("serviceWorker" in navigator && !local) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => { /* senza offline, pazienza */ }));
  }

  // ---------- Tastiera ----------
  document.addEventListener("keydown", (e) => {
    if (e.altKey || e.metaKey) return;
    if (e.key === "Escape") {
      if (closeDialogs()) return;
      if (!screens.game.hidden) go("#livelli");
      else if (!screens.menu.hidden) return;
      else go("#");
      return;
    }
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const dir = e.key === "ArrowRight" ? "next" : "prev";
      if (!$("dlg-legend").hidden && legendPager) return legendPager[dir]();
    }
    if (screens.game.hidden || document.querySelector(".overlay:not([hidden])")) return;
    if (e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === "r") reset();
    else if (k === "h") useHint();
    else if (k === "l") openLegend();
    else if (/^[1-7]$/.test(k) && game) {
      const m = game.types[Number(k) - 1];
      if (m) select(m);
    }
  });

  route();
})();
