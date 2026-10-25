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
  async function fetchComp(key, href) {
    const cached = (await chrome.storage.local.get(key))[key];
    if (cached && Date.now() - cached.t < (cached.c ? CACHE_TTL : MISS_TTL)) return cached.c;
    try {
      const r = await fetch(href, { credentials: 'include' });
      if (!r.ok) return null;
      const c = CC.parseText(CC.htmlToText(await r.text()));
      await chrome.storage.local.set({ [key]: { c, t: Date.now() } });
      return c;
    } catch { return null; }
  }

  function getComp(key, href) {
    if (!results.has(key)) results.set(key, new Promise(res => queue.push({ key, href, res })));
    pump();
    return results.get(key);
  }

  function pump() {
    while (active < CONCURRENCY && queue.length) {
      const { key, href, res } = queue.shift();
      active++; updatePill();
      fetchComp(key, href).then(res, () => res(null)).finally(() => { active--; pump(); updatePill(); });
    }
  }

  // ---------- Détection des cartes produit ----------
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); processCard(e.target); }
  }, { rootMargin: '1200px 0px' });

  async function processCard(card) {
    const info = cards.get(card);
    if (!info) return;
    info.comp = await getComp(info.key, info.href);
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
    const flagged = v.status === 'bad' || (v.status === 'unknown' && S.hideUnknown);
    card.classList.toggle('cc-hidden', flagged && S.mode === 'hide' && !revealed);
    card.classList.toggle('cc-dimmed', flagged && (S.mode === 'dim' || revealed));

    let b = card.querySelector(':scope > .cc-badge');
    if (S.badges) {
      if (!b) {
        b = document.createElement('div');
        b.className = 'cc-badge cc-ui';
        if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
        card.appendChild(b);
      }
      b.dataset.status = v.status;
      b.textContent = v.status === 'unknown' ? '? inconnue' : CC.describe(info.comp.fibers);
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
      if (!i.done) continue;
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
    const comp = CC.parseText(CC.htmlToText(document.documentElement.outerHTML));
    if (!comp || !comp.sure) {
      if (attempt < 2) setTimeout(() => location.href === lastUrl && checkProductPage(attempt + 1), 2500);
      return;
    }
    const v = CC.verdict(comp, S);
    const el = document.createElement('div');
    el.className = 'cc-banner cc-ui';
    el.dataset.status = v.status;
    el.innerHTML = `<span></span><button aria-label="Fermer">×</button>`;
    el.firstChild.textContent = `${v.status === 'bad' ? '✗' : '✓'} ${CC.describe(comp.fibers)} — ${v.bad}% de fibres exclues (seuil ${S.threshold}%)`;
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
    cards.forEach((_, c) => apply(c));
    lastUrl = ''; onUrl();
  });
})();
