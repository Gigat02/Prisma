// Prisma — missione giornaliera: livelli del giorno, creati sul dispositivo e tenuti in memoria.
//
// I livelli li crea forge.js partendo solo dalla data, in un worker (assets/forge-worker.js) per non
// bloccare la pagina. Quelli pronti si salvano: riaprendo l'app non si ricalcola niente. Finiti quelli
// di oggi, si preparano già quelli di domani, così a mezzanotte la missione nuova è subito pronta.
(function () {
  "use strict";

  const Forge = window.PrismaForge;
  const KEY = "prisma.daily.cache.v1";
  let store = null;
  let cache = { v: Forge.VERSION, days: {} }; // days[data] = [livello | null, ...] (null = non ancora pronto)
  const listeners = new Set();
  let worker = null, busy = null, queue = [];

  function attachStorage(s) {
    store = s;
    try {
      const raw = JSON.parse(store.getItem(KEY));
      // Livelli di un'altra versione del generatore: si rifanno (sarebbero diversi da quelli di oggi).
      if (raw && raw.v === Forge.VERSION && raw.days && typeof raw.days === "object") cache = raw;
    } catch { /* cache assente o rovinata: si rigenera */ }
  }
  function persist() {
    // Si tengono solo oggi e domani: i giorni passati non si rigiocano.
    const keep = new Set([today(), tomorrow()]);
    for (const d of Object.keys(cache.days)) if (!keep.has(d)) delete cache.days[d];
    try { store && store.setItem(KEY, JSON.stringify(cache)); } catch { /* spazio pieno: pazienza, si ricalcola */ }
  }

  const today = (d) => Forge.today(d);
  function tomorrow() {
    const d = new Date();
    return Forge.today(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12));
  }
  // Data di ieri rispetto a una data AAAA-MM-GG (per le serie di giorni consecutivi).
  function dayBefore(date) {
    const [y, m, d] = date.split("-").map(Number);
    return Forge.today(new Date(y, m - 1, d - 1, 12));
  }
  // Millisecondi alla prossima mezzanotte del dispositivo.
  function untilMidnight() {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1) - n;
  }

  const day = (date) => (cache.days[date] ||= Array(Forge.COUNT).fill(null));
  const get = (date, i) => (cache.days[date] && cache.days[date][i]) || null;
  const readyCount = (date) => (cache.days[date] || []).filter(Boolean).length;

  // Chiede i livelli mancanti di una data. Le date si fanno una alla volta, nell'ordine richiesto.
  function ensure(date) {
    const missing = day(date).map((l, i) => (l ? -1 : i)).filter((i) => i >= 0);
    if (!missing.length || (busy && busy.date === date) || queue.some((q) => q.date === date)) return;
    queue.push({ date, indices: missing });
    pump();
  }
  function pump() {
    if (busy || !queue.length) return;
    busy = queue.shift();
    busy.left = busy.indices.length;
    if (!worker) {
      try {
        worker = new Worker("assets/forge-worker.js");
        worker.onmessage = (e) => done(e.data);
        worker.onerror = () => { worker = null; inline(busy); };
      } catch { worker = null; }
    }
    if (worker) worker.postMessage({ date: busy.date, indices: busy.indices });
    else inline(busy);
  }
  // Senza worker (raro): un livello per volta sul thread principale, lasciando respirare la pagina.
  function inline(job) {
    const m = Forge.modifiers(job.date);
    const todo = job.indices.filter((i) => !get(job.date, i));
    const step = () => {
      const i = todo.shift();
      if (i == null) return;
      let level = null;
      try { level = Forge.level(job.date, i, m); } catch { /* resta null */ }
      done({ date: job.date, i, level });
      setTimeout(step, 0);
    };
    setTimeout(step, 0);
  }
  function done({ date, i, level }) {
    if (level) {
      const { score, attempts, ...clean } = level; // nel salvataggio solo il livello
      day(date)[i] = clean;
      persist();
    }
    for (const fn of listeners) fn(date, i, !!level);
    if (busy && busy.date === date && --busy.left <= 0) {
      busy = null;
      // Oggi è pronto: si prepara domani, in sottofondo.
      if (date === today()) ensure(tomorrow());
      pump();
    }
  }
  const onReady = (fn) => listeners.add(fn);

  window.PrismaDaily = {
    COUNT: Forge.COUNT, PALETTES: Forge.PALETTES, MODS: Forge.MODS,
    attachStorage, today, tomorrow, dayBefore, untilMidnight,
    modifiers: (date) => Forge.modifiers(date),
    get, readyCount, ensure, onReady,
  };
})();
