import {
  TRANSLATION_ERROR_LOG,
  TRANSLATION_PROVIDER_INVALID_KEY_LOG,
  TRANSLATION_PROVIDER_MISSING_CONFIG_LOG,
  TRANSLATION_PROVIDER_QUOTA_LOG,
  TRANSLATION_PROVIDER_RATE_LIMIT_LOG,
} from "@constants";
import { log } from "@utils";
import { clearAllCache, getCachedRomanization, getCachedTranslation } from "./translationProviders/cache";
import {
  dispatchRomanizeBatch,
  dispatchTranslateBatch,
  getActiveProviderKey,
  validateActiveProviderConfig,
} from "./translationProviders/registry";
import {
  type BatchRequest,
  type BatchRomanizationResponse,
  type BatchTranslationResponse,
  ProviderError,
  type TranslationProviderKey,
  type TranslationResult,
} from "./translationProviders/types";

function emptyTranslationResponse(lines: string[]): BatchTranslationResponse {
  return { results: lines.map(() => null), detectedLanguage: "" };
}

function logProviderError(error: unknown, providerKey: TranslationProviderKey): void {
  if (error instanceof ProviderError) {
    switch (error.kind) {
      case "invalid-key":
        log(TRANSLATION_PROVIDER_INVALID_KEY_LOG, providerKey);
        return;
      case "quota":
        log(TRANSLATION_PROVIDER_QUOTA_LOG, providerKey);
        return;
      case "rate-limit":
        log(TRANSLATION_PROVIDER_RATE_LIMIT_LOG, providerKey, error.retryAfterSeconds ?? "");
        return;
      case "server":
      case "network":
      case "unknown":
        log(TRANSLATION_ERROR_LOG, providerKey, error.message);
        return;
    }
  }
  log(TRANSLATION_ERROR_LOG, providerKey, error);
}

export async function translateBatch(request: BatchRequest): Promise<BatchTranslationResponse> {
  if (request.lines.length === 0 || !request.targetLanguage) {
    return emptyTranslationResponse(request.lines);
  }

  const providerKey = getActiveProviderKey();

  if (validateActiveProviderConfig() === "missing-config") {
    log(TRANSLATION_PROVIDER_MISSING_CONFIG_LOG, providerKey);
    return emptyTranslationResponse(request.lines);
  }

  try {
    return await dispatchTranslateBatch(request);
  } catch (error) {
    if ((error as Error).name === "AbortError") return emptyTranslationResponse(request.lines);
    logProviderError(error, providerKey);
    return emptyTranslationResponse(request.lines);
  }
}

export async function romanizeBatch(request: BatchRequest): Promise<BatchRomanizationResponse> {
  if (request.lines.length === 0) {
    return { results: request.lines.map(() => null), detectedLanguage: "" };
  }
  try {
    return await dispatchRomanizeBatch(request);
  } catch (error) {
    if ((error as Error).name !== "AbortError") {
      log(TRANSLATION_ERROR_LOG, "google", error);
    }
    return { results: request.lines.map(() => null), detectedLanguage: request.sourceLanguage || "auto" };
  }
}

export function clearCache(): void {
  clearAllCache();
}

export function getTranslationFromCache(
  text: string,
  targetLanguage: string,
  provider: TranslationProviderKey = getActiveProviderKey()
): TranslationResult | null {
  return getCachedTranslation(provider, targetLanguage, text);
}

export function getRomanizationFromCache(text: string): string | null {
  return getCachedRomanization(text);
}
