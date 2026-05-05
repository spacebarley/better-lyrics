import { getCachedTranslation, setCachedTranslation } from "./cache";
import {
  type BatchRequest,
  type BatchTranslationResponse,
  ProviderError,
  type ProviderErrorKind,
  type TranslationProvider,
  type TranslationResult,
} from "./types";

const PROVIDER_KEY = "deepl" as const;

export const deeplProvider: TranslationProvider<"deepl"> = {
  key: PROVIDER_KEY,
  validateConfig: config => (config.apiKey.trim().length === 0 ? "missing-config" : null),
  translateBatch,
};

// -- Implementation --------------------------

// DeepL does not allow browser side API calls
// (https://developers.deepl.com/docs/best-practices/cors-requests)
// So we have to proxy through the background. (src/options/background.ts)
// This module marshals the request and reconstructs ProviderError from the response,
// while the background handles the actual network call and error parsing.)

const MAX_TEXTS_PER_REQUEST = 50;

interface DeeplTranslationItem {
  detected_source_language: string;
  text: string;
}

interface BackgroundDeeplSuccess {
  ok: true;
  translations: DeeplTranslationItem[];
}

interface BackgroundDeeplFailure {
  ok: false;
  error: { kind: ProviderErrorKind; message: string; retryAfterSeconds?: number };
}

type BackgroundDeeplResponse = BackgroundDeeplSuccess | BackgroundDeeplFailure;

function chunkByCount<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      result => {
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      err => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      }
    );
  });
}

async function callBackground(
  apiKey: string,
  texts: string[],
  targetLang: string,
  signal: AbortSignal | undefined
): Promise<DeeplTranslationItem[]> {
  const messagePromise = chrome.runtime.sendMessage({
    action: "deepl-translate",
    apiKey,
    texts,
    targetLang,
  }) as Promise<BackgroundDeeplResponse>;

  const response = await raceWithAbort(messagePromise, signal);

  if (!response.ok) {
    throw new ProviderError(
      response.error.kind,
      PROVIDER_KEY,
      response.error.message,
      response.error.retryAfterSeconds
    );
  }
  return response.translations;
}

async function translateBatch(request: BatchRequest, config: { apiKey: string }): Promise<BatchTranslationResponse> {
  const { lines, targetLanguage, signal } = request;
  if (!targetLanguage || lines.length === 0) {
    return { results: lines.map(() => null), detectedLanguage: "" };
  }

  const results: (TranslationResult | null)[] = new Array(lines.length).fill(null);
  const toTranslate: { index: number; text: string }[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "♪") return;

    const cached = getCachedTranslation(PROVIDER_KEY, targetLanguage, trimmed);
    if (cached) {
      results[index] = cached;
    } else {
      toTranslate.push({ index, text: trimmed });
    }
  });

  if (toTranslate.length === 0) {
    return { results, detectedLanguage: results.find(r => r !== null)?.originalLanguage || "" };
  }

  let detectedLanguage = "";

  for (const chunk of chunkByCount(toTranslate, MAX_TEXTS_PER_REQUEST)) {
    let translations: DeeplTranslationItem[];
    try {
      translations = await callBackground(
        config.apiKey,
        chunk.map(item => item.text),
        targetLanguage,
        signal
      );
    } catch (error) {
      if ((error as Error).name === "AbortError") break;
      throw error;
    }

    chunk.forEach((item, i) => {
      const entry = translations[i];
      if (!entry) return;
      const translatedText = entry.text?.trim();
      if (!translatedText || translatedText.toLowerCase() === item.text.toLowerCase()) return;

      const originalLanguage = entry.detected_source_language?.toLowerCase() ?? "";
      if (!detectedLanguage && originalLanguage) {
        detectedLanguage = originalLanguage;
      }
      const result: TranslationResult = { originalLanguage, translatedText };
      setCachedTranslation(PROVIDER_KEY, targetLanguage, item.text, result);
      results[item.index] = result;
    });
  }

  return { results, detectedLanguage };
}
