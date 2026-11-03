# 16 Local

An offline, on-device version of 16 for iPhone. It keeps a private ego-network graph of the people you know, with a relationship strength for each person, tags, notes, and links between your contacts. All data stays on the phone in SQLite.

Forked from the 16 project's history (`upstream` remote). It has no accounts, no sharing, no push notifications, and no network calls.

## Features
- Add people by hand, or import from the address book (native app), the Contact Picker API (Chrome on Android), or `.vcf` / `.csv` files.
- Each person has a relationship strength (1–5). Stronger relationships sit closer to you on the graph.
- Curated tags (the same taxonomy as the networked app), notes, and "about" text.
- Links between your contacts, drawn as edges.

## Layout
- `src/data/`: the on-device data layer.
  - `migrations/`: versioned SQL schema.
  - `seed/tags.json`: the tag dictionary, generated from the backend's V4 migration.
  - `contacts.ts`, `tags.ts`, `graph.ts`: business rules ported from the backend's services.
  - `capacitorDb.ts`: SQLite on the device. `testing/nodeDb.ts`: better-sqlite3 for tests.
- `src/services/`: thin wrappers the UI calls.
- `scripts/generate-tag-seed.mjs`: regenerates `seed/tags.json`.

## Commands
```bash
npm install
npm run dev          # Vite dev server
npm test             # Vitest
npm run build        # Type-check and build
npm run cap:sync     # Build and sync the iOS project
node scripts/generate-tag-seed.mjs <path to V4__curated_tag_taxonomy.sql>
```
