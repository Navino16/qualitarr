# Qualitarr - Instructions Claude

## Description du projet

Qualitarr est un outil CLI qui surveille et compare les scores de qualité (Custom Formats) attendus vs réels pour les téléchargements Radarr/Sonarr. Il détecte les écarts entre le score annoncé par l'indexer et le score réel après import.

## Structure du projet

```
qualitarr/
├── src/
│   ├── cli.ts              # Point d'entrée CLI
│   ├── commands/           # Commandes (batch, import, search)
│   ├── services/           # Services (radarr, discord, queue, score)
│   ├── types/              # Types TypeScript (config, radarr, score)
│   └── utils/              # Utilitaires (logger, env, history)
├── tests/                  # Tests Vitest
│   ├── services/
│   └── utils/
├── .github/workflows/      # CI/CD GitHub Actions
├── Dockerfile              # Build multi-stage Node 22 Alpine
├── vitest.config.ts        # Configuration tests
└── config.example.yaml     # Exemple de configuration
```

## Commandes essentielles

```bash
# Développement
npm run build        # Compile TypeScript
npm run dev          # Build en mode watch
npm run lint         # Vérifie ESLint
npm run format       # Formate avec Prettier

# Tests
npm test             # Lance les tests (vitest run)
npm run test:watch   # Tests en mode watch
npm run test:coverage # Tests avec couverture

# Packaging
npm run package      # Crée les binaires avec @yao-pkg/pkg
```

## Workflow obligatoire avant commit

**TOUJOURS exécuter dans cet ordre avant de commit :**

```bash
npm run lint && npm run format && npm run build
```

Ces commandes doivent passer sans erreur avant tout commit.

## Configuration ESLint

Le projet utilise ESLint strict avec TypeScript. Règles importantes :
- `@typescript-eslint/restrict-template-expressions` avec `allowNumber: true`
- `@typescript-eslint/no-unused-vars` avec `argsIgnorePattern: "^_"`

## CI/CD

### Workflows GitHub Actions

| Workflow | Déclencheur | Description |
|----------|-------------|-------------|
| `ci.yml` | PR vers main | Lint, tests, build |
| `develop.yml` | Push sur develop | Build image Docker develop |
| `release.yml` | Tag v*.*.* | Build binaires + image Docker release |

### Binaires générés

Le packaging crée des binaires pour :
- `qualitarr-linux-amd64` (renommé depuis linux-x64)
- `qualitarr-linux-arm64`
- `qualitarr-macos-x64`
- `qualitarr-win-x64.exe`

### Docker

L'image Docker utilise un build TypeScript complet (pas les binaires pkg car Alpine utilise musl, incompatible avec glibc).

## Conventions de code

- Code et commits en **anglais**
- Communication en **français** (préférence utilisateur)
- Pas d'emojis sauf demande explicite
- Types stricts, pas de `any`

## Types principaux

### ScoreComparison
```typescript
interface ScoreComparison {
  expectedScore: number;   // Score du grabbed event
  actualScore: number;     // Score du fichier importé
  difference: number;      // actual - expected
  isOverScore: boolean;    // Au-dessus des limites
  isUnderScore: boolean;   // En-dessous des limites
  isWithinLimits: boolean; // Dans les limites acceptables
}
```

### Config
Voir `src/types/config.ts` - Schéma Zod avec validation.

## API Radarr utilisée

- `GET /api/v3/movie` - Liste des films
- `GET /api/v3/history/movie?movieId=X` - Historique d'un film
- `GET /api/v3/moviefile?movieId=X` - Fichier d'un film
- `POST /api/v3/command` - Lancer une recherche
- `GET/POST /api/v3/tag` - Gestion des tags

## Tests

Framework: **Vitest** avec couverture v8

Fichiers de tests :
- `tests/services/score.test.ts` - Calcul et gestion des scores
- `tests/utils/history.test.ts` - Parsing historique Radarr
- `tests/utils/env.test.ts` - Variables d'environnement Radarr/Sonarr
- `tests/utils/logger.test.ts` - Logger

Couverture actuelle : **100%** sur les fichiers testés.

## Git

- Branche principale : `main`
- Tags de release : `vX.Y.Z` (ex: v0.1.0)
- Signature des commits : demander confirmation si échec