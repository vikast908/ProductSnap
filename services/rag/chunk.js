/**
 * Split a document's text into overlapping chunks for embedding.
 *
 * Returns offset-based chunks ({ start, len, text }) so the index can store
 * offsets instead of duplicated text — the snippet is sliced from the parent's
 * content at query time, keeping the index small (memory-conscious).
 */

const DEFAULT_CHUNK_CHARS = 1600; // ~400 tokens
const DEFAULT_OVERLAP_CHARS = 240; // ~15% overlap

/**
 * @param {string} text
 * @param {Object} [opts]
 * @returns {Array<{start:number,len:number,text:string}>}
 */
function chunkText(text, opts = {}) {
  const chunkChars = opts.chunkChars || DEFAULT_CHUNK_CHARS;
  const overlap = opts.overlap ?? DEFAULT_OVERLAP_CHARS;
  if (!text) return [];
  const clean = String(text);
  if (clean.length <= chunkChars) {
    return [{ start: 0, len: clean.length, text: clean.trim() }];
  }

  const chunks = [];
  const step = Math.max(1, chunkChars - overlap);
  for (let start = 0; start < clean.length; start += step) {
    let end = Math.min(clean.length, start + chunkChars);
    // Extend to the next word boundary so we don't cut mid-word.
    while (end < clean.length && clean[end] !== ' ' && clean[end] !== '\n') end++;
    const slice = clean.slice(start, end);
    if (slice.trim().length > 0) {
      chunks.push({ start, len: end - start, text: slice.trim() });
    }
    if (end >= clean.length) break;
  }
  return chunks;
}

module.exports = { chunkText, DEFAULT_CHUNK_CHARS, DEFAULT_OVERLAP_CHARS };
