export type TranslationProviderKey = "google";

export interface ProviderConfigMap {
  google: Record<string, never>;
}

export type ProviderConfig<K extends TranslationProviderKey> = ProviderConfigMap[K];

export interface BatchRequest {
  lines: string[];
  targetLanguage?: string;
  sourceLanguage?: string;
  signal?: AbortSignal;
}

export interface TranslationResult {
  originalLanguage: string;
  translatedText: string;
}

export interface BatchTranslationResponse {
  results: (TranslationResult | null)[];
  detectedLanguage: string;
}

export interface BatchRomanizationResponse {
  results: (string | null)[];
  detectedLanguage: string;
}

export type ConfigValidationResult = null | "missing-config";

export interface TranslationProvider<K extends TranslationProviderKey = TranslationProviderKey> {
  readonly key: K;
  validateConfig(config: ProviderConfig<K>): ConfigValidationResult;
  translateBatch(request: BatchRequest, config: ProviderConfig<K>): Promise<BatchTranslationResponse>;
  romanizeBatch?(request: BatchRequest, config: ProviderConfig<K>): Promise<BatchRomanizationResponse>;
}

type ProviderErrorKind = "invalid-key" | "quota" | "rate-limit" | "network" | "server" | "unknown";

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly providerKey: TranslationProviderKey;
  readonly retryAfterSeconds?: number;

  constructor(
    kind: ProviderErrorKind,
    providerKey: TranslationProviderKey,
    message: string,
    retryAfterSeconds?: number
  ) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    this.providerKey = providerKey;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
