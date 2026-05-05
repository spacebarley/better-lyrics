import { TRANSLATE_IN_ROMAJI, TRANSLATE_LYRICS_URL, TRANSLATION_ERROR_LOG } from "@constants";
import { log } from "@utils";
import { getCachedRomanization, getCachedTranslation, setCachedRomanization, setCachedTranslation } from "./cache";
import { BATCH_SEPARATOR, chunkByUrlLength, type ChunkItem } from "./chunking";
import type {
  BatchRequest,
  BatchRomanizationResponse,
  BatchTranslationResponse,
  TranslationProvider,
  TranslationResult,
} from "./types";

const PROVIDER_KEY = "google" as const;

export const googleProvider: TranslationProvider<"google"> = {
  key: PROVIDER_KEY,
  validateConfig: () => null,
  translateBatch,
  romanizeBatch,
};

// -- Implementation --------------------------

async function translateBatch(request: BatchRequest): Promise<BatchTranslationResponse> {
  const { lines, targetLanguage, signal } = request;
  if (!targetLanguage || lines.length === 0) {
    return { results: lines.map(() => null), detectedLanguage: "" };
  }

  const results: (TranslationResult | null)[] = new Array(lines.length).fill(null);
  const toTranslate: ChunkItem[] = [];

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
  const baseUrl = TRANSLATE_LYRICS_URL(targetLanguage, "");
  const chunks = chunkByUrlLength(toTranslate, baseUrl.length);

  for (const chunk of chunks) {
    try {
      const combinedText = chunk.map(item => item.text).join(BATCH_SEPARATOR);
      const url = TRANSLATE_LYRICS_URL(targetLanguage, combinedText);

      const response = await fetch(url, { cache: "force-cache", signal });
      const data = await response.json();

      if (!detectedLanguage) {
        detectedLanguage = data[2] || "";
      }

      let fullTranslatedText = "";
      data[0].forEach((part: string[]) => {
        fullTranslatedText += part[0];
      });

      let translatedLines = fullTranslatedText.split(BATCH_SEPARATOR);

      // Fallback: If Google merged the translations into fewer blocks than expected
      if (translatedLines.length < chunk.length) {
        const semicolonSplit = fullTranslatedText.split(";").filter(l => l.trim().length > 0);
        if (semicolonSplit.length === chunk.length) {
          translatedLines = semicolonSplit;
        } else {
          const singleNewlineSplit = fullTranslatedText.split(/\r?\n/).filter(l => l.trim().length > 0);
          if (singleNewlineSplit.length === chunk.length) {
            translatedLines = singleNewlineSplit;
          } else if (translatedLines.length === 1 && chunk.length > 1) {
            log(TRANSLATION_ERROR_LOG, `Batch translation failed to split: expected ${chunk.length} lines, got 1.`);
            translatedLines = [];
          }
        }
      }

      chunk.forEach((item, i) => {
        const translatedText = translatedLines[i]?.trim();
        if (translatedText && translatedText.toLowerCase() !== item.text.toLowerCase()) {
          const result: TranslationResult = { originalLanguage: detectedLanguage, translatedText };
          setCachedTranslation(PROVIDER_KEY, targetLanguage, item.text, result);
          results[item.index] = result;
        }
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") break;
      log(TRANSLATION_ERROR_LOG, error);
    }
  }

  return { results, detectedLanguage };
}

async function romanizeBatch(request: BatchRequest): Promise<BatchRomanizationResponse> {
  const { lines, sourceLanguage, signal } = request;
  if (lines.length === 0) {
    return { results: lines.map(() => null), detectedLanguage: "" };
  }

  const results: (string | null)[] = new Array(lines.length).fill(null);
  const toRomanize: ChunkItem[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "♪") return;

    const cached = getCachedRomanization(trimmed);
    if (cached) {
      results[index] = cached;
    } else {
      toRomanize.push({ index, text: trimmed });
    }
  });

  if (toRomanize.length === 0) {
    return { results, detectedLanguage: sourceLanguage || "auto" };
  }

  let detectedLanguage = sourceLanguage || "auto";
  const lang = sourceLanguage || "auto";
  const baseUrl = TRANSLATE_IN_ROMAJI(lang, "");
  const chunks = chunkByUrlLength(toRomanize, baseUrl.length);

  for (const chunk of chunks) {
    try {
      const combinedText = chunk.map(item => item.text).join(BATCH_SEPARATOR);
      const url = TRANSLATE_IN_ROMAJI(lang, combinedText);

      const response = await fetch(url, { cache: "force-cache", signal });
      const data = await response.json();

      detectedLanguage = data[2] || detectedLanguage;

      let fullRomanizedText = "";
      for (const part of data[0]) {
        if (!part) continue;
        const romanized = part[3] || part[2];
        if (romanized) {
          fullRomanizedText += romanized;
        }
      }

      let romanizedLines = fullRomanizedText.split(BATCH_SEPARATOR);

      // Fallback: If Google merged the romanizations into fewer blocks than expected
      if (romanizedLines.length < chunk.length) {
        const semicolonSplit = fullRomanizedText.split(";").filter(l => l.trim().length > 0);
        if (semicolonSplit.length === chunk.length) {
          romanizedLines = semicolonSplit;
        } else {
          const singleNewlineSplit = fullRomanizedText.split(/\r?\n/).filter(l => l.trim().length > 0);
          if (singleNewlineSplit.length === chunk.length) {
            romanizedLines = singleNewlineSplit;
          } else if (romanizedLines.length === 1 && chunk.length > 1) {
            log(TRANSLATION_ERROR_LOG, `Batch romanization failed to split: expected ${chunk.length} lines, got 1.`);
            romanizedLines = [];
          }
        }
      }

      chunk.forEach((item, i) => {
        const romanizedText = romanizedLines[i]?.trim();
        if (romanizedText && romanizedText.toLowerCase() !== item.text.toLowerCase()) {
          setCachedRomanization(item.text, romanizedText);
          results[item.index] = romanizedText;
        }
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") break;
      log(TRANSLATION_ERROR_LOG, error);
    }
  }

  return { results, detectedLanguage };
}
