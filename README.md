## Triply (skeleton)

This repo is an **empty skeleton** for an MVP social app (Expo mobile+web) + Firebase (Firestore/Storage/Functions).

### Structure

- `apps/expo/` — Expo Router app (screens/files exist but are intentionally empty)
- `firebase/` — Firestore/Storage rules + indexes
- `functions/` — Cloud Functions (TypeScript) skeleton
- `packages/shared/` — shared TypeScript types/constants skeleton

### Next steps (when you start coding)

- Install deps in your chosen package manager (root workspaces).
- Add Firebase client init in `apps/expo/src/firebase/client.ts`.
- Add moderation + limit logic in `functions/src/triggers/onPostStatusChange.ts`.

### Firestore indexes

This repo uses `firebase/firestore.indexes.json` (configured in `firebase.json`).

- Deploy indexes (only):
  - `firebase deploy --only firestore:indexes`
