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
          if (fibers[j].i >= pEnd) { if (!/[\d%]/.test(text.slice(pEnd, fibers[j].i))) f = fibers[j]; break; }
        }
      } else {
        for (let j = fi; j < fibers.length && fibers[j].end <= m.index; j++) f = fibers[j];
        if (f && /[\d%]/.test(text.slice(f.end, m.index))) f = null;
      }
      if (f) out.push({ pos: m.index, key: f.key, v });
    }
    return out;
  }

  // Premier bloc de fibres consécutives qui totalise 100 % (= tissu principal)
  function firstGroup(ps) {
    let g = {}, sum = 0, last = -1e9, start = 0;
    for (const p of ps) {
      if (p.pos - last > 200 || g[p.key] != null || sum + p.v > 101) { g = {}; sum = 0; }
      if (sum === 0) start = p.pos;
      g[p.key] = p.v; sum += p.v; last = p.pos;
      if (Math.abs(sum - 100) <= 1) return { fibers: g, pos: start };
    }
    return null;
  }

  function best(t) {
    const a = firstGroup(pairs(t, 'after')), b = firstGroup(pairs(t, 'before'));
    if (a && b) return b.pos < a.pos ? b : a;
    return a || b;
  }

  // sure = trouvé près d'un mot-clé "composition / matière…"
  function parseText(raw) {
    const text = norm(raw);
    let n = 0;
    for (const m of text.matchAll(KEYWORD_RE)) {
      const r = best(text.slice(m.index, m.index + 800));
      if (r) return { fibers: r.fibers, sure: true };
      if (++n > 40) break;
    }
    const r = best(text);
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

  global.CC = { FIBERS, DEFAULTS, parseText, htmlToText, verdict, describe };
})(globalThis);
