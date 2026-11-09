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
  const Daily = window.PrismaDaily;
  const Stats = window.PrismaStats;
  Daily.attachStorage(store);
  Stats.attachStorage(store, Daily.today());

  // Prima e ultima posizione di ogni capitolo, per i suggerimenti e i messaggi di fine capitolo.
  const chapterStart = new Map();
  const chapterEnd = new Map();
  levels.forEach((l, i) => {
    if (!chapterStart.has(l.chapter)) chapterStart.set(l.chapter, i);
    chapterEnd.set(l.chapter, i);
  });

  const CHAPTER_HINTS = [
    null,
    "Nuovo colore: il blu. Dove rosso e blu si incrociano la luce diventa magenta.",
    "Arriva il verde. Rosso + verde = giallo, verde + blu = ciano, tutti e tre = bianco.",
    "Sorgenti composte: la gialla emette rosso e verde insieme, la magenta rosso e blu, la ciano verde e blu.",
    "La sorgente bianca accende tutti e tre i colori: potente, e proprio per questo pericolosa.",
    "Griglie grandi e molte sorgenti.",
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

  // ---------- Tutorial (l'unico posto con fumetti e spiegazioni: nei livelli non si danno aiuti) ----------
  const Coach = window.PrismaCoach;
  const COACH_KEY = "prisma.coach.v1";
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
  // ---------- Navigazione (con l'hash, così il tasto indietro del telefono funziona) ----------
  const screens = { menu: $("screen-menu"), levels: $("screen-levels"), game: $("screen-game"), guide: $("screen-guide"), shop: $("screen-shop"), tutorial: $("screen-tutorial"), daily: $("screen-daily"), stats: $("screen-stats") };
  function show(name) {
    clockStop();
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
    const dm = /^#m(\d+)$/.exec(h);
    if (dm) {
      const i = Number(dm[1]) - 1, date = Daily.today();
      const level = Daily.get(date, i);
      if (i >= 0 && i < Daily.COUNT && level && dailyUnlocked(date, i)) { show("game"); startDaily(date, i, level); fitBoard(); return; }
      history.replaceState(null, "", "#missione");
    }
    if (location.hash === "#missione") { show("daily"); renderDaily(); return; }
    if (location.hash === "#statistiche") { show("stats"); renderStats(); return; }
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
    const date = Daily.today();
    const done = dailySolved(date).length;
    const st = Stats.summary(date, Daily.COUNT, Daily.dayBefore).streak;
    $("daily-btn-state").textContent = done >= Daily.COUNT ? `Completata${st.current > 1 ? ` · serie di ${st.current} giorni` : ""}`
      : done ? `${done} di ${Daily.COUNT} oggi` : "Nuova oggi";
    $("btn-daily").classList.toggle("complete", done >= Daily.COUNT);
    shownDate = date;
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
  $("btn-daily").addEventListener("click", () => go("#missione"));
  $("btn-stats").addEventListener("click", () => go("#statistiche"));

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
  // mode "camp" (campagna, idx = indice del livello) o "daily" (missione: date, di = 0..9)
  let game = null; // { mode, idx, date, di, b, view, lamps: Map, history, sel, types, won, sol, hintsUsed, ms }

  function startLevel(idx) {
    if (game && game.mode === "camp" && game.idx === idx && !game.won) { clockRun(); return; } // già aperto (es. ritorno dalla legenda)
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
    game = { mode: "camp", idx, b, view, lamps, history: [], sel: types[0], types, won: false, sol: null, hintsUsed: 0, ms: 0 };
    progress.last = idx;
    save();

    $("game-level").textContent = `Livello ${idx + 1}`;
    $("game-chapter").textContent = `${chapters[level.chapter]} · ${idx + 1}/${levels.length}`;
    $("btn-game-back").setAttribute("aria-label", "Torna ai livelli");
    setHint(hintFor(idx));
    clockRun();
    pickNextType();
    renderPalette();
    renderHintButton();
    R.update(view, lamps, null);
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

  // Testo fisso della riga sopra la griglia per il livello aperto.
  const levelHint = () => (game.mode === "daily" ? dailyHint(game.date) : hintFor(game.idx));

  function commit(origin) {
    clearHintMarks();
    setHint(levelHint());
    if (game.mode === "daily") Stats.setDraft(game.date, { i: game.di, lamps: [...game.lamps] });
    else { progress.draft = { level: game.idx, lamps: [...game.lamps] }; save(); }
    pickNextType();
    renderPalette();
    R.update(game.view, game.lamps, origin);
    if (core.isSolved(game.b, game.view.lit)) win();
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
      Stats.move("del");
      buzz(6);
      game.sel = m; // chi toglie una sorgente di solito vuole rimetterla altrove
    } else {
      if (remaining(game.sel) <= 0) { nudge(paletteEl); return; }
      game.lamps.set(p, game.sel);
      game.history.push({ op: "add", p, m: game.sel });
      Stats.move("add");
      buzz(12);
    }
    commit(p);
  });

  function undo() {
    if (!game || game.won) return;
    const h = game.history.pop();
    if (!h) { nudge($("btn-undo")); return; }
    Stats.move("undo");
    if (h.op === "add") game.lamps.delete(h.p);
    else if (h.op === "del") { game.lamps.set(h.p, h.m); game.sel = h.m; }
    else if (h.op === "reset") game.lamps = new Map(h.lamps);
    commit(h.op === "reset" ? null : h.p);
  }
  function reset() {
    if (!game || game.won || game.lamps.size === 0) return;
    game.history.push({ op: "reset", lamps: [...game.lamps] });
    Stats.move("reset");
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
    hintTimer = setTimeout(() => { if (game) $("hint").textContent = levelHint(); }, 2600);
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
    Stats.hint(game.mode, game.date);
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
    clockStop();
    game.won = true;
    if (game.mode === "daily") return winDaily();
    Stats.solvedCamp(!progress.solved.has(game.idx), game.hintsUsed);
    progress.solved.add(game.idx);
    progress.draft = null;
    save();
    celebrate();
    finishWin();
  }
  function celebrate() {
    const { b, view } = game;
    // Onda di festa che parte dall'angolo in alto a sinistra.
    for (let i = 0; i < b.n; i++) view.cells[i].style.setProperty("--wdelay", `${((i % b.w) + ((i / b.w) | 0)) * 40 + 250}ms`);
    boardEl.classList.add("won");
    buzz([18, 60, 18, 60, 40]);
    renderPalette();
    renderHintButton();
  }
  function finishWin() {
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
    $("btn-next").textContent = "Avanti";
    $("btn-win-menu").textContent = "Livelli";
    openWinLater();
  }
  function openWinLater() {
    const g = game;
    const delay = matchMedia("(prefers-reduced-motion: reduce)").matches ? 150 : 900 + (g.b.w + g.b.h) * 45;
    g.winTimer = setTimeout(() => {
      if (game === g && !screens.game.hidden) openDialog("dlg-win");
    }, delay);
  }
  $("btn-next").addEventListener("click", () => {
    if (game.mode === "daily") {
      if (game.missionDone) return go("#statistiche", true);
      return go(`#m${game.di + 2}`, true);
    }
    const n = game.idx + 1;
    if (n < levels.length) go(`#l${n + 1}`, true);
  });
  $("btn-win-menu").addEventListener("click", () => go(game && game.mode === "daily" ? "#missione" : "#livelli"));
  $("btn-game-back").addEventListener("click", () => go(game && game.mode === "daily" ? "#missione" : "#livelli"));

  // ---------- Tempo di gioco ----------
  // Conta solo mentre la griglia è davvero davanti al giocatore: schermata di gioco, app in primo piano.
  let clockStart = 0;
  function clockRun() {
    if (clockStart || !game || game.won || screens.game.hidden || document.visibilityState !== "visible") return;
    clockStart = performance.now();
  }
  function clockStop() {
    if (!clockStart || !game) { clockStart = 0; return; }
    const ms = Math.min(performance.now() - clockStart, 6 * 3600e3);
    clockStart = 0;
    game.ms += ms;
    Stats.addTime(game.mode, ms, game.date, game.di);
    Stats.save();
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") clockRun(); else clockStop(); });
  // Ogni tanto si salva, così chiudere l'app di colpo perde al massimo pochi secondi.
  setInterval(() => { if (clockStart) { clockStop(); clockRun(); } }, 15000);
  const fmtTime = (ms) => {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min ${String(s % 60).padStart(2, "0")} s`;
    return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
  };

  // ---------- Missione giornaliera ----------
  let shownDate = null;
  const dailySolved = (date) => (Stats.dayInfo(date) || { solved: [] }).solved;
  const dailyUnlocked = (date, i) => i === 0 || dailySolved(date).includes(i) || dailySolved(date).includes(i - 1);
  const nextDaily = (date) => { for (let i = 0; i < Daily.COUNT; i++) if (!dailySolved(date).includes(i)) return i; return -1; };
  const modNames = (m) => [Daily.PALETTES[m.palette].name, ...m.mods.map((k) => Daily.MODS[k].name)];
  function dailyHint(date) {
    const m = Daily.modifiers(date);
    return "Oggi: " + m.mods.map((k) => `${Daily.MODS[k].name.toLowerCase()} (${Daily.MODS[k].desc})`).join(", ") + `; ${Daily.PALETTES[m.palette].desc}.`;
  }

  function startDaily(date, i, level) {
    if (game && game.mode === "daily" && game.date === date && game.di === i && !game.won) { clockRun(); return; }
    clearTimeout(game && game.winTimer);
    const b = core.parse(level);
    const lamps = new Map();
    const info = Stats.dayInfo(date);
    const draft = info && info.draft;
    if (draft && draft.i === i && !dailySolved(date).includes(i)) {
      const used = new Array(8).fill(0);
      for (const pair of draft.lamps) {
        const [p, m] = Array.isArray(pair) ? pair : [];
        if (!Number.isInteger(p) || !Number.isInteger(m) || p < 0 || p >= b.n || b.wall[p] || b.fixed.has(p) || m < 1 || m > 7) continue;
        if (lamps.has(p) || used[m] >= b.inv[m]) continue;
        used[m]++;
        lamps.set(p, m);
      }
    }
    const types = core.LAMP_ORDER.filter((m) => b.inv[m] > 0);
    const view = R.build(boardEl, b, true);
    game = { mode: "daily", idx: -1, date, di: i, level, b, view, lamps, history: [], sel: types[0], types, won: false, sol: null, hintsUsed: 0, ms: 0 };
    $("game-level").textContent = `Missione · ${i + 1} di ${Daily.COUNT}`;
    $("game-chapter").textContent = modNames(Daily.modifiers(date)).join(" · ");
    $("btn-game-back").setAttribute("aria-label", "Torna alla missione");
    setHint(dailyHint(date));
    pickNextType();
    renderPalette();
    renderHintButton();
    R.update(view, lamps, null);
    clockRun();
  }

  function winDaily() {
    const { date, di } = game;
    const complete = Stats.solvedDaily(date, di, game.hintsUsed, Daily.COUNT);
    game.missionDone = complete;
    celebrate();
    const info = Stats.dayInfo(date);
    const last = dailySolved(date).length >= Daily.COUNT;
    let text = `Livello risolto in ${fmtTime(info.ms[di] || game.ms)}.`;
    if (game.hintsUsed) text += ` Con ${game.hintsUsed} suggeriment${game.hintsUsed === 1 ? "o" : "i"}.`;
    if (complete) {
      const sum = Stats.summary(date, Daily.COUNT, Daily.dayBefore);
      const total = Object.values(info.ms).reduce((a, v) => a + v, 0);
      text = `Tutti e ${Daily.COUNT} i livelli di oggi, in ${fmtTime(total)}.` +
        (sum.streak.current > 1 ? ` Serie: ${sum.streak.current} giorni di fila.` : "") + " Domani ne arrivano dieci nuovi.";
    }
    $("win-title").textContent = complete ? "Missione completata" : `Missione · livello ${di + 1} completato`;
    $("win-text").textContent = text;
    // Avanti: il livello successivo della missione (se è pronto) o, a missione finita, le statistiche.
    const nextReady = di + 1 < Daily.COUNT && Daily.get(date, di + 1);
    $("btn-next").hidden = !complete && (last || !nextReady || date !== Daily.today());
    $("btn-next").textContent = complete ? "Statistiche" : "Avanti";
    $("btn-win-menu").textContent = "Missione";
    openWinLater();
  }

  const WEEKDAY = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long" });
  function modChip(icon, name, desc) {
    const el = document.createElement("div");
    el.className = "mod";
    const ic = document.createElement("span");
    ic.className = "mod-ic";
    if (icon) ic.append(icon);
    const tx = document.createElement("div");
    const b = document.createElement("b");
    b.textContent = name;
    const d = document.createElement("span");
    d.className = "muted small";
    d.textContent = desc;
    tx.append(b, d);
    el.append(ic, tx);
    return el;
  }
  const MOD_ICON = { specchi: () => R.mini("mirror-a"), vetri: () => R.mini("glass", 3), prismi: () => R.mini("prism"), veli: () => R.mini("veil"), fari: () => R.mini("fixed", 7), forme: shapeIcon, labirinto: () => R.mini("wall") };
  // Tavolozza: tre campioni dei colori del giorno.
  const PAL_ICON = { primari: [1, 2, 4], miscele: [3, 5, 6], tutti: [1, 6, 7] };
  function paletteIcon(key) {
    const box = document.createElement("span");
    box.className = "mod-swatches";
    for (const m of PAL_ICON[key]) box.append(R.mini("swatch", m));
    return box;
  }
  // Forme: una griglia a diamante in miniatura.
  function shapeIcon() {
    const box = document.createElement("span");
    box.className = "mod-shape";
    for (const on of [0, 1, 0, 1, 1, 1, 0, 1, 0]) box.append(document.createElement(on ? "b" : "i"));
    return box;
  }

  function renderDaily() {
    const date = Daily.today();
    shownDate = date;
    Daily.ensure(date);
    const m = Daily.modifiers(date);
    const label = WEEKDAY.format(new Date());
    $("daily-date").textContent = label[0].toUpperCase() + label.slice(1);
    $("daily-mods").replaceChildren(
      modChip(paletteIcon(m.palette), Daily.PALETTES[m.palette].name, Daily.PALETTES[m.palette].desc),
      ...m.mods.map((k) => modChip(MOD_ICON[k](), Daily.MODS[k].name, Daily.MODS[k].desc)));
    const solved = dailySolved(date);
    const next = nextDaily(date);
    const grid = $("daily-grid");
    grid.textContent = "";
    for (let i = 0; i < Daily.COUNT; i++) {
      const b = document.createElement("button");
      b.className = "lvl";
      b.textContent = i + 1;
      const ready = !!Daily.get(date, i);
      const done = solved.includes(i);
      if (done) { b.classList.add("done"); b.style.setProperty("--sw", DONE_COLORS[i % DONE_COLORS.length]); }
      else if (!ready) b.classList.add("loading");
      if (i === next) b.classList.add("next");
      b.disabled = !ready || !dailyUnlocked(date, i);
      b.setAttribute("aria-label", `Livello ${i + 1} della missione${done ? ", risolto" : !ready ? ", in preparazione" : b.disabled ? ", bloccato" : ""}`);
      b.addEventListener("click", () => go(`#m${i + 1}`));
      grid.append(b);
    }
    const ready = Daily.readyCount(date);
    const play = $("btn-daily-play");
    if (next < 0) {
      $("daily-status").textContent = "Missione di oggi completata. Domani dieci livelli nuovi, con altri modificatori.";
      play.textContent = "Statistiche";
      play.disabled = false;
    } else {
      $("daily-status").textContent = ready < Daily.COUNT ? `Preparo i livelli di oggi… ${ready} di ${Daily.COUNT}` : "Dieci livelli, dal più facile al più difficile. Si sbloccano uno dopo l'altro.";
      const r = !!Daily.get(date, next);
      play.textContent = !r ? "Preparo il livello…" : solved.length ? `Continua · livello ${next + 1}` : "Inizia la missione";
      play.disabled = !r;
    }
    const st = Stats.summary(date, Daily.COUNT, Daily.dayBefore).streak;
    $("daily-streak").textContent = st.current ? `Serie: ${st.current} ${st.current === 1 ? "giorno" : "giorni"} di fila` + (st.best > st.current ? ` · record ${st.best}` : "")
      : st.best ? `Record: ${st.best} ${st.best === 1 ? "giorno" : "giorni"} di fila` : "Completa la missione ogni giorno per fare una serie.";
    renderCountdown();
  }
  function renderCountdown() {
    const ms = Daily.untilMidnight();
    const h = Math.floor(ms / 3600e3), mi = Math.floor((ms % 3600e3) / 60e3);
    $("daily-next").textContent = `Nuova missione tra ${h ? `${h} h ` : ""}${mi} min`;
  }
  $("btn-daily-play").addEventListener("click", () => {
    const next = nextDaily(Daily.today());
    go(next < 0 ? "#statistiche" : `#m${next + 1}`);
  });
  Daily.onReady((date) => {
    if (date !== Daily.today()) return;
    if (!screens.daily.hidden) renderDaily();
    if (!screens.menu.hidden) renderMenu();
    // Fine partita in attesa del livello successivo: il pulsante Avanti compare appena è pronto.
    if (game && game.mode === "daily" && game.won && !game.missionDone && Daily.get(date, game.di + 1)) $("btn-next").hidden = false;
  });
  // Mezzanotte: missione nuova anche con l'app aperta (si controlla ogni 30 secondi).
  setInterval(() => {
    if (!screens.daily.hidden) { if (Daily.today() !== shownDate) renderDaily(); else renderCountdown(); }
    if (!screens.menu.hidden && Daily.today() !== shownDate) renderMenu();
  }, 30000);
  // I livelli di oggi si preparano subito, in sottofondo.
  Daily.ensure(Daily.today());

  // ---------- Statistiche ----------
  function renderStats() {
    const date = Daily.today();
    const S = Stats.summary(date, Daily.COUNT, Daily.dayBefore);
    const w = Shop.snapshot();
    const chaptersDone = chapters.filter((_, ci) => {
      for (let i = chapterStart.get(ci); i <= chapterEnd.get(ci); i++) if (!progress.solved.has(i)) return false;
      return true;
    }).length;
    const card = (title, rows, extra) => {
      const c = document.createElement("section");
      c.className = "stats-card";
      const h = document.createElement("h3");
      h.textContent = title;
      const g = document.createElement("div");
      g.className = "stats-grid";
      for (const [value, label] of rows) {
        const d = document.createElement("div");
        d.className = "stat";
        const b = document.createElement("b");
        b.textContent = value;
        const sp = document.createElement("span");
        sp.textContent = label;
        d.append(b, sp);
        g.append(d);
      }
      c.append(h, g);
      if (extra) c.append(extra);
      return c;
    };
    const daily = card("Missione giornaliera", [
      [S.missions, S.missions === 1 ? "missione completata" : "missioni completate"],
      [S.dailySolved, "livelli delle missioni risolti"],
      [S.streak.current, "giorni di fila, ora"],
      [S.streak.best, "record di giorni di fila"],
      [S.daysPlayed, S.daysPlayed === 1 ? "giorno giocato" : "giorni giocati"],
      [S.fastest ? fmtTime(S.fastest) : "—", "missione più veloce"],
    ], calendar(date));
    const camp = card("Livelli", [
      [`${progress.solved.size}/${levels.length}`, "livelli risolti"],
      [`${chaptersDone}/${chapters.length}`, "capitoli completati"],
      [S.modes.camp.perfect + S.modes.daily.perfect, "risolti senza suggerimenti"],
      [fmtTime(S.modes.camp.ms + S.modes.daily.ms), "tempo di gioco"],
    ]);
    const general = card("Mosse e suggerimenti", [
      [w.used, "suggerimenti usati in tutto"],
      [S.modes.daily.hints, "di cui nelle missioni"],
      [S.moves, "sorgenti piazzate o tolte"],
      [S.undos, "mosse annullate"],
      [S.resets, "volte ricominciato"],
    ]);
    const note = document.createElement("p");
    note.className = "muted small stats-note";
    const since = new Date(`${S.since}T12:00:00`);
    note.textContent = `Tempo, mosse e livelli senza suggerimenti si contano dal ${since.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}. Tutto resta su questo dispositivo.`;
    $("stats-body").replaceChildren(daily, camp, general, note);
    $("stats-body").scrollTop = 0;
  }
  // Calendario delle ultime 5 settimane: ogni giorno è una casella, più accesa quanti più livelli risolti.
  function calendar(today) {
    const box = document.createElement("div");
    box.className = "cal";
    const head = document.createElement("div");
    head.className = "cal-row cal-head";
    for (const d of ["L", "M", "M", "G", "V", "S", "D"]) { const s = document.createElement("span"); s.textContent = d; head.append(s); }
    const grid = document.createElement("div");
    grid.className = "cal-row";
    const now = new Date();
    const dow = (now.getDay() + 6) % 7; // lunedì = 0
    for (let k = 0; k < 35; k++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow - 28 + k, 12);
      const key = Daily.today(d);
      const n = dailySolved(key).length;
      const c = document.createElement("i");
      if (key > today) c.className = "future";
      else if (n >= Daily.COUNT) c.className = "full";
      else if (n) { c.className = "part"; c.style.setProperty("--k", (0.25 + (0.5 * n) / Daily.COUNT).toFixed(2)); }
      if (key === today) c.classList.add("today");
      c.title = `${d.toLocaleDateString("it-IT", { day: "numeric", month: "long" })}: ${n} di ${Daily.COUNT}`;
      grid.append(c);
    }
    const legend = document.createElement("p");
    legend.className = "muted small cal-legend";
    legend.textContent = "Ultime cinque settimane: casella piena = missione completata.";
    box.append(head, grid, legend);
    return box;
  }

  // ---------- Legenda ----------
  let legendPager = null;
  function openLegend() {
    if (!game) return;
    if (!legendPager) legendPager = window.PrismaPager($("legend-body"), $("legend-nav"), { minCol: 300, maxCols: 2, gap: 10 });
    const daily = game.mode === "daily";
    $("legend-title").textContent = daily ? `Legenda · missione ${game.di + 1}` : `Legenda · livello ${game.idx + 1}`;
    openDialog("dlg-legend");
    legendPager.setItems(window.PrismaLegend.build(game.idx, daily ? game.level : null));
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
      if (!screens.game.hidden) go(game && game.mode === "daily" ? "#missione" : "#livelli");
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
