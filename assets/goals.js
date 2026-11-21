// Prisma — obiettivi: traguardi secondari che si sbloccano giocando, salvati sul dispositivo.
//
// Alcuni dipendono da come si risolve un livello (tempo, errori, suggerimenti): li aggiorna levelDone()
// alla fine di ogni livello. Altri dipendono dai progressi (capitoli, serie, tempo totale): li ricontrolla
// check() con un riepilogo dello stato, così valgono anche per chi li aveva già raggiunti prima.
// "Errore" = togliere una sorgente, annullare o ricominciare durante il livello.
(function () {
  "use strict";

  const KEY = "prisma.goals.v1";
  let store = null;
  let s = blank();
  function blank() { return { unlocked: {}, runClean: 0, runNoHint: 0 }; }

  const GOALS = [
    { id: "lampo", title: "Lampo", desc: "Completa un livello oltre il 50 in meno di 20 secondi." },
    { id: "mano-ferma", title: "Mano ferma", desc: "Completa 5 livelli di fila senza errori (senza togliere sorgenti, annullare o ricominciare).", max: 5, cur: () => s.runClean },
    { id: "da-solo", title: "Da solo", desc: "Completa 10 livelli di fila senza suggerimenti.", max: 10, cur: () => s.runNoHint },
    { id: "esploratore", title: "Esploratore", desc: "Completa 10 capitoli della modalità normale.", max: 10, cur: (c) => c.chaptersDone },
    { id: "ingranaggi", title: "Ingranaggi", desc: "Completa il capitolo «Ingranaggi», quello delle caselle girevoli." },
    { id: "alla-vetta", title: "Alla vetta", desc: "Sblocca la Sfida suprema completando il livello 30." },
    { id: "costanza", title: "Costanza", desc: "Completa la missione giornaliera 3 giorni di fila.", max: 3, cur: (c) => c.dailyStreak },
    { id: "missione-pulita", title: "Missione pulita", desc: "Completa una missione giornaliera senza usare suggerimenti." },
    { id: "corsa", title: "Corsa", desc: "Completa una missione giornaliera intera in meno di 15 minuti." },
    { id: "maratoneta", title: "Maratoneta", desc: "Gioca 3 ore in tutto.", max: 3 * 3600e3, cur: (c) => c.playMs, time: true },
  ];

  function attachStorage(st) {
    store = st;
    s = blank();
    try {
      const raw = JSON.parse(store.getItem(KEY));
      if (raw && typeof raw === "object") {
        if (raw.unlocked && typeof raw.unlocked === "object") for (const g of GOALS) if (typeof raw.unlocked[g.id] === "string") s.unlocked[g.id] = raw.unlocked[g.id];
        s.runClean = Number.isInteger(raw.runClean) && raw.runClean >= 0 ? raw.runClean : 0;
        s.runNoHint = Number.isInteger(raw.runNoHint) && raw.runNoHint >= 0 ? raw.runNoHint : 0;
      }
    } catch { /* obiettivi assenti o rovinati: si riparte */ }
  }
  function save() { try { store && store.setItem(KEY, JSON.stringify(s)); } catch { /* niente da fare */ } }

  // Sblocca gli obiettivi che soddisfano la condizione; restituisce quelli appena sbloccati.
  function unlock(ids) {
    const fresh = [];
    for (const id of ids) {
      if (s.unlocked[id]) continue;
      s.unlocked[id] = new Date().toISOString();
      fresh.push(GOALS.find((g) => g.id === id));
    }
    if (fresh.length) save();
    return fresh;
  }

  // Fine di un livello. info: { mode: "camp" | "daily", number (1..), ms, hints, errors }.
  function levelDone(info) {
    s.runClean = info.errors ? 0 : s.runClean + 1;
    s.runNoHint = info.hints ? 0 : s.runNoHint + 1;
    save();
    const ids = [];
    if (info.mode === "camp" && info.number > 50 && info.ms > 0 && info.ms < 20000) ids.push("lampo");
    if (s.runClean >= 5) ids.push("mano-ferma");
    if (s.runNoHint >= 10) ids.push("da-solo");
    return unlock(ids);
  }

  // Obiettivi legati ai progressi. c: { chaptersDone, ingranaggi, level30, dailyStreak, missionPerfect, missionFastMs, playMs }.
  function check(c) {
    const ids = [];
    if (c.chaptersDone >= 10) ids.push("esploratore");
    if (c.ingranaggi) ids.push("ingranaggi");
    if (c.level30) ids.push("alla-vetta");
    if (c.dailyStreak >= 3) ids.push("costanza");
    if (c.missionPerfect) ids.push("missione-pulita");
    if (c.missionFastMs > 0 && c.missionFastMs < 15 * 60e3) ids.push("corsa");
    if (c.playMs >= 3 * 3600e3) ids.push("maratoneta");
    return unlock(ids);
  }

  // Elenco per la pagina: { id, title, desc, done, date, progress: [attuale, massimo] | null, time }.
  function list(c) {
    return GOALS.map((g) => ({
      id: g.id, title: g.title, desc: g.desc, time: !!g.time,
      done: !!s.unlocked[g.id],
      date: s.unlocked[g.id] || null,
      progress: g.max ? [Math.min(g.max, g.cur(c) || 0), g.max] : null,
    }));
  }
  const count = () => Object.keys(s.unlocked).length;

  window.PrismaGoals = { attachStorage, levelDone, check, list, count, TOTAL: GOALS.length };
})();
