// Prisma — missione giornaliera: 10 livelli nuovi ogni giorno, creati sul dispositivo.
//
// Tutto dipende solo dalla data (AAAA-MM-GG, presa dall'orologio del dispositivo) e da VERSION:
// stesso giorno => stessi modificatori e stessi livelli su ogni dispositivo, senza internet.
// Per questo la generazione non usa mai il tempo come limite (darebbe livelli diversi su telefoni
// lenti e veloci): ogni ricerca ha un numero fisso di tentativi e il risolutore un numero fisso di nodi.
// Se si cambia qualcosa qui che altera i livelli, si aumenta VERSION.
//
// Un livello è valido con gli stessi criteri dei livelli normali (tools/generate.js): soluzione unica,
// ogni sorgente indispensabile, le novità attraversate dalla luce, né troppo buio né tutto acceso.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else root.PrismaForge = factory(root.PrismaCore);
})(typeof self !== "undefined" ? self : this, function (core) {
  "use strict";

  const VERSION = 1;
  const COUNT = 10;
  const C = core.CHARS;
  const T = (s) => [...s].map((ch) => C.indexOf(ch));
  const SHAPES = ["diamond", "ring", "cross", "notch", "twin", "holes"];

  // ---------- Casualità riproducibile ----------
  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  const between = (r, [lo, hi] = [0, 0]) => lo + Math.floor(r() * (hi - lo + 1));
  const shuffle = (r, a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // Data locale del dispositivo: la missione cambia alla mezzanotte del suo fuso orario.
  function today(d = new Date()) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  // ---------- Modificatori del giorno ----------
  // Colori: quali sorgenti si usano. Dinamiche: cosa c'è sulla griglia. Ogni giorno una tavolozza e
  // due dinamiche (a volte una o tre), con poche regole perché la combinazione abbia senso.
  const PALETTES = {
    primari: { name: "Colori primari", desc: "solo sorgenti rosse, verdi e blu", pool: T("rgb") },
    miscele: { name: "Miscele", desc: "sorgenti gialle, magenta e ciano", pool: T("ymc"), mustMix: true },
    tutti:   { name: "Tutti i colori", desc: "ogni sorgente, bianca compresa", pool: T("rgbymcw"), mustMix: true },
  };
  const MODS = {
    specchi:   { name: "Specchi", desc: "deviano il raggio di 90°" },
    vetri:     { name: "Vetri", desc: "lasciano passare solo i loro colori" },
    prismi:    { name: "Prismi", desc: "scompongono la luce bianca" },
    veli:      { name: "Caselle velate", desc: "il loro colore non conta" },
    fari:      { name: "Fari", desc: "sorgenti già accese e fisse" },
    forme:     { name: "Forme", desc: "griglie a diamante, anello, croce..." },
    labirinto: { name: "Labirinto", desc: "molti più muri" },
  };

  function modifiers(date) {
    const r = rng(hash(`mods/${VERSION}/${date}`));
    const mods = shuffle(r, Object.keys(MODS));
    const n = r() < 0.2 ? 1 : r() < 0.85 ? 2 : 3;
    let chosen = mods.slice(0, n);
    // Il labirinto con le forme diventa uno scolapasta: si tiene solo il primo dei due.
    if (chosen.includes("labirinto") && chosen.includes("forme")) chosen = chosen.filter((m) => m !== chosen.find((x) => x === "labirinto" || x === "forme"));
    let palette = pick(r, ["primari", "miscele", "tutti", "tutti"]);
    // Prismi e vetri lavorano su luce composta: servono le miscele o la bianca.
    if (palette === "primari" && (chosen.includes("prismi") || chosen.includes("vetri"))) palette = "tutti";
    if (chosen.includes("prismi")) palette = "tutti";
    return { date, palette, mods: chosen };
  }

  // Parametri del livello i (0..COUNT-1): tutto cresce con t, dalla griglia alle sorgenti.
  function spec(m, i) {
    const t = i / (COUNT - 1);
    const has = (k) => m.mods.includes(k);
    const pal = PALETTES[m.palette];
    const side = 5 + Math.round(t * 5); // da 5x5 a 10x10
    const sp = {
      sizes: side >= 10 ? [[10, 10]] : [[side, side], [side + (t > 0.3 ? 1 : 0), side]],
      walls: has("labirinto") ? [0.14 + 0.06 * t, 0.2 + 0.06 * t] : [0.04, 0.1 + 0.04 * (1 - t)],
      lamps: [2 + Math.round(t * 5), 3 + Math.round(t * 6)],
      pool: pal.pool,
      mustMix: pal.mustMix,
    };
    if (has("prismi")) { sp.must = T("w"); sp.prisms = [1, 1 + Math.round(t * 2)]; }
    if (has("specchi")) sp.mirrors = [1 + Math.round(t * 2), 2 + Math.round(t * 4)];
    if (has("labirinto")) sp.mirrors = [Math.max((sp.mirrors || [0])[0], 1 + Math.round(t * 3)), Math.max((sp.mirrors || [0, 0])[1], 2 + Math.round(t * 5))];
    if (has("vetri")) sp.filters = [1 + Math.round(t), 2 + Math.round(t * 2)];
    if (has("veli")) sp.veil = [0.12 + 0.1 * t, 0.2 + 0.15 * t];
    if (has("fari")) sp.fixed = [1, 1 + Math.round(t)];
    if (has("forme")) { sp.shapes = SHAPES; sp.sizes = [[Math.max(7, side), Math.max(7, side)]]; }
    return sp;
  }

  // ---------- Costruzione di un livello (stesse regole di tools/generate.js) ----------
  function shape(grid, kind, r) {
    const h = grid.length, w = grid[0].length;
    const cx = (w - 1) / 2, cy = (h - 1) / 2;
    const cut = (x, y) => { if (x >= 0 && y >= 0 && x < w && y < h) grid[y][x] = "_"; };
    if (kind === "diamond") {
      const R = Math.floor(Math.max(w, h) / 2) + 1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.abs(x - cx) + Math.abs(y - cy) > R) cut(x, y);
    } else if (kind === "ring") {
      const s = w >= 9 ? 3 : 2;
      const x0 = Math.floor((w - s) / 2), y0 = Math.floor((h - s) / 2);
      for (let y = y0; y < y0 + s; y++) for (let x = x0; x < x0 + s; x++) cut(x, y);
    } else if (kind === "cross") {
      const s = Math.max(2, Math.floor(Math.min(w, h) / 3) - (r() < 0.5 ? 1 : 0));
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { cut(x, y); cut(w - 1 - x, y); cut(x, h - 1 - y); cut(w - 1 - x, h - 1 - y); }
    } else if (kind === "notch") {
      for (let k = between(r, [2, 4]); k > 0; k--) {
        const side = Math.floor(r() * 4), len = between(r, [2, 3]), dep = between(r, [1, 2]);
        const at = Math.floor(r() * ((side < 2 ? w : h) - len + 1));
        for (let a = 0; a < len; a++) for (let d = 0; d < dep; d++) {
          if (side === 0) cut(at + a, d); else if (side === 1) cut(at + a, h - 1 - d);
          else if (side === 2) cut(d, at + a); else cut(w - 1 - d, at + a);
        }
      }
    } else if (kind === "twin") {
      const x = Math.floor(w / 2);
      const gaps = new Set([between(r, [1, h - 2]), between(r, [1, h - 2])]);
      for (let y = 0; y < h; y++) if (!gaps.has(y)) cut(x, y);
    } else if (kind === "holes") {
      for (let k = between(r, [2, 4]); k > 0; k--) {
        const x = between(r, [1, w - 3]), y = between(r, [1, h - 3]);
        cut(x, y); if (r() < 0.6) cut(x + 1, y); if (r() < 0.6) cut(x, y + 1);
      }
    }
  }

  const MAX_NODES = 2e5;
  // Numero di cifre binarie: come log2, ma intero e identico su ogni browser (l'ordine dei livelli
  // dipende dal punteggio, quindi niente funzioni che un motore potrebbe arrotondare diversamente).
  const bits = (n) => 32 - Math.clz32(n);

  function candidate(r, ch) {
    const [w, h] = pick(r, ch.sizes);
    const grid = Array.from({ length: h }, () => Array(w).fill("."));
    if (ch.shapes) shape(grid, pick(r, ch.shapes), r);
    const density = ch.walls[0] + r() * (ch.walls[1] - ch.walls[0]);
    for (const row of grid) for (let x = 0; x < w; x++) if (row[x] === "." && r() < density) row[x] = "#";

    const free = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (grid[y][x] === ".") free.push(y * w + x);
    shuffle(r, free);
    const put = (c) => { const i = free.pop(); grid[(i / w) | 0][i % w] = c; return i; };
    const specials = { mirror: [], glass: [], prism: [] };
    for (let k = between(r, ch.mirrors); k > 0; k--) specials.mirror.push(put(r() < 0.5 ? "/" : "\\"));
    for (let k = between(r, ch.filters); k > 0; k--) specials.glass.push(put(pick(r, [..."RGBYMC"])));
    for (let k = between(r, ch.prisms); k > 0; k--) specials.prism.push(put("P"));

    const k = between(r, ch.lamps);
    if (free.length < k * 3) return null;
    const types = [...(ch.must || [])];
    if (ch.mustMix) types.push(pick(r, T("ymc")));
    while (types.length < k) types.push(pick(r, ch.pool));
    if (types.length > k) return null;
    const lampList = types.map((m) => [free.pop(), m]);
    const nFixed = Math.min(between(r, ch.fixed), k - 2);
    const fixedList = lampList.slice(0, Math.max(0, nFixed));
    const freeLamps = new Map(lampList.slice(fixedList.length));

    const shell = core.parse({ rows: grid.map((row) => row.join("")), lamps: {} });
    const lit = core.light(shell, new Map(lampList));
    const target = grid.map((row, y) => row.map((c, x) => (c === "." ? C[lit[y * w + x]] : c)));

    const veilFrac = ch.veil ? ch.veil[0] + r() * (ch.veil[1] - ch.veil[0]) : 0;
    if (veilFrac > 0) {
      const fixedSet = new Set(fixedList.map(([p]) => p));
      const floors = shuffle(r, shell.floor.filter((p) => !fixedSet.has(p)));
      for (const p of floors.slice(0, Math.round(floors.length * veilFrac))) target[(p / w) | 0][p % w] = "?";
    }

    const inv = {};
    for (const m of freeLamps.values()) inv[C[m]] = (inv[C[m]] || 0) + 1;
    const level = { rows: target.map((row) => row.join("")), lamps: inv };
    if (fixedList.length) level.fixed = fixedList.map(([p, m]) => [p, C[m]]);
    const b = core.parse(level);

    for (const [p, m] of freeLamps) {
      const others = new Map(freeLamps); others.delete(p);
      const rest = core.light(b, others);
      const rr = core.reach(b, p);
      let useful = false;
      for (let j = 0; j < rr.q.length && !useful; j++) {
        const q = rr.q[j];
        if (b.kind[q] !== core.FLOOR || b.veil[q]) continue;
        const l = m & rr.m[j];
        if ((rest[q] & l) !== l) useful = true;
      }
      if (!useful) return null;
    }
    for (const [p] of fixedList) {
      const rr = core.reach(b, p);
      if (![...rr.q].some((q) => q !== p && b.kind[q] === core.FLOOR && !b.veil[q] && b.target[q])) return null;
    }
    const used = (list) => list.filter((q) => lit[q]).length;
    if (used(specials.prism) < specials.prism.length) return null;
    if (used(specials.mirror) < Math.ceil(specials.mirror.length / 2)) return null;
    if (used(specials.glass) < Math.ceil(specials.glass.length / 2)) return null;
    const shown = b.floor.filter((q) => !b.veil[q]);
    const dark = shown.filter((q) => b.target[q] === 0).length / shown.length;
    if (dark < 0.08 || dark > 0.55) return null;

    const sol = core.solve(b, null, 2, MAX_NODES);
    if (sol.aborted || sol.count !== 1) return null;
    const rt = core.rate(b);
    const score = rt.trials * 4 + rt.rounds * 6 + (rt.solved ? 0 : 40 + bits(sol.nodes + 1) * 6) + k * 3 + b.floor.length * 0.15 + rt.candidates * 0.05;
    return { level, score };
  }

  // Quanti livelli validi si confrontano per ogni posto: i primi sono facili e se ne prende il più
  // semplice, gli ultimi il più difficile. Tentativi limitati: se non basta, si allenta la richiesta.
  const ATTEMPTS = 2500;
  const poolSize = (i) => 4 + Math.round((12 * i) / (COUNT - 1)); // da 4 a 16 candidati

  // Livello i della missione del giorno. È indipendente dagli altri: si può creare in qualunque ordine.
  function level(date, i, m = modifiers(date)) {
    const sp = spec(m, i);
    const r = rng(hash(`level/${VERSION}/${date}/${i}`));
    const pool = [];
    let attempts = 0;
    while (pool.length < poolSize(i) && attempts < ATTEMPTS) {
      attempts++;
      const c = candidate(r, sp);
      if (c) pool.push(c);
    }
    // Ripiego (raro): stessi modificatori, ma griglia e sorgenti di due livelli prima.
    if (!pool.length) return fallback(date, i, m);
    pool.sort((a, b) => a.score - b.score);
    const t = i / (COUNT - 1);
    const c = pool[Math.round(t * (pool.length - 1))];
    return { ...c.level, score: c.score, attempts };
  }
  function fallback(date, i, m) {
    const sp = spec(m, Math.max(0, i - 2));
    const r = rng(hash(`fallback/${VERSION}/${date}/${i}`));
    for (let a = 0; a < ATTEMPTS * 4; a++) { const c = candidate(r, sp); if (c) return { ...c.level, score: c.score, attempts: a + 1 }; }
    return null;
  }

  return { VERSION, COUNT, PALETTES, MODS, today, modifiers, spec, level, hash, rng };
});
