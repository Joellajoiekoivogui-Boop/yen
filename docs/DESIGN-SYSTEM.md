# Design system YEN Career Bridge

Référence des jetons, composants et règles d'usage de l'interface. Les jetons vivent dans
`src/app/globals.css` (bloc `@theme`), les composants de base dans `src/components/ui/index.tsx`.
Règle générale : **utiliser un jeton ou un composant existant avant d'écrire une valeur en dur.**

## 1. Jetons

### Couleurs de la charte

| Famille | Jetons | Usage |
|---|---|---|
| Bleu marine YEN | `navy-50` → `navy-950` (principal : `navy-700` #0a2a6c) | Titres, fonds sombres, bouton principal |
| Bleu vif | `electric-50` → `electric-900` | Liens, actions secondaires, focus |
| Jaune YEN | `gold-50` → `gold-900` (accent : `gold-400` #edb413) | Accent, bouton d'appel à l'action, surtitres |

Lisibilité :
- texte jaune uniquement sur fond sombre (`gold-300`/`gold-400`) ;
- sur fond clair, `gold-600` au minimum (5:1) ;
- sur un fond jaune, le texte est bleu marine, jamais blanc.

### Couleurs sémantiques

| Jeton | Valeur | Usage |
|---|---|---|
| `surface` | #ffffff | Fond des cartes |
| `canvas` | #f4f7fb | Fond des pages des espaces connectés |
| `border` | #dfe6f0 | Bordures et séparateurs |
| `muted` | #5b6b82 | Texte secondaire (descriptions, libellés, légendes) |

Les états utilisent la palette Tailwind : `emerald` pour réussi, `amber` pour attention, `red` pour erreur.
Ils passent par les composants `Badge`, `Alert` et `ApplicationStatusBadge`, pas par des classes écrites à la main.

Hors CSS (graphiques SVG, métadonnées, image d'aperçu des liens), on importe `COLORS` et `CHART`
depuis `src/lib/design-tokens.ts`. Le test `tests/unit/design-tokens.test.ts` vérifie que ces valeurs
restent identiques à celles de `globals.css`.

### Texte

| Usage | Classe |
|---|---|
| Titres | police Poppins (`font-heading`, automatique sur h1, h2, h3), `text-navy-900` |
| Texte courant | Inter, `text-slate-600` / `text-slate-700` |
| Texte secondaire | `text-muted` |
| Très petit texte (pastilles, raccourcis, légendes) | `text-2xs` (11 px), jamais plus petit |

Icônes cliquables ou porteuses de sens : `text-slate-500` au minimum (contraste 3:1). `text-slate-400`
est réservé aux icônes décoratives et aux textes d'exemple des champs.

### Formes et profondeur

| Jeton | Classe | Usage |
|---|---|---|
| `--radius-card` (16 px) | `rounded-card` | Cartes (`Card`, squelettes de chargement) |
| — | `rounded-xl` | Boutons et champs |
| — | `rounded-lg` | Alertes, états vides, petites pastilles |
| `--shadow-card` | `shadow-card` | Ombre de repos des cartes |

### Mouvement

| Jeton | Usage |
|---|---|
| `ease-out-expo` | Entrées et transitions principales |
| `ease-spring` | Petits rebonds (icônes, pastilles) |
| `animate-*` (float, blob, pop-in, slide-down…) | Animations prêtes à l'emploi |
| `data-reveal`, `data-reveal-children` | Apparition au défilement |
| `data-spotlight`, `data-tilt`, `data-magnetic`, `data-depth`, `data-sparkle` | Effets liés au pointeur (moteur `components/motion/motion-engine.tsx`) |

Toute animation continue s'arrête avec le bouton pause (`[data-motion-paused]`). Rien ne bouge si
l'appareil demande à réduire les animations.

## 2. Composants (`src/components/ui`)

### Button / ButtonLink / buttonClass

| Variante | Quand l'utiliser |
|---|---|
| `primary` | Action principale d'un écran d'espace connecté (« Enregistrer », « Filtrer ») |
| `secondary` | Action importante sur fond clair, en complément du principal |
| `accent` | Appel à l'action du site public (« Créer mon profil ») |
| `outline` | Action secondaire, pagination, filtres légers |
| `ghost` | Action discrète (lien d'annulation, barre d'outils) |
| `danger` | Suppression, révocation |

- **Tailles :** `sm` (32 px), `md` (40 px, par défaut), `lg` (48 px).
- **États :** survol (léger soulèvement), appui (réduction), désactivé (`disabled` : 50 % d'opacité, non cliquable). Le focus clavier utilise le contour global.
- **Type :** `Button` est `type="button"` par défaut. Dans un formulaire, écrire `type="submit"`.
- **Action serveur :** pour une action serveur avec attente, confirmation et notification, utiliser `ActionButton` (`components/forms/action-button.tsx`).

| ✅ À faire | ❌ À éviter |
|---|---|
| `<Button type="submit">Filtrer</Button>` | `<button className="h-10 rounded-lg bg-navy-800 …">` |
| `buttonClass("outline", "sm")` sur un élément non bouton | Recopier les classes d'un bouton |

### Champs : classe `field-input`

- **États intégrés :** survol, focus (anneau bleu), désactivé, erreur (`aria-invalid="true"`).
- **Libellés :** toujours un `<label>` relié (`htmlFor`). Libellé court en `text-xs font-medium text-muted` au-dessus du champ.
- **Mot de passe :** utiliser `PasswordInput` (affichage, majuscules verrouillées, mot de passe trop courant).

### Badge et ApplicationStatusBadge

`Badge` accepte les tons `neutral`, `blue`, `gold`, `green`, `amber`, `red`, `navy`, `purple` et `teal`.
`ApplicationStatusBadge` donne à chaque étape de candidature une couleur fixe, identique dans les trois espaces.
`DemoBadge` signale toute donnée fictive de démonstration.

### Card, CardHeader, CardBody, PageHeader

`Card` est la surface standard : `rounded-card`, bordure `border`, `shadow-card`, apparition au défilement.
`PageHeader` porte le titre de chaque page d'espace (surtitre facultatif, description, actions à droite).

### Alert, EmptyState, TableEmpty

| Composant | Rôle |
|---|---|
| `Alert` | Message `info`, `success`, `warning` ou `error`. `error` est annoncé immédiatement (`role="alert"`), les autres poliment (`role="status"`). |
| `EmptyState` | Liste vide, avec pictogramme, explication et action facultative. |
| `TableEmpty` | Même chose dans un tableau. |

### Données

| Composant | Rôle |
|---|---|
| `StatCard` | Chiffre clé avec compteur animé |
| `ProgressBar` | Barre de progression (`role="progressbar"`) |
| `ProgressRing` | Anneau de progression (`role="img"` + libellé) |
| `ScorePill` | Score de compatibilité 0 à 100 : couleur selon le seuil, libellé lu par les lecteurs d'écran |
| `Table` / `Th` / `Td` | Tableau qui défile au clavier sur petit écran |
| `TabLinks` | Onglets en liens, avec `aria-current` |
| `Pagination` | Pagination en liens |
| `DefinitionList` | Paires libellé / valeur |
| `PageSkeleton` | Squelette pendant le chargement (`aria-busy`) |

### Site public (`src/components/public`)

| Composant | Rôle |
|---|---|
| `PageHero` | Bandeau d'ouverture des pages : titre, description, photo facultative, décor animé, bouton pause |
| `SectionTitle` | Titre de section : surtitre doré, titre, trait animé, description ; `inverted` sur fond sombre |
| Décor (`components/motion/sky.tsx`) | `NightSky` (étoiles filantes et scintillements), `FloatingIcons` (pictos flottants), `EdgeBeam` (traits lumineux sur les bords) |

## 3. Règles de contribution

1. Pas de couleur hexadécimale dans les composants. Utiliser les jetons Tailwind, ou `COLORS` et `CHART` hors CSS.
2. Pas de valeur arbitraire (`text-[…]`, `rounded-[…]`) quand un jeton existe. Une valeur réutilisée devient un jeton dans `@theme`.
3. Pas de bouton, badge ou alerte recopié à la main : utiliser le composant, quitte à lui ajouter une variante.
4. Contrastes :
   - texte : 4,5:1 minimum ;
   - icônes et contours d'éléments d'interface : 3:1 minimum.
5. Animations :
   - uniquement `transform` et `opacity` ;
   - toujours arrêtables avec le bouton pause ;
   - désactivées si l'appareil demande moins d'animations.
