import { DEEPL_TRANSLATE_FREE_URL, DEEPL_TRANSLATE_PRO_URL } from "@constants";
import { ProviderError } from "./types";

const PROVIDER_KEY = "deepl" as const;

const DEEPL_FREE_KEY_SUFFIX = ":fx" as const;

interface DeeplTranslationItem {
  detected_source_language: string;
  text: string;
}

interface DeeplFetchResult {
  translations: DeeplTranslationItem[];
}

const DEEPL_LANG_MAP: Record<string, string> = {
  en: "EN-US",
  zh: "ZH-HANS",
  pt: "PT-BR",
  "zh-cn": "ZH-HANS",
  "zh-tw": "ZH-HANT",
  "zh-hk": "ZH-HANT",
  no: "NB",
};

function mapTargetLanguage(code: string): string {
  const lower = code.toLowerCase();
  return DEEPL_LANG_MAP[lower] ?? code.toUpperCase();
}

function endpointFor(apiKey: string): string {
  return apiKey.endsWith(DEEPL_FREE_KEY_SUFFIX) ? DEEPL_TRANSLATE_FREE_URL : DEEPL_TRANSLATE_PRO_URL;
}

function parseRetryAfter(headers: Headers): number | undefined {
  const value = headers.get("Retry-After");
  if (!value) return undefined;
  const seconds = Number.parseInt(value, 10);
  return Number.isFinite(seconds) ? seconds : undefined;
}

function classifyHttpError(status: number, headers: Headers): ProviderError {
  if (status === 401 || status === 403) {
    return new ProviderError("invalid-key", PROVIDER_KEY, `DeepL rejected the API key (HTTP ${status}).`);
  }
  if (status === 456) {
    return new ProviderError("quota", PROVIDER_KEY, "DeepL API quota exceeded for this billing period.");
  }
  if (status === 429) {
    return new ProviderError("rate-limit", PROVIDER_KEY, "DeepL rate limit hit.", parseRetryAfter(headers));
  }
  if (status >= 500) {
    return new ProviderError("server", PROVIDER_KEY, `DeepL server error (HTTP ${status}).`);
  }
  return new ProviderError("unknown", PROVIDER_KEY, `DeepL request failed (HTTP ${status}).`);
}

export async function fetchDeeplTranslations(
  apiKey: string,
  texts: string[],
  targetLang: string,
  signal?: AbortSignal
): Promise<DeeplFetchResult> {
  const endpoint = endpointFor(apiKey);
  const response = await fetch(endpoint, {
    method: "POST",
    signal,
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: texts,
      target_lang: mapTargetLanguage(targetLang),
    }),
  });

  if (!response.ok) {
    throw classifyHttpError(response.status, response.headers);
  }

  return (await response.json()) as DeeplFetchResult;
}
