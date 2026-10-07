// Prisma — schermata "Come si gioca": procedimento, regole ed esempi animati. Gli esempi sono piccoli
// livelli veri, calcolati dal motore e disegnati come in partita: ciò che si vede qui è esattamente
// quello che succede giocando.
(function () {
  "use strict";

  const R = window.PrismaRender;
  const legend = window.PrismaLegend;
  const STEP_MS = 1900;

  // Ogni esempio: griglia, soluzione (che decide i colori richiesti), fotogrammi da ripetere in loop.
  // Un fotogramma: sorgenti presenti e didascalia; won: true fa partire l'onda della vittoria.
  const S = (x, y, c) => [x, y, c];
  const DEMOS = {
    hero: {
      rows: [".....", ".#...", ".....", "...#.", "....."],
      sol: [S(0, 2, "r"), S(2, 0, "b"), S(4, 4, "g")],
      frames: [
        { l: [], cap: "Ogni casella mostra, al centro, il colore che deve avere." },
        { l: [S(2, 2, "r")], cap: "Una sorgente rossa qui… ma accende caselle che vogliono altro: i quadratini sporgono." },
        { l: [], cap: "Basta toccarla di nuovo per toglierla." },
        { l: [S(0, 2, "r")], cap: "Qui invece il rosso finisce solo dove serve." },
        { l: [S(0, 2, "r"), S(2, 0, "b")], cap: "Il blu incrocia il rosso: lì la luce diventa magenta, proprio come richiesto." },
        { l: [S(0, 2, "r"), S(2, 0, "b"), S(4, 4, "g")], cap: "Ultima sorgente: ogni casella è piena del suo colore. Risolto!", won: true },
      ],
    },
    line: {
      rows: ["....", "....", "....", "...."], sol: [S(1, 1, "r")],
      frames: [
        { l: [], cap: "Quattro caselle vogliono il rosso, le altre il buio." },
        { l: [S(1, 1, "r")], cap: "La sorgente illumina tutta la riga e tutta la colonna, nelle quattro direzioni." },
      ],
    },
    wall: {
      rows: ["....", "..#.", "....", "...."], sol: [S(1, 1, "r")],
      frames: [
        { l: [], cap: "Un muro nella riga." },
        { l: [S(1, 1, "r")], cap: "La luce si ferma contro il muro: la casella dietro resta al buio." },
      ],
    },
    mix: {
      rows: [".....", ".....", ".....", ".....", "....."], sol: [S(1, 1, "r"), S(3, 3, "b")],
      frames: [
        { l: [], cap: "Due incroci chiedono il magenta." },
        { l: [S(1, 1, "r")], cap: "Il rosso da solo non basta." },
        { l: [S(1, 1, "r"), S(3, 3, "b")], cap: "Rosso + blu = magenta: dove le luci si incrociano, si sommano." },
      ],
    },
    composite: {
      rows: [".....", ".....", ".....", ".....", "....."], sol: [S(2, 2, "y"), S(0, 0, "b")],
      frames: [
        { l: [], cap: "Qui servono giallo, blu e bianco." },
        { l: [S(2, 2, "y")], cap: "La sorgente gialla emette rosso e verde insieme." },
        { l: [S(2, 2, "y"), S(0, 0, "b")], cap: "Giallo + blu = bianco: la luce bianca contiene tutti e tre i colori." },
      ],
    },
    mirror: {
      rows: ["....\\", ".....", ".....", "..../"], sol: [S(0, 0, "r")],
      frames: [
        { l: [], cap: "Due specchi sul bordo destro." },
        { l: [S(0, 0, "r")], cap: "Il raggio rimbalza sugli specchi e torna indietro lungo il fondo." },
      ],
    },
    glass: {
      rows: ["..M..", ".....", "G....", "....."], sol: [S(0, 0, "w")],
      frames: [
        { l: [], cap: "Un vetro magenta e uno verde." },
        { l: [S(0, 0, "w")], cap: "Il bianco attraversa i vetri e ne esce del loro colore: il resto viene fermato." },
      ],
    },
    prism: {
      rows: [".....", "..P..", "....."], sol: [S(0, 1, "w")],
      frames: [
        { l: [], cap: "Un prisma al centro." },
        { l: [S(0, 1, "w")], cap: "Il bianco si scompone: verde dritto, rosso a sinistra (in alto), blu a destra (in basso)." },
      ],
    },
    veil: {
      rows: ["?...", "....", "..?.", "...."], sol: [S(1, 0, "r")], fixed: [S(3, 3, "b")],
      frames: [
        { l: [], cap: "Il faro blu (a rombo) è già acceso. Le caselle con «?» accettano qualsiasi colore." },
        { l: [S(1, 0, "r")], cap: "Aggiungi la tua sorgente: il faro non si sposta, si lavora attorno a lui." },
      ],
    },
    shape: {
      rows: ["_...._", "......", "..__..", "......", "_...._"], sol: [S(1, 1, "g"), S(4, 3, "m")],
      frames: [
        { l: [], cap: "Una griglia con dei buchi." },
        { l: [S(1, 1, "g"), S(4, 3, "m")], cap: "Dove mancano le caselle la luce si ferma, come contro un muro." },
      ],
    },
  };

  // Da quale livello compare ogni cosa (per l'etichetta «dal livello N»).
  const SINCE = { mirror: "mirror", glass: "glass", prism: "prism", veil: "veil", shape: "void" };

  // Caselle degli esempi: più grandi su tablet e computer.
  const cellFor = (spec) => {
    const wide = Math.min(window.innerWidth, window.innerHeight) >= 600 && window.innerWidth >= 700;
    return spec === DEMOS.hero ? (wide ? 60 : 44) : (wide ? 36 : 30);
  };

  let built = false;
  const players = [];
  let timer = 0;

  function player(box, spec) {
    const ex = R.demo(spec.rows, spec.sol, spec.fixed || []);
    const board = document.createElement("div");
    board.className = "board demo-board";
    const cap = document.createElement("p");
    cap.className = "demo-cap";
    cap.setAttribute("aria-live", "off");
    box.append(board, cap);
    const view = R.build(board, ex.b, false);
    const w = ex.b.w;
    const toMap = (l) => new Map(l.map(([x, y, c]) => [y * w + x, window.PrismaCore.CHARS.indexOf(c)]));
    const p = {
      k: -1, view, board, cap, spec,
      size(px) { board.style.setProperty("--cell", `${px}px`); board.style.setProperty("--gap", "4px"); },
      step() {
        const prev = p.k >= 0 ? toMap(spec.frames[p.k].l) : new Map();
        p.k = (p.k + 1) % spec.frames.length;
        const fr = spec.frames[p.k];
        const now = toMap(fr.l);
        // L'animazione parte dalla sorgente appena aggiunta (o tolta).
        let origin = null;
        for (const q of now.keys()) if (!prev.has(q)) origin = q;
        if (origin == null) for (const q of prev.keys()) if (!now.has(q)) origin = q;
        board.classList.remove("won");
        if (p.k === 0) { view.lit.fill(255); }
        R.update(view, now, origin);
        if (fr.won) {
          view.cells.forEach((c, i) => c.style.setProperty("--wdelay", `${((i % w) + ((i / w) | 0)) * 60 + 300}ms`));
          void board.offsetWidth;
          board.classList.add("won");
        }
        cap.textContent = fr.cap;
      },
    };
    p.size(cellFor(spec));
    p.step();
    return p;
  }

  function card(parent, title, text, demoKey, since) {
    const sec = document.createElement("section");
    sec.className = "guide-card";
    const h = document.createElement("h3");
    h.textContent = title;
    if (since) {
      const tag = document.createElement("span");
      tag.className = "since";
      tag.textContent = since;
      h.append(tag);
    }
    sec.append(h);
    if (text) { const p = document.createElement("p"); p.innerHTML = text; sec.append(p); }
    if (demoKey) {
      const box = document.createElement("div");
      box.className = "demo";
      sec.append(box);
      players.push(player(box, DEMOS[demoKey]));
    }
    parent.append(sec);
    return sec;
  }

  function build(root) {
    if (built) return;
    built = true;
    const first = legend.firstSeen();
    const since = (key) => (SINCE[key] && first[SINCE[key]] != null ? `dal livello ${first[SINCE[key]] + 1}` : "");

    const hero = document.createElement("div");
    hero.className = "guide-hero demo";
    root.append(hero);
    players.push(player(hero, DEMOS.hero));

    const intro = document.createElement("p");
    intro.className = "guide-intro";
    intro.innerHTML = "In Prisma si piazzano <b>sorgenti di luce</b> su una griglia. Lo scopo è che <b>ogni casella</b> abbia esattamente il colore richiesto: né meno luce, né di più.";
    root.append(intro);

    // Procedimento.
    const how = card(root, "Come si gioca, passo per passo");
    how.classList.add("wide");
    const ol = document.createElement("ol");
    ol.className = "guide-steps";
    const steps = [
      [R.mini("target", 5), "<b>Leggi la griglia.</b> Il quadratino al centro di ogni casella è il colore che dovrà avere. Quadratino scuro = la casella deve restare al buio."],
      [R.mini("lamp", 1), "<b>Scegli una sorgente</b> nella tavolozza in basso. Il numero accanto dice quante ne restano: sono contate, esattamente quelle che servono."],
      [R.mini("swatch", 1), "<b>Tocca una casella libera</b> per piazzarla: la luce si accende subito. Tocca di nuovo la sorgente per toglierla."],
      [R.mini("dark", 1), "<b>Controlla.</b> Una casella giusta diventa piena, tutta del suo colore. Se il quadratino «sporge» su un colore diverso, lì arriva luce di troppo."],
      [null, "<b>Annulla</b> torna indietro di una mossa, <b>Ricomincia</b> svuota la griglia."],
      [null, "In alto a destra c'è la <b>legenda</b>: le regole valide nel livello che stai giocando, sempre a portata. Se sei bloccato, <b>Suggerimento</b> ti indica una mossa e ti spiega perché."],
      [null, "Quando <b>tutte</b> le caselle combaciano il livello è risolto e si apre il successivo. I progressi restano salvati sul dispositivo."],
    ];
    for (const [icon, text] of steps) {
      const li = document.createElement("li");
      const ic = document.createElement("span");
      ic.className = "legend-ic";
      if (icon) ic.append(icon);
      const p = document.createElement("p");
      p.innerHTML = text;
      li.append(ic, p);
      ol.append(li);
    }
    how.append(ol);

    card(root, "La luce corre dritta", "Ogni sorgente illumina la sua <b>riga</b> e la sua <b>colonna</b> fino al bordo.", "line");
    card(root, "I muri la fermano", "Un <b>muro</b> blocca il raggio: quello che c'è dietro resta al buio.", "wall");
    card(root, "I colori si sommano", "È luce, non tempera: rosso + verde = <b>giallo</b>, rosso + blu = <b>magenta</b>, verde + blu = <b>ciano</b>, tutti e tre = <b>bianco</b>.", "mix");
    card(root, "Sorgenti composte", "La gialla emette rosso e verde insieme, la magenta rosso e blu, la ciano verde e blu, la bianca tutti e tre.", "composite");
    card(root, "Specchi", "Deviano il raggio di 90°, come una sponda, da entrambi i lati.", "mirror", since("mirror"));
    card(root, "Vetri", "Lasciano passare solo i colori che contengono: un vetro giallo fa passare rosso e verde, ferma il blu.", "glass", since("glass"));
    card(root, "Prismi", "Scompongono la luce: il verde prosegue dritto, il rosso gira a sinistra e il blu a destra, rispetto a dove va il raggio.", "prism", since("prism"));
    card(root, "Caselle velate e fari", "Il «?» nasconde il colore richiesto: va bene qualsiasi. Il faro, a rombo, è una sorgente già accesa che non si sposta.", "veil", since("veil"));
    card(root, "Forme", "Alcune griglie hanno buchi o bordi irregolari: dove mancano le caselle, la luce si ferma.", "shape", since("shape"));

    const tips = card(root, "Consigli");
    tips.classList.add("wide");
    const ul = document.createElement("ul");
    ul.className = "guide-tips";
    for (const t of [
      "Parti dalle caselle <b>scure</b>: sulla loro riga e colonna (fino al primo muro) non può stare nessuna sorgente.",
      "Cerca le caselle che <b>una sola</b> posizione può accendere: quella sorgente è obbligata.",
      "Leggi i colori come somme: una casella <b>magenta</b> vuole rosso e blu, ma <b>niente</b> verde.",
      "Le sorgenti sono contate: se ne avanza una, qualcosa non torna.",
    ]) { const li = document.createElement("li"); li.innerHTML = t; ul.append(li); }
    tips.append(ul);

    const keys = document.createElement("p");
    keys.className = "muted small keys";
    keys.innerHTML = "Tastiera: <kbd>1</kbd>–<kbd>7</kbd> sorgente · <kbd>Z</kbd> annulla · <kbd>R</kbd> ricomincia · <kbd>H</kbd> suggerimento · <kbd>L</kbd> legenda · <kbd>Esc</kbd> indietro";
    root.append(keys);
  }

  function start(root) {
    build(root);
    stop();
    // Ogni esempio riparte dall'inizio quando si apre la guida.
    for (const p of players) { p.size(cellFor(p.spec)); p.k = -1; p.step(); }
    timer = setInterval(() => { for (const p of players) p.step(); }, STEP_MS);
  }
  function stop() { clearInterval(timer); timer = 0; }

  window.PrismaGuide = { start, stop, DEMOS };
})();
