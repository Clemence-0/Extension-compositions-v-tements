// Tests du parser — lancer depuis la racine du projet : node --test
// Ce dossier n'est pas lu par l'extension (seuls les fichiers du manifest le sont).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// parser.js est écrit pour le navigateur : on le charge dans un contexte isolé
const ctx = vm.createContext({ URL });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'parser.js'), 'utf8'), ctx);
const { CC } = ctx;

const comp = r => (r && r.fibers ? CC.describe(r.fibers) : null);
const S = types => ({ ...CC.DEFAULTS, types });

// Node n'a pas de DOMParser : un faux document qui répond aux seules questions que pose parser.js
function fakeDoc(html) {
  const tag = (re) => [...html.matchAll(re)].map(m => m[1]);
  const meta = prop => (html.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`)) || [])[1];
  const text = html.replace(/<!--[\s\S]*?-->/g, '').replace(/</g, ' <').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
  return {
    documentElement: { textContent: text },
    querySelectorAll: sel => sel.includes('ld+json')
      ? tag(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g).map(textContent => ({ textContent })) : [],
    querySelector: sel => {
      if (sel === 'h1') { const h = tag(/<h1[^>]*>([\s\S]*?)<\/h1>/g)[0]; return h && { textContent: h }; }
      const m = sel.match(/^meta\[property="([^"]+)"\]$/);
      if (m) { const c = meta(m[1]); return c && { content: c }; }
      return null;
    },
  };
}
const page = file => fakeDoc(fs.readFileSync(path.join(__dirname, 'pages', file), 'utf8'));

const RECOS = ' Vous aimerez aussi : T-shirt basique 19,99 € 100% polyester  Pull 29,99 € 60% coton 40% polyester';

test('compositions classiques', async t => {
  for (const [text, expected] of [
    ['Composition : 100% coton. Entretien : lavage 30°', '100% Coton'],
    ['Composition: 98% coton, 2% élasthanne. Doublure de poche : 100% polyester', '98% Coton, 2% Élasthanne'],
    ['Extérieur : 60 % laine, 40 % polyamide Doublure : 100 % viscose', '60% Laine, 40% Polyamide'],
    ['Matière 52% acrylique 48% laine', '52% Acrylique, 48% Laine'],
    ['Composition : Coton 60% Polyester 40%', '60% Coton, 40% Polyester'],
    ['Composition : Coton 60%, Polyester 40%', '60% Coton, 40% Polyester'],
    ['Composition : Coton : 60 % Polyester : 40 %', '60% Coton, 40% Polyester'],
    ['COMPOSITION COTON 95% ELASTHANNE 5%', '95% Coton, 5% Élasthanne'],
    ['Composition et entretien Lavage en machine à 30 degrés, ne pas sécher en tambour 100% viscose', '100% Viscose'],
    ['Composition : 100% coton biologique.' + RECOS, '100% Coton'],
    ['Composition : 100% laine d’agneau', '100% Laine'],
  ]) await t.test(text, () => assert.equal(comp(CC.parseText(text)), expected));
});

test('cuir et simili', async t => {
  for (const [text, expected] of [
    ['Composition : Extérieur : 100% cuir de vachette ; Doublure : 100% polyester' + RECOS, '100% Cuir'],
    ['Matière : cuir de vachette pleine fleur. Doublure : 100 % coton' + RECOS, '100% Cuir'],
    ['Tige : cuir ; doublure : textile ; semelle : caoutchouc', '100% Cuir'],
    ['Dessus : Veau italien patiné à la main. Doublure: Cuir vachette.', '100% Cuir'],
    ['"material":"Leather","color":"black"', '100% Cuir'],
    ['Matière : simili-cuir. Doublure 100% polyester', '100% Simili cuir'],
    ['Matière : 100% PU', '100% Polyuréthane'],
    ['Matière : cuir et coton. Doublure 100% polyester', null], // mélange sans pourcentages : on ne devine pas
  ]) await t.test(text, () => assert.equal(comp(CC.parseText(text)), expected));
});

test('pièges', async t => {
  await t.test('le 100 % suivi d’une matière ne remonte pas à la précédente', () =>
    assert.equal(comp(CC.parseText('pulls coton-cachemire et pulls 100% coton')), '100% Coton'));
  await t.test('les remises ne sont pas des pourcentages de fibres', () =>
    assert.equal(comp(CC.parseText('Composition : 100% coton. -30% sur tout le site')), '100% Coton'));
  await t.test('des recommandations contradictoires ne donnent rien', () =>
    assert.equal(comp(CC.parseText(RECOS)), null));
  await t.test('une finition (ganse) n’est pas le tissu', () =>
    assert.equal(comp(CC.parseText('Toutes les extrémités sont délimitées par une ganse de propreté en 100% coton.')), null));
});

test('compositions rédigées (sites "storytelling")', async t => {
  for (const [text, expected] of [
    ['Pure laine mérinos d’Arles. Thermorégulatrice, douce et inodore.', '100% Laine'],
    ['Full coton bio : coton bio certifié GOTS.', '100% Coton'],
    ['Un pull tout cachemire, tricoté en Écosse.', '100% Cachemire'],
    ['Pure laine et soie.', null], // deux matières : on ne devine pas les proportions
    ['On a opté pour un mélange intégrant 35% de cachemire vierge et 65% de cachemire recyclé.', '100% Cachemire'],
    ['C’est du coton bio (95 %) pour la douceur, avec juste ce qu’il faut d’élasthanne (5 %).', '95% Coton, 5% Élasthanne'],
    ['Composition : 100% Econyl®', '100% Polyamide'],
    ['La toile Ventile® : 100% coton bio', '100% Coton'],
  ]) await t.test(text, () => assert.equal(comp(CC.parseText(text)), expected));
});

test('type d’article et verdict', async t => {
  const cases = [
    // nom, fil d'Ariane, texte, type, statut avec vêtements seuls, composition
    ['T-shirt col rond', '', 'Composition : 100% coton', 'vetement', 'ok', '100% Coton'],
    ['Veste en cuir daim homme havane - Faustin', '', 'Matière : 100% cuir', 'vetement', 'ok', '100% Cuir'],
    ['Pantalon à ceinture élastique', '', 'Composition : 98% coton 2% elasthanne', 'vetement', 'ok', '98% Coton, 2% Élasthanne'],
    ['Chaussettes en laine', '', 'Composition : 20% laine 80% polyamide', 'vetement', 'bad', '80% Polyamide, 20% Laine'],
    ['T-shirt Parfum de vacances', '', 'Composition : 100% coton', 'vetement', 'ok', '100% Coton'],
    ['Mocassin homme Noir', '', 'Dessus : veau.' + RECOS, 'chaussures', 'na', '100% Cuir'],
    ['DERYBROOK', 'Accueil > Chaussures > Mocassins', 'Dessus : veau', 'chaussures', 'na', '100% Cuir'],
    ['Sac cabas en cuir', '', 'Matière : cuir de vachette', 'maroquinerie', 'na', '100% Cuir'],
    ['Faustin', 'Vêtements > Ceintures & Maroquinerie > Ceintures', 'Matière : cuir', 'maroquinerie', 'na', '100% Cuir'],
    ['Eau de parfum Rose 50 ml', '', RECOS, 'hors', 'na', null],
    ['Collier doré', '', RECOS, 'hors', 'na', null],
    ['Écharpe', '', RECOS, 'vetement', 'unknown', null],
    ['Pull en cachemire', '', RECOS, 'vetement', 'unknown', null], // le nom dit cachemire, la page non
    ['Pull toucher cachemire', '', 'Composition : 100% polyester', 'vetement', 'bad', '100% Polyester'],
  ];
  for (const [name, crumbs, text, type, status, expected] of cases)
    await t.test(name, () => {
      const r = CC.judge(text, { name, crumbs }, 'https://exemple.fr/p/123');
      assert.equal(r.type, type);
      assert.equal(CC.verdict(r, S(['vetement'])).status, status);
      assert.equal(comp(r), expected);
    });

  await t.test('chaussures cochées : le mocassin est analysé', () =>
    assert.equal(CC.verdict(CC.judge('Dessus : veau', { name: 'Mocassin homme Noir' }), S(['vetement', 'chaussures'])).status, 'ok'));
  await t.test('le type se lit aussi dans l’adresse', () =>
    assert.equal(CC.judge('', {}, 'https://www.bexley.fr/chaussures-derybrook-noir-0173700k.html').type, 'chaussures'));
});

test('type deviné sur une carte de liste, avant d’ouvrir la fiche', async t => {
  for (const [text, url, type] of [
    ['+7 couleurs VESTE EN CUIR DAIM HOMME HAVANE - FAUSTIN - 100% Cuir 179,00 € -20€ sur le 2e manteau ou blouson', '/faustin-havana.html', 'vetement'],
    ['+2 couleurs Mocassin homme Noir - DERYBROOK - Chaussure ville de luxe 169,00 € -30€ sur la 2e paire', '/derybrook-noir.html', 'chaussures'],
    ['DERYBROOK 169,00 €', '/chaussures-derybrook-noir.html', 'chaussures'],
    ['SURCHEMISE HOMME VIEUX ROSE EN VELOURS CÔTELÉ 64,00 €', '/victorin.html', 'vetement'],
    ['Nouveau Iris 89,00 €', '/beaute/parfums/iris.html', 'hors'],
  ]) await t.test(text, () => assert.equal(CC.cardType(text, 'https://exemple.fr' + url), type));
});

test('vraies fiches : Asphalte', async t => {
  await t.test('Veste Woolpure : « Pure laine », pas le 100 % coton de la ganse', () => {
    const r = CC.analyze(page('asphalte-veste-woolpure.html'), 'https://www.asphalte.com/h/products/la-veste-woolpure');
    assert.equal(CC.productInfo(page('asphalte-veste-woolpure.html')).isProduct, true);
    assert.equal(r.type, 'vetement');
    assert.equal(comp(r), '100% Laine');
  });
  await t.test('Cachemire col roulé : 35 % vierge + 65 % recyclé', () => {
    const r = CC.analyze(page('asphalte-cachemire-col-roule.html'), 'https://www.asphalte.com/h/products/le-cachemire-col-roule');
    assert.equal(comp(r), '100% Cachemire');
  });
});

test('vraie fiche : mocassin Bexley', async t => {
  const doc = page('bexley-mocassin.html');
  const url = 'https://www.bexley.fr/chaussures-derybrook-noir-0173700k.html';
  await t.test('nom, fil d’Ariane, fiche produit', () => {
    const info = CC.productInfo(doc);
    assert.equal(info.name, 'Mocassin homme Noir - DERYBROOK');
    assert.match(info.crumbs, /^Chaussures > Chaussures Ville > Mocassins/);
    assert.equal(info.isProduct, true);
  });
  await t.test('« Dessus : Veau » = cuir, pas le cachemire du script de promos', () => {
    const r = CC.analyze(doc, url);
    assert.equal(r.type, 'chaussures');
    assert.equal(comp(r), '100% Cuir');
    assert.equal(r.sure, true);
  });
});
