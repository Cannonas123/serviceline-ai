import type Anthropic from '@anthropic-ai/sdk';

// Caller transcripts can arrive empty/whitespace (silence, background noise, a
// dropped word). The Anthropic API rejects empty text content blocks anywhere in
// the message list, so we must never send one — these helpers guarantee that.

export const SILENCE_PLACEHOLDER = '(the caller did not say anything audible)';
export const FALLBACK_REPLY =
  "Sorry, I didn't catch that — could you say that again?";

/** Normalize a caller utterance so it's always a non-empty string. */
export function sanitizeUserText(text: string | null | undefined): string {
  const t = (text ?? '').trim();
  return t.length > 0 ? t : SILENCE_PLACEHOLDER;
}

/** Join the assistant's text blocks into the spoken reply (trimmed). */
export function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

/**
 * Strip empty/whitespace text blocks before storing an assistant turn in history,
 * so a later request never includes an empty text block (which the API rejects).
 * If everything was stripped, keep one minimal text block so the turn stays valid.
 */
export function sanitizeContentForHistory(
  content: Anthropic.ContentBlock[],
): Anthropic.ContentBlock[] {
  const cleaned = content.filter(
    (b) => b.type !== 'text' || b.text.trim().length > 0,
  );
  return cleaned.length > 0
    ? cleaned
    : ([{ type: 'text', text: FALLBACK_REPLY }] as Anthropic.ContentBlock[]);
}

/** Transient (retryable) API failures — overload, rate limit, network blips. */
export function isTransientApiError(msg: string): boolean {
  return /overloaded|rate.?limit|\b429\b|\b503\b|\b529\b|timeout|ETIMEDOUT|fetch failed|ECONNRESET|socket hang|premature close/i.test(
    msg,
  );
}

/** Retry a call on transient errors with linear backoff. Non-transient errors
 *  (e.g. a 400 or auth failure) throw immediately — no point retrying those. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 2,
  baseMs = 400,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (i < attempts && isTransientApiError(msg)) {
        await new Promise((r) => setTimeout(r, baseMs * (i + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}
