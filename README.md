# Triply

Aplikacja społecznościowa umożliwiająca publikowanie postów ze zdjęciami, obserwowanie innych użytkowników, komentowanie i reagowanie na treści. Posty przechodzą przez automatyczną moderację AI (GPT-4 Vision), a administrator ma dostęp do panelu ręcznej weryfikacji flagowanych treści.

## Funkcjonalności

- Tworzenie postów ze zdjęciami (kompresja po stronie klienta)
- Feed z paginacją — wszystkie posty lub tylko od obserwowanych
- Komentarze i polubienia z aktualizacją w czasie rzeczywistym
- System obserwowania użytkowników
- Wyszukiwanie użytkowników i profile
- Powiadomienia w aplikacji
- Automatyczna moderacja treści (tekst + obraz) przez OpenAI GPT-4 Vision
- Panel admina z workflow zatwierdzania/odrzucania postów
- Kontrola dostępu na podstawie ról (użytkownik / admin)
- Stany ładowania, błędów i pustych widoków w całym UI

## Stack technologiczny

**Frontend:** Expo SDK 54, React Native, React 19, Expo Router, TypeScript

**Backend:** Firebase Authentication, Cloud Firestore, Cloud Storage, Cloud Functions (Node.js 20)

**AI:** OpenAI API (GPT-4 Vision) — automatyczna moderacja treści

**Tooling:** npm workspaces (monorepo), ESLint, Prettier, Firebase Emulators

## Struktura projektu

```
apps/expo/        Aplikacja Expo Router — ekrany, komponenty, klient Firebase
functions/        Cloud Functions — triggery, serwisy, logika moderacji AI
packages/shared/  Współdzielone typy TypeScript i stałe
firebase/         Reguły bezpieczeństwa Firestore i Storage, indeksy
```

## Uruchomienie lokalne

1. Instalacja zależności:
   ```
   npm install
   ```

2. Konfiguracja zmiennych środowiskowych — wymagane klucze opisane w `docs/env.example`.

3. Uruchomienie emulatorów Firebase:
   ```
   npm run emulators
   ```

4. Uruchomienie aplikacji Expo:
   ```
   npm run expo
   ```

## Indeksy Firestore

Indeksy kompozytowe zdefiniowane w `firebase/firestore.indexes.json`. Deploy:

```
firebase deploy --only firestore:indexes
```
