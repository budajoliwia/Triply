import * as logger from 'firebase-functions/logger';

export type AiModerationDecision = 'ALLOW' | 'REVIEW' | 'BLOCK';

export type AiModerationResult = {
  decision: AiModerationDecision;
  /** 0..1 confidence of the decision */
  score: number;
  /** per-category scores 0..1 */
  categories: Record<string, number>;
  /** short user-facing rejection reason (only for BLOCK) */
  rejectionReason?: string;
  /** includes model name + internal prompt version */
  modelVersion: string;
};

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const PROMPT_VERSION = 'postmod-v1';
const REQUEST_TIMEOUT_MS = 10_000;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asDecision(value: unknown): AiModerationDecision | null {
  if (value === 'ALLOW' || value === 'REVIEW' || value === 'BLOCK') return value;
  return null;
}

function asCategories(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const obj = value as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof k !== 'string' || !k) continue;
    if (typeof v !== 'number') continue;
    out[k] = clamp01(v);
  }
  return out;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Try to salvage a JSON object from within the text.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const slice = text.slice(start, end + 1);
      try {
        return JSON.parse(slice);
      } catch {
        // ignore
      }
    }
    return null;
  }
}

function buildInputText(params: { title?: string | null; text: string }): string {
  const title = asNonEmptyString(params.title);
  const text = typeof params.text === 'string' ? params.text : '';
  if (title) return `Tytuł: ${title}\n\nTreść: ${text}`;
  return `Treść: ${text}`;
}

function buildSystemPrompt(): string {
  return [
    'Jesteś systemem moderacji treści dla aplikacji społecznościowej.',
    'Oceń tylko TEKST (bez analizy obrazów).',
    '',
    'Zadanie: sklasyfikuj treść do jednej z decyzji:',
    '- ALLOW: bezpieczne, zgodne z zasadami; można automatycznie zatwierdzić.',
    '- BLOCK: jednoznacznie niebezpieczne lub naruszające zasady; można automatycznie odrzucić.',
    '- REVIEW: niepewne/na granicy; pozostaw do ręcznej decyzji admina.',
    '',
    'Zwróć WYŁĄCZNIE poprawny JSON o strukturze:',
    '{',
    '  "decision": "ALLOW" | "REVIEW" | "BLOCK",',
    '  "score": number,',
    '  "categories": { "<kategoria>": number, ... },',
    '  "rejectionReason": string',
    '}',
    '',
    'Wymagania:',
    '- score: 0..1 (pewność decyzji).',
    '- categories: mapuj kategorie na 0..1 (np. spam, hate, harassment, sexual, violence, self_harm, illegal, extremism, drugs, weapons, minors).',
    '- rejectionReason: tylko dla BLOCK. Krótki, przyjazny komunikat po polsku (max 240 znaków), bez cytowania treści użytkownika.',
    '- Jeśli nie ma podstaw do BLOCK, ale są wątpliwości, wybierz REVIEW (nie ALLOW).',
  ].join('\n');
}

function buildImageSystemPrompt(): string {
  return [
    'Jesteś systemem moderacji treści dla aplikacji społecznościowej.',
    'Oceń tylko OBRAZ. Skup się wyłącznie na:',
    '- nagości/treściach seksualnych (NSFW)',
    '- przemocy/drastycznych scenach (gore)',
    '',
    'Nie oceniaj spamu ani tekstu na obrazie jako spamu.',
    '',
    'Zwróć WYŁĄCZNIE poprawny JSON o strukturze:',
    '{',
    '  "decision": "ALLOW" | "REVIEW" | "BLOCK",',
    '  "score": number,',
    '  "categories": { "nudity": number, "violence": number, ... },',
    '  "rejectionReasonPL": string',
    '}',
    '',
    'Wymagania:',
    '- decision: ALLOW jeśli bezpieczne; BLOCK jeśli jednoznacznie NSFW lub przemoc/gore; REVIEW jeśli niepewne.',
    '- score: 0..1 (pewność decyzji).',
    '- categories: mapuj co najmniej "nudity" i "violence" na 0..1.',
    '- rejectionReasonPL: tylko dla BLOCK. Krótki, przyjazny komunikat po polsku (max 240 znaków), bez cytowania obrazu.',
    '- Jeśli masz wątpliwości, wybierz REVIEW (nie ALLOW).',
  ].join('\n');
}

function getFetchWithTimeout(timeoutMs: number): {
  fetchFn: (input: any, init?: any) => Promise<any>;
  controller: any | null;
  timeoutHandle: ReturnType<typeof setTimeout>;
} {
  const fetchFn = (globalThis as any).fetch as (input: any, init?: any) => Promise<any>;
  if (typeof fetchFn !== 'function') throw new Error('global fetch is not available (Node 20 required)');

  const AbortControllerCtor = (globalThis as any).AbortController as any;
  const controller = AbortControllerCtor ? new AbortControllerCtor() : null;

  const timeoutHandle = setTimeout(() => {
    try {
      controller?.abort?.();
    } catch {
      // ignore
    }
  }, timeoutMs);

  return { fetchFn, controller, timeoutHandle };
}

/**
 * Calls OpenAI to classify text into ALLOW / REVIEW / BLOCK.
 * Throws on any error. Caller must ensure fail-safe behavior (never auto-approve on error).
 */
export async function moderateTextWithOpenAI(params: {
  title?: string | null;
  text: string;
}): Promise<AiModerationResult> {
  const apiKey = asNonEmptyString(process.env.OPENAI_API_KEY);
  const model = asNonEmptyString(process.env.AI_MODERATION_MODEL);
  if (!apiKey) throw new Error('OPENAI_API_KEY is missing');
  if (!model) throw new Error('AI_MODERATION_MODEL is missing');

  const modelVersion = `${model}@${PROMPT_VERSION}`;

  // TS note: functions tsconfig doesn't include DOM libs; keep fetch/AbortController as any.
  const { fetchFn, controller, timeoutHandle } = getFetchWithTimeout(REQUEST_TIMEOUT_MS);

  const inputText = buildInputText(params);
  const systemPrompt = buildSystemPrompt();

  const body = {
    model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: inputText },
    ],
  };

  try {
    const resp = await fetchFn(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      ...(controller ? { signal: controller.signal } : {}),
    });

    const respText = await resp.text();
    if (!resp.ok) {
      logger.error('[aiModeration][openai] non_200', { status: resp.status, body: respText?.slice?.(0, 2000) });
      throw new Error(`OpenAI error: ${resp.status}`);
    }

    const respJson = safeJsonParse(respText) as any;
    const content = respJson?.choices?.[0]?.message?.content;
    const contentStr = typeof content === 'string' ? content : '';
    const parsed = safeJsonParse(contentStr) as any;

    const decision = asDecision(parsed?.decision);
    const score = clamp01(typeof parsed?.score === 'number' ? parsed.score : 0);
    const categories = asCategories(parsed?.categories);
    const rejectionReasonRaw = asNonEmptyString(parsed?.rejectionReason);

    if (!decision) {
      logger.error('[aiModeration][parse] invalid_decision', { content: contentStr?.slice?.(0, 2000) });
      throw new Error('Invalid moderation decision');
    }

    const result: AiModerationResult = {
      decision,
      score,
      categories,
      modelVersion,
      ...(decision === 'BLOCK'
        ? {
            rejectionReason: (rejectionReasonRaw ?? 'Treść narusza zasady społeczności.').slice(0, 240),
          }
        : {}),
    };

    return result;
  } catch (error) {
    const message = (error as { message?: string })?.message ?? 'unknown';
    const isTimeoutLike =
      message.includes('AbortError') ||
      message.toLowerCase().includes('timeout') ||
      message.toLowerCase().includes('aborted');
    logger.error('[aiModeration] failed', {
      modelVersion,
      isTimeoutLike,
      error,
    });
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * Calls OpenAI vision to classify image into ALLOW / REVIEW / BLOCK for:
 * - nudity / sexual content
 * - violence / gore
 *
 * Throws on any error. Caller must ensure fail-safe behavior (never auto-approve on error).
 */
export async function moderateImageWithOpenAI(params: {
  imageBuffer: Buffer;
  mimeType: string;
}): Promise<AiModerationResult> {
  const apiKey = asNonEmptyString(process.env.OPENAI_API_KEY);
  const model = asNonEmptyString(process.env.AI_MODERATION_MODEL);
  if (!apiKey) throw new Error('OPENAI_API_KEY is missing');
  if (!model) throw new Error('AI_MODERATION_MODEL is missing');

  const modelVersion = `${model}@${PROMPT_VERSION}`;
  const { fetchFn, controller, timeoutHandle } = getFetchWithTimeout(REQUEST_TIMEOUT_MS);

  const mimeType = asNonEmptyString(params.mimeType) ?? 'image/jpeg';
  const base64 = params.imageBuffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const systemPrompt = buildImageSystemPrompt();

  const body = {
    model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Oceń ten obraz.' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
  };

  try {
    const resp = await fetchFn(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      ...(controller ? { signal: controller.signal } : {}),
    });

    const respText = await resp.text();
    if (!resp.ok) {
      logger.error('[aiModeration][openai:image] non_200', { status: resp.status, body: respText?.slice?.(0, 2000) });
      throw new Error(`OpenAI error: ${resp.status}`);
    }

    const respJson = safeJsonParse(respText) as any;
    const content = respJson?.choices?.[0]?.message?.content;
    const contentStr = typeof content === 'string' ? content : '';
    const parsed = safeJsonParse(contentStr) as any;

    const decision = asDecision(parsed?.decision);
    const score = clamp01(typeof parsed?.score === 'number' ? parsed.score : 0);
    const categories = asCategories(parsed?.categories);
    const rejectionReasonRaw = asNonEmptyString(parsed?.rejectionReasonPL);

    if (!decision) {
      logger.error('[aiModeration][parse:image] invalid_decision', { content: contentStr?.slice?.(0, 2000) });
      throw new Error('Invalid image moderation decision');
    }

    return {
      decision,
      score,
      categories,
      modelVersion,
      ...(decision === 'BLOCK'
        ? {
            rejectionReason: (rejectionReasonRaw ?? 'Zdjęcie narusza zasady społeczności.').slice(0, 240),
          }
        : {}),
    };
  } catch (error) {
    const message = (error as { message?: string })?.message ?? 'unknown';
    const isTimeoutLike =
      message.includes('AbortError') ||
      message.toLowerCase().includes('timeout') ||
      message.toLowerCase().includes('aborted');
    logger.error('[aiModeration][image] failed', {
      modelVersion,
      isTimeoutLike,
      error,
    });
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}


