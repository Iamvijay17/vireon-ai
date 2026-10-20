/**
 * Make user-typed search text safe to use inside a Mongo $regex.
 *
 * The list endpoints do a case-insensitive "contains" search, so the text must
 * match literally. Passed through raw, "c++" or "(" is an invalid pattern (the
 * query throws and the page shows a server error), and a crafted pattern can
 * make the regex engine run for a very long time.
 */
function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { escapeRegex };
