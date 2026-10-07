// Prisma — disegno della griglia, condiviso da partita, guida e legenda: così un esempio nella guida
// è identico a quello che si vede giocando. Usa core.js per la luce; nessuna regola qui dentro.
(function () {
  "use strict";

  const core = window.PrismaCore;
  const FILL = ["var(--floor)", "var(--r)", "var(--g)", "var(--y)", "var(--b)", "var(--m)", "var(--c)", "var(--w)"];
  const LAMP_NAMES = ["", "rossa", "verde", "gialla", "blu", "magenta", "ciano", "bianca"];
  const COLOR_NAMES = ["buio", "rosso", "verde", "giallo", "blu", "magenta", "ciano", "bianco"];
  // Classe e descrizione per ogni casella che non è libera (indice = core.WALL, VOID, MIRROR_A, ...).
  const ELEMENTS = [null, ["wall", "Muro"], ["void", ""], ["mirror-a", "Specchio, inclinato a destra"],
    ["mirror-b", "Specchio, inclinato a sinistra"], ["glass", ""], ["prism", "Prisma"]];

  const span = (cls) => Object.assign(document.createElement("span"), { className: cls });

  // Crea le caselle dentro container. interactive: pulsanti con etichette per lo screen reader
  // (partita); altrimenti semplici riquadri decorativi (guida, legenda).
  function build(container, b, interactive) {
    container.textContent = "";
    container.classList.remove("won");
    container.style.setProperty("--cols", b.w);
    const cells = [];
    for (let i = 0; i < b.n; i++) {
      const c = document.createElement(interactive ? "button" : "div");
      c.className = "cell";
      if (interactive) c.type = "button";
      const k = b.kind[i];
      if (k !== core.FLOOR) {
        if (interactive) { c.disabled = true; c.tabIndex = -1; }
        const [cls, label] = ELEMENTS[k];
        c.classList.add(cls);
        if (k >= core.MIRROR_A) c.classList.add("special");
        if (k === core.GLASS) c.style.setProperty("--gl", FILL[b.glass[i]]);
        if (k === core.PRISM) c.append(span("prism-shape"));
        if (interactive) {
          if (k === core.GLASS) c.setAttribute("aria-label", `Vetro ${COLOR_NAMES[b.glass[i]]}`);
          else if (label) c.setAttribute("aria-label", label);
          else c.setAttribute("aria-hidden", "true");
        }
      } else {
        c.dataset.i = i;
        if (b.veil[i]) c.classList.add("veil", "ok");
        else c.style.setProperty("--t", FILL[b.target[i]]);
        c.append(span("t"));
        if (b.fixed.has(i)) {
          const l = span("lamp fixed");
          l.style.setProperty("--l", FILL[b.fixed.get(i)]);
          c.append(l);
        }
      }
      container.append(c);
      cells.push(c);
    }
    if (!interactive) container.setAttribute("aria-hidden", "true");
    return { b, cells, container, interactive, lit: new Uint8Array(b.n).fill(255), lamps: new Map() };
  }

  // Ridisegna solo le caselle cambiate; il ritardo fa "correre" la luce lungo il raggio (specchi
  // compresi) partendo da origin, la sorgente appena toccata.
  function update(view, lamps, origin) {
    const { b, cells } = view;
    const lit = core.light(b, lamps);
    const dist = new Map();
    if (origin != null) {
      const r = core.reach(b, origin);
      for (let k = 0; k < r.q.length; k++) dist.set(r.q[k], r.d[k]);
    }
    const paint = (i) => {
      cells[i].style.setProperty("--delay", `${(dist.get(i) || 0) * 32}ms`);
      cells[i].style.setProperty("--fill", FILL[lit[i]]);
      cells[i].classList.toggle("lit", lit[i] !== 0);
    };
    // Specchi, vetri e prismi brillano del colore che li attraversa.
    for (const i of b.special) if (lit[i] !== view.lit[i]) paint(i);
    for (const i of b.floor) {
      const c = cells[i];
      if (lit[i] !== view.lit[i]) {
        paint(i);
        if (!b.veil[i]) {
          c.classList.toggle("ok", lit[i] === b.target[i]);
          // Troppa luce: il bersaglio si gonfia per segnalare che qualcosa va tolto.
          c.classList.toggle("bad", (lit[i] & ~b.target[i]) !== 0);
        }
      }
      const m = lamps.get(i);
      let lampEl = c.querySelector(".lamp:not(.fixed)");
      if (m && !lampEl) { lampEl = span("lamp"); c.append(lampEl); }
      else if (!m && lampEl) { lampEl.remove(); lampEl = null; }
      if (lampEl) lampEl.style.setProperty("--l", FILL[m]);
      if (view.interactive) {
        const fx = b.fixed.get(i);
        c.setAttribute("aria-label",
          (b.veil[i] ? "Velata" : `Richiesto ${COLOR_NAMES[b.target[i]]}`) + `, ora ${COLOR_NAMES[lit[i]]}` +
          (m ? `, sorgente ${LAMP_NAMES[m]}` : "") + (fx ? `, faro ${LAMP_NAMES[fx]} fisso` : ""));
      }
    }
    view.lit = lit;
    view.lamps = new Map(lamps);
    return lit;
  }

  // Dimensiona le caselle per stare in W×H.
  function fit(view, W, H, max = 76) {
    const { w, h } = view.b;
    const gap = W < 420 ? (w >= 9 ? 3 : 4) : W >= 700 ? 8 : 6;
    const cell = Math.max(22, Math.floor(Math.min((W - gap * (w - 1)) / w, (H - gap * (h - 1)) / h, max)));
    view.container.style.setProperty("--cell", `${cell}px`);
    view.container.style.setProperty("--gap", `${gap}px`);
  }

  // Una casella da sola, per legenda e guida: mini("mirror-a"), mini("glass", 3), mini("lamp", 7)...
  function mini(kind, mask) {
    const c = document.createElement("span");
    c.className = "cell ex";
    c.setAttribute("aria-hidden", "true");
    if (kind === "mirror-a" || kind === "mirror-b" || kind === "prism" || kind === "glass") c.classList.add("special", kind);
    if (kind === "glass") c.style.setProperty("--gl", FILL[mask]);
    if (kind === "prism") c.append(span("prism-shape"));
    if (kind === "wall") c.classList.add("wall");
    if (kind === "void") c.classList.add("void-ex");
    if (kind === "veil") { c.classList.add("veil"); c.append(span("t")); }
    if (kind === "target") { c.style.setProperty("--t", FILL[mask]); c.append(span("t")); }
    if (kind === "dark") { c.style.setProperty("--fill", FILL[mask]); c.classList.add("lit"); c.style.setProperty("--t", FILL[0]); c.append(span("t")); }
    if (kind === "lamp" || kind === "fixed") {
      const l = span(kind === "fixed" ? "lamp fixed" : "lamp");
      l.style.setProperty("--l", FILL[mask]);
      c.append(l);
    }
    if (kind === "swatch") { c.style.setProperty("--fill", FILL[mask]); c.classList.add("swatch"); }
    return c;
  }

  // Esempio costruito dal motore: rows usa "." per le caselle (il colore lo calcola la luce),
  // "?" per quelle velate e i soliti simboli per gli elementi. lamps: [[x, y, "r"], ...] è la soluzione;
  // fixed: sorgenti già accese. Restituisce il livello e la soluzione come Map posizione -> maschera.
  function demo(rows, lamps, fixed = []) {
    const w = rows[0].length;
    const shell = core.parse({ rows: rows.map((r) => r.replace(/\?/g, ".")), lamps: {} });
    const at = ([x, y, ch]) => [y * w + x, core.CHARS.indexOf(ch)];
    const sol = new Map(lamps.map(at));
    const lit = core.light(shell, new Map([...sol, ...fixed.map(at)]));
    const level = {
      rows: rows.map((r, y) => [...r].map((c, x) => (c === "." ? core.CHARS[lit[y * w + x]] : c)).join("")),
      lamps: {},
    };
    for (const m of sol.values()) level.lamps[core.CHARS[m]] = (level.lamps[core.CHARS[m]] || 0) + 1;
    if (fixed.length) level.fixed = fixed.map(([x, y, ch]) => [y * w + x, ch]);
    return { level, b: core.parse(level), sol };
  }

  // Esempio fermo, già risolto (o con le sorgenti indicate), dentro container.
  function still(container, ex, lamps, cell = 26) {
    const view = build(container, ex.b, false);
    container.style.setProperty("--cell", `${cell}px`);
    container.style.setProperty("--gap", "3px");
    update(view, lamps || ex.sol, null);
    return view;
  }

  window.PrismaRender = { FILL, LAMP_NAMES, COLOR_NAMES, build, update, fit, mini, demo, still };
})();
