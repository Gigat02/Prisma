// Prisma — impaginazione "a schermo": distribuisce una lista di blocchi in pagine che stanno
// interamente nello spazio disponibile, così nessuna schermata deve scorrere. Le pagine si sfogliano
// con frecce, pallini, swipe e tasti freccia. Sugli schermi larghi ogni pagina ha più colonne.
//
// Le pagine si ricalcolano misurando i blocchi veri a ogni cambio di dimensione: un telefono piccolo
// ne avrà di più, un PC di meno. Un blocco con data-keep="next" (un titolo) non resta mai in fondo a
// una colonna separato da ciò che introduce. Un blocco più alto della pagina viene rimpicciolito.
(function () {
  "use strict";

  function Pager(viewport, nav, opts = {}) {
    const gap = opts.gap ?? 12;
    const minCol = opts.minCol ?? 300;
    let items = [];
    let pages = [];      // pagine -> colonne -> blocchi
    let current = 0;
    let colsPerPage = 1;
    let lastSize = "";

    viewport.classList.add("pager");
    nav.classList.add("pager-nav");
    nav.innerHTML = `
      <button class="icon-btn pager-prev" aria-label="Pagina precedente"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
      <div class="pager-dots" aria-hidden="true"></div>
      <span class="pager-count"></span>
      <button class="icon-btn pager-next" aria-label="Pagina successiva"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>`;
    const prevBtn = nav.querySelector(".pager-prev");
    const nextBtn = nav.querySelector(".pager-next");
    prevBtn.addEventListener("click", () => go(current - 1));
    nextBtn.addEventListener("click", () => go(current + 1));

    // Swipe orizzontale sulla pagina.
    let sx = null, sy = null;
    viewport.addEventListener("pointerdown", (e) => { sx = e.clientX; sy = e.clientY; });
    viewport.addEventListener("pointerup", (e) => {
      if (sx == null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      sx = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(current + (dx < 0 ? 1 : -1));
    });

    function setItems(list) {
      items = list;
      lastSize = "";
      layout();
    }

    function layout() {
      const W = viewport.clientWidth, H = viewport.clientHeight;
      if (!W || !H || !items.length) return;
      const size = `${W}x${H}`;
      if (size === lastSize) return;
      lastSize = size;
      const firstItem = pages[current] && pages[current][0] && pages[current][0][0];

      const cols = Math.max(1, Math.min(opts.maxCols || 4, Math.floor((W + gap) / (minCol + gap))));
      const colW = (W - gap * (cols - 1)) / cols;
      colsPerPage = cols;
      // Misura: ogni blocco alla larghezza della colonna, fuori vista.
      const meas = document.createElement("div");
      meas.className = "pager-measure";
      meas.style.width = `${colW}px`;
      viewport.append(meas);
      if (opts.beforeMeasure) opts.beforeMeasure(); // es. la guida mette le didascalie più lunghe
      for (const it of items) { it.style.zoom = ""; meas.append(it); }
      // Altezza vera di ogni blocco, margini compresi (un titolo con margine sopra occupa di più).
      const hs = items.map((it) => {
        const cs = getComputedStyle(it);
        return it.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
      });
      meas.remove();
      if (opts.afterMeasure) opts.afterMeasure();

      // Riempimento: colonna dopo colonna, pagina dopo pagina, nell'ordine dei blocchi.
      pages = [];
      let page = [], col = [], used = 0;
      const closeCol = () => { if (col.length) page.push(col); col = []; used = 0; if (page.length === cols) { pages.push(page); page = []; } };
      for (let i = 0; i < items.length; i++) {
        let h = hs[i];
        if (h > H) { items[i].style.zoom = String(Math.max(0.5, H / h)); h = H; }
        // Un titolo deve stare insieme al blocco che lo segue.
        const need = items[i].dataset.keep === "next" && i + 1 < items.length ? h + gap + Math.min(hs[i + 1], H) : h;
        if (col.length && used + gap + need > H) closeCol();
        used += (col.length ? gap : 0) + h;
        col.push(items[i]);
      }
      closeCol();
      if (page.length) pages.push(page);

      let k = 0;
      if (firstItem) k = Math.max(0, pages.findIndex((p) => p.some((c) => c.includes(firstItem))));
      render(Math.min(k, pages.length - 1));
    }

    function render(k) {
      current = Math.max(0, Math.min(pages.length - 1, k));
      const wrap = document.createElement("div");
      wrap.className = "pager-page";
      wrap.style.gap = `${gap}px`;
      // Sempre lo stesso numero di colonne (anche vuote): le larghezze restano quelle misurate.
      const cs = pages[current] || [];
      for (let k = 0; k < colsPerPage; k++) {
        const col = document.createElement("div");
        col.className = "pager-col";
        col.style.gap = `${gap}px`;
        if (cs[k]) col.append(...cs[k]);
        wrap.append(col);
      }
      viewport.replaceChildren(wrap);
      const n = pages.length;
      nav.hidden = n <= 1;
      prevBtn.disabled = current === 0;
      nextBtn.disabled = current === n - 1;
      const dots = nav.querySelector(".pager-dots");
      dots.innerHTML = n <= 12 ? pages.map((_, i) => `<i class="${i === current ? "now" : ""}"></i>`).join("") : "";
      nav.querySelector(".pager-count").textContent = n > 12 ? `${current + 1} / ${n}` : "";
      if (opts.onPage) opts.onPage(current, n);
    }

    function go(k) {
      if (k < 0 || k >= pages.length || k === current) return;
      render(k);
    }

    // Va alla pagina che contiene il blocco indicato (es. il capitolo da giocare).
    function show(item) {
      layout();
      const k = pages.findIndex((p) => p.some((c) => c.includes(item)));
      if (k >= 0) render(k);
    }

    if (window.ResizeObserver) new ResizeObserver(() => requestAnimationFrame(layout)).observe(viewport);

    return {
      setItems, layout, show, go,
      next: () => go(current + 1), prev: () => go(current - 1),
      relayout: () => { lastSize = ""; layout(); },
      get page() { return current; },
      get count() { return pages.length; },
    };
  }

  window.PrismaPager = Pager;
})();
