import { AppState } from "@core/appState";
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

export function getActiveProviderKey(): TranslationProviderKey {
  return AppState.translationApiProvider ?? "google";
}

/**
 * Validates the active provider's config without side effects.
 * The dispatcher uses this to short-circuit before any network call.
 */
export function validateActiveProviderConfig(): ConfigValidationResult {
  const key = getActiveProviderKey();
  switch (key) {
    case "google":
      return providers.google.validateConfig({});
    case "deepl":
      return providers.deepl.validateConfig(AppState.translationProviderConfigs.deepl);
  }
}

/**
 * Dispatches a translate-batch request to the active provider, threading the
 * provider-specific config from AppState. The switch is what narrows the
 * provider/config pair so the call type-checks without `any`.
 */
export async function dispatchTranslateBatch(request: BatchRequest): Promise<BatchTranslationResponse> {
  const key = getActiveProviderKey();
  switch (key) {
    case "google":
      return providers.google.translateBatch(request, {});
    case "deepl":
      return providers.deepl.translateBatch(request, AppState.translationProviderConfigs.deepl);
  }
}

/**
 * Romanization always goes through Google: DeepL has no romanization API,
 * and other providers (future LLMs) are unlikely to either. Centralizing
 * this here means the dispatcher in translation.ts doesn't need to know.
 */
export async function dispatchRomanizeBatch(request: BatchRequest): Promise<BatchRomanizationResponse> {
  return providers.google.romanizeBatch!(request, {});
}
