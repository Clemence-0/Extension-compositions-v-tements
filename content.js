(async () => {
  const host = location.hostname.replace(/^www\./, '');
  let S = { ...CC.DEFAULTS, ...(await chrome.storage.sync.get(null)) };
  if (!S.sites.includes(host)) return; // inactif tant que le site n'est pas activé dans le popup

  // Les compositions analysées avec une ancienne version sont jetées
  if ((await chrome.storage.local.get('cacheVersion')).cacheVersion !== CC.VERSION) {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({ cacheVersion: CC.VERSION });
  }

  const CACHE_TTL = 7 * 864e5, MISS_TTL = 864e5, CONCURRENCY = 3;
  const PRICE_RE = /\d\s?(€|eur\b|\$|£|chf)|(€|\$|£)\s?\d/i;

  const cards = new Map();    // élément carte -> { key, href, comp, done }
  const keyOf = new WeakMap(); // <a> -> URL normalisée
  const results = new Map();  // URL -> Promise<composition|null>
  const queue = [];
  let active = 0, revealed = false;

  const normUrl = href => {
    try { const u = new URL(href, location.href); return u.origin === location.origin ? u.origin + u.pathname : null; }
    catch { return null; }
  };

  // ---------- Récupération des fiches produit ----------
  async function fetchComp(key, href, text) {
    const cached = (await chrome.storage.local.get(key))[key];
    const found = cached?.c && (cached.c.fibers || cached.c.type === 'hors');
    if (cached && Date.now() - cached.t < (found ? CACHE_TTL : MISS_TTL)) return cached.c;
    // "Mocassin homme…", ".../parfums/..." : type non analysé, inutile d'ouvrir la fiche
    const type = CC.cardType(text, href);
    if (type === 'hors' || !S.types.includes(type)) return { type, skipped: true };
    try {
      const r = await fetch(href, { credentials: 'include' });
      if (!r.ok) return null;
      const c = CC.analyze(CC.parseHtml(await r.text()), href);
      await chrome.storage.local.set({ [key]: { c, t: Date.now() } });
      return c;
    } catch { return null; }
  }

  function getComp(key, href, text) {
    if (!results.has(key)) results.set(key, new Promise(res => queue.push({ key, href, text, res })));
    pump();
    return results.get(key);
  }

  function pump() {
    while (active < CONCURRENCY && queue.length) {
      const { key, href, text, res } = queue.shift();
      active++; updatePill();
      fetchComp(key, href, text).then(res, () => res(null)).finally(() => { active--; pump(); updatePill(); });
    }
  }

  // ---------- Détection des cartes produit ----------
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); processCard(e.target); }
  }, { rootMargin: '1200px 0px' });

  async function processCard(card) {
    const info = cards.get(card);
    if (!info) return;
    info.comp = await getComp(info.key, info.href, card.textContent);
    info.done = true;
    apply(card);
  }

  function hasOtherProduct(el, key) {
    for (const a of el.querySelectorAll('a[href]')) { const k = keyOf.get(a); if (k && k !== key) return true; }
    return false;
  }

  function scan() {
    const here = normUrl(location.href);
    const links = [];
    for (const a of document.querySelectorAll('a[href]')) {
      if (a.closest('header, nav, footer, .cc-ui')) continue;
      if (!a.querySelector('img, picture, video')) continue;
      const w = a.getBoundingClientRect().width;
      if (w && w < 70) continue; // pastilles couleur
      const key = normUrl(a.href);
      if (!key || key === here || new URL(key).pathname.length < 3) continue;
      keyOf.set(a, key);
      links.push(a);
    }
    for (const a of links) {
      if (a.closest('.cc-card')) continue;
      const key = keyOf.get(a);
      let el = a;
      for (let i = 0; i < 10; i++) {
        const p = el.parentElement;
        if (!p || p === document.body || hasOtherProduct(p, key)) break;
        el = p;
      }
      if (el.classList.contains('cc-card') || !PRICE_RE.test(el.textContent)) continue;
      el.classList.add('cc-card');
      cards.set(el, { key, href: a.href, comp: null, done: false });
      io.observe(el);
    }
    updatePill();
  }

  // ---------- Affichage ----------
  function apply(card) {
    const info = cards.get(card);
    if (!info || !info.done) return;
    const v = CC.verdict(info.comp, S);
    info.status = v.status;
    const flagged = v.status === 'bad' || (v.status === 'unknown' && S.hideUnknown);
    card.classList.toggle('cc-hidden', flagged && S.mode === 'hide' && !revealed);
    card.classList.toggle('cc-dimmed', flagged && (S.mode === 'dim' || revealed));

    // Article non concerné : pas de pastille, l'extension se tait
    let b = card.querySelector(':scope > .cc-badge');
    if (S.badges && v.status !== 'na') {
      if (!b) {
        b = document.createElement('div');
        b.className = 'cc-badge cc-ui';
        if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
        card.appendChild(b);
      }
      b.dataset.status = v.status;
      b.textContent = v.status === 'unknown' ? '? introuvable' : CC.describe(info.comp.fibers);
    } else if (b) b.remove();
    updatePill();
  }

  const pill = document.createElement('div');
  pill.className = 'cc-pill cc-ui';
  document.documentElement.appendChild(pill);
  pill.addEventListener('click', e => {
    if (e.target.dataset.act !== 'toggle') return;
    revealed = !revealed;
    cards.forEach((_, c) => apply(c));
  });

  function updatePill() {
    let done = 0, flagged = 0;
    for (const [c, i] of cards) {
      if (!c.isConnected) { cards.delete(c); continue; }
      if (!i.done || i.status === 'na') continue; // les non concernés ne comptent pas
      done++;
      if (c.classList.contains('cc-hidden') || c.classList.contains('cc-dimmed')) flagged++;
    }
    const busy = active > 0 || queue.length > 0;
    pill.innerHTML = `<span>🧵 ${flagged} écarté${flagged > 1 ? 's' : ''} / ${done} analysé${done > 1 ? 's' : ''}${busy ? ' · …' : ''}</span>`
      + (flagged && S.mode === 'hide' ? `<button data-act="toggle">${revealed ? 'Masquer' : 'Afficher'}</button>` : '');
    pill.style.display = cards.size ? '' : 'none';
  }

  // ---------- Fiche produit ouverte ----------
  let lastUrl = '';
  function checkProductPage(attempt = 0) {
    document.querySelector('.cc-banner')?.remove();
    const doc = CC.parseHtml(document.documentElement.outerHTML), page = CC.productInfo(doc);
    const comp = CC.judge(doc.documentElement.textContent, page, location.href);
    const v = CC.verdict(comp, S);
    if (v.status === 'na') return;
    if (!comp.sure) { // introuvable, ou trouvé loin de tout mot-clé "composition" : la page finit peut-être de charger
      if (attempt < 2) return setTimeout(() => location.href === lastUrl && checkProductPage(attempt + 1), 2500);
      if (!page.isProduct) return; // pages liste : rien à dire
    }
    if (v.status === 'unknown') return banner('unknown', '? Composition introuvable sur cette fiche');
    banner(v.status, `${v.status === 'bad' ? '✗' : '✓'} ${CC.describe(comp.fibers)} — ${v.bad}% de fibres exclues (seuil ${S.threshold}%)`
      + (comp.sure ? '' : ' · à vérifier'));
  }

  function banner(status, text) {
    const el = document.createElement('div');
    el.className = 'cc-banner cc-ui';
    el.dataset.status = status;
    el.innerHTML = `<span></span><button aria-label="Fermer">×</button>`;
    el.firstChild.textContent = text;
    el.lastChild.onclick = () => el.remove();
    document.documentElement.appendChild(el);
  }

  function onUrl() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    setTimeout(() => checkProductPage(), 1200);
  }

  // ---------- Démarrage ----------
  scan();
  onUrl();
  let t;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(scan, 600); })
    .observe(document.body, { childList: true, subtree: true });
  setInterval(onUrl, 1000); // navigation des sites "single page"

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'sync') return;
    for (const k in ch) S[k] = ch[k].newValue ?? CC.DEFAULTS[k];
    if (ch.types) cards.forEach((info, c) => { // fiches jamais ouvertes car type non coché : on les ouvre maintenant
      if (!info.comp?.skipped) return;
      results.delete(info.key);
      info.done = false;
      processCard(c);
    });
    cards.forEach((_, c) => apply(c));
    lastUrl = ''; onUrl();
  });
})();
