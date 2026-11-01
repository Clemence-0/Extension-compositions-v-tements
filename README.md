# Filtre Fibres — extension Chrome

Masque (ou grise) les vêtements dont la part de fibres synthétiques dépasse ton seuil, directement dans les listes produits des sites de marques.

## Installation (2 minutes)

1. Dézippe le dossier `filtre-fibres`.
2. Dans Chrome, ouvre `chrome://extensions`.
3. Active le **Mode développeur** (en haut à droite).
4. Clique sur **Charger l'extension non empaquetée** et choisis le dossier `filtre-fibres`.
5. Épingle l'icône (puzzle 🧩 → punaise) pour l'avoir sous la main.

## Utilisation

1. Va sur le site d'une marque (une page catégorie, ex. « Pulls femme »).
2. Clique sur l'icône → **Activer sur ce site**. La page se recharge.
3. Les articles sont analysés au fil du défilement ; une pastille en bas à droite indique combien ont été écartés, avec un bouton **Afficher** pour les revoir.

Réglages du popup :
- **Seuil** (50 % par défaut) : l'article est écarté si les fibres cochées dépassent ce pourcentage.
- **Fibres comptées** : polyester, polyamide, acrylique… cochés par défaut. L'élasthanne et les fibres artificielles (viscose, modal…) sont décochés — à toi de voir.
- **Masquer ou griser**, pastille de composition sur chaque article, et option pour écarter aussi les articles dont la composition est introuvable.

Sur une fiche produit, un bandeau en haut affiche la composition et le verdict.

## Comment ça marche

Les pages de liste n'affichent presque jamais la composition. L'extension ouvre donc discrètement chaque fiche produit en arrière-plan (3 à la fois, seulement pour les articles proches de l'écran), y repère la composition (FR, EN, ES, IT, DE) et garde le résultat en cache 7 jours.

Elle ne retient que le **tissu principal** (le premier bloc qui fait 100 %) : dans « Extérieur 60 % coton, 40 % polyester — Doublure 100 % polyester », c'est 60/40 qui compte.

Le **cuir** est reconnu (cuir, veau, agneau, daim, nubuck, leather, piel, pelle, Leder…), y compris sans pourcentage (« Dessus : veau italien »). Le **simili cuir** (faux cuir, effet cuir, vegan leather…) et le **PVC** sont comptés parmi les synthétiques.

Les compositions rédigées sont comprises quand elles sont sans ambiguïté (« Pure laine mérinos », « Full coton bio », « 35 % de cachemire vierge et 65 % de cachemire recyclé »), ainsi que quelques noms de marque qui désignent une seule fibre (Econyl, Tencel, Ecovero, Woolpure, Ventile…). Les finitions (ganse, passepoil, bords-côtes…) ne comptent pas comme tissu principal.

### Types d'articles

Chaque article est classé : **vêtements & accessoires textiles**, **chaussures**, **sacs & maroquinerie**, ou **hors sujet** (parfum, beauté, bijoux, montres, lunettes, cartes cadeaux…). Le type se lit dans le nom du produit, puis dans le fil d'Ariane de la fiche, puis dans son adresse ; à défaut, l'article est considéré comme un vêtement.

Dans le popup, **Articles analysés** choisit les types concernés (par défaut : vêtements seulement, car chaussures et sacs donnent rarement une composition chiffrée). Pour un type non coché, la fiche n'est même pas ouverte.

### « Non concerné » ou « ne sais pas »

- **Non concerné** (type non coché ou hors sujet) : l'extension se tait. Pas de pastille, pas de bandeau, article jamais masqué ni compté.
- **Ne sais pas** (article concerné, mais composition introuvable ou douteuse) : pastille grise « ? introuvable », et bandeau gris sur la fiche produit. Une composition est jugée douteuse quand plusieurs compositions se contredisent sur la page (souvent des articles recommandés) ou quand elle contredit le nom du produit (« Sac en cuir » analysé en « 100 % polyester »). L'option « Écarter aussi les compositions introuvables » masque ces articles.

## Limites connues

- Certains sites chargent la composition uniquement après un clic (via une requête séparée) : l'article apparaît alors en « ? introuvable ».
- Le type d'article se devine par mots-clés : un nom de produit sans mot de type (« FAUSTIN ») dépend du fil d'Ariane ou de l'adresse. Un article mal classé est soit ignoré à tort, soit analysé alors qu'il n'aurait pas dû l'être.
- Si tu avais déjà modifié la liste des fibres comptées, coche « Simili cuir » et « PVC » dans le popup pour les inclure.
- La détection des cartes produit est générique ; sur un site à la structure inhabituelle, il faudra peut-être ajouter un sélecteur spécifique dans `content.js`.
- Ouvrir beaucoup de fiches en peu de temps peut déclencher l'anti-robot de certains sites ; le cache limite ce risque.

## Tests

Les règles d'analyse se contredisent facilement : une correction pour un site peut en casser un autre. Avant chaque modification de `parser.js`, lancer depuis la racine du projet (Node.js 18 ou plus, rien à installer) :

```
node --test
```

Chaque cas est une ligne dans `tests/parser.test.js` (texte → composition attendue). `tests/pages/` contient des extraits de vraies fiches produit. Quand un site donne un mauvais résultat, y ajouter un extrait de la fiche, puis un test, avant de corriger.

Le dossier `tests/` n'est pas lu par l'extension : seuls les fichiers déclarés dans `manifest.json` le sont.

## Fichiers

- `manifest.json` — déclaration de l'extension
- `parser.js` — lecture des compositions (dictionnaire des fibres, règles de calcul)
- `content.js` — détection des cartes produit, récupération des fiches, masquage
- `content.css` — styles des pastilles et du bandeau
- `popup.html` / `popup.js` — fenêtre de réglages
