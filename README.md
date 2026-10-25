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

## Limites connues

- Certains sites chargent la composition uniquement après un clic (via une requête séparée) : l'article apparaît alors en « ? inconnue ».
- La détection des cartes produit est générique ; sur un site à la structure inhabituelle, il faudra peut-être ajouter un sélecteur spécifique dans `content.js`.
- Ouvrir beaucoup de fiches en peu de temps peut déclencher l'anti-robot de certains sites ; le cache limite ce risque.

## Fichiers

- `manifest.json` — déclaration de l'extension
- `parser.js` — lecture des compositions (dictionnaire des fibres, règles de calcul)
- `content.js` — détection des cartes produit, récupération des fiches, masquage
- `content.css` — styles des pastilles et du bandeau
- `popup.html` / `popup.js` — fenêtre de réglages
