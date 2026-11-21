// Prisma — tutorial interattivo. Sette passi su griglie piccole: si gioca davvero, ma guidati da un
// fumetto che indica dove toccare e spiega ogni errore. Si avanza solo facendo l'azione richiesta.
// Le griglie sono livelli veri costruiti dal motore (render.demo), ognuno con una sola soluzione.
(function () {
  "use strict";

  const core = window.PrismaCore;
  const R = window.PrismaRender;
  const Coach = window.PrismaCoach;
  const $ = (id) => document.getElementById(id);
  const S = (x, y, c) => [x, y, c];
  const EMPTY4 = ["....", "....", "....", "...."];

  // Ogni passo: titolo, testo, griglia (righe + soluzione) e un copione.
  //  enter(t): cosa succede all'inizio (fumetti, mosse obbligate);
  //  tap(t, p): gestisce il tocco sulla casella p; se non c'è, si gioca liberamente con il commento alle mosse.
  const STEPS = [
    {
      title: "Ogni casella vuole un colore",
      text: "Guarda il <b>quadratino</b> al centro delle caselle: è il colore che ognuna dovrà avere alla fine.",
      grid: [EMPTY4, [S(1, 1, "r")]],
      enter(t) {
        t.coach(t.cellAt(1, 0), "Questa casella ha il quadratino <b>rosso</b>: alla fine dovrà essere tutta rossa.", {
          button: "Avanti",
          onNext: () => t.coach(t.cellAt(3, 3), "Questa ha il quadratino <b>scuro</b>: deve restare al <b>buio</b>.", {
            button: "Avanti", onNext: () => t.next(),
          }),
        });
      },
      tap: (t) => t.wiggle(),
    },
    {
      title: "Accendi la luce",
      text: "Le caselle si colorano con le <b>sorgenti di luce</b>. Una sorgente illumina tutta la sua <b>riga</b> e tutta la sua <b>colonna</b>.",
      grid: [EMPTY4, [S(1, 1, "r")]],
      enter(t) {
        t.coach(t.chip(1), "Questa è la tua sorgente <b>rossa</b>. Il numero dice quante ne hai: una sola.", {
          button: "Avanti",
          onNext: () => t.coach(t.cellAt(1, 1), "Tocca questa casella per piazzarla.", { pulse: true }),
        });
      },
      tap(t, p) {
        if (p !== t.at(1, 1) || t.lamps.size) return t.wiggle("Tocca la casella che pulsa.", t.cellAt(1, 1));
        t.place(p, 1);
        t.success("La luce ha percorso riga e colonna: ogni casella ora è <b>piena</b> del suo colore. Livello risolto!");
      },
    },
    {
      title: "Troppa luce",
      text: "La luce non si spegne: se una sorgente è nel posto sbagliato, accende caselle che non dovrebbe.",
      grid: [EMPTY4, [S(2, 2, "r")]],
      enter(t) {
        t.coach(t.cellAt(1, 1), "Proviamo a sbagliare apposta: tocca qui.", { pulse: true });
        t.phase = "wrong";
      },
      tap(t, p) {
        if (t.phase === "wrong") {
          if (p !== t.at(1, 1)) return t.wiggle("Tocca la casella che pulsa.", t.cellAt(1, 1));
          t.place(p, 1);
          t.phase = "look";
          const bad = t.b.floor.find((i) => t.lit[i] & ~t.b.target[i]);
          t.coach(t.cells[bad], "Vedi il quadratino che <b>sporge</b>? Qui arriva luce, ma la casella vuole il buio. Succede in tutte le caselle con il quadratino gonfio.", {
            button: "Ho capito",
            onNext: () => { t.phase = "remove"; t.coach(t.cellAt(1, 1), "Tocca la sorgente per <b>toglierla</b>.", { pulse: true }); },
          });
          return;
        }
        if (t.phase === "look") return;
        if (t.phase === "remove") {
          if (p !== t.at(1, 1)) return t.wiggle("Tocca la sorgente per toglierla.", t.cellAt(1, 1));
          t.remove(p);
          t.phase = "free";
          t.text("Ora trova tu il posto giusto. Suggerimento: la sorgente va dove si <b>incrociano</b> le caselle rosse.");
          Coach.clear();
          return;
        }
        t.freeTap(p);
      },
    },
    {
      title: "I muri",
      text: "Le caselle a righe sono <b>muri</b>: fermano la luce. Hai una sorgente rossa: dove va?",
      grid: [["....", ".#..", "....", "...."], [S(3, 1, "r")]],
      enter(t) {
        t.coach(t.cellAt(1, 1), "Questo è un muro: la luce si ferma qui e non va oltre.", { button: "Ok" });
      },
    },
    {
      title: "I colori si sommano",
      text: "È luce, non tempera: <b class=\"c1\">rosso</b> + <b class=\"c4\">blu</b> = <b style=\"color:var(--m)\">magenta</b>. Dove due luci si incrociano, si sommano.",
      grid: [EMPTY4, [S(0, 1, "r"), S(2, 3, "b")]],
      enter(t) {
        const mag = t.b.floor.find((i) => t.b.target[i] === 5);
        t.coach(t.cells[mag], "Questa casella è <b>magenta</b>: deve ricevere sia la luce rossa sia quella blu.", {
          button: "Avanti",
          onNext: () => t.coach(t.chip(4), "Per cambiare sorgente, tocca il suo colore qui sotto.", { button: "Ok" }),
        });
      },
    },
    {
      title: "Ora da solo",
      text: "Tre sorgenti, tre colori. Rosso + verde = giallo, verde + blu = ciano. Se sbagli, ti dico dove.",
      grid: [[".....", ".#...", ".....", "...#.", "....."], [S(0, 2, "r"), S(2, 0, "b"), S(4, 4, "g")]],
      enter(t) {
        t.coach(t.board, "Parti dalle caselle <b>scure</b>: sulla loro riga e colonna non può stare nessuna sorgente.", { button: "Ok" });
      },
    },
    {
      title: "Sei pronto",
      text: null, // contenuto in finale(): niente griglia, solo il riepilogo
      grid: null,
    },
  ];

  let t = null; // stato del passo in corso
  let finish = null;

  function render(i) {
    Coach.clear();
    const step = STEPS[i];
    $("tut-dots").innerHTML = STEPS.map((_, k) => `<i class="${k < i ? "done" : k === i ? "now" : ""}"></i>`).join("");
    $("tut-title").textContent = step.title;
    $("tut-next").hidden = true;
    $("tut-finale").hidden = !!step.grid;
    $("tut-play").hidden = !step.grid;
    if (!step.grid) { $("tut-text").innerHTML = ""; $("tut-next").hidden = true; return; }

    const ex = R.demo(step.grid[0], step.grid[1]);
    const board = $("tut-board");
    const view = R.build(board, ex.b, true);
    const types = core.LAMP_ORDER.filter((m) => ex.b.inv[m] > 0);
    t = {
      i, step, b: ex.b, view, board, cells: view.cells, lamps: new Map(), lit: new Uint8Array(ex.b.n),
      sel: types[0], types, phase: null, solved: false,
      at: (x, y) => y * ex.b.w + x,
      cellAt: (x, y) => view.cells[y * ex.b.w + x],
      chip: (m) => document.querySelector(`#tut-palette .chip[data-m="${m}"]`),
      coach: (el, html, opts) => Coach.show(el, html, opts),
      text: (html) => { $("tut-text").innerHTML = html; },
      next: () => go(i + 1),
      left: (m) => ex.b.inv[m] - [...t.lamps.values()].filter((v) => v === m).length,
      place(p, m) { t.lamps.set(p, m); refresh(p); },
      remove(p) { t.lamps.delete(p); refresh(p); },
      wiggle(msg, el) {
        t.board.classList.remove("shake"); void t.board.offsetWidth; t.board.classList.add("shake");
        if (msg) Coach.show(el || t.board, msg, { pulse: !!el });
      },
      success(html) {
        t.solved = true;
        t.text(`<span class="tut-ok">✓</span> ${html}`);
        Coach.clear();
        $("tut-next").hidden = false;
        $("tut-next").focus({ preventScroll: true });
        palette();
      },
      freeTap: (p) => freeTap(p),
    };
    t.text(step.text);
    palette();
    R.update(view, t.lamps, null);
    fit();
    // Il primo fumetto dopo il disegno, quando le caselle hanno la loro posizione definitiva.
    setTimeout(() => { if (t && t.i === i && step.enter) step.enter(t); }, 40);
  }

  function refresh(origin) {
    t.lit = R.update(t.view, t.lamps, origin);
    palette();
  }

  function palette() {
    const el = $("tut-palette");
    el.textContent = "";
    for (const m of t.types) {
      const b = document.createElement("button");
      b.className = "chip" + (m === t.sel ? " sel" : "");
      b.dataset.m = m;
      b.style.setProperty("--l", R.FILL[m]);
      const left = t.left(m);
      b.disabled = left <= 0 || t.solved;
      b.setAttribute("aria-label", `Sorgente ${R.LAMP_NAMES[m]}, ${left} rimast${left === 1 ? "a" : "e"}`);
      b.innerHTML = `<i></i><b>×${left}</b>`;
      b.addEventListener("click", () => { if (t.left(m) > 0) { t.sel = m; palette(); } });
      el.append(b);
    }
  }

  // Gioco libero con commento: ogni errore viene indicato sulla casella che lo mostra.
  function freeTap(p) {
    if (t.lamps.has(p)) {
      const m = t.lamps.get(p);
      t.remove(p);
      t.sel = m;
    } else {
      if (t.left(t.sel) <= 0) {
        const other = t.types.find((m) => t.left(m) > 0);
        if (!other) return t.wiggle("Hai usato tutte le sorgenti. Tocca una sorgente sulla griglia per toglierla e spostarla.");
        t.sel = other;
      }
      t.place(p, t.sel);
    }
    if (core.isSolved(t.b, t.lit)) return t.success("Esatto! Ogni casella ha il suo colore.");
    const left = t.types.reduce((a, m) => a + t.left(m), 0);
    const fb = window.PrismaCoach.feedback(t.b, t.lamps, t.lit, left);
    if (fb && fb.kind !== "ok") Coach.show(t.cells[fb.cell], fb.html);
    else Coach.clear();
    if (t.left(t.sel) <= 0) { const other = t.types.find((m) => t.left(m) > 0); if (other) t.sel = other; }
    palette();
  }

  function onBoard(e) {
    const c = e.target.closest(".cell");
    if (!t || t.solved || !c || c.dataset.i == null) return;
    const p = Number(c.dataset.i);
    if (Coach.active() && document.querySelector(".coach .coach-btn")) return; // prima si legge il fumetto
    if (t.step.tap) t.step.tap(t, p); else freeTap(p);
  }

  function fit() {
    if (!t) return;
    const wrap = $("tut-wrap");
    const W = wrap.clientWidth, H = wrap.clientHeight;
    if (W && H) R.fit(t.view, W, H, window.innerWidth >= 700 && window.innerHeight >= 600 ? 96 : 72);
    Coach.place();
  }

  function go(i) {
    if (i >= STEPS.length) return;
    render(i);
  }

  let wired = false;
  function wire() {
    if (wired) return;
    wired = true;
    $("tut-board").addEventListener("click", onBoard);
    $("tut-board").addEventListener("contextmenu", (e) => e.preventDefault());
    $("tut-next").addEventListener("click", () => t && go(t.i + 1));
    $("tut-skip").addEventListener("click", () => end(false));
    $("tut-start").addEventListener("click", () => end(true));
    if (window.ResizeObserver) new ResizeObserver(fit).observe($("tut-wrap"));
  }

  function end(completed) {
    stop();
    if (finish) finish(completed);
  }

  // onFinish(completato): chiamata alla fine o quando si salta.
  function start(onFinish) {
    finish = onFinish;
    wire();
    go(0);
  }
  function stop() {
    Coach.clear();
    t = null;
  }

  window.PrismaTutorial = { start, stop, STEPS };
})();
