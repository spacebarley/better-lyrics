import type { TranslationProviderKey, TranslationResult } from "./types";

interface TranslationCache {
  romanization: Map<string, string>;
  translation: Map<string, TranslationResult>;
}

const cache: TranslationCache = {
  romanization: new Map(),
  translation: new Map(),
};

function translationKey(provider: TranslationProviderKey, targetLanguage: string, text: string): string {
  return `${provider}_${targetLanguage}_${text}`;
}

export function getCachedTranslation(
  provider: TranslationProviderKey,
  targetLanguage: string,
  text: string
): TranslationResult | null {
  return cache.translation.get(translationKey(provider, targetLanguage, text.trim())) ?? null;
}

export function setCachedTranslation(
  provider: TranslationProviderKey,
  targetLanguage: string,
  text: string,
  result: TranslationResult
): void {
  cache.translation.set(translationKey(provider, targetLanguage, text), result);
}

export function getCachedRomanization(text: string): string | null {
  return cache.romanization.get(text.trim()) ?? null;
}

export function setCachedRomanization(text: string, romanized: string): void {
  cache.romanization.set(text, romanized);
}

export function clearAllCache(): void {
  cache.romanization.clear();
  cache.translation.clear();
}
