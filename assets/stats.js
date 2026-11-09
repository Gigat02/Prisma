// Prisma — statistiche del giocatore e progressi della missione giornaliera, salvati sul dispositivo.
//
// Struttura salvata (chiave prisma.stats.v1):
//   since           primo giorno in cui sono state raccolte le statistiche
//   daily[data]     { solved: [indici risolti], ms: { indice: tempo }, hints, draft }
//   modes.camp / modes.daily   { solved, perfect, hints, ms }  (perfect = risolti senza suggerimenti)
//   moves, undos, resets, fastest (miglior tempo per una missione completa, in ms)
// I suggerimenti si contano qui per modalità, ma il totale "di sempre" resta quello del portafoglio
// (shop.js), che include anche quelli usati prima che esistessero le statistiche.
(function () {
  "use strict";

  const KEY = "prisma.stats.v1";
  let store = null;
  let s = blank();
  function blank() {
    const mode = () => ({ solved: 0, perfect: 0, hints: 0, ms: 0 });
    return { since: null, daily: {}, modes: { camp: mode(), daily: mode() }, moves: 0, undos: 0, resets: 0, fastest: 0 };
  }
  const num = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);

  function attachStorage(st, today) {
    store = st;
    s = blank();
    try {
      const raw = JSON.parse(store.getItem(KEY));
      if (raw && typeof raw === "object") {
        s.since = typeof raw.since === "string" ? raw.since : null;
        for (const m of ["camp", "daily"]) for (const k of ["solved", "perfect", "hints", "ms"]) s.modes[m][k] = num(raw.modes && raw.modes[m] && raw.modes[m][k]);
        for (const k of ["moves", "undos", "resets", "fastest"]) s[k] = num(raw[k]);
        if (raw.daily && typeof raw.daily === "object") {
          for (const [date, d] of Object.entries(raw.daily)) {
            if (!/^\d{4}-\d\d-\d\d$/.test(date) || !d) continue;
            s.daily[date] = {
              solved: Array.isArray(d.solved) ? [...new Set(d.solved.filter((i) => Number.isInteger(i) && i >= 0 && i < 10))] : [],
              ms: d.ms && typeof d.ms === "object" ? d.ms : {},
              hints: num(d.hints),
              draft: d.draft && Number.isInteger(d.draft.i) && Array.isArray(d.draft.lamps) ? d.draft : null,
            };
          }
        }
      }
    } catch { /* statistiche assenti o rovinate: si riparte da zero */ }
    if (!s.since) { s.since = today; save(); }
  }
  function save() {
    try { store && store.setItem(KEY, JSON.stringify(s)); } catch { /* niente da fare */ }
  }

  const day = (date) => (s.daily[date] ||= { solved: [], ms: {}, hints: 0, draft: null });
  const dayInfo = (date) => s.daily[date] || null;
  const isDone = (date, count) => !!s.daily[date] && s.daily[date].solved.length >= count;

  // ---------- Registrazione ----------
  function addTime(mode, ms, date, i) {
    if (!(ms > 0)) return;
    s.modes[mode].ms += ms;
    if (mode === "daily" && date != null) { const d = day(date); d.ms[i] = (d.ms[i] || 0) + ms; }
  }
  function move(kind) { if (kind === "undo") s.undos++; else if (kind === "reset") s.resets++; else s.moves++; }
  function hint(mode, date) { s.modes[mode].hints++; if (mode === "daily") day(date).hints++; save(); }
  // Livello risolto: conta una volta sola per livello (rigiocarlo non gonfia i numeri).
  function solvedCamp(firstTime, hints) {
    if (!firstTime) return;
    s.modes.camp.solved++;
    if (!hints) s.modes.camp.perfect++;
    save();
  }
  function solvedDaily(date, i, hints, count) {
    const d = day(date);
    if (d.solved.includes(i)) return false;
    d.solved.push(i);
    d.draft = null;
    s.modes.daily.solved++;
    if (!hints) s.modes.daily.perfect++;
    let complete = false;
    if (d.solved.length >= count) {
      complete = true;
      const total = Object.values(d.ms).reduce((a, v) => a + num(v), 0);
      if (total > 0 && (!s.fastest || total < s.fastest)) s.fastest = total;
    }
    save();
    return complete;
  }
  function setDraft(date, draft) { day(date).draft = draft; save(); }

  // ---------- Riepiloghi ----------
  // Serie: giorni consecutivi con la missione completata, fino a oggi (o fino a ieri, se oggi è ancora aperta).
  function streaks(today, count, dayBefore) {
    const done = (d) => isDone(d, count);
    let cur = 0;
    let d = done(today) ? today : dayBefore(today);
    while (done(d)) { cur++; d = dayBefore(d); }
    // Serie migliore: si scorrono i giorni completati in ordine.
    const dates = Object.keys(s.daily).filter(done).sort();
    let best = 0, run = 0, prev = null;
    for (const x of dates) {
      run = prev && dayBefore(x) === prev ? run + 1 : 1;
      best = Math.max(best, run);
      prev = x;
    }
    return { current: cur, best: Math.max(best, cur) };
  }
  function summary(today, count, dayBefore) {
    const days = Object.entries(s.daily);
    return {
      since: s.since,
      missions: days.filter(([, d]) => d.solved.length >= count).length,
      daysPlayed: days.filter(([, d]) => d.solved.length > 0).length,
      dailySolved: days.reduce((a, [, d]) => a + d.solved.length, 0),
      streak: streaks(today, count, dayBefore),
      fastest: s.fastest,
      modes: s.modes,
      moves: s.moves, undos: s.undos, resets: s.resets,
    };
  }

  window.PrismaStats = { attachStorage, save, addTime, move, hint, solvedCamp, solvedDaily, setDraft, dayInfo, isDone, summary };
})();
