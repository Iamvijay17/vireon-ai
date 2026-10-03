const { buildSubtitles } = require('./subtitles');
const { sanitizeFilename } = require('./filename');
const { NotFoundError, ValidationError } = require('./errors');

const FORMATS = {
  srt: 'application/x-subrip',
  vtt: 'text/vtt',
};

/**
 * Sends a script's captions as a downloadable .srt / .vtt.
 * `?format=srt|vtt` (default srt). 404 until the script has narration to caption.
 */
function sendSubtitles(req, res, { scenes, title }) {
  const format = String(req.query.format || 'srt').toLowerCase();
  if (!FORMATS[format]) throw new ValidationError('format must be "srt" or "vtt"');

  const { cues, text } = buildSubtitles(scenes, format);
  if (cues === 0) throw new NotFoundError('This video has no narration to caption yet');

  res.setHeader('Content-Type', `${FORMATS[format]}; charset=utf-8`);
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(title || 'captions')}.${format}"`);
  res.send(text);
}

module.exports = { sendSubtitles };
