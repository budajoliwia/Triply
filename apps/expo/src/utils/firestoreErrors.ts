type ErrorLike = {
  code?: unknown;
  message?: unknown;
  name?: unknown;
};

function getCode(error: unknown): string | null {
  const code = (error as ErrorLike | null | undefined)?.code;
  return typeof code === 'string' && code ? code : null;
}

function getMessage(error: unknown): string | null {
  const msg = (error as ErrorLike | null | undefined)?.message;
  return typeof msg === 'string' && msg ? msg : null;
}

export type UiErrorKind = 'offline' | 'permission' | 'timeout' | 'unknown';

export function classifyFirestoreError(error: unknown): UiErrorKind {
  const code = getCode(error);
  const msg = (getMessage(error) ?? '').toLowerCase();

  if (code === 'permission-denied' || code === 'unauthenticated') return 'permission';
  if (code === 'deadline-exceeded') return 'timeout';
  if (code === 'unavailable') return 'offline';

  // Auth/network-ish
  if (code === 'auth/network-request-failed') return 'offline';
  if (msg.includes('network request failed')) return 'offline';
  if (msg.includes('timeout') || msg.includes('timed out')) return 'timeout';

  return 'unknown';
}

/**
 * Maps Firestore/Auth-ish errors to a user-friendly Polish message.
 * Use `fallback` for action-specific copy (e.g. "Nie udało się polubić posta.").
 */
export function mapFirestoreErrorToMessage(
  error: unknown,
  fallback = 'Wystąpił błąd. Spróbuj ponownie.',
): string {
  const code = getCode(error);
  const msg = getMessage(error) ?? '';

  // Firestore
  if (code === 'permission-denied') return 'Brak uprawnień do tej akcji.';
  if (code === 'unauthenticated') return 'Zaloguj się, aby kontynuować.';
  if (code === 'not-found') return 'Nie znaleziono danych. Spróbuj odświeżyć.';
  if (code === 'failed-precondition') return 'Nie można wykonać tej akcji w tej chwili.';
  if (code === 'resource-exhausted') return 'Zbyt wiele żądań. Spróbuj ponownie za chwilę.';

  // Network-ish
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return 'Błąd sieci. Sprawdź połączenie z internetem i spróbuj ponownie.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Błąd sieci. Sprawdź połączenie z internetem i spróbuj ponownie.';
  }
  if (/network request failed/i.test(msg)) {
    return 'Błąd sieci. Sprawdź połączenie z internetem i spróbuj ponownie.';
  }

  return fallback;
}


