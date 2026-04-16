const path = require('path');
const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');
const { logger } = require('../utils');

const SUPPORTED_EXTENSIONS = ['.txt', '.srt', '.vtt', '.docx', '.pdf'];

class TranscriptParserError extends Error {
  constructor(message, code = 'TRANSCRIPT_PARSE_ERROR') {
    super(message);
    this.name = 'TranscriptParserError';
    this.code = code;
  }
}

function getExtension(originalname = '') {
  return path.extname(originalname).toLowerCase();
}

function isSupportedExtension(ext) {
  return SUPPORTED_EXTENSIONS.includes(ext);
}

function decodeText(buffer) {
  const raw = buffer.toString('utf8');
  return raw.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '');
}

function stripCaptions(text) {
  const lines = text.split('\n');
  const timestampRe = /^\s*\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3}\s*-->\s*\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3}.*$/;
  const sequenceRe = /^\s*\d+\s*$/;
  const vttHeaderRe = /^\s*(WEBVTT|NOTE|STYLE|REGION).*$/i;
  const cueSettingsRe = /^\s*(align|line|position|size|vertical):/i;

  const cleaned = [];
  for (const line of lines) {
    if (timestampRe.test(line)) continue;
    if (sequenceRe.test(line)) continue;
    if (vttHeaderRe.test(line)) continue;
    if (cueSettingsRe.test(line)) continue;
    const stripped = line.replace(/<[^>]+>/g, '').trim();
    if (stripped.length === 0) continue;
    cleaned.push(stripped);
  }
  return cleaned.join('\n');
}

async function parseDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

async function parsePdf(buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text || '';
  } finally {
    try { await parser.destroy(); } catch { /* ignore */ }
  }
}

async function parseTranscriptFile({ buffer, originalname, mimetype }) {
  if (!buffer || buffer.length === 0) {
    throw new TranscriptParserError('Empty file', 'EMPTY_FILE');
  }

  const ext = getExtension(originalname);
  if (!isSupportedExtension(ext)) {
    throw new TranscriptParserError(
      `Unsupported file type: ${ext || 'unknown'}. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`,
      'UNSUPPORTED_TYPE'
    );
  }

  let text;
  try {
    switch (ext) {
    case '.txt':
      text = decodeText(buffer);
      break;
    case '.srt':
    case '.vtt':
      text = stripCaptions(decodeText(buffer));
      break;
    case '.docx':
      text = await parseDocx(buffer);
      break;
    case '.pdf':
      text = await parsePdf(buffer);
      break;
    default:
      throw new TranscriptParserError('Unsupported file type', 'UNSUPPORTED_TYPE');
    }
  } catch (err) {
    if (err instanceof TranscriptParserError) throw err;
    logger.error(`Failed to parse ${ext} transcript file:`, err.message);
    throw new TranscriptParserError(
      `Could not read ${ext} file: ${err.message}`,
      'PARSE_FAILED'
    );
  }

  const normalized = (text || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  if (normalized.length < 50) {
    throw new TranscriptParserError(
      'Transcript is too short. Please upload a file with at least 50 characters of text.',
      'TRANSCRIPT_TOO_SHORT'
    );
  }

  logger.info(`Parsed ${ext} transcript file`, {
    originalname,
    mimetype,
    length: normalized.length
  });

  return { text: normalized, extension: ext };
}

module.exports = {
  parseTranscriptFile,
  SUPPORTED_EXTENSIONS,
  TranscriptParserError
};
