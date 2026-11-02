// Prisma — regole del gioco e risolutore. Nessuna dipendenza dal DOM: lo usano sia la pagina
// sia gli script in tools/ (generazione e verifica dei livelli).
//
// Regole. Ogni sorgente piazzata su una casella libera manda luce nelle quattro direzioni.
// I colori sono luce: si sommano per canale (rosso 1, verde 2, blu 4), quindi ogni colore è una
// maschera di 3 bit e una casella vale l'OR di tutto ciò che la raggiunge. Il livello è risolto
// quando ogni casella libera (non velata) ha esattamente il colore richiesto.
//
// Il raggio si ferma contro muri, vuoti e bordo. Gli altri elementi lo trasformano:
//   specchi  / e \  deviano il raggio di 90°;
//   vetri    R G B Y M C  lasciano passare solo i canali del loro colore;
//   prisma   P  scompone: il verde prosegue, il rosso gira a sinistra, il blu a destra
//               (rispetto alla direzione in cui viaggia il raggio).
// Poiché ogni canale segue la propria strada, la luce si traccia un canale alla volta.
//
// Formato del livello: { rows: [...], lamps: { r: 2, w: 1 }, fixed?: [[indice, "w"], ...] }
//   .            casella da lasciare al buio      r g y b m c w  casella da accendere di quel colore
//   ?            casella velata: va bene qualsiasi colore
//   #  muro      _  vuoto (fuori dalla griglia)    / \  specchi    R G B Y M C  vetri    P  prisma
//   fixed        sorgenti già piazzate, che non si possono togliere
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PrismaCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const CHARS = ".rgybmcw"; // carattere della maschera 0..7 (r=1, g=2, y=3, b=4, m=5, c=6, w=7)
  const NAMES = ["buio", "rosso", "verde", "giallo", "blu", "magenta", "ciano", "bianco"];
  const LAMP_ORDER = [1, 2, 4, 3, 5, 6, 7]; // ordine della tavolozza: primari, poi miscele, poi bianco
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // Tipi di casella.
  const FLOOR = 0, WALL = 1, VOID = 2, MIRROR_A = 3, MIRROR_B = 4, GLASS = 5, PRISM = 6;
  const FILTERS = "RGYBMC"; // vetri: stesse lettere dei colori, maiuscole

  function parse(level) {
    const h = level.rows.length;
    const w = level.rows[0].length;
    const n = w * h;
    const kind = new Uint8Array(n);
    const target = new Uint8Array(n);
    const veil = new Uint8Array(n);
    const glass = new Uint8Array(n); // maschera dei vetri
    const floor = [];
    for (let y = 0; y < h; y++) {
      if (level.rows[y].length !== w) throw new Error(`riga ${y} lunga ${level.rows[y].length}, attesa ${w}`);
      for (let x = 0; x < w; x++) {
        const ch = level.rows[y][x];
        const i = y * w + x;
        if (ch === "#") kind[i] = WALL;
        else if (ch === "_") kind[i] = VOID;
        else if (ch === "/") kind[i] = MIRROR_A;
        else if (ch === "\\") kind[i] = MIRROR_B;
        else if (ch === "P") kind[i] = PRISM;
        else if (FILTERS.includes(ch)) { kind[i] = GLASS; glass[i] = CHARS.indexOf(ch.toLowerCase()); }
        else if (ch === "?") { veil[i] = 1; floor.push(i); }
        else {
          const m = CHARS.indexOf(ch);
          if (m < 0) throw new Error(`carattere sconosciuto «${ch}» in ${x},${y}`);
          target[i] = m;
          floor.push(i);
        }
      }
    }
    const inv = new Array(8).fill(0);
    for (const [ch, k] of Object.entries(level.lamps || {})) {
      const m = CHARS.indexOf(ch);
      if (m < 1) throw new Error(`sorgente sconosciuta «${ch}»`);
      inv[m] = k;
    }
    const b = { w, h, n, kind, target, veil, glass, floor, inv, reach: new Array(n), fixed: new Map() };
    b.wall = kind.map((k) => (k === FLOOR ? 0 : 1)); // tutto ciò che non è casella libera
    for (const [p, ch] of level.fixed || []) {
      const m = CHARS.indexOf(ch);
      if (!(p >= 0 && p < n) || kind[p] !== FLOOR || m < 1) throw new Error(`sorgente fissa non valida in ${p}`);
      b.fixed.set(p, m);
    }
    b.special = [];
    for (let i = 0; i < n; i++) if (kind[i] >= MIRROR_A) b.special.push(i);
    return b;
  }

  // Raggio di una sorgente in p: per ogni casella raggiunta, la maschera dei canali che ci arrivano
  // (supponendo una sorgente bianca) e la distanza in passi, usata solo per l'animazione.
  // Comprende anche specchi, vetri e prismi attraversati, che il disegno fa brillare.
  function reach(b, p) {
    if (b.reach[p]) return b.reach[p];
    const { w, h, kind, glass } = b;
    const mask = new Map(); // casella -> maschera
    const dist = new Map();
    const hit = (q, bit, d) => {
      mask.set(q, (mask.get(q) || 0) | bit);
      if (!dist.has(q) || dist.get(q) > d) dist.set(q, d);
    };
    for (let c = 0; c < 3; c++) {
      const bit = 1 << c;
      hit(p, bit, 0);
      const seen = new Set();
      const stack = DIRS.map(([dx, dy]) => [p % w, (p / w) | 0, dx, dy, 0]);
      while (stack.length) {
        let [x, y, dx, dy, d] = stack.pop();
        for (;;) {
          x += dx; y += dy; d++;
          if (x < 0 || y < 0 || x >= w || y >= h) break;
          const q = y * w + x;
          const k = kind[q];
          if (k === WALL || k === VOID) break;
          const key = q * 4 + (dx === 1 ? 0 : dx === -1 ? 1 : dy === 1 ? 2 : 3);
          if (seen.has(key)) break; // gli specchi possono chiudere il raggio in un anello
          seen.add(key);
          hit(q, bit, d);
          if (k === MIRROR_A) { const t = dx; dx = -dy; dy = -t; }       // "/"
          else if (k === MIRROR_B) { const t = dx; dx = dy; dy = t; }    // "\"
          else if (k === GLASS) { if (!(glass[q] & bit)) break; }
          else if (k === PRISM) {
            if (bit === 1) { const t = dx; dx = dy; dy = -t; }           // rosso: a sinistra
            else if (bit === 4) { const t = dx; dx = -dy; dy = t; }      // blu: a destra
          }
        }
      }
    }
    const qs = [...mask.keys()];
    const out = { q: Int32Array.from(qs), m: Uint8Array.from(qs.map((q) => mask.get(q))), d: Uint16Array.from(qs.map((q) => dist.get(q))) };
    b.reach[p] = out;
    return out;
  }

  // lamps: Map posizione -> maschera (le sorgenti fisse si aggiungono da sole).
  function light(b, lamps) {
    const lit = new Uint8Array(b.n);
    const add = (p, m) => {
      const r = reach(b, p);
      for (let k = 0; k < r.q.length; k++) lit[r.q[k]] |= m & r.m[k];
    };
    for (const [p, m] of b.fixed) add(p, m);
    for (const [p, m] of lamps) add(p, m);
    return lit;
  }

  const counts = (b, i) => b.kind[i] === FLOOR && !b.veil[i];

  function isSolved(b, lit) {
    for (const i of b.floor) if (!b.veil[i] && lit[i] !== b.target[i]) return false;
    return true;
  }

  // Una sorgente è "sicura" se non accende mai un canale che una casella del suo raggio non vuole.
  // Ogni soluzione usa solo sorgenti sicure: la luce non si può spegnere.
  function isSafe(b, p, m) {
    const r = reach(b, p);
    for (let k = 0; k < r.q.length; k++) {
      const q = r.q[k];
      if (!counts(b, q)) continue;
      const l = m & r.m[k];
      if ((b.target[q] & l) !== l) return false;
    }
    return true;
  }

  // Struttura comune ai due risolutori: requisiti (casella, canale) ancora da accendere dopo le
  // sorgenti fisse e, per ognuno, i piazzamenti sicuri che lo soddisfano.
  function model(b, inv) {
    const base = light(b, new Map());
    const place = []; // { p, m }
    for (const p of b.floor) {
      if (b.fixed.has(p)) continue;
      for (const m of LAMP_ORDER) if (inv[m] > 0 && isSafe(b, p, m)) place.push({ p, m });
    }
    const reqIndex = new Int32Array(b.n * 3).fill(-1);
    const reqs = [];
    let broken = false; // una sorgente fissa che accende troppo: livello impossibile
    for (const q of b.floor) {
      if (b.veil[q]) continue;
      if (base[q] & ~b.target[q]) broken = true;
      for (let c = 0; c < 3; c++) {
        const bit = 1 << c;
        if ((b.target[q] & bit) && !(base[q] & bit)) { reqIndex[q * 3 + c] = reqs.length; reqs.push({ q, c, cands: [] }); }
      }
    }
    const covers = place.map(() => []);
    place.forEach((pl, k) => {
      const r = reach(b, pl.p);
      for (let j = 0; j < r.q.length; j++) {
        const l = pl.m & r.m[j];
        for (let c = 0; c < 3; c++) {
          if (!(l & (1 << c))) continue;
          const ri = reqIndex[r.q[j] * 3 + c];
          if (ri >= 0) { reqs[ri].cands.push(k); covers[k].push(ri); }
        }
      }
    });
    return { place, reqs, covers, broken };
  }

  // Conta le soluzioni (fino a limit) con un backtracking esatto: si sceglie il requisito scoperto
  // con meno candidati, si prova ogni candidato e lo si esclude dai rami successivi, così ogni
  // insieme di sorgenti viene contato una volta sola.
  function solve(b, invIn, limit = 2, maxNodes = 2e6) {
    const inv = (invIn || b.inv).slice();
    const { place, reqs, covers, broken } = model(b, inv);
    if (broken) return { count: 0, solutions: [], nodes: 0, aborted: false };
    const cov = new Int16Array(reqs.length);
    const occ = new Uint8Array(b.n);
    const banned = new Uint8Array(place.length);
    const chosen = [];
    const solutions = [];
    let nodes = 0, aborted = false;

    const avail = (k) => !banned[k] && !occ[place[k].p] && inv[place[k].m] > 0;
    const put = (k, d) => {
      const pl = place[k];
      occ[pl.p] = d > 0 ? 1 : 0;
      inv[pl.m] -= d;
      for (const r of covers[k]) cov[r] += d;
    };

    (function rec() {
      if (++nodes > maxNodes) { aborted = true; return; }
      let best = -1, bestN = Infinity;
      for (let r = 0; r < reqs.length; r++) {
        if (cov[r]) continue;
        let cnt = 0;
        for (const k of reqs[r].cands) if (avail(k)) cnt++;
        if (cnt < bestN) { bestN = cnt; best = r; if (cnt === 0) return; }
      }
      if (best < 0) { solutions.push(chosen.map((k) => place[k])); return; }
      const opts = reqs[best].cands.filter(avail);
      const undo = [];
      for (const k of opts) {
        put(k, 1); chosen.push(k);
        rec();
        chosen.pop(); put(k, -1);
        if (solutions.length >= limit || aborted) break;
        banned[k] = 1; undo.push(k);
      }
      for (const k of undo) banned[k] = 0;
    })();

    return { count: solutions.length, solutions, nodes, aborted };
  }

  // Risolutore "umano", usato solo per stimare la difficoltà. Applica a ripetizione:
  //  - forzatura: un requisito con un solo candidato rimasto obbliga quel piazzamento;
  //  - prova breve: un candidato che, piazzato, porta a contraddizione con le sole forzature si scarta.
  // Restituisce quante prove sono servite e se è bastato (altrimenti serve ragionare più a fondo).
  function rate(b) {
    const inv0 = b.inv.slice();
    const { place, reqs, covers } = model(b, inv0);

    const fresh = () => ({ inv: inv0.slice(), cov: new Int16Array(reqs.length), occ: new Uint8Array(b.n), banned: new Uint8Array(place.length) });
    const clone = (s) => ({ inv: s.inv.slice(), cov: s.cov.slice(), occ: s.occ.slice(), banned: s.banned.slice() });
    const avail = (s, k) => !s.banned[k] && !s.occ[place[k].p] && s.inv[place[k].m] > 0;
    const put = (s, k) => {
      s.occ[place[k].p] = 1; s.inv[place[k].m]--;
      for (const r of covers[k]) s.cov[r]++;
    };
    // Restituisce false se trova una contraddizione.
    const propagate = (s, stats) => {
      for (;;) {
        let forced = -1, open = 0;
        for (let r = 0; r < reqs.length; r++) {
          if (s.cov[r]) continue;
          open++;
          let cnt = 0, last = -1;
          for (const k of reqs[r].cands) if (avail(s, k)) { cnt++; last = k; if (cnt > 1) break; }
          if (cnt === 0) return false;
          if (cnt === 1) { forced = last; break; }
        }
        if (open === 0 || forced < 0) return true;
        put(s, forced);
        if (stats) stats.forced++;
      }
    };
    const done = (s) => { for (let r = 0; r < reqs.length; r++) if (!s.cov[r]) return false; return true; };

    const stats = { forced: 0, trials: 0, rounds: 0, solved: false, candidates: place.length };
    const s = fresh();
    if (!propagate(s, stats)) return stats;
    while (!done(s)) {
      stats.rounds++;
      let progress = false;
      for (let k = 0; k < place.length; k++) {
        if (!avail(s, k)) continue;
        const t = clone(s);
        put(t, k);
        if (!propagate(t, null)) {
          s.banned[k] = 1; stats.trials++; progress = true;
          if (!propagate(s, stats)) return stats;
          if (done(s)) break;
        }
      }
      if (!progress) return stats;
    }
    stats.solved = true;
    return stats;
  }

  // Suggerimento per chi è bloccato, partendo dalle sorgenti già piazzate (lamps: Map posizione -> maschera).
  // Prima si segnala una sorgente sbagliata, se c'è. Altrimenti si cerca la mossa che un buon giocatore
  // troverebbe per prima: una casella da accendere che, con quanto c'è sulla griglia, può ricevere luce
  // da un solo piazzamento ancora possibile ("forzata"). Se non esiste, una sorgente della soluzione.
  // Restituisce { op: "remove", p, m } | { op: "place", p, m, why } (why = casella che lo giustifica) | null.
  function hint(b, lamps, solution) {
    const sol = solution || (solve(b, null, 1).solutions[0] || null);
    if (!sol) return null;
    const want = new Map(sol.map(({ p, m }) => [p, m]));
    for (const [p, m] of lamps) if (want.get(p) !== m) return { op: "remove", p, m };
    const missing = sol.filter(({ p }) => !lamps.has(p));
    if (!missing.length) return null;

    const inv = b.inv.slice();
    for (const m of lamps.values()) inv[m]--;
    const { place, reqs } = model(b, b.inv);
    const lit = light(b, lamps);
    const usable = (k) => !lamps.has(place[k].p) && inv[place[k].m] > 0;
    const inSol = (k) => want.get(place[k].p) === place[k].m;
    let fallback = null, fewest = Infinity;
    for (const r of reqs) {
      if (lit[r.q] & (1 << r.c)) continue;
      const cands = r.cands.filter(usable);
      if (cands.length === 1 && inSol(cands[0])) return { op: "place", p: place[cands[0]].p, m: place[cands[0]].m, why: r.q };
      // Ripiego: il requisito con meno alternative, risolto dalla sua sorgente nella soluzione.
      const good = cands.find(inSol);
      if (good !== undefined && cands.length < fewest) { fewest = cands.length; fallback = { op: "place", p: place[good].p, m: place[good].m, why: r.q }; }
    }
    return fallback || { op: "place", p: missing[0].p, m: missing[0].m };
  }

  return {
    CHARS, NAMES, LAMP_ORDER, FILTERS,
    FLOOR, WALL, VOID, MIRROR_A, MIRROR_B, GLASS, PRISM,
    parse, reach, light, isSolved, isSafe, solve, rate, hint,
  };
});
