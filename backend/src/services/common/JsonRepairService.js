/**
 * Best-effort repair for near-valid JSON from a local LLM.
 * Single Responsibility: turn the two recurring failure shapes we actually
 * see from LM Studio into parseable JSON before giving up:
 *   - "Expected property name or '}'" etc. - the model wrote a literal
 *     newline/tab inside a narration string instead of escaping it, or left
 *     a trailing comma before a closing brace/bracket.
 *   - "Unexpected end of JSON input" - generation stopped mid-structure
 *     (still possible even with a correctly-sized token budget/context -
 *     the model can just decide to stop early).
 */
class JsonRepairService {
  /**
   * Escape literal control characters (newline, carriage return, tab) that
   * appear INSIDE JSON string literals. Only touches characters between
   * unescaped quotes - legitimate JSON whitespace between tokens (the
   * model's own pretty-printing) is left untouched.
   */
  static escapeRawControlCharsInStrings(text) {
    let result = '';
    let inString = false;
    let escaped = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (!inString) {
        if (ch === '"') inString = true;
        result += ch;
        continue;
      }

      if (escaped) {
        result += ch;
        escaped = false;
        continue;
      }

      if (ch === '\\') {
        result += ch;
        escaped = true;
        continue;
      }

      if (ch === '"') {
        inString = false;
        result += ch;
        continue;
      }

      if (ch === '\n') { result += '\\n'; continue; }
      if (ch === '\t') { result += '\\t'; continue; }
      if (ch === '\r') { continue; } // usually paired with \n - drop the bare CR

      result += ch;
    }

    return result;
  }

  /**
   * Remove a trailing comma right before a closing } or ] - a common
   * "last item," mistake.
   */
  static stripTrailingCommas(text) {
    return text.replace(/,(\s*[}\]])/g, '$1');
  }

  /**
   * Salvage a response that got cut off mid-structure: walk the text
   * tracking nesting depth and string state, trim back to the end of the
   * last fully-closed element directly inside the first array found (e.g.
   * the last complete scene in the scenes array), then close every brace/
   * bracket still open at that point. Sacrifices whatever didn't finish
   * generating in exchange for valid JSON with N-1 complete items instead
   * of a hard failure - ScriptParserService doesn't require an exact scene
   * count.
   */
  static closeTruncatedJson(text) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    let lastSafeCut = -1;
    // Depth level immediately inside the first array we hit (e.g. the
    // "scenes" array's own bracket brings depth to N; its elements open at
    // N+1 and close back down to N - that's the depth we're watching for).
    let arrayElementDepth = null;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (inString) {
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === '"') inString = false;
        continue;
      }

      if (ch === '"') { inString = true; continue; }

      if (ch === '{' || ch === '[') {
        depth++;
        if (ch === '[' && arrayElementDepth === null) {
          arrayElementDepth = depth;
        }
        continue;
      }

      if (ch === '}' || ch === ']') {
        depth--;
        if (arrayElementDepth !== null && depth === arrayElementDepth) {
          // Just closed a direct child of that array (e.g. one full scene).
          lastSafeCut = i;
        }
        continue;
      }
    }

    if (lastSafeCut === -1) return text; // nothing salvageable

    const truncated = text.slice(0, lastSafeCut + 1);

    // Re-walk the truncated slice to find what's still open, then close it.
    const openStack = [];
    inString = false;
    escaped = false;
    for (let i = 0; i < truncated.length; i++) {
      const ch = truncated[i];
      if (inString) {
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === '{' || ch === '[') openStack.push(ch);
      else if (ch === '}' || ch === ']') openStack.pop();
    }

    let closed = truncated;
    while (openStack.length) {
      closed += openStack.pop() === '{' ? '}' : ']';
    }
    return closed;
  }

  /**
   * Try increasingly aggressive repairs and return the first one that
   * parses. Throws the original parse error if nothing works.
   */
  static parse(rawText) {
    try {
      return JSON.parse(rawText);
    } catch (originalError) {
      const attempts = [
        () => JSON.parse(this.stripTrailingCommas(rawText)),
        () => JSON.parse(this.escapeRawControlCharsInStrings(rawText)),
        () => JSON.parse(this.stripTrailingCommas(this.escapeRawControlCharsInStrings(rawText))),
        () => JSON.parse(this.closeTruncatedJson(this.escapeRawControlCharsInStrings(rawText))),
        () => JSON.parse(this.closeTruncatedJson(this.stripTrailingCommas(this.escapeRawControlCharsInStrings(rawText)))),
      ];

      for (const attempt of attempts) {
        try {
          return attempt();
        } catch {
          // try the next repair
        }
      }

      throw originalError;
    }
  }
}

module.exports = JsonRepairService;
