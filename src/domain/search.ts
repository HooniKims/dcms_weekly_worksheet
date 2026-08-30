const DEFAULT_EXCERPT_LENGTH = 96;
const ELLIPSIS = "…";
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function characters(value: string): readonly string[] {
  return Array.from(graphemeSegmenter.segment(value), ({ segment }) => segment);
}

export function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

export function searchGrams(value: string): readonly string[] {
  const normalized = characters(normalizeSearchText(value));
  const grams: string[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < normalized.length - 1; index += 1) {
    const gram = `${normalized[index]}${normalized[index + 1]}`;
    if (!seen.has(gram)) {
      seen.add(gram);
      grams.push(gram);
    }
  }

  return grams;
}

export function matchesSearch(recordText: string, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (characters(normalizedQuery).length < 2) {
    return false;
  }
  return normalizeSearchText(recordText).includes(normalizedQuery);
}

function startExcerpt(text: readonly string[], maxLength: number): string {
  if (text.length <= maxLength) {
    return text.join("");
  }
  if (maxLength === 1) {
    return ELLIPSIS;
  }
  return `${text
    .slice(0, maxLength - 1)
    .join("")
    .trimEnd()}${ELLIPSIS}`;
}

export function searchExcerpt(
  plainText: string,
  query: string,
  maxLength = DEFAULT_EXCERPT_LENGTH,
): string {
  if (maxLength <= 0) {
    return "";
  }

  const normalizedText = normalizeSearchText(plainText);
  const text = characters(normalizedText);
  if (text.length <= maxLength) {
    return text.join("");
  }

  const normalizedQuery = normalizeSearchText(query);
  const queryCharacters = characters(normalizedQuery);
  const queryStartInString = normalizedText.indexOf(normalizedQuery);
  if (queryCharacters.length < 2 || queryStartInString < 0) {
    return startExcerpt(text, maxLength);
  }

  const queryStart = characters(normalizedText.slice(0, queryStartInString)).length;
  const queryEnd = queryStart + queryCharacters.length;
  if (queryCharacters.length >= maxLength) {
    return text.slice(queryStart, queryEnd).slice(0, maxLength).join("");
  }

  if (queryCharacters.length + 2 > maxLength) {
    const queryText = queryCharacters.join("");
    if (queryStart > 0) {
      return `${ELLIPSIS}${queryText}`;
    }
    return `${queryText}${ELLIPSIS}`;
  }

  const contentLength = maxLength - 2;
  let windowStart = queryStart - Math.floor((contentLength - queryCharacters.length) / 2);
  windowStart = Math.max(0, Math.min(windowStart, text.length - contentLength));
  const windowEnd = windowStart + contentLength;
  const prefix = windowStart > 0 ? ELLIPSIS : "";
  const suffix = windowEnd < text.length ? ELLIPSIS : "";
  let content = text.slice(windowStart, windowEnd).join("");
  if (prefix) {
    content = content.trimStart();
  }
  if (suffix) {
    content = content.trimEnd();
  }
  return `${prefix}${content}${suffix}`;
}
