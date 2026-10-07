// Prisma — legenda della partita. Mostra solo le regole già in vigore al livello che si sta giocando:
// per ogni voce si cerca il primo livello in cui compare davvero (un colore richiesto, un tipo di
// sorgente, un elemento), così la legenda cresce con il gioco e non anticipa nulla.
(function () {
  "use strict";

  const core = window.PrismaCore;
  const R = window.PrismaRender;
  const { levels } = window.PRISMA_LEVELS;

  // Voci della legenda, nell'ordine in cui compaiono nel pannello.
  // has(b): il livello contiene la voce? Le voci "always" valgono dal primo livello.
  const MIX = [
    { key: "mix-y", parts: [1, 2], out: 3 },
    { key: "mix-m", parts: [1, 4], out: 5 },
    { key: "mix-c", parts: [2, 4], out: 6 },
    { key: "mix-w", parts: [1, 2, 4], out: 7 },
  ];
  const targets = (b) => b.floor.filter((i) => !b.veil[i]).map((i) => b.target[i]);
  const lampTypes = (b) => new Set([...b.inv.map((k, m) => (k > 0 ? m : 0)).filter(Boolean), ...b.fixed.values()]);
  const kinds = (b, k) => [...b.kind].some((x) => x === k);

  const FEATURES = {
    dark: (b) => targets(b).includes(0),
    wall: (b) => kinds(b, core.WALL),
    void: (b) => kinds(b, core.VOID),
    mirror: (b) => kinds(b, core.MIRROR_A) || kinds(b, core.MIRROR_B),
    glass: (b) => kinds(b, core.GLASS),
    prism: (b) => kinds(b, core.PRISM),
    veil: (b) => b.floor.some((i) => b.veil[i]),
    fixed: (b) => b.fixed.size > 0,
  };
  for (const mx of MIX) FEATURES[mx.key] = (b) => targets(b).includes(mx.out) || lampTypes(b).has(mx.out);
  for (const m of [3, 5, 6, 7]) FEATURES[`lamp-${m}`] = (b) => lampTypes(b).has(m);
  for (const m of [1, 2, 3, 4, 5, 6]) FEATURES[`glass-${m}`] = (b) => b.special.some((i) => b.kind[i] === core.GLASS && b.glass[i] === m);

  // Primo livello in cui compare ogni voce (calcolato una volta sola).
  let first = null;
  function firstSeen() {
    if (first) return first;
    first = {};
    levels.forEach((lvl, i) => {
      const b = core.parse(lvl);
      for (const [key, has] of Object.entries(FEATURES)) if (!(key in first) && has(b)) first[key] = i;
    });
    return first;
  }

  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  const NAMES = R.COLOR_NAMES;
  const chan = (m) => [1, 2, 4].filter((c) => m & c).map((c) => `<b class="c${c}">${NAMES[c]}</b>`);
  const list = (a) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} e ${a[a.length - 1]}` : a[0]);

  // Esempi fermi per gli elementi, costruiti dal motore.
  const EXAMPLES = {
    mirror: () => R.demo(["...\\", "....", "...."], [[0, 0, "r"]]),
    glass: () => R.demo([".Y..", "....", "...."], [[0, 0, "w"]]),
    prism: () => R.demo(["...", ".P.", "..."], [[0, 1, "w"]]),
  };

  // Costruisce il contenuto della legenda per il livello idx.
  function build(idx) {
    const f = firstSeen();
    const seen = (key) => key in f && f[key] <= idx;
    const fresh = (key) => f[key] === idx;
    const root = document.createDocumentFragment();

    const section = (title) => {
      const s = el("section", "legend-sec");
      s.append(el("h3", "legend-h", title));
      const ul = el("ul", "legend-list");
      s.append(ul);
      root.append(s);
      return ul;
    };
    const item = (ul, icon, html, key) => {
      const li = el("li");
      const ic = el("span", "legend-ic");
      if (icon) ic.append(icon);
      li.append(ic);
      const p = el("p", null, html);
      if (key && fresh(key)) p.prepend(el("span", "badge-new", "nuovo"));
      li.append(p);
      ul.append(li);
      return li;
    };

    // Regole di base: valgono sempre.
    const first0 = levels[0] ? core.parse(levels[0]) : null;
    const baseColor = first0 ? [...lampTypes(first0)][0] || 1 : 1;
    const base = section("Regole");
    item(base, R.mini("lamp", baseColor), "La <b>sorgente</b> illumina la sua <b>riga</b> e la sua <b>colonna</b>, in tutte e quattro le direzioni.");
    item(base, R.mini("target", baseColor), "Il <b>quadratino</b> al centro è il colore che la casella deve avere alla fine.");
    if (seen("dark")) item(base, R.mini("dark", baseColor), "Quadratino <b>scuro</b>: la casella deve restare al buio. La luce non si spegne, quindi una sorgente di troppo rovina tutto.", "dark");
    if (seen("wall")) item(base, R.mini("wall"), "Il <b>muro</b> ferma la luce.", "wall");
    if (seen("void")) item(base, R.mini("void"), "Dove la griglia <b>non ha caselle</b> la luce si ferma, come contro un muro.", "void");
    item(base, null, "Tocca una sorgente per toglierla. Ogni livello ha <b>una sola</b> soluzione.");

    // Miscele: la luce si somma per canali.
    const mixes = MIX.filter((mx) => seen(mx.key));
    if (mixes.length) {
      const ul = section("Colori");
      for (const mx of mixes) {
        const eq = el("span", "eq");
        mx.parts.forEach((p, k) => { if (k) eq.append("+"); eq.append(R.mini("swatch", p)); });
        eq.append("=", R.mini("swatch", mx.out));
        const li = item(ul, null, `${list(chan(mx.out))} = <b>${NAMES[mx.out]}</b>`, mx.key);
        li.classList.add("eq-row");
        li.firstChild.replaceWith(eq);
      }
      item(ul, null, "È luce, non tempera: i colori si <b>sommano</b> e il bianco li contiene tutti.");
    }

    // Sorgenti composte.
    const composite = [3, 5, 6, 7].filter((m) => seen(`lamp-${m}`));
    if (composite.length) {
      const ul = section("Sorgenti");
      for (const m of composite) {
        item(ul, R.mini("lamp", m), `La sorgente <b>${R.LAMP_NAMES[m]}</b> emette ${list(chan(m))} insieme, lungo la stessa riga e colonna.`, `lamp-${m}`);
      }
    }

    // Elementi della griglia.
    const els = [];
    if (seen("mirror")) els.push(["mirror", R.mini("mirror-a"), "Lo <b>specchio</b> devia il raggio di 90°, come una sponda. Funziona da entrambi i lati. Qui sotto: il rosso va a destra, rimbalza e scende."]);
    if (seen("glass")) {
      const cols = [1, 2, 3, 4, 5, 6].filter((m) => seen(`glass-${m}`));
      const lines = cols.map((m) => `vetro ${NAMES[m]}: passa ${list(chan(m))}`).join("; ");
      els.push(["glass", R.mini("glass", cols[0] || 3), `Il <b>vetro</b> lascia passare solo i colori che contiene e ferma gli altri (${lines}). Qui sotto: il bianco attraversa il vetro giallo e ne esce giallo.`]);
    }
    if (seen("prism")) els.push(["prism", R.mini("prism"), "Il <b>prisma</b> scompone la luce: il <b class=\"c2\">verde</b> prosegue dritto, il <b class=\"c1\">rosso</b> gira a <b>sinistra</b>, il <b class=\"c4\">blu</b> a <b>destra</b>, rispetto a dove va il raggio. Qui sotto: il bianco arriva da sinistra."]);
    if (seen("veil")) els.push(["veil", R.mini("veil"), "La casella <b>velata</b> nasconde il colore richiesto: va bene qualsiasi. Meno indizi, stesse regole."]);
    if (seen("fixed")) els.push(["fixed", R.mini("fixed", 7), "Il <b>faro</b> (a rombo) è una sorgente già accesa: non si sposta e non si toglie."]);
    if (els.length) {
      const ul = section("Elementi");
      for (const [key, icon, html] of els) {
        const li = item(ul, icon, html, key);
        if (EXAMPLES[key]) {
          const box = el("div", "board legend-demo");
          R.still(box, EXAMPLES[key](), null, 22);
          li.querySelector("p").append(box);
        }
      }
    }
    return root;
  }

  window.PrismaLegend = { build, firstSeen };
})();
