// Prisma — suggerimenti, portafoglio e negozio. Nessuna dipendenza dal DOM.
//
// Oggi i suggerimenti sono gratuiti e illimitati (CONFIG.paidHints = false): si conta solo quanti ne
// sono stati usati in tutto, e il menu lo mostra. Il giorno in cui diventano a pagamento:
//   1. si sceglie un fornitore e si scrive il suo adattatore (stessa forma di NO_PAYMENTS, sotto);
//   2. lo si registra con PrismaShop.setProvider(adattatore);
//   3. si mette CONFIG.verifyUrl, l'indirizzo del server che controlla le ricevute;
//   4. si porta CONFIG.paidHints a true: da lì ogni suggerimento scala il saldo.
// Il saldo cresce SOLO dopo una ricevuta verificata dal server: il browser non è affidabile, chiunque
// può modificare il proprio localStorage. Per lo stesso motivo, con i pagamenti attivi il saldo
// "vero" dovrà vivere sul server legato a un account; quello locale resta una copia di comodo.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PrismaShop = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const CONFIG = {
    paidHints: false,      // false: suggerimenti gratuiti e illimitati, si contano soltanto
    welcomeHints: 5,       // regalo iniziale quando diventeranno a pagamento
    currency: "EUR",
    verifyUrl: null,       // es. "https://api.esempio.it/prisma/verifica-ricevuta"
  };

  // Pacchetti in vendita. Il prezzo è in centesimi per non avere errori di arrotondamento.
  // L'id è quello che andrà configurato identico nel catalogo del fornitore di pagamento.
  const PACKAGES = [
    { id: "hints_10", hints: 10, cents: 100 },
    { id: "hints_30", hints: 30, cents: 250, badge: "Più scelto" },
    { id: "hints_75", hints: 75, cents: 500 },
    { id: "hints_200", hints: 200, cents: 1000, badge: "Miglior prezzo" },
  ];

  // ---------- Portafoglio ----------
  const KEY = "prisma.wallet.v1";
  const blank = () => ({ used: 0, balance: CONFIG.welcomeHints, purchases: [] });
  let state = blank();
  let storage = null;
  const listeners = new Set();

  function attachStorage(s) { // la pagina passa localStorage; nei test si può passare un finto archivio
    storage = s;
    state = blank();
    try {
      const raw = JSON.parse(storage.getItem(KEY));
      if (raw && typeof raw === "object") {
        state = {
          used: Number.isInteger(raw.used) && raw.used >= 0 ? raw.used : 0,
          balance: Number.isInteger(raw.balance) && raw.balance >= 0 ? raw.balance : CONFIG.welcomeHints,
          purchases: Array.isArray(raw.purchases) ? raw.purchases.filter((p) => p && typeof p.id === "string") : [],
        };
      }
    } catch { /* archivio assente o rovinato: si riparte dal portafoglio vuoto */ }
  }
  function persist() {
    try { if (storage) storage.setItem(KEY, JSON.stringify(state)); } catch { /* archivio pieno o bloccato */ }
    for (const fn of listeners) { try { fn(snapshot()); } catch { /* un ascoltatore rotto non blocca gli altri */ } }
  }
  const snapshot = () => ({ used: state.used, balance: state.balance, paid: CONFIG.paidHints, purchases: state.purchases.slice() });

  const canUseHint = () => !CONFIG.paidHints || state.balance > 0;
  // Da chiamare solo quando il suggerimento viene davvero mostrato.
  function consumeHint() {
    if (!canUseHint()) return false;
    state.used++;
    if (CONFIG.paidHints) state.balance--;
    persist();
    return true;
  }

  // ---------- Pagamenti ----------
  // Forma di un fornitore: { id, available(): Promise<bool>, purchase(pkg): Promise<{ ok, receipt?, reason? }> }.
  // Esempi futuri: Stripe Checkout (sito), Google Play Billing tramite Digital Goods API (app Android),
  // App Store (app iOS). Ognuno restituisce una ricevuta che il server sa verificare.
  const NO_PAYMENTS = {
    id: "nessuno",
    available: async () => false,
    purchase: async () => ({ ok: false, reason: "not-available" }),
  };
  let provider = NO_PAYMENTS;
  const setProvider = (p) => { provider = p || NO_PAYMENTS; };

  async function verifyReceipt(pkg, receipt) {
    if (!CONFIG.verifyUrl) return false; // senza server non si accredita niente
    try {
      const res = await fetch(CONFIG.verifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: provider.id, packageId: pkg.id, receipt }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      return data && data.valid === true && data.packageId === pkg.id;
    } catch { return false; }
  }

  // Acquisto completo: disponibilità, pagamento, verifica, accredito. Non lancia mai eccezioni.
  // reason: "not-available" | "unknown-package" | "cancelled" | "failed" | "unverified"
  async function buy(packageId) {
    const pkg = PACKAGES.find((p) => p.id === packageId);
    if (!pkg) return { ok: false, reason: "unknown-package" };
    try {
      if (!(await provider.available())) return { ok: false, reason: "not-available" };
      const res = await provider.purchase(pkg);
      if (!res || !res.ok) return { ok: false, reason: (res && res.reason) || "failed" };
      if (state.purchases.some((p) => p.receipt === res.receipt)) return { ok: false, reason: "unverified" }; // ricevuta già usata
      if (!(await verifyReceipt(pkg, res.receipt))) return { ok: false, reason: "unverified" };
      state.balance += pkg.hints;
      state.purchases.push({ id: pkg.id, hints: pkg.hints, at: new Date().toISOString(), receipt: res.receipt });
      persist();
      return { ok: true, hints: pkg.hints };
    } catch {
      return { ok: false, reason: "failed" };
    }
  }

  const fmt = typeof Intl !== "undefined" ? new Intl.NumberFormat("it-IT", { style: "currency", currency: CONFIG.currency }) : null;
  const price = (cents) => (fmt ? fmt.format(cents / 100) : `${(cents / 100).toFixed(2).replace(".", ",")} €`);

  return {
    CONFIG, PACKAGES,
    attachStorage, snapshot, canUseHint, consumeHint,
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    setProvider, buy, price,
    paymentsAvailable: async () => { try { return await provider.available(); } catch { return false; } },
  };
});
