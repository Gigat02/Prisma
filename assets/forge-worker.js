// Prisma — crea i livelli della missione giornaliera in sottofondo, senza bloccare il gioco.
// Riceve { date, indices } e risponde con un messaggio per livello: { date, i, level }.
importScripts("core.js", "forge.js");
self.onmessage = (e) => {
  const { date, indices } = e.data;
  const m = self.PrismaForge.modifiers(date);
  for (const i of indices) {
    let level = null;
    try { level = self.PrismaForge.level(date, i, m); } catch { /* resta null: la pagina lo segnala */ }
    self.postMessage({ date, i, level });
  }
};
