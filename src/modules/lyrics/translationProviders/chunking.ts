export const BATCH_SEPARATOR = "\n\n;\n\n";
const MAX_URL_LENGTH = 15000;

export interface ChunkItem {
  index: number;
  text: string;
}

/**
 * Splits items into chunks so that each chunk's encoded length plus a fixed base URL
 * stays under MAX_URL_LENGTH. Used by URL-bound providers (Google).
 */
export function chunkByUrlLength(items: ChunkItem[], baseUrlLength: number): ChunkItem[][] {
  const chunks: ChunkItem[][] = [];
  let currentChunk: ChunkItem[] = [];
  let currentEncodedLength = 0;
  const separatorEncoded = encodeURIComponent(BATCH_SEPARATOR);

  for (const item of items) {
    const itemEncoded = encodeURIComponent(item.text);
    const addedLength = (currentChunk.length > 0 ? separatorEncoded.length : 0) + itemEncoded.length;

    if (currentChunk.length > 0 && baseUrlLength + currentEncodedLength + addedLength > MAX_URL_LENGTH) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentEncodedLength = 0;
    }

    currentChunk.push(item);
    currentEncodedLength += (currentChunk.length > 1 ? separatorEncoded.length : 0) + itemEncoded.length;
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  return chunks;
}
