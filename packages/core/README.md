# @repo/core

Addon natif (C++ via node-addon-api) pour les utilitaires de scan réseau. Fournit une API TypeScript propre, tout en appelant du C++ sous le capot.

## Structure

- native/ — code C++ (node-addon-api)
  - addon.cc — point d’entrée N-API, exporte les sous-modules
  - modules/datetime — exemple de module natif
- src/ — wrappers TypeScript et chargeur natif
  - loader.ts — charge le binaire natif avec node-gyp-build
  - modules/datetime — classe DateTime (API publique)
  - index.ts — exports publics

## Scripts

- build:native — compile le C++ avec node-gyp
- build:ts — compile TypeScript vers dist/
- build — build natif + TS
- rebuild:electron — relink pour Electron
- test:smoke — test de fumée minimal

## Utilisation

```ts
import { DateTime } from '@repo/core'

const info = DateTime.getInfo()
console.log(info)
// { iso: string, epochMs: number, timezone: string }
```

## Electron
Après installation dans l’app Electron, relancez un rebuild:

```sh
pnpm -F @repo/desktop electron-rebuild -f -w @repo/core
```


