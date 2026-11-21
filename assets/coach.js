// Prisma — "allenatore": fumetti che indicano un punto preciso dello schermo (una casella, una sorgente,
// un pulsante) e spiegano cosa fare. Li usano il tutorial e i primi livelli.
// Contiene anche il commento alle mosse: dato lo stato della griglia, cosa c'è che non va e dove.
(function () {
  "use strict";

  const R = window.PrismaRender;
  let bubble = null, target = null, onButton = null;

  // Mostra un fumetto accanto a el. opts.button: testo di un pulsante (es. "Avanti") che chiama opts.onNext.
  // opts.pulse: fa pulsare l'elemento indicato (per dire "tocca qui").
  function show(el, html, opts = {}) {
    clear();
    if (!el || !el.isConnected) return;
    target = el;
    bubble = document.createElement("div");
    bubble.className = "coach";
    bubble.setAttribute("role", "status");
    const p = document.createElement("p");
    p.innerHTML = html;
    bubble.append(p);
    if (opts.button) {
      const b = document.createElement("button");
      b.className = "btn primary coach-btn";
      b.textContent = opts.button;
      onButton = opts.onNext || clear;
      b.addEventListener("click", (e) => { e.stopPropagation(); const fn = onButton; clear(); fn(); });
      bubble.append(b);
    }
    else {
      // Senza pulsante il fumetto si chiude toccandolo: non deve mai impedire di toccare le caselle sotto.
      bubble.classList.add("dismissable");
      bubble.addEventListener("click", clear);
    }
    document.body.append(bubble);
    el.classList.add(opts.pulse ? "coach-pulse" : "coach-ring");
    place();
  }

  // Sotto l'elemento se c'è spazio, altrimenti sopra; la freccia punta sempre al suo centro.
  // Altezza in pixel di --safe-top (è un calc, quindi va misurata su un elemento).
  function safeTopPx() {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;visibility:hidden;height:var(--safe-top)";
    document.body.append(probe);
    const h = probe.offsetHeight;
    probe.remove();
    return h;
  }
  function place() {
    if (!bubble || !target) return;
    if (!target.isConnected) { clear(); return; }
    const r = target.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const bw = Math.min(300, vw - 24);
    bubble.style.width = `${bw}px`;
    const bh = bubble.offsetHeight;
    const cx = r.left + r.width / 2;
    const left = Math.max(12, Math.min(vw - bw - 12, cx - bw / 2));
    const safeTop0 = safeTopPx();
    const below = r.bottom + 14 + bh <= vh - 8 || r.top - 14 - bh < 8 + safeTop0;
    const top = below ? r.bottom + 14 : r.top - 14 - bh;
    bubble.style.left = `${left}px`;
    // Mai sotto la barra di stato del telefono (notch, isola, ora e batteria).
    bubble.style.top = `${Math.max(8 + safeTop0, top)}px`;
    bubble.classList.toggle("above", !below);
    bubble.style.setProperty("--ax", `${Math.max(16, Math.min(bw - 16, cx - left))}px`);
  }

  function clear() {
    if (bubble) bubble.remove();
    if (target) target.classList.remove("coach-pulse", "coach-ring");
    bubble = target = onButton = null;
  }
  const active = () => !!bubble;

  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, true);

  // ---------- Commento alle mosse ----------
  const NAMES = R.COLOR_NAMES;
  const chans = (m) => [1, 2, 4].filter((c) => m & c).map((c) => NAMES[c]);
  const join = (a) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} e ${a[a.length - 1]}` : a[0]);

  // Cosa non va nella griglia: { cell, html, kind } oppure null se va tutto bene finora.
  //  "over":  una casella riceve luce che non deve ricevere (l'errore più importante: va corretto subito);
  //  "stuck": sorgenti finite ma il livello non è risolto;
  //  "ok":    nessun errore, si può continuare.
  function feedback(b, lamps, lit, left) {
    for (const i of b.floor) {
      if (b.veil[i]) continue;
      const extra = lit[i] & ~b.target[i];
      if (!extra) continue;
      const html = b.target[i] === 0
        ? "<b>Troppa luce.</b> Questa casella deve restare <b>al buio</b>, ma una sorgente la illumina. Spostala: tocca la sorgente per toglierla."
        : `<b>Troppa luce.</b> Questa casella vuole il <b>${NAMES[b.target[i]]}</b>, ma riceve anche ${join(chans(extra))}. Una sorgente è nel posto sbagliato.`;
      return { cell: i, html, kind: "over" };
    }
    const missing = b.floor.find((i) => !b.veil[i] && lit[i] !== b.target[i]);
    if (missing == null) return null;
    if (left <= 0) {
      return {
        cell: missing, kind: "stuck",
        html: `Hai usato tutte le sorgenti, ma questa casella non ha ancora il suo <b>${NAMES[b.target[missing]]}</b>. Qualche sorgente va spostata.`,
      };
    }
    return { cell: missing, kind: "ok", html: "Bene: nessuna casella ha luce di troppo. Continua." };
  }

  window.PrismaCoach = { show, clear, place, active, feedback };
})();
