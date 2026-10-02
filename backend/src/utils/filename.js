// Turns a video/course title into a safe download filename: strips
// characters illegal on Windows/macOS/Linux filesystems, collapses
// whitespace, and falls back to "video" if nothing usable remains.
function sanitizeFilename(title) {
  const cleaned = (title || '')
    .replace(/[/\\?%*:|"<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'video';
}

module.exports = { sanitizeFilename };
