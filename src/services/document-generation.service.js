/**
 * Document Generation Service
 * Generates DOCX and PDF documents from content
 * Uses Puppeteer for PDF generation to support emojis natively
 */

// eslint-disable-next-line no-unused-vars
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, PageBreak, Table, TableRow, TableCell, WidthType, TableBorders, VerticalAlign } = require('docx');
const PDFDocument = require('pdfkit');
const { logger } = require('../utils');

// PDFKit-based PDF generation (no browser dependency)

class DocumentGenerationService {
  constructor() {
    // Document styling constants
    this.styles = {
      fonts: {
        title: 'Arial',
        heading: 'Arial',
        body: 'Arial'
      },
      sizes: {
        title: 28,
        heading1: 24,
        heading2: 20,
        heading3: 16,
        body: 12
      },
      colors: {
        primary: '#1a365d',
        secondary: '#2d3748',
        text: '#333333',
        muted: '#718096'
      }
    };

    // Common emoji to text mappings for PDF fallback
    this.emojiMap = {
      '😀': ':)',
      '😃': ':D',
      '😄': ':D',
      '😁': ':D',
      '😊': ':)',
      '🙂': ':)',
      '😉': ';)',
      '😍': '<3',
      '🥰': '<3',
      '😘': ':*',
      '😂': 'LOL',
      '🤣': 'ROFL',
      '😢': ':(',
      '😭': ':\'(',
      '😱': ':O',
      '😮': ':O',
      '🤔': '(?)',
      '👍': '[thumbs up]',
      '👎': '[thumbs down]',
      '👏': '[clap]',
      '🙌': '[raised hands]',
      '🤝': '[handshake]',
      '✅': '[check]',
      '❌': '[x]',
      '⭐': '[star]',
      '🌟': '[star]',
      '💡': '[idea]',
      '💪': '[strong]',
      '🎉': '[celebration]',
      '🎊': '[celebration]',
      '🔥': '[fire]',
      '💯': '[100]',
      '❤️': '[heart]',
      '💙': '[heart]',
      '💚': '[heart]',
      '💛': '[heart]',
      '🧡': '[heart]',
      '💜': '[heart]',
      '🖤': '[heart]',
      '🤍': '[heart]',
      '➡️': '->',
      '⬅️': '<-',
      '⬆️': '^',
      '⬇️': 'v',
      '📌': '[pin]',
      '📍': '[pin]',
      '🎯': '[target]',
      '📈': '[chart up]',
      '📉': '[chart down]',
      '📊': '[chart]',
      '💰': '[$]',
      '💵': '[$]',
      '💲': '[$]',
      '🏆': '[trophy]',
      '🥇': '[1st]',
      '🥈': '[2nd]',
      '🥉': '[3rd]',
      '📱': '[phone]',
      '💻': '[laptop]',
      '🖥️': '[computer]',
      '📧': '[email]',
      '✉️': '[email]',
      '📞': '[phone]',
      '🔗': '[link]',
      '🔒': '[locked]',
      '🔓': '[unlocked]',
      '⚡': '[lightning]',
      '✨': '[sparkles]',
      '🚀': '[rocket]',
      '💎': '[gem]',
      '🎬': '[video]',
      '🎥': '[camera]',
      '📸': '[photo]',
      '🎵': '[music]',
      '🎶': '[music]',
      '📝': '[note]',
      '✏️': '[pencil]',
      '📚': '[books]',
      '📖': '[book]',
      '🗓️': '[calendar]',
      '📅': '[calendar]',
      '⏰': '[clock]',
      '⏱️': '[timer]',
      '🌍': '[globe]',
      '🌎': '[globe]',
      '🌏': '[globe]',
      '🏠': '[home]',
      '🏢': '[building]',
      '💼': '[briefcase]',
      '🛒': '[cart]',
      '🎁': '[gift]',
      '🔔': '[bell]',
      '🔕': '[muted]',
      '💬': '[comment]',
      '💭': '[thought]',
      '👀': '[eyes]',
      '👁️': '[eye]',
      '🙏': '[pray]',
      '🤷': '[shrug]',
      '🤦': '[facepalm]',
      '👋': '[wave]',
      '✋': '[hand]',
      '🖐️': '[hand]',
      '👆': '[point up]',
      '👇': '[point down]',
      '👈': '[point left]',
      '👉': '[point right]',
      '☝️': '[point]',
      '🤞': '[fingers crossed]',
      '✌️': '[peace]',
      '🤟': '[love]',
      '🤘': '[rock]',
      '👌': '[OK]',
      '🆕': '[NEW]',
      '🆓': '[FREE]',
      '🆗': '[OK]',
      '🆙': '[UP]',
      '🔴': '[red]',
      '🟢': '[green]',
      '🔵': '[blue]',
      '🟡': '[yellow]',
      '🟠': '[orange]',
      '🟣': '[purple]',
      '⚪': '[white]',
      '⚫': '[black]',
      '🟤': '[brown]',
      '▶️': '[play]',
      '⏸️': '[pause]',
      '⏹️': '[stop]',
      '⏭️': '[next]',
      '⏮️': '[prev]',
      '🔊': '[loud]',
      '🔉': '[sound]',
      '🔈': '[sound]',
      '🔇': '[mute]'
    };

    // Note: PDFKit has limited emoji support. The built-in Helvetica font doesn't
    // support emojis, and most system emoji fonts (like Segoe UI Emoji) are not
    // compatible with PDFKit's font rendering. For now, we convert emojis to
    // descriptive text like [fire] for PDF output to ensure reliable rendering.
    // DOCX files fully support emojis natively.
    this.emojiFontPath = null;
    this.emojiFontAvailable = false;
  }

  /**
   * Convert emojis to text representations for PDF
   * @param {string} text - Text potentially containing emojis
   * @returns {string} Text with emojis converted to text
   */
  convertEmojisToText(text) {
    if (!text) return '';

    let result = text;

    // Replace known emojis with text
    for (const [emoji, replacement] of Object.entries(this.emojiMap)) {
      result = result.split(emoji).join(replacement);
    }

    // Remove any remaining emojis (Unicode ranges for emojis)
    // This regex matches most emoji characters
    result = result.replace(/[\u{1F600}-\u{1F64F}]/gu, ''); // Emoticons
    result = result.replace(/[\u{1F300}-\u{1F5FF}]/gu, ''); // Misc Symbols and Pictographs
    result = result.replace(/[\u{1F680}-\u{1F6FF}]/gu, ''); // Transport and Map
    result = result.replace(/[\u{1F1E0}-\u{1F1FF}]/gu, ''); // Flags
    result = result.replace(/[\u{2600}-\u{26FF}]/gu, '');   // Misc symbols
    result = result.replace(/[\u{2700}-\u{27BF}]/gu, '');   // Dingbats
    result = result.replace(/[\u{FE00}-\u{FE0F}]/gu, '');   // Variation Selectors
    result = result.replace(/[\u{1F900}-\u{1F9FF}]/gu, ''); // Supplemental Symbols
    result = result.replace(/[\u{1FA00}-\u{1FA6F}]/gu, ''); // Chess Symbols
    result = result.replace(/[\u{1FA70}-\u{1FAFF}]/gu, ''); // Symbols and Pictographs Extended-A
    result = result.replace(/[\u{231A}-\u{231B}]/gu, '');   // Watch, Hourglass
    result = result.replace(/[\u{23E9}-\u{23F3}]/gu, '');   // Media control symbols
    result = result.replace(/[\u{23F8}-\u{23FA}]/gu, '');   // Media control symbols
    result = result.replace(/[\u{25AA}-\u{25AB}]/gu, '');   // Squares
    result = result.replace(/[\u{25B6}]/gu, '');            // Play button
    result = result.replace(/[\u{25C0}]/gu, '');            // Reverse button
    result = result.replace(/[\u{25FB}-\u{25FE}]/gu, '');   // Squares
    result = result.replace(/[\u{2614}-\u{2615}]/gu, '');   // Umbrella, Hot beverage
    result = result.replace(/[\u{2648}-\u{2653}]/gu, '');   // Zodiac
    result = result.replace(/[\u{267F}]/gu, '');            // Wheelchair
    result = result.replace(/[\u{2693}]/gu, '');            // Anchor
    result = result.replace(/[\u{26A1}]/gu, '');            // High voltage
    result = result.replace(/[\u{26AA}-\u{26AB}]/gu, '');   // Circles
    result = result.replace(/[\u{26BD}-\u{26BE}]/gu, '');   // Sports balls
    result = result.replace(/[\u{26C4}-\u{26C5}]/gu, '');   // Weather
    result = result.replace(/[\u{26CE}]/gu, '');            // Ophiuchus
    result = result.replace(/[\u{26D4}]/gu, '');            // No entry
    result = result.replace(/[\u{26EA}]/gu, '');            // Church
    result = result.replace(/[\u{26F2}-\u{26F3}]/gu, '');   // Fountain, Golf
    result = result.replace(/[\u{26F5}]/gu, '');            // Sailboat
    result = result.replace(/[\u{26FA}]/gu, '');            // Tent
    result = result.replace(/[\u{26FD}]/gu, '');            // Fuel pump
    result = result.replace(/[\u{2702}]/gu, '');            // Scissors
    result = result.replace(/[\u{2705}]/gu, '[check]');     // Check mark
    result = result.replace(/[\u{2708}-\u{270D}]/gu, '');   // Misc
    result = result.replace(/[\u{270F}]/gu, '');            // Pencil
    result = result.replace(/[\u{2712}]/gu, '');            // Black nib
    result = result.replace(/[\u{2714}]/gu, '[check]');     // Check mark
    result = result.replace(/[\u{2716}]/gu, '[x]');         // X mark
    result = result.replace(/[\u{271D}]/gu, '');            // Cross
    result = result.replace(/[\u{2721}]/gu, '');            // Star of David
    result = result.replace(/[\u{2728}]/gu, '[sparkles]');  // Sparkles
    result = result.replace(/[\u{2733}-\u{2734}]/gu, '');   // Symbols
    result = result.replace(/[\u{2744}]/gu, '');            // Snowflake
    result = result.replace(/[\u{2747}]/gu, '');            // Sparkle
    result = result.replace(/[\u{274C}]/gu, '[x]');         // Cross mark
    result = result.replace(/[\u{274E}]/gu, '[x]');         // Cross mark
    result = result.replace(/[\u{2753}-\u{2755}]/gu, '?');  // Question marks
    result = result.replace(/[\u{2757}]/gu, '!');           // Exclamation
    result = result.replace(/[\u{2763}-\u{2764}]/gu, '[heart]'); // Hearts
    result = result.replace(/[\u{2795}-\u{2797}]/gu, '');   // Math symbols
    result = result.replace(/[\u{27A1}]/gu, '->');          // Arrow
    result = result.replace(/[\u{27B0}]/gu, '');            // Curly loop
    result = result.replace(/[\u{27BF}]/gu, '');            // Double curly loop
    result = result.replace(/[\u{2934}-\u{2935}]/gu, '');   // Arrows
    result = result.replace(/[\u{2B05}-\u{2B07}]/gu, '');   // Arrows
    result = result.replace(/[\u{2B1B}-\u{2B1C}]/gu, '');   // Squares
    result = result.replace(/[\u{2B50}]/gu, '[star]');      // Star
    result = result.replace(/[\u{2B55}]/gu, '');            // Circle
    result = result.replace(/[\u{3030}]/gu, '');            // Wavy dash
    result = result.replace(/[\u{303D}]/gu, '');            // Part alternation mark
    result = result.replace(/[\u{3297}]/gu, '');            // Circled Ideograph Congratulation
    result = result.replace(/[\u{3299}]/gu, '');            // Circled Ideograph Secret

    return result;
  }

  /**
   * Format content type key to readable label
   * @param {string} contentType - Content type key (e.g., 'summary_text')
   * @returns {string} Formatted label (e.g., 'Summary')
   */
  formatContentTypeLabel(contentType) {
    if (!contentType) return 'Content';

    return contentType
      .replace(/_text$/, '')
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Check if content looks like a transcript (timestamped lines)
   * @param {string} content - Content to check
   * @returns {boolean} True if content appears to be a transcript
   */
  isTranscriptContent(content) {
    if (!content) return false;

    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length < 3) return false;

    // Check if most lines start with timestamp pattern like "3.0 - 7.4" or "[00:00]"
    const timestampPatterns = [
      /^\d+\.\d+\s*-\s*\d+\.\d+/, // "3.0 - 7.4"
      /^\[\d{1,2}:\d{2}(:\d{2})?\]/, // "[00:00]" or "[00:00:00]"
      /^\d{1,2}:\d{2}(:\d{2})?/, // "0:00" or "00:00:00"
    ];

    let matchCount = 0;
    const samplesToCheck = Math.min(10, lines.length);

    for (let i = 0; i < samplesToCheck; i++) {
      const line = lines[i].trim();
      if (timestampPatterns.some(pattern => pattern.test(line))) {
        matchCount++;
      }
    }

    // If more than 50% of sampled lines have timestamps, treat as transcript
    return matchCount / samplesToCheck > 0.5;
  }

  /**
   * Parse markdown content into structured sections
   * @param {string} content - Markdown content
   * @param {boolean} preserveLineBreaks - Force each line to be a separate paragraph
   * @returns {Array} Array of content sections with type and text
   */
  parseMarkdownContent(content, preserveLineBreaks = false) {
    if (!content) return [];

    // Auto-detect transcript content
    if (!preserveLineBreaks && this.isTranscriptContent(content)) {
      preserveLineBreaks = true;
    }

    const lines = content.split('\n');
    const sections = [];
    let currentParagraph = [];
    let inTable = false;
    let tableRows = [];
    let tableHeaderSeparatorFound = false;

    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        sections.push({
          type: 'paragraph',
          text: currentParagraph.join(' ')
        });
        currentParagraph = [];
      }
    };

    const flushTable = () => {
      if (tableRows.length > 0) {
        sections.push({
          type: 'table',
          rows: tableRows,
          hasHeader: tableHeaderSeparatorFound
        });
        tableRows = [];
        tableHeaderSeparatorFound = false;
        inTable = false;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Empty line - flush current paragraph and table
      if (trimmedLine === '') {
        flushParagraph();
        flushTable();
        continue;
      }

      // Horizontal rule (---, ***, ___)
      if (trimmedLine.match(/^[-*_]{3,}$/) && !inTable) {
        flushParagraph();
        sections.push({ type: 'horizontalRule' });
        continue;
      }

      // Table detection - line starts and ends with | or contains multiple |
      const isTableRow = trimmedLine.startsWith('|') && trimmedLine.endsWith('|');
      const isTableSeparator = trimmedLine.match(/^\|?[\s-:|]+\|?$/) && trimmedLine.includes('-');

      if (isTableRow || (inTable && isTableSeparator)) {
        flushParagraph();
        inTable = true;

        if (isTableSeparator) {
          // This is the header separator row (|---|---|)
          tableHeaderSeparatorFound = true;
          continue; // Skip the separator row itself
        }

        // Parse table row cells
        const cells = trimmedLine
          .replace(/^\|/, '')  // Remove leading |
          .replace(/\|$/, '')  // Remove trailing |
          .split('|')
          .map(cell => cell.trim());

        tableRows.push(cells);
        continue;
      } else if (inTable) {
        // We were in a table but this line isn't a table row - flush the table
        flushTable();
      }

      // Headers - check from most specific (######) to least specific (#)
      if (trimmedLine.startsWith('###### ')) {
        flushParagraph();
        sections.push({
          type: 'heading6',
          text: trimmedLine.replace(/^###### /, '')
        });
        continue;
      }

      if (trimmedLine.startsWith('##### ')) {
        flushParagraph();
        sections.push({
          type: 'heading5',
          text: trimmedLine.replace(/^##### /, '')
        });
        continue;
      }

      if (trimmedLine.startsWith('#### ')) {
        flushParagraph();
        sections.push({
          type: 'heading4',
          text: trimmedLine.replace(/^#### /, '')
        });
        continue;
      }

      if (trimmedLine.startsWith('### ')) {
        flushParagraph();
        sections.push({
          type: 'heading3',
          text: trimmedLine.replace(/^### /, '')
        });
        continue;
      }

      if (trimmedLine.startsWith('## ')) {
        flushParagraph();
        sections.push({
          type: 'heading2',
          text: trimmedLine.replace(/^## /, '')
        });
        continue;
      }

      if (trimmedLine.startsWith('# ')) {
        flushParagraph();
        sections.push({
          type: 'heading1',
          text: trimmedLine.replace(/^# /, '')
        });
        continue;
      }

      // Bullet points (but not horizontal rules)
      if (trimmedLine.match(/^[-*•]\s/) && !trimmedLine.match(/^[-*]{3,}$/)) {
        flushParagraph();
        sections.push({
          type: 'bullet',
          text: trimmedLine.replace(/^[-*•]\s/, '')
        });
        continue;
      }

      // Numbered lists
      if (trimmedLine.match(/^\d+\.\s/)) {
        flushParagraph();
        sections.push({
          type: 'numberedItem',
          text: trimmedLine
        });
        continue;
      }

      // Blockquotes
      if (trimmedLine.startsWith('>')) {
        flushParagraph();
        sections.push({
          type: 'quote',
          text: trimmedLine.replace(/^>\s?/, '')
        });
        continue;
      }

      // Regular text
      if (preserveLineBreaks) {
        // Each line is its own paragraph (for transcripts, etc.)
        sections.push({
          type: 'paragraph',
          text: trimmedLine
        });
      } else {
        // Accumulate into current paragraph
        currentParagraph.push(trimmedLine);
      }
    }

    // Flush remaining content
    flushParagraph();
    flushTable();

    return sections;
  }

  /**
   * Decode HTML entities in text
   * @param {string} text - Text with potential HTML entities
   * @returns {string} Text with decoded entities
   */
  decodeHtmlEntities(text) {
    if (!text) return '';

    return text
      .replace(/&#39;/g, '\'')
      .replace(/&#x27;/g, '\'')
      .replace(/&apos;/g, '\'')
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
  }

  /**
   * Strip markdown formatting from text for plain text output
   * @param {string} text - Text with potential markdown
   * @returns {string} Clean text without markdown
   */
  stripMarkdown(text) {
    if (!text) return '';

    return this.decodeHtmlEntities(text)
      // Remove bold/italic
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      // Remove inline code
      .replace(/`([^`]+)`/g, '$1')
      // Remove links - keep text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove images
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
      // Clean up extra whitespace (but preserve single spaces)
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  /**
   * Strip markdown and convert emojis for PDF output
   * PDFKit's built-in fonts don't support emoji characters, so we convert
   * them to descriptive text like [fire] for reliable rendering.
   * Note: DOCX files support emojis natively - this is PDF-specific.
   * @param {string} text - Text with potential markdown and emojis
   * @returns {string} Clean text suitable for PDF
   */
  stripMarkdownForPdf(text) {
    const stripped = this.stripMarkdown(text);
    return this.convertEmojisToText(stripped);
  }

  /**
   * Parse text for inline formatting (bold, italic)
   * @param {string} text - Text to parse
   * @returns {Array} Array of TextRun objects for docx
   */
  parseInlineFormatting(text) {
    const runs = [];
    let remaining = text;

    while (remaining.length > 0) {
      // Check for bold **text**
      const boldMatch = remaining.match(/^(.*?)\*\*([^*]+)\*\*(.*)/s);
      if (boldMatch) {
        if (boldMatch[1]) {
          runs.push(new TextRun({ text: this.stripMarkdown(boldMatch[1]) }));
        }
        runs.push(new TextRun({ text: this.stripMarkdown(boldMatch[2]), bold: true }));
        remaining = boldMatch[3];
        continue;
      }

      // Check for italic *text* (but not bold)
      const italicMatch = remaining.match(/^(.*?)\*([^*]+)\*(.*)/s);
      if (italicMatch) {
        if (italicMatch[1]) {
          runs.push(new TextRun({ text: this.stripMarkdown(italicMatch[1]) }));
        }
        runs.push(new TextRun({ text: this.stripMarkdown(italicMatch[2]), italics: true }));
        remaining = italicMatch[3];
        continue;
      }

      // No more formatting, add remaining text
      runs.push(new TextRun({ text: this.stripMarkdown(remaining) }));
      break;
    }

    return runs.length > 0 ? runs : [new TextRun({ text: this.stripMarkdown(text) })];
  }

  /**
   * Create a DOCX table from parsed table rows
   * @param {Array} rows - Array of row arrays (each row is array of cell strings)
   * @param {boolean} hasHeader - Whether first row is a header
   * @returns {Table} DOCX Table object
   */
  createDocxTable(rows, hasHeader = false) {
    if (!rows || rows.length === 0) {
      return new Paragraph({ children: [] });
    }

    // Calculate number of columns from the first row
    const numCols = Math.max(...rows.map(row => row.length));
    // Calculate equal width percentage for each column
    const colWidthPercent = Math.floor(100 / numCols);

    const tableRows = rows.map((row, rowIndex) => {
      const isHeader = hasHeader && rowIndex === 0;

      // Ensure all rows have the same number of cells
      const normalizedRow = [...row];
      while (normalizedRow.length < numCols) {
        normalizedRow.push('');
      }

      const cells = normalizedRow.map(cellText => {
        return new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: this.stripMarkdown(cellText),
                  bold: isHeader,
                  size: this.styles.sizes.body * 2
                })
              ]
            })
          ],
          // Explicitly set column width to ensure equal distribution
          width: {
            size: colWidthPercent,
            type: WidthType.PERCENTAGE
          },
          shading: isHeader ? { fill: 'E8E8E8' } : undefined,
          verticalAlign: VerticalAlign.CENTER,
          margins: {
            top: 50,
            bottom: 50,
            left: 100,
            right: 100
          }
        });
      });

      return new TableRow({ children: cells });
    });

    return new Table({
      rows: tableRows,
      width: {
        size: 100,
        type: WidthType.PERCENTAGE
      },
      // Explicitly set table layout to fixed for consistent column widths
      layout: 'fixed',
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
        left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
        right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
        insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
      }
    });
  }

  /**
   * Generate DOCX document from content
   * @param {string} content - Markdown content
   * @param {string} contentType - Content type key
   * @param {string} videoTitle - Video title
   * @returns {Promise<Buffer>} DOCX buffer
   */
  async generateDocx(content, contentType, videoTitle) {
    try {
      // Remove "Character count: XXX/280" text from social media posts
      content = content.replace(/\s*Character count:\s*\d+\/\d+/gi, '');

      const contentLabel = this.formatContentTypeLabel(contentType);
      const sections = this.parseMarkdownContent(content);

      const children = [];

      // Title
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: contentLabel,
              bold: true,
              size: this.styles.sizes.title * 2, // Half-points
              color: this.styles.colors.primary.replace('#', '')
            })
          ],
          heading: HeadingLevel.TITLE,
          spacing: { after: 200 }
        })
      );

      // Subtitle with video title
      if (videoTitle) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: videoTitle,
                size: this.styles.sizes.heading3 * 2,
                color: this.styles.colors.muted.replace('#', ''),
                italics: true
              })
            ],
            spacing: { after: 400 }
          })
        );
      }

      // Add separator line
      children.push(
        new Paragraph({
          border: {
            bottom: {
              color: 'CCCCCC',
              space: 1,
              style: BorderStyle.SINGLE,
              size: 6
            }
          },
          spacing: { after: 300 }
        })
      );

      // Content sections
      for (const section of sections) {
        switch (section.type) {
          case 'heading1':
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: this.stripMarkdown(section.text),
                    bold: true,
                    size: this.styles.sizes.heading1 * 2,
                    color: this.styles.colors.secondary.replace('#', '')
                  })
                ],
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 300, after: 150 }
              })
            );
            break;

          case 'heading2':
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: this.stripMarkdown(section.text),
                    bold: true,
                    size: this.styles.sizes.heading2 * 2,
                    color: this.styles.colors.secondary.replace('#', '')
                  })
                ],
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 250, after: 120 }
              })
            );
            break;

          case 'heading3':
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: this.stripMarkdown(section.text),
                    bold: true,
                    size: this.styles.sizes.heading3 * 2,
                    color: this.styles.colors.secondary.replace('#', '')
                  })
                ],
                heading: HeadingLevel.HEADING_3,
                spacing: { before: 200, after: 100 }
              })
            );
            break;

          case 'heading4':
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: this.stripMarkdown(section.text),
                    bold: true,
                    size: 14 * 2, // 14pt
                    color: this.styles.colors.secondary.replace('#', '')
                  })
                ],
                heading: HeadingLevel.HEADING_4,
                spacing: { before: 180, after: 80 }
              })
            );
            break;

          case 'heading5':
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: this.stripMarkdown(section.text),
                    bold: true,
                    size: 13 * 2, // 13pt
                    color: this.styles.colors.secondary.replace('#', '')
                  })
                ],
                heading: HeadingLevel.HEADING_5,
                spacing: { before: 160, after: 60 }
              })
            );
            break;

          case 'heading6':
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: this.stripMarkdown(section.text),
                    bold: true,
                    size: 12 * 2, // 12pt
                    color: this.styles.colors.secondary.replace('#', '')
                  })
                ],
                heading: HeadingLevel.HEADING_6,
                spacing: { before: 140, after: 60 }
              })
            );
            break;

          case 'horizontalRule':
            children.push(
              new Paragraph({
                border: {
                  bottom: {
                    color: 'CCCCCC',
                    space: 1,
                    style: BorderStyle.SINGLE,
                    size: 6
                  }
                },
                spacing: { before: 200, after: 200 }
              })
            );
            break;

          case 'table':
            children.push(this.createDocxTable(section.rows, section.hasHeader));
            // Add empty paragraph after table to reset layout and ensure proper spacing
            children.push(
              new Paragraph({
                children: [],
                spacing: { before: 100, after: 100 }
              })
            );
            break;

          case 'bullet':
            children.push(
              new Paragraph({
                children: this.parseInlineFormatting(section.text),
                bullet: { level: 0 },
                spacing: { before: 60, after: 60 }
              })
            );
            break;

          case 'numberedItem':
            children.push(
              new Paragraph({
                children: this.parseInlineFormatting(section.text),
                spacing: { before: 60, after: 60 },
                indent: { left: 360 }
              })
            );
            break;

          case 'quote':
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: this.stripMarkdown(section.text),
                    italics: true,
                    color: this.styles.colors.muted.replace('#', '')
                  })
                ],
                indent: { left: 720 },
                border: {
                  left: {
                    color: 'CCCCCC',
                    space: 5,
                    style: BorderStyle.SINGLE,
                    size: 12
                  }
                },
                spacing: { before: 120, after: 120 }
              })
            );
            break;

          case 'paragraph':
          default:
            children.push(
              new Paragraph({
                children: this.parseInlineFormatting(section.text),
                spacing: { before: 100, after: 100 }
              })
            );
            break;
        }
      }

      // Footer
      children.push(
        new Paragraph({
          children: [],
          spacing: { before: 400 }
        })
      );

      children.push(
        new Paragraph({
          border: {
            top: {
              color: 'CCCCCC',
              space: 1,
              style: BorderStyle.SINGLE,
              size: 6
            }
          },
          spacing: { before: 200, after: 100 }
        })
      );

      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'Generated by AmplifyContent.ai',
              size: 20,
              color: this.styles.colors.muted.replace('#', ''),
              italics: true
            })
          ],
          alignment: AlignmentType.CENTER
        })
      );

      const doc = new Document({
        sections: [{
          properties: {},
          children
        }]
      });

      const buffer = await Packer.toBuffer(doc);

      logger.info(`Generated DOCX for ${contentType}`, {
        contentType,
        videoTitle: videoTitle?.substring(0, 50),
        size: buffer.length
      });

      return buffer;

    } catch (error) {
      logger.error('Error generating DOCX:', error);
      throw new Error(`Failed to generate DOCX: ${error.message}`);
    }
  }


  /**
   * Generate PDF document from content using PDFKit
   * No browser dependency - works in all environments
   * @param {string} content - Markdown content
   * @param {string} contentType - Content type key
   * @param {string} videoTitle - Video title
   * @returns {Promise<Buffer>} PDF buffer
   */
  async generatePdf(content, contentType, videoTitle) {
    try {
      // Remove "Character count: XXX/280" text from social media posts
      content = content.replace(/\s*Character count:\s*\d+\/\d+/gi, '');

      const contentLabel = this.formatContentTypeLabel(contentType);
      const sections = this.parseMarkdownContent(content);

      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 72, bottom: 72, left: 72, right: 72 },
        bufferPages: true
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));

      const pdfReady = new Promise((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
      });

      // Title
      doc.font('Helvetica-Bold')
        .fontSize(this.styles.sizes.title)
        .fillColor(this.styles.colors.primary)
        .text(this.stripMarkdownForPdf(contentLabel));

      // Subtitle (video title)
      if (videoTitle) {
        doc.font('Helvetica-Oblique')
          .fontSize(this.styles.sizes.heading3)
          .fillColor(this.styles.colors.muted)
          .text(this.stripMarkdownForPdf(videoTitle));
      }

      // Separator
      doc.moveDown(0.5);
      const lineY = doc.y;
      doc.strokeColor('#CCCCCC')
        .lineWidth(1)
        .moveTo(72, lineY)
        .lineTo(doc.page.width - 72, lineY)
        .stroke();
      doc.moveDown(0.5);

      // Content sections
      for (const section of sections) {
        // Check if we need a new page (leave room for at least 2 lines)
        if (doc.y > doc.page.height - 100) {
          doc.addPage();
        }

        switch (section.type) {
          case 'heading1':
            doc.moveDown(0.5);
            doc.font('Helvetica-Bold')
              .fontSize(this.styles.sizes.heading1)
              .fillColor(this.styles.colors.secondary)
              .text(this.stripMarkdownForPdf(section.text));
            doc.moveDown(0.3);
            break;

          case 'heading2':
            doc.moveDown(0.4);
            doc.font('Helvetica-Bold')
              .fontSize(this.styles.sizes.heading2)
              .fillColor(this.styles.colors.secondary)
              .text(this.stripMarkdownForPdf(section.text));
            doc.moveDown(0.2);
            break;

          case 'heading3':
            doc.moveDown(0.3);
            doc.font('Helvetica-Bold')
              .fontSize(this.styles.sizes.heading3)
              .fillColor(this.styles.colors.secondary)
              .text(this.stripMarkdownForPdf(section.text));
            doc.moveDown(0.2);
            break;

          case 'heading4':
          case 'heading5':
          case 'heading6':
            doc.moveDown(0.2);
            doc.font('Helvetica-Bold')
              .fontSize(14)
              .fillColor(this.styles.colors.secondary)
              .text(this.stripMarkdownForPdf(section.text));
            doc.moveDown(0.1);
            break;

          case 'horizontalRule': {
            doc.moveDown(0.3);
            const hrY = doc.y;
            doc.strokeColor('#CCCCCC')
              .lineWidth(1)
              .moveTo(72, hrY)
              .lineTo(doc.page.width - 72, hrY)
              .stroke();
            doc.moveDown(0.3);
            break;
          }

          case 'table':
            this.renderPdfTable(doc, section.rows, section.hasHeader);
            break;

          case 'bullet':
            doc.font('Helvetica')
              .fontSize(this.styles.sizes.body)
              .fillColor(this.styles.colors.text)
              .text(`  •  ${this.stripMarkdownForPdf(section.text)}`, {
                indent: 20
              });
            break;

          case 'numberedItem':
            doc.font('Helvetica')
              .fontSize(this.styles.sizes.body)
              .fillColor(this.styles.colors.text)
              .text(this.stripMarkdownForPdf(section.text), {
                indent: 20
              });
            break;

          case 'quote':
            doc.font('Helvetica-Oblique')
              .fontSize(this.styles.sizes.body)
              .fillColor(this.styles.colors.muted)
              .text(this.stripMarkdownForPdf(section.text), {
                indent: 40
              });
            doc.font('Helvetica')
              .fillColor(this.styles.colors.text);
            break;

          case 'paragraph':
          default:
            doc.font('Helvetica')
              .fontSize(this.styles.sizes.body)
              .fillColor(this.styles.colors.text)
              .text(this.stripMarkdownForPdf(section.text));
            doc.moveDown(0.3);
            break;
        }
      }

      // Footer
      doc.moveDown(1);
      const footerY = doc.y;
      doc.strokeColor('#CCCCCC')
        .lineWidth(1)
        .moveTo(72, footerY)
        .lineTo(doc.page.width - 72, footerY)
        .stroke();
      doc.moveDown(0.5);
      doc.font('Helvetica-Oblique')
        .fontSize(10)
        .fillColor(this.styles.colors.muted)
        .text('Generated by AmplifyContent.ai', { align: 'center' });

      doc.end();

      const pdfBuffer = await pdfReady;

      logger.info(`Generated PDF for ${contentType} (PDFKit)`, {
        contentType,
        videoTitle: videoTitle?.substring(0, 50),
        size: pdfBuffer.length
      });

      return pdfBuffer;

    } catch (error) {
      logger.error('Error generating PDF:', error);
      throw new Error(`Failed to generate PDF: ${error.message}`);
    }
  }

  /**
   * Render a table in PDF document
   * @param {PDFDocument} doc - PDFKit document
   * @param {Array} rows - Array of row arrays
   * @param {boolean} hasHeader - Whether first row is header
   */
  renderPdfTable(doc, rows, hasHeader = false) {
    if (!rows || rows.length === 0) return;

    const pageWidth = doc.page.width - 144; // 72pt margins on each side
    const startX = 72;
    const cellPadding = 8;
    const fontSize = 10;
    const headerBgColor = '#E8E8E8';
    const borderColor = '#CCCCCC';

    // Calculate column widths based on content
    const numCols = Math.max(...rows.map(row => row.length));
    const colWidth = pageWidth / numCols;

    doc.font('Helvetica').fontSize(fontSize);

    let currentY = doc.y;

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      const isHeader = hasHeader && rowIndex === 0;

      // Calculate row height based on content
      let maxCellHeight = 0;
      row.forEach((cell) => {
        const cellText = this.stripMarkdownForPdf(cell);
        const textWidth = colWidth - (cellPadding * 2);
        const height = doc.heightOfString(cellText, { width: textWidth }) + (cellPadding * 2);
        maxCellHeight = Math.max(maxCellHeight, height);
      });

      const rowHeight = Math.max(maxCellHeight, 25);

      // Check if we need a new page
      if (currentY + rowHeight > doc.page.height - 72) {
        doc.addPage();
        currentY = 72;
      }

      // Draw row background for header
      if (isHeader) {
        doc
          .fillColor(headerBgColor)
          .rect(startX, currentY, pageWidth, rowHeight)
          .fill();
      }

      // Draw cells - save position before each cell to avoid cursor drift
      for (let colIndex = 0; colIndex < numCols; colIndex++) {
        const cellX = startX + (colIndex * colWidth);
        const cellText = row[colIndex] ? this.stripMarkdownForPdf(row[colIndex]) : '';

        // Draw cell border
        doc
          .strokeColor(borderColor)
          .lineWidth(0.5)
          .rect(cellX, currentY, colWidth, rowHeight)
          .stroke();

        // Draw cell text - use explicit positioning and don't let it affect cursor
        doc
          .fillColor(this.styles.colors.text)
          .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(fontSize);

        // Save current position
        const savedX = doc.x;
        const savedY = doc.y;

        doc.text(cellText, cellX + cellPadding, currentY + cellPadding, {
          width: colWidth - (cellPadding * 2),
          height: rowHeight - (cellPadding * 2),
          lineBreak: true
        });

        // Restore position after drawing cell text (prevents cursor drift)
        doc.x = savedX;
        doc.y = savedY;
      }

      currentY += rowHeight;
    }

    // CRITICAL: Reset cursor position to left margin and below the table
    // This prevents subsequent content from being offset to the right
    doc.x = startX;
    doc.y = currentY + 10; // Add small gap after table
  }

  /**
   * Generate a filename for the document
   * @param {string} videoTitle - Video title
   * @param {string} contentType - Content type key
   * @param {string} format - File format (docx or pdf)
   * @returns {string} Sanitized filename
   */
  generateFilename(videoTitle, contentType, format) {
    const contentLabel = this.formatContentTypeLabel(contentType);

    // Sanitize video title for filename
    let sanitizedTitle = (videoTitle || 'content')
      .replace(/[<>:"/\\|?*]/g, '') // Remove invalid chars
      .replace(/\s+/g, '_')          // Replace spaces with underscores
      .substring(0, 50);              // Limit length

    return `${sanitizedTitle}_${contentLabel.replace(/\s+/g, '_')}.${format}`;
  }
}

module.exports = new DocumentGenerationService();
