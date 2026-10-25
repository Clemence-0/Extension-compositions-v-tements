// Analyse de composition — partagé entre le script de page et le popup
(function (global) {
  const FIBERS = {
    // Synthétiques
    polyester:        { label: 'Polyester',        cat: 'synth', words: ['polyester', 'poliester', 'poliestere'] },
    polyamide:        { label: 'Polyamide',        cat: 'synth', words: ['polyamide', 'polyamid', 'poliamida', 'poliammide', 'nylon'] },
    acrylique:        { label: 'Acrylique',        cat: 'synth', words: ['acrylique', 'acrylic', 'acrilico', 'acrilica', 'acryl', 'polyacryl', 'polyacrylique'] },
    elasthanne:       { label: 'Élasthanne',       cat: 'synth', words: ['elasthanne', 'elastane', 'elasthan', 'elastan', 'spandex', 'lycra'] },
    polyurethane:     { label: 'Polyuréthane',     cat: 'synth', words: ['polyurethane', 'polyurethan', 'poliuretano'] },
    polypropylene:    { label: 'Polypropylène',    cat: 'synth', words: ['polypropylene', 'polypropylen', 'polipropileno', 'polipropilene'] },
    modacrylique:     { label: 'Modacrylique',     cat: 'synth', words: ['modacrylique', 'modacrylic', 'modacrilico'] },
    elastomultiester: { label: 'Élastomultiester', cat: 'synth', words: ['elastomultiester'] },
    // Artificielles (cellulose)
    viscose:  { label: 'Viscose', cat: 'art', words: ['viscose', 'viscosa', 'rayonne', 'rayon'] },
    modal:    { label: 'Modal',   cat: 'art', words: ['modal'] },
    lyocell:  { label: 'Lyocell', cat: 'art', words: ['lyocell', 'tencel'] },
    acetate:  { label: 'Acétate', cat: 'art', words: ['acetate', 'acetato', 'triacetate'] },
    cupro:    { label: 'Cupro',   cat: 'art', words: ['cupro'] },
    // Naturelles
    coton:     { label: 'Coton',     cat: 'nat', words: ['coton', 'cotton', 'algodon', 'cotone', 'baumwolle'] },
    laine:     { label: 'Laine',     cat: 'nat', words: ['laine', 'wool', 'lana', 'wolle', 'merinos', 'merino'] },
    lin:       { label: 'Lin',       cat: 'nat', words: ['lin', 'linen', 'lino', 'leinen', 'flax'] },
    soie:      { label: 'Soie',      cat: 'nat', words: ['soie', 'silk', 'seda', 'seta', 'seide'] },
    cachemire: { label: 'Cachemire', cat: 'nat', words: ['cachemire', 'cashmere', 'cachemira', 'kaschmir'] },
    mohair:    { label: 'Mohair',    cat: 'nat', words: ['mohair'] },
    alpaga:    { label: 'Alpaga',    cat: 'nat', words: ['alpaga', 'alpaca', 'alpaka'] },
    chanvre:   { label: 'Chanvre',   cat: 'nat', words: ['chanvre', 'hemp', 'canamo', 'canapa', 'hanf'] },
    yak:       { label: 'Yak',       cat: 'nat', words: ['yak'] },
    angora:    { label: 'Angora',    cat: 'nat', words: ['angora'] },
  };

  const DEFAULTS = {
    sites: [],
    threshold: 50,
    bad: ['polyester', 'polyamide', 'acrylique', 'polyurethane', 'polypropylene', 'modacrylique', 'elastomultiester'],
    mode: 'hide',        // 'hide' | 'dim'
    badges: true,
    hideUnknown: false,
  };

  const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u00a0\u202f]/g, ' ');

  const WORD2KEY = {};
  for (const [k, f] of Object.entries(FIBERS)) for (const w of f.words) WORD2KEY[w] = k;
  const FIBER_RE = new RegExp('\\b(' + Object.keys(WORD2KEY).sort((a, b) => b.length - a.length).join('|') + ')s?\\b', 'g');
  const PCT_RE = /(\d{1,3}(?:[.,]\d{1,2})?)\s*%/g;
  const KEYWORD_RE = /composition|matiere|materiau|material|fabric|tissu|zusammensetzung|composicion|composizione/g;
  const GAP_MAX = 25;

  // Libellés de section : ce qui n'est PAS le tissu principal…
  const LINING_RE = /\b(doublures?|lining|forro|fodera|futter|voering|poches?|pocket(?:ing)?s?|bolsillos?|rembourrage|garnissage|ouatinage|ouatine|filling|padding|relleno|imbottitura|bords?[ -]?cotes?|ribbing|garnitures?|trims?|empiecements?)\b/g;
  // … et ce qui l'est explicitement
  const MAIN_RE = /\b(exterieur|tissu (?:principal|exterieur)|matiere (?:principale|exterieure)|dessus|outer(?: shell)?|shell|main (?:fabric|material)|exterior|tejido (?:principal|exterior)|tessuto (?:principale|esterno)|esterno|oberstoff|aussenmaterial|hauptmaterial)\b/g;
  const GENERIC_RE = /\b(composition|material|matiere|tissu|fabric|composicion|composizione|zusammensetzung)\b/;
  const LABEL_ANY = new RegExp(`${LINING_RE.source}|${MAIN_RE.source}|${GENERIC_RE.source}`);
  // Entre un % et sa fibre : pas d'autre chiffre, de fin de phrase ni de libellé de section
  const badGap = s => /[\d%!?;]/.test(s) || LABEL_ANY.test(s);

  // Associe chaque pourcentage à une fibre, soit après ("60% coton"), soit avant ("Coton 60%")
  function pairs(text, dir) {
    const fibers = [...text.matchAll(FIBER_RE)].map(m => ({ i: m.index, end: m.index + m[0].length, key: WORD2KEY[m[1]] }));
    const out = [];
    let fi = 0;
    for (const m of text.matchAll(PCT_RE)) {
      const prev = text[m.index - 1];
      if (prev === '-' || prev === '\u2212' || /\d/.test(prev || '')) continue; // remises "-30%"
      const v = parseFloat(m[1].replace(',', '.'));
      if (!(v > 0 && v <= 100)) continue;
      const pEnd = m.index + m[0].length;
      while (fi < fibers.length && fibers[fi].end <= m.index - GAP_MAX) fi++;
      let f = null;
      if (dir === 'after') {
        for (let j = fi; j < fibers.length && fibers[j].i - pEnd <= GAP_MAX; j++) {
          if (fibers[j].i >= pEnd) { if (!badGap(text.slice(pEnd, fibers[j].i))) f = fibers[j]; break; }
        }
      } else {
        for (let j = fi; j < fibers.length && fibers[j].end <= m.index; j++) f = fibers[j];
        if (f && badGap(text.slice(f.end, m.index))) f = null;
      }
      if (f) out.push({ start: Math.min(m.index, f.i), end: Math.max(pEnd, f.end), key: f.key, v });
    }
    return out;
  }

  // Tous les blocs de fibres consécutives qui totalisent 100 %
  function groups(ps) {
    const out = [];
    let g = {}, sum = 0, last = -1e9, start = 0;
    for (const p of ps) {
      if (p.start - last > 200 || g[p.key] != null || sum + p.v > 101) { g = {}; sum = 0; }
      if (sum === 0) start = p.start;
      g[p.key] = p.v; sum += p.v; last = p.end;
      if (Math.abs(sum - 100) <= 1) { out.push({ fibers: g, start, end: p.end }); g = {}; sum = 0; }
    }
    return out;
  }

  // Quel libellé précède le bloc ? Le plus proche l'emporte ; "composition" seul = tissu principal
  function labelOf(text, from, to) {
    const zone = text.slice(Math.max(from, to - 80), to);
    let found = null;
    for (const [re, kind] of [[LINING_RE, 'lining'], [MAIN_RE, 'main']])
      for (const m of zone.matchAll(re)) if (!found || m.index >= found.i) found = { i: m.index, kind };
    if (found) return found.kind;
    return GENERIC_RE.test(zone) ? 'main' : 'none';
  }

  const RANK = { main: 2, none: 1 };

  // Choisit le tissu principal : bloc étiqueté principal > bloc sans étiquette ; doublure & co. ignorés
  function pick(t) {
    const ga = groups(pairs(t, 'after')), gb = groups(pairs(t, 'before'));
    const gs = !ga.length ? gb : !gb.length ? ga : (gb[0].start < ga[0].start ? gb : ga);
    let best = null, prevEnd = 0;
    for (const g of gs) {
      const kind = labelOf(t, prevEnd, g.start);
      prevEnd = g.end;
      if (kind === 'lining') continue;
      if (!best || RANK[kind] > best.rank) best = { fibers: g.fibers, rank: RANK[kind] };
      if (best.rank === 2) break;
    }
    return best;
  }

  // sure = trouvé près d'un mot-clé "composition / matière…"
  function parseText(raw) {
    const text = norm(raw);
    let n = 0;
    for (const m of text.matchAll(KEYWORD_RE)) {
      const r = pick(text.slice(Math.max(0, m.index - 80), m.index + 800)); // -80 : voir "Doublure" placé avant "composition"
      if (r) return { fibers: r.fibers, sure: true };
      if (++n > 40) break;
    }
    const r = pick(text);
    return r ? { fibers: r.fibers, sure: false } : null;
  }

  function htmlToText(html) {
    html = html
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\[nrt]/g, ' ')
      .replace(/</g, ' <'); // évite "coton40%" quand les balises sont collées
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('style, .cc-ui').forEach(e => e.remove());
    return doc.documentElement.textContent; // inclut le JSON des <script>, souvent riche en compositions
  }

  function verdict(comp, s) {
    if (!comp) return { status: 'unknown', bad: 0 };
    let bad = 0;
    for (const [k, v] of Object.entries(comp.fibers)) if (s.bad.includes(k)) bad += v;
    return { status: bad > s.threshold ? 'bad' : 'ok', bad: Math.round(bad) };
  }

  function describe(fibers) {
    return Object.entries(fibers).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${Math.round(v * 10) / 10}% ${FIBERS[k].label}`).join(', ');
  }

  const VERSION = 2; // à incrémenter quand l'analyse change : vide le cache des compositions

  global.CC = { VERSION, FIBERS, DEFAULTS, parseText, htmlToText, verdict, describe };
})(globalThis);
