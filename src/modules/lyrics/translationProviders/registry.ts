import { deeplProvider } from "./deepl";
import { googleProvider } from "./google";
import type {
  BatchRequest,
  BatchRomanizationResponse,
  BatchTranslationResponse,
  ConfigValidationResult,
  TranslationProviderKey,
} from "./types";

const providers = {
  google: googleProvider,
  deepl: deeplProvider,
} as const;

// Selection from user settings is wired through AppState in a follow-up commit.
// Until then the dispatcher always routes to Google.
export function getActiveProviderKey(): TranslationProviderKey {
  return "google";
}

/**
 * Validates the active provider's config without side effects.
 * The dispatcher uses this to short-circuit before any network call.
 */
export function validateActiveProviderConfig(): ConfigValidationResult {
  return providers.google.validateConfig({});
}

/**
 * Dispatches a translate-batch request to the active provider, threading the
 * provider-specific config. A switch (added when more providers exist) is
 * what narrows the provider/config pair so the call type-checks without `any`.
 */
export async function dispatchTranslateBatch(request: BatchRequest): Promise<BatchTranslationResponse> {
  return providers.google.translateBatch(request, {});
}

/**
 * Romanization always goes through Google: other providers (future LLMs and
 * commercial translation APIs like DeepL) generally don't expose a
 * transliteration endpoint. Centralizing this here means the dispatcher in
 * translation.ts doesn't need to know.
 */
export async function dispatchRomanizeBatch(request: BatchRequest): Promise<BatchRomanizationResponse> {
  return providers.google.romanizeBatch!(request, {});
}
