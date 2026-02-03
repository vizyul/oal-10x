/**
 * Slide Deck Generation Service
 * Generates PPTX presentations and slide-style PDFs from AI-structured JSON content
 */

const path = require('path');
const PptxGenJS = require('pptxgenjs');
const PDFDocument = require('pdfkit');
const { logger } = require('../utils');

/** Path to Noto Sans Symbols 2 font for rendering Unicode icons in PDFs */
const NOTO_SYMBOLS_FONT = path.join(__dirname, '..', 'assets', 'fonts', 'NotoSansSymbols2-Regular.ttf');

/**
 * 10 predefined visual theme presets for PPTX generation.
 * Each defines a full 10-color palette, font pair, and which slide types use dark backgrounds.
 */
const THEME_PRESETS = {
  executive_dark: {
    id: 'executive_dark',
    name: 'Executive Dark',
    description: 'Navy & gold corporate',
    colors: {
      primary_color: '#1B2A4A',
      secondary_color: '#2C3E6B',
      accent_color: '#E8B931',
      dark_bg: '#1B2A4A',
      light_bg: '#F5F1EB',
      card_bg: '#FFFFFF',
      text_dark: '#1A1A2E',
      text_light: '#EDE8E0',
      text_muted: '#7A8BB5',
      card_border_top: '#E8B931'
    },
    fonts: { heading: 'Georgia', body: 'Arial' },
    darkSlideTypes: ['title', 'section_divider', 'quote', 'summary']
  },
  modern_warm: {
    id: 'modern_warm',
    name: 'Modern Warm',
    description: 'Brown & amber elegance',
    colors: {
      primary_color: '#3E2723',
      secondary_color: '#5D4037',
      accent_color: '#C8A415',
      dark_bg: '#3E2723',
      light_bg: '#F5F0EB',
      card_bg: '#FFFFFF',
      text_dark: '#2C1810',
      text_light: '#FAF3ED',
      text_muted: '#8D6E63',
      card_border_top: '#C8A415'
    },
    fonts: { heading: 'Georgia', body: 'Arial' },
    darkSlideTypes: ['title', 'section_divider', 'quote', 'summary']
  },
  ocean_blue: {
    id: 'ocean_blue',
    name: 'Ocean Blue',
    description: 'Deep navy & teal',
    colors: {
      primary_color: '#0D1B2A',
      secondary_color: '#1B3A5C',
      accent_color: '#00BCD4',
      dark_bg: '#0D1B2A',
      light_bg: '#EEF5F9',
      card_bg: '#FFFFFF',
      text_dark: '#0A1628',
      text_light: '#E0F0F6',
      text_muted: '#5B8BA0',
      card_border_top: '#00BCD4'
    },
    fonts: { heading: 'Georgia', body: 'Arial' },
    darkSlideTypes: ['title', 'section_divider', 'quote', 'summary']
  },
  forest_green: {
    id: 'forest_green',
    name: 'Forest Green',
    description: 'Natural & earthy',
    colors: {
      primary_color: '#1B3A2D',
      secondary_color: '#2E5E47',
      accent_color: '#66BB6A',
      dark_bg: '#1B3A2D',
      light_bg: '#F0F7F0',
      card_bg: '#FFFFFF',
      text_dark: '#142A20',
      text_light: '#E5F2E5',
      text_muted: '#6E9E7E',
      card_border_top: '#66BB6A'
    },
    fonts: { heading: 'Georgia', body: 'Arial' },
    darkSlideTypes: ['title', 'section_divider', 'quote', 'summary']
  },
  sunset_bold: {
    id: 'sunset_bold',
    name: 'Sunset Bold',
    description: 'Warm purple & orange',
    colors: {
      primary_color: '#2D1B2E',
      secondary_color: '#4A2D4E',
      accent_color: '#FF6B35',
      dark_bg: '#2D1B2E',
      light_bg: '#FFF5F0',
      card_bg: '#FFFFFF',
      text_dark: '#231520',
      text_light: '#F9ECE5',
      text_muted: '#9E7AA0',
      card_border_top: '#FF6B35'
    },
    fonts: { heading: 'Georgia', body: 'Arial' },
    darkSlideTypes: ['title', 'section_divider', 'quote', 'summary']
  },
  royal_purple: {
    id: 'royal_purple',
    name: 'Royal Purple',
    description: 'Deep purple & lavender',
    colors: {
      primary_color: '#1A0933',
      secondary_color: '#2E1A52',
      accent_color: '#CE93D8',
      dark_bg: '#1A0933',
      light_bg: '#F5F0FF',
      card_bg: '#FFFFFF',
      text_dark: '#140726',
      text_light: '#EDE0F5',
      text_muted: '#8E6BA5',
      card_border_top: '#CE93D8'
    },
    fonts: { heading: 'Georgia', body: 'Arial' },
    darkSlideTypes: ['title', 'section_divider', 'quote', 'summary']
  },
  minimalist: {
    id: 'minimalist',
    name: 'Minimalist',
    description: 'Clean black & teal',
    colors: {
      primary_color: '#1A1A1A',
      secondary_color: '#3A3A3A',
      accent_color: '#00ACC1',
      dark_bg: '#1A1A1A',
      light_bg: '#FAFAFA',
      card_bg: '#FFFFFF',
      text_dark: '#111111',
      text_light: '#F0F0F0',
      text_muted: '#888888',
      card_border_top: '#00ACC1'
    },
    fonts: { heading: 'Georgia', body: 'Arial' },
    darkSlideTypes: ['title', 'section_divider', 'quote', 'summary']
  },
  classic_crimson: {
    id: 'classic_crimson',
    name: 'Classic Crimson',
    description: 'Dark red scholarly',
    colors: {
      primary_color: '#2D0A0A',
      secondary_color: '#4A1A1A',
      accent_color: '#C62828',
      dark_bg: '#2D0A0A',
      light_bg: '#FFF5F5',
      card_bg: '#FFFFFF',
      text_dark: '#1F0808',
      text_light: '#F5E0E0',
      text_muted: '#A06060',
      card_border_top: '#C62828'
    },
    fonts: { heading: 'Georgia', body: 'Arial' },
    darkSlideTypes: ['title', 'section_divider', 'quote', 'summary']
  },
  slate_pro: {
    id: 'slate_pro',
    name: 'Slate Professional',
    description: 'Blue-gray & teal',
    colors: {
      primary_color: '#263238',
      secondary_color: '#37474F',
      accent_color: '#26A69A',
      dark_bg: '#263238',
      light_bg: '#ECEFF1',
      card_bg: '#FFFFFF',
      text_dark: '#1C262B',
      text_light: '#DEE4E8',
      text_muted: '#78909C',
      card_border_top: '#26A69A'
    },
    fonts: { heading: 'Georgia', body: 'Arial' },
    darkSlideTypes: ['title', 'section_divider', 'quote', 'summary']
  },
  midnight_gold: {
    id: 'midnight_gold',
    name: 'Midnight Gold',
    description: 'Deep navy & gold',
    colors: {
      primary_color: '#0A0A23',
      secondary_color: '#1A1A40',
      accent_color: '#FFD700',
      dark_bg: '#0A0A23',
      light_bg: '#FFFFF0',
      card_bg: '#FFFFFF',
      text_dark: '#08081A',
      text_light: '#E8E8D0',
      text_muted: '#7070A0',
      card_border_top: '#FFD700'
    },
    fonts: { heading: 'Georgia', body: 'Arial' },
    darkSlideTypes: ['title', 'section_divider', 'quote', 'summary']
  }
};

/** Valid theme IDs for route validation */
const VALID_THEME_IDS = ['auto', ...Object.keys(THEME_PRESETS)];

class SlideDeckGenerationService {

  /**
   * Parse AI-generated slide JSON content
   * Strips markdown code fences if present and validates structure
   * @param {string} contentText - Raw AI output
   * @returns {Object} Parsed slide data with theme and slides
   */
  parseSlideJSON(contentText) {
    let jsonContent = contentText.trim();

    // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
    const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonContent);
    } catch (parseError) {
      // Attempt to repair common AI JSON issues (unescaped quotes inside strings)
      try {
        const repaired = this._repairJSON(jsonContent);
        parsed = JSON.parse(repaired);
      } catch {
        throw new Error(`Invalid slide deck JSON: ${parseError.message}`);
      }
    }

    // Validate required structure
    if (!parsed.theme || typeof parsed.theme !== 'object') {
      throw new Error('Slide deck JSON missing required "theme" object');
    }
    if (!parsed.slides || !Array.isArray(parsed.slides) || parsed.slides.length === 0) {
      throw new Error('Slide deck JSON missing required "slides" array');
    }

    // Validate theme has required color fields
    const requiredColors = ['primary_color', 'secondary_color', 'accent_color', 'background_color', 'text_color'];
    for (const colorField of requiredColors) {
      if (!parsed.theme[colorField]) {
        // Provide sensible defaults
        const defaults = {
          primary_color: '#1a365d',
          secondary_color: '#2d3748',
          accent_color: '#3182ce',
          background_color: '#ffffff',
          text_color: '#1a202c'
        };
        parsed.theme[colorField] = defaults[colorField];
      }
    }

    return parsed;
  }

  /**
   * Attempt to repair common AI-generated JSON issues.
   * Fixes unescaped double quotes inside string values (e.g. "he said "hello" to them")
   * by walking the string character-by-character with state tracking.
   * @param {string} json - Malformed JSON string
   * @returns {string} Repaired JSON string
   */
  _repairJSON(json) {
    const chars = [...json];
    const result = [];
    let inString = false;
    let i = 0;

    while (i < chars.length) {
      const ch = chars[i];

      if (ch === '\\' && inString) {
        // Escaped character — pass through as-is
        result.push(ch, chars[i + 1] || '');
        i += 2;
        continue;
      }

      if (ch === '"') {
        if (!inString) {
          // Opening a string
          inString = true;
          result.push(ch);
          i++;
          continue;
        }

        // We're inside a string and hit a quote — is it the real closing quote?
        // Look ahead: if the next non-whitespace char is a structural JSON character
        // ( : , ] } ) then this is the real closing quote.
        let lookAhead = i + 1;
        while (lookAhead < chars.length && (chars[lookAhead] === ' ' || chars[lookAhead] === '\t' || chars[lookAhead] === '\n' || chars[lookAhead] === '\r')) {
          lookAhead++;
        }
        const nextSignificant = chars[lookAhead];
        if (nextSignificant === ':' || nextSignificant === ',' || nextSignificant === ']' || nextSignificant === '}' || nextSignificant === undefined) {
          // Real closing quote
          inString = false;
          result.push(ch);
        } else {
          // Unescaped quote inside a string — escape it
          result.push('\\"');
        }
        i++;
        continue;
      }

      result.push(ch);
      i++;
    }

    return result.join('');
  }

  /**
   * Strip leading # from hex color (pptxgenjs expects no #)
   */
  stripHash(color) {
    return color.replace(/^#/, '');
  }

  /**
   * Resolve theme: expand AI JSON's 5-color theme to 10-color, or return a preset
   * @param {string} themeId - 'auto' or a preset ID
   * @param {Object} aiTheme - The AI-generated 5-color theme from parsed JSON
   * @returns {Object} Resolved theme with full 10-color palette, fonts, and darkSlideTypes
   */
  resolveTheme(themeId, aiTheme) {
    // Preset theme
    if (themeId && themeId !== 'auto' && THEME_PRESETS[themeId]) {
      return THEME_PRESETS[themeId];
    }

    // Auto: expand the AI JSON's 5-color theme to full 10-color format
    const primary = aiTheme.primary_color || '#1a365d';
    const secondary = aiTheme.secondary_color || '#2d3748';
    const accent = aiTheme.accent_color || '#3182ce';
    const bg = aiTheme.background_color || '#ffffff';
    const text = aiTheme.text_color || '#1a202c';

    // Derive dark_bg from the darkest of the 5 AI colors (lowest luminance)
    const darkBg = this._pickDarkest([primary, secondary, accent, bg, text]);

    return {
      id: 'auto',
      name: 'Auto',
      colors: {
        primary_color: primary,
        secondary_color: secondary,
        accent_color: accent,
        dark_bg: darkBg,
        light_bg: bg,
        card_bg: '#FFFFFF',
        text_dark: text,
        text_light: this.lightenColor(bg, 0.95),
        text_muted: secondary,
        card_border_top: accent
      },
      fonts: { heading: 'Georgia', body: 'Arial' },
      darkSlideTypes: ['title', 'section_divider', 'quote', 'summary']
    };
  }

  /**
   * Lighten a hex color towards white
   */
  lightenColor(hex, factor) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    const lr = Math.round(r + (255 - r) * factor);
    const lg = Math.round(g + (255 - g) * factor);
    const lb = Math.round(b + (255 - b) * factor);
    return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
  }

  /**
   * Calculate relative luminance of a hex color (0 = black, 1 = white)
   */
  _luminance(hex) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;
    const toLinear = (c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  }

  /**
   * Pick the darkest color from an array of hex colors (lowest luminance)
   */
  _pickDarkest(colors) {
    let darkest = colors[0];
    let minLum = this._luminance(colors[0]);
    for (let i = 1; i < colors.length; i++) {
      const lum = this._luminance(colors[i]);
      if (lum < minLum) {
        minLum = lum;
        darkest = colors[i];
      }
    }
    return darkest;
  }

  /**
   * Get a unicode icon for a slide type (fallback for legacy content without icon field)
   */
  getSlideIcon(slideType) {
    const icons = {
      title: '\u2726',           // four-pointed star
      section_divider: '\u2756', // black diamond minus white X
      bullets: '\u2022',         // bullet
      quote: '\u201C',           // left double quotation
      two_column: '\u2637',      // trigram
      statistics: '\u2605',      // black star
      table: '\u2630',           // trigram for heaven
      image_placeholder: '\u25A1', // white square
      summary: '\u2713'          // checkmark
    };
    return icons[slideType] || '\u2022';
  }

  // ─── PPTX SHAPE HELPERS ─────────────────────────────────────────────

  /**
   * Add a card panel (rounded rect with colored top border)
   */
  addCardPanel(slide, pptx, x, y, w, h, theme, opts = {}) {
    const borderH = 0.06;
    // Top accent border
    slide.addShape(pptx.ShapeType.rect, {
      x, y, w, h: borderH,
      fill: { color: this.stripHash(opts.borderColor || theme.colors.card_border_top) },
      rectRadius: 0.08
    });
    // Card body
    slide.addShape(pptx.ShapeType.rect, {
      x, y: y + borderH, w, h: h - borderH,
      fill: { color: this.stripHash(opts.fill || theme.colors.card_bg) },
      shadow: { type: 'outer', blur: 6, offset: 2, color: '000000', opacity: 0.08 },
      rectRadius: 0.08
    });
  }

  /**
   * Add a left vertical accent bar
   */
  addLeftAccentBar(slide, pptx, x, y, h, color) {
    slide.addShape(pptx.ShapeType.rect, {
      x, y, w: 0.06, h,
      fill: { color: this.stripHash(color) }
    });
  }

  /**
   * Add a full-width dark header band with white heading text (PDF p2,p3,p4,p6,p7 pattern)
   */
  addDarkHeaderBand(slide, pptx, text, theme, opts = {}) {
    const bandH = opts.bandH || 1.25;
    // Dark band background
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: '100%', h: bandH,
      fill: { color: this.stripHash(theme.colors.dark_bg) }
    });
    // Accent underline at band bottom
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: bandH, w: '100%', h: 0.05,
      fill: { color: this.stripHash(theme.colors.accent_color) }
    });
    // Heading text (white on dark)
    slide.addText(text, {
      x: 0.6, y: 0.05, w: 12.1, h: bandH - 0.1,
      fontSize: opts.fontSize || 30,
      fontFace: theme.fonts.heading,
      color: this.stripHash(theme.colors.text_light),
      bold: true,
      valign: 'middle'
    });
  }

  /**
   * Add a heading with an accent underline
   */
  addHeadingWithAccent(slide, pptx, text, theme, opts = {}) {
    const x = opts.x || 1.0;
    const y = opts.y || 0.4;
    const fontSize = opts.fontSize || 26;
    const color = opts.color || theme.colors.primary_color;

    slide.addText(text, {
      x, y, w: opts.w || 11.3, h: 0.9,
      fontSize,
      fontFace: theme.fonts.heading,
      color: this.stripHash(color),
      bold: true,
      valign: 'bottom'
    });

    // Accent underline
    slide.addShape(pptx.ShapeType.rect, {
      x, y: y + 0.95, w: 1.8, h: 0.05,
      fill: { color: this.stripHash(theme.colors.accent_color) }
    });
  }

  /**
   * Check if a slide type should use dark background
   */
  isDarkSlide(slideType, theme) {
    return (theme.darkSlideTypes || []).includes(slideType);
  }

  // ─── GENERATE PPTX ──────────────────────────────────────────────────

  /**
   * Generate PPTX buffer from slide JSON content
   * @param {string} contentText - AI-generated JSON content
   * @param {string} videoTitle - Video title for metadata
   * @param {string} themeId - Theme preset ID or 'auto'
   * @returns {Promise<Buffer>} PPTX file as Buffer
   */
  async generatePptx(contentText, videoTitle, themeId = 'auto') {
    const data = this.parseSlideJSON(contentText);
    const { theme: aiTheme, slides } = data;
    const theme = this.resolveTheme(themeId, aiTheme);

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE'; // 16:9 widescreen (13.33" x 7.5")
    pptx.title = videoTitle || 'Slide Deck';
    pptx.author = 'AmplifyContent.ai';

    // Define two slide masters: LIGHT_SLIDE and DARK_SLIDE
    pptx.defineSlideMaster({
      title: 'LIGHT_SLIDE',
      background: { color: this.stripHash(theme.colors.light_bg) }
    });

    pptx.defineSlideMaster({
      title: 'DARK_SLIDE',
      background: { color: this.stripHash(theme.colors.dark_bg) }
    });

    // Build each slide, tracking occurrence count per type for variant cycling
    const slideTypeCounts = {};
    for (const slideData of slides) {
      const type = slideData.slide_type;
      const variantIndex = slideTypeCounts[type] || 0;
      slideTypeCounts[type] = variantIndex + 1;

      const builderMethod = this.getBuilderMethod(type);
      try {
        builderMethod.call(this, pptx, slideData, theme, variantIndex);
      } catch (slideError) {
        logger.warn(`Error building slide type "${type}": ${slideError.message}, falling back to bullets`);
        this.buildBulletsSlide(pptx, {
          heading: slideData.heading || slideData.title || 'Slide',
          bullets: [JSON.stringify(slideData)]
        }, theme, 0);
      }
    }

    const buffer = await pptx.write({ outputType: 'nodebuffer' });
    return buffer;
  }

  /**
   * Get the builder method for a slide type
   */
  getBuilderMethod(slideType) {
    const builders = {
      title: this.buildTitleSlide,
      section_divider: this.buildSectionDividerSlide,
      bullets: this.buildBulletsSlide,
      quote: this.buildQuoteSlide,
      two_column: this.buildTwoColumnSlide,
      statistics: this.buildStatisticsSlide,
      table: this.buildTableSlide,
      image_placeholder: this.buildImagePlaceholderSlide,
      summary: this.buildSummarySlide
    };
    return builders[slideType] || this.buildBulletsSlide;
  }

  // ─── SLIDE BUILDERS (MULTI-VARIANT) ───────────────────────────────────
  // Each builder receives variantIndex and cycles through distinct visual layouts.

  /**
   * Title slide - DARK bg (PDF p1 style)
   * Centered icon, large serif title, italic subtitle, footer
   */
  buildTitleSlide(pptx, data, theme) {
    const slide = pptx.addSlide({ masterName: 'DARK_SLIDE' });

    // Left accent bar
    this.addLeftAccentBar(slide, pptx, 0.35, 0, 7.5, theme.colors.accent_color);

    // Centered icon
    slide.addText(this.getSlideIcon('title'), {
      x: 5.2, y: 0.6, w: 2.9, h: 1.3,
      fontSize: 52,
      fontFace: theme.fonts.body,
      color: this.stripHash(theme.colors.accent_color),
      align: 'center',
      valign: 'middle'
    });

    // Title - large, centered
    slide.addText(data.title || 'Presentation', {
      x: 0.8, y: 2.0, w: 11.7, h: 2.0,
      fontSize: 44,
      fontFace: theme.fonts.heading,
      color: this.stripHash(theme.colors.text_light),
      bold: true,
      align: 'center',
      valign: 'bottom'
    });

    // Subtitle - italic, centered
    if (data.subtitle) {
      slide.addText(data.subtitle, {
        x: 1.5, y: 4.2, w: 10.3, h: 1.0,
        fontSize: 20,
        fontFace: theme.fonts.heading,
        color: this.stripHash(theme.colors.accent_color),
        italic: true,
        align: 'center',
        valign: 'top'
      });
    }

    // Footer - centered, lower
    if (data.footer) {
      slide.addText(data.footer, {
        x: 1.5, y: 5.8, w: 10.3, h: 0.6,
        fontSize: 14,
        fontFace: theme.fonts.body,
        color: this.stripHash(theme.colors.text_light),
        align: 'center'
      });
    }
  }

  /**
   * Section divider - 2 variants
   * A (PDF p9): Dark bg, centered icon, centered large title, accent subtitle
   * B: Dark bg, left accent bar, left-aligned heading, decorative icon right
   */
  buildSectionDividerSlide(pptx, data, theme, variantIndex = 0) {
    const variant = variantIndex % 2;
    const slide = pptx.addSlide({ masterName: 'DARK_SLIDE' });

    if (variant === 0) {
      // Variant A: centered icon + centered title (PDF p9 style)
      this.addLeftAccentBar(slide, pptx, 0.35, 0, 7.5, theme.colors.accent_color);

      slide.addText(this.getSlideIcon('section_divider'), {
        x: 5.2, y: 0.5, w: 2.9, h: 1.3,
        fontSize: 52,
        fontFace: theme.fonts.body,
        color: this.stripHash(theme.colors.accent_color),
        align: 'center'
      });

      slide.addText(data.heading || 'Section', {
        x: 0.8, y: 2.0, w: 11.7, h: 2.0,
        fontSize: 40,
        fontFace: theme.fonts.heading,
        color: this.stripHash(theme.colors.text_light),
        bold: true,
        align: 'center',
        valign: 'bottom'
      });

      // Accent subtitle if available
      if (data.subtitle) {
        slide.addText(data.subtitle, {
          x: 1.5, y: 4.3, w: 10.3, h: 0.9,
          fontSize: 18,
          fontFace: theme.fonts.heading,
          color: this.stripHash(theme.colors.accent_color),
          italic: true,
          align: 'center'
        });
      }
    } else {
      // Variant B: left-aligned with decorative icon right
      this.addLeftAccentBar(slide, pptx, 0.6, 0.8, 5.8, theme.colors.accent_color);

      slide.addText(this.getSlideIcon('section_divider'), {
        x: 9.0, y: 1.5, w: 3.0, h: 3.0,
        fontSize: 72,
        fontFace: theme.fonts.body,
        color: this.stripHash(theme.colors.accent_color),
        transparency: 50,
        align: 'center',
        valign: 'middle'
      });

      slide.addText(data.heading || 'Section', {
        x: 1.0, y: 2.5, w: 8.0, h: 1.5,
        fontSize: 36,
        fontFace: theme.fonts.heading,
        color: this.stripHash(theme.colors.text_light),
        bold: true,
        valign: 'bottom'
      });

      slide.addShape(pptx.ShapeType.rect, {
        x: 1.0, y: 4.15, w: 2.5, h: 0.06,
        fill: { color: this.stripHash(theme.colors.accent_color) }
      });
    }
  }

  /**
   * Bullets slide - 3 variants
   * A (PDF p2): Light bg, dark header band, icon + accent bar, bullets in card
   * B (PDF p5): Dark bg, heading, muted quote banner, white bullets below
   * C (PDF p6): Light bg, dark header band, icon + bold subtitle + accent line, bullets
   */
  buildBulletsSlide(pptx, data, theme, variantIndex = 0) {
    const variant = variantIndex % 3;
    const bullets = data.bullets || [];

    if (variant === 0) {
      // Variant A: Light bg + dark header band + card with accent bar (PDF p2)
      const slide = pptx.addSlide({ masterName: 'LIGHT_SLIDE' });

      this.addDarkHeaderBand(slide, pptx, data.heading || '', theme);

      // Card area with left accent bar
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.5, y: 1.55, w: 12.3, h: 5.55,
        fill: { color: this.stripHash(theme.colors.card_bg) },
        shadow: { type: 'outer', blur: 4, offset: 2, color: '000000', opacity: 0.06 },
        rectRadius: 0.08
      });
      this.addLeftAccentBar(slide, pptx, 0.5, 1.55, 5.55, theme.colors.accent_color);

      // Icon beside accent bar
      slide.addText(this.getSlideIcon('bullets'), {
        x: 0.8, y: 1.7, w: 0.8, h: 0.8,
        fontSize: 28,
        fontFace: theme.fonts.body,
        color: this.stripHash(theme.colors.primary_color),
        align: 'center'
      });

      const bulletItems = bullets.map(text => ({
        text: text,
        options: {
          fontSize: 16, fontFace: theme.fonts.body,
          color: this.stripHash(theme.colors.text_dark),
          bullet: { type: 'bullet', color: this.stripHash(theme.colors.accent_color) },
          paraSpaceBefore: 4, paraSpaceAfter: 8, breakLine: true
        }
      }));
      slide.addText(bulletItems, { x: 1.8, y: 1.8, w: 10.6, h: 5.0, valign: 'top' });

    } else if (variant === 1) {
      // Variant B: Dark bg + heading + muted quote banner + white bullets (PDF p5)
      const slide = pptx.addSlide({ masterName: 'DARK_SLIDE' });

      this.addLeftAccentBar(slide, pptx, 0.35, 0, 7.5, theme.colors.accent_color);

      // Heading
      slide.addText(data.heading || '', {
        x: 0.7, y: 0.3, w: 11.9, h: 1.1,
        fontSize: 30, fontFace: theme.fonts.heading,
        color: this.stripHash(theme.colors.text_light),
        bold: true, valign: 'middle'
      });

      // Muted banner for subtitle/quote if present
      const subtitle = data.subtitle || '';
      if (subtitle) {
        slide.addShape(pptx.ShapeType.rect, {
          x: 0.5, y: 1.6, w: 12.3, h: 1.1,
          fill: { color: this.stripHash(theme.colors.secondary_color) },
          rectRadius: 0.06
        });
        slide.addText(subtitle, {
          x: 0.9, y: 1.65, w: 11.5, h: 1.0,
          fontSize: 18, fontFace: theme.fonts.heading,
          color: this.stripHash(theme.colors.accent_color),
          italic: true, valign: 'middle'
        });
      }

      const bulletsY = subtitle ? 3.0 : 1.7;
      const bulletItems = bullets.map(text => ({
        text: text,
        options: {
          fontSize: 16, fontFace: theme.fonts.body,
          color: this.stripHash(theme.colors.text_light),
          bullet: { type: 'bullet', color: this.stripHash(theme.colors.accent_color) },
          paraSpaceBefore: 4, paraSpaceAfter: 8, breakLine: true
        }
      }));
      slide.addText(bulletItems, { x: 1.0, y: bulletsY, w: 11.3, h: 7.1 - bulletsY, valign: 'top' });

    } else {
      // Variant C: Light bg + dark header band + icon + subtitle emphasis + bullets (PDF p6)
      const slide = pptx.addSlide({ masterName: 'LIGHT_SLIDE' });

      this.addDarkHeaderBand(slide, pptx, data.heading || '', theme);

      // Icon + subtitle emphasis row
      const subtitle = data.subtitle || '';
      if (subtitle) {
        slide.addText(this.getSlideIcon('bullets'), {
          x: 0.6, y: 1.5, w: 0.7, h: 0.7,
          fontSize: 24, fontFace: theme.fonts.body,
          color: this.stripHash(theme.colors.accent_color),
          align: 'center'
        });
        slide.addText(subtitle, {
          x: 1.4, y: 1.45, w: 11.3, h: 0.7,
          fontSize: 18, fontFace: theme.fonts.heading,
          color: this.stripHash(theme.colors.primary_color),
          bold: true, valign: 'middle'
        });
        slide.addShape(pptx.ShapeType.rect, {
          x: 1.4, y: 2.2, w: 11.3, h: 0.04,
          fill: { color: this.stripHash(theme.colors.accent_color) }
        });
      }

      const bulletsY = subtitle ? 2.5 : 1.6;
      const bulletItems = bullets.map(text => ({
        text: text,
        options: {
          fontSize: 16, fontFace: theme.fonts.body,
          color: this.stripHash(theme.colors.text_dark),
          bullet: { type: 'bullet', color: this.stripHash(theme.colors.accent_color) },
          paraSpaceBefore: 4, paraSpaceAfter: 8, breakLine: true
        }
      }));
      slide.addText(bulletItems, { x: 1.4, y: bulletsY, w: 11.3, h: 7.1 - bulletsY, valign: 'top' });
    }
  }

  /**
   * Quote slide - 2 variants
   * A: Dark bg, accent-bordered panel, large quote mark, serif italic quote (current)
   * B (PDF p7): Light bg, dark header band, white card with left accent bar, italic quote
   */
  buildQuoteSlide(pptx, data, theme, variantIndex = 0) {
    const variant = variantIndex % 2;

    if (variant === 0) {
      // Variant A: Dark bg with quote panel
      const slide = pptx.addSlide({ masterName: 'DARK_SLIDE' });

      this.addLeftAccentBar(slide, pptx, 0.35, 0, 7.5, theme.colors.accent_color);

      // Subtle bordered panel
      slide.addShape(pptx.ShapeType.rect, {
        x: 1.2, y: 1.0, w: 11.3, h: 5.0,
        fill: { color: this.stripHash(theme.colors.dark_bg) },
        line: { color: this.stripHash(theme.colors.accent_color), width: 1.0 },
        rectRadius: 0.15
      });

      // Large quote mark
      slide.addText('\u201C', {
        x: 1.5, y: 0.5, w: 2.0, h: 2.0,
        fontSize: 96, fontFace: theme.fonts.heading,
        color: this.stripHash(theme.colors.accent_color),
        transparency: 70
      });

      slide.addText(data.quote || '', {
        x: 2.0, y: 1.8, w: 9.8, h: 2.8,
        fontSize: 22, fontFace: theme.fonts.heading,
        color: this.stripHash(theme.colors.text_light),
        italic: true, align: 'center', valign: 'middle'
      });

      // Separator + attribution
      slide.addShape(pptx.ShapeType.rect, {
        x: 5.5, y: 4.8, w: 2.3, h: 0.04,
        fill: { color: this.stripHash(theme.colors.accent_color) }
      });

      if (data.attribution) {
        slide.addText(`\u2014 ${data.attribution}`, {
          x: 2.0, y: 5.0, w: 9.8, h: 0.6,
          fontSize: 14, fontFace: theme.fonts.body,
          color: this.stripHash(theme.colors.accent_color),
          align: 'right'
        });
      }

    } else {
      // Variant B: Light bg + dark header band + white card with accent bar (PDF p7)
      const heading = data.heading || data.attribution || 'Notable Quote';
      const slide = pptx.addSlide({ masterName: 'LIGHT_SLIDE' });

      this.addDarkHeaderBand(slide, pptx, heading, theme);

      // White card with left accent bar
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.5, y: 1.55, w: 12.3, h: 3.2,
        fill: { color: this.stripHash(theme.colors.card_bg) },
        shadow: { type: 'outer', blur: 4, offset: 2, color: '000000', opacity: 0.06 },
        rectRadius: 0.08
      });
      this.addLeftAccentBar(slide, pptx, 0.5, 1.55, 3.2, theme.colors.accent_color);

      // Quote text inside card
      slide.addText(data.quote || '', {
        x: 1.0, y: 1.8, w: 11.3, h: 2.2,
        fontSize: 20, fontFace: theme.fonts.heading,
        color: this.stripHash(theme.colors.text_dark),
        italic: true, valign: 'middle'
      });

      // Attribution below card
      if (data.attribution) {
        slide.addText(`\u2014 ${data.attribution}`, {
          x: 1.0, y: 5.0, w: 11.3, h: 0.5,
          fontSize: 14, fontFace: theme.fonts.body,
          color: this.stripHash(theme.colors.text_muted),
          align: 'right'
        });
      }
    }
  }

  /**
   * Two column slide - 2 variants
   * A (PDF p4): Light bg, dark header band, two white cards with icons above titles, bullets inside
   * B (PDF p8): Light bg, dark header band, two cards with colored fills (primary/accent), white text
   */
  buildTwoColumnSlide(pptx, data, theme, variantIndex = 0) {
    const variant = variantIndex % 2;
    const slide = pptx.addSlide({ masterName: 'LIGHT_SLIDE' });

    this.addDarkHeaderBand(slide, pptx, data.heading || '', theme);

    if (variant === 0) {
      // Variant A: Two white cards with icons (PDF p4)
      const cardY = 1.55;
      const cardH = 5.55;

      // Left white card
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.5, y: cardY, w: 5.95, h: cardH,
        fill: { color: this.stripHash(theme.colors.card_bg) },
        shadow: { type: 'outer', blur: 4, offset: 2, color: '000000', opacity: 0.06 },
        rectRadius: 0.1
      });
      // Right white card
      slide.addShape(pptx.ShapeType.rect, {
        x: 6.85, y: cardY, w: 5.95, h: cardH,
        fill: { color: this.stripHash(theme.colors.card_bg) },
        shadow: { type: 'outer', blur: 4, offset: 2, color: '000000', opacity: 0.06 },
        rectRadius: 0.1
      });

      // Left icon + title
      slide.addText(this.getSlideIcon('two_column'), {
        x: 2.5, y: 1.7, w: 1.5, h: 0.8,
        fontSize: 28, fontFace: theme.fonts.body,
        color: this.stripHash(theme.colors.accent_color),
        align: 'center'
      });
      if (data.left_title) {
        slide.addText(data.left_title, {
          x: 0.8, y: 2.5, w: 5.35, h: 0.7,
          fontSize: 16, fontFace: theme.fonts.heading,
          color: this.stripHash(theme.colors.accent_color),
          bold: true, align: 'center'
        });
      }

      // Right icon + title
      slide.addText(this.getSlideIcon('two_column'), {
        x: 8.85, y: 1.7, w: 1.5, h: 0.8,
        fontSize: 28, fontFace: theme.fonts.body,
        color: this.stripHash(theme.colors.primary_color),
        align: 'center'
      });
      if (data.right_title) {
        slide.addText(data.right_title, {
          x: 7.15, y: 2.5, w: 5.35, h: 0.7,
          fontSize: 16, fontFace: theme.fonts.heading,
          color: this.stripHash(theme.colors.primary_color),
          bold: true, align: 'center'
        });
      }

      // Left items
      const leftItems = (data.left_items || []).map(text => ({
        text, options: {
          fontSize: 14, fontFace: theme.fonts.body,
          color: this.stripHash(theme.colors.text_dark),
          bullet: { type: 'bullet', color: this.stripHash(theme.colors.accent_color) },
          paraSpaceBefore: 3, paraSpaceAfter: 6, breakLine: true
        }
      }));
      slide.addText(leftItems, { x: 0.9, y: 3.3, w: 5.15, h: 3.5, valign: 'top' });

      // Right items
      const rightItems = (data.right_items || []).map(text => ({
        text, options: {
          fontSize: 14, fontFace: theme.fonts.body,
          color: this.stripHash(theme.colors.text_dark),
          bullet: { type: 'bullet', color: this.stripHash(theme.colors.primary_color) },
          paraSpaceBefore: 3, paraSpaceAfter: 6, breakLine: true
        }
      }));
      slide.addText(rightItems, { x: 7.25, y: 3.3, w: 5.15, h: 3.5, valign: 'top' });

    } else {
      // Variant B: Two colored-fill cards (PDF p8 style)
      const cardY = 1.55;
      const cardH = 5.55;

      // Left card - primary color fill
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.5, y: cardY, w: 5.95, h: cardH,
        fill: { color: this.stripHash(theme.colors.primary_color) },
        rectRadius: 0.1
      });
      // Right card - accent color fill
      slide.addShape(pptx.ShapeType.rect, {
        x: 6.85, y: cardY, w: 5.95, h: cardH,
        fill: { color: this.stripHash(theme.colors.accent_color) },
        rectRadius: 0.1
      });

      // Left title + subtitle
      if (data.left_title) {
        slide.addText(data.left_title, {
          x: 0.9, y: 1.8, w: 5.15, h: 0.7,
          fontSize: 18, fontFace: theme.fonts.heading,
          color: 'FFFFFF', bold: true, align: 'center'
        });
      }
      // Right title + subtitle
      if (data.right_title) {
        slide.addText(data.right_title, {
          x: 7.25, y: 1.8, w: 5.15, h: 0.7,
          fontSize: 18, fontFace: theme.fonts.heading,
          color: 'FFFFFF', bold: true, align: 'center'
        });
      }

      // Left items (white text on dark)
      const leftItems = (data.left_items || []).map(text => ({
        text, options: {
          fontSize: 14, fontFace: theme.fonts.body, color: 'FFFFFF',
          paraSpaceBefore: 3, paraSpaceAfter: 6, breakLine: true, align: 'center'
        }
      }));
      slide.addText(leftItems, { x: 0.9, y: 2.7, w: 5.15, h: 4.1, valign: 'top' });

      // Right items (white text on accent)
      const rightItems = (data.right_items || []).map(text => ({
        text, options: {
          fontSize: 14, fontFace: theme.fonts.body, color: 'FFFFFF',
          paraSpaceBefore: 3, paraSpaceAfter: 6, breakLine: true, align: 'center'
        }
      }));
      slide.addText(rightItems, { x: 7.25, y: 2.7, w: 5.15, h: 4.1, valign: 'top' });
    }
  }

  /**
   * Statistics slide - 2 variants
   * A: Light bg, dark header band, white stat cards with accent top borders
   * B (PDF p3/p8): Light bg, dark header band, colored-fill cards (alternating primary/accent/primary)
   */
  buildStatisticsSlide(pptx, data, theme, variantIndex = 0) {
    const variant = variantIndex % 2;
    const slide = pptx.addSlide({ masterName: 'LIGHT_SLIDE' });
    const stats = data.stats || [];
    const count = Math.min(stats.length, 4);
    if (count === 0) return;

    this.addDarkHeaderBand(slide, pptx, data.heading || 'Key Statistics', theme);

    const totalWidth = 12.3;
    const gap = 0.3;
    const cardW = (totalWidth - gap * (count - 1)) / count;
    const cardY = 1.55;
    const cardH = 5.55;

    if (variant === 0) {
      // Variant A: White cards with accent top border
      for (let i = 0; i < count; i++) {
        const stat = stats[i];
        const xPos = 0.5 + i * (cardW + gap);

        this.addCardPanel(slide, pptx, xPos, cardY, cardW, cardH, theme);

        slide.addText(stat.value || '', {
          x: xPos + 0.2, y: cardY + 0.8, w: cardW - 0.4, h: 1.8,
          fontSize: 40, fontFace: theme.fonts.heading,
          color: this.stripHash(theme.colors.accent_color),
          bold: true, align: 'center', valign: 'bottom'
        });
        slide.addText(stat.label || '', {
          x: xPos + 0.2, y: cardY + 2.8, w: cardW - 0.4, h: 1.5,
          fontSize: 14, fontFace: theme.fonts.body,
          color: this.stripHash(theme.colors.text_dark),
          align: 'center', valign: 'top'
        });
      }
    } else {
      // Variant B: Colored-fill cards alternating primary/accent (PDF p3/p8)
      for (let i = 0; i < count; i++) {
        const stat = stats[i];
        const xPos = 0.5 + i * (cardW + gap);
        const isOdd = i % 2 === 1;
        const fillColor = isOdd ? theme.colors.accent_color : theme.colors.primary_color;

        slide.addShape(pptx.ShapeType.rect, {
          x: xPos, y: cardY, w: cardW, h: cardH,
          fill: { color: this.stripHash(fillColor) },
          rectRadius: 0.1
        });

        slide.addText(stat.value || '', {
          x: xPos + 0.2, y: cardY + 0.8, w: cardW - 0.4, h: 1.8,
          fontSize: 40, fontFace: theme.fonts.heading,
          color: 'FFFFFF', bold: true, align: 'center', valign: 'bottom'
        });
        slide.addText(stat.label || '', {
          x: xPos + 0.2, y: cardY + 2.8, w: cardW - 0.4, h: 1.5,
          fontSize: 14, fontFace: theme.fonts.body,
          color: 'FFFFFF', align: 'center', valign: 'top'
        });
      }
    }
  }

  /**
   * Table slide - Light bg, dark header band, table with dark header row
   */
  buildTableSlide(pptx, data, theme) {
    const slide = pptx.addSlide({ masterName: 'LIGHT_SLIDE' });

    this.addDarkHeaderBand(slide, pptx, data.heading || '', theme);

    const headers = data.headers || [];
    const rows = data.rows || [];
    if (headers.length === 0) return;

    const tableRows = [];

    // Header row - dark background
    tableRows.push(
      headers.map(h => ({
        text: h,
        options: {
          bold: true, fontSize: 12, fontFace: theme.fonts.body,
          color: 'FFFFFF',
          fill: { color: this.stripHash(theme.colors.dark_bg) },
          align: 'center', valign: 'middle'
        }
      }))
    );

    // Data rows with alternating backgrounds
    rows.forEach((row, rowIdx) => {
      tableRows.push(
        row.map(cell => ({
          text: cell || '',
          options: {
            fontSize: 11, fontFace: theme.fonts.body,
            color: this.stripHash(theme.colors.text_dark),
            fill: { color: rowIdx % 2 === 0 ? this.stripHash(theme.colors.light_bg) : 'FFFFFF' },
            valign: 'middle'
          }
        }))
      );
    });

    const colW = headers.map(() => 11.0 / headers.length);
    slide.addTable(tableRows, {
      x: 1.15, y: 1.6, w: 11.0,
      colW, border: { pt: 0.5, color: 'CBD5E0' }, rowH: 0.5
    });
  }

  /**
   * Image placeholder slide - Light bg, dark header band, card with dashed border
   */
  buildImagePlaceholderSlide(pptx, data, theme) {
    const slide = pptx.addSlide({ masterName: 'LIGHT_SLIDE' });

    this.addDarkHeaderBand(slide, pptx, data.heading || '', theme);

    // Card panel
    this.addCardPanel(slide, pptx, 1.5, 1.6, 10.3, 4.5, theme);

    // Dashed border inner rect
    slide.addShape(pptx.ShapeType.rect, {
      x: 2.0, y: 2.0, w: 9.3, h: 3.6,
      fill: { color: this.stripHash(theme.colors.light_bg) },
      line: { color: this.stripHash(theme.colors.accent_color), dashType: 'dash', width: 1.5 },
      rectRadius: 0.1
    });

    slide.addText(this.getSlideIcon('image_placeholder'), {
      x: 5.0, y: 2.5, w: 3.3, h: 1.5,
      fontSize: 48, fontFace: theme.fonts.body,
      color: this.stripHash(theme.colors.text_muted),
      align: 'center', valign: 'middle', transparency: 40
    });

    slide.addText(data.image_description || '[Image Placeholder]', {
      x: 2.5, y: 4.0, w: 8.3, h: 1.0,
      fontSize: 14, fontFace: theme.fonts.body,
      color: this.stripHash(theme.colors.text_muted),
      align: 'center', valign: 'middle', italic: true
    });

    if (data.caption) {
      slide.addText(data.caption, {
        x: 2.0, y: 6.3, w: 9.3, h: 0.5,
        fontSize: 11, fontFace: theme.fonts.body,
        color: this.stripHash(theme.colors.text_muted),
        align: 'center', italic: true
      });
    }
  }

  /**
   * Summary slide - 2 variants
   * A (PDF p10): Dark bg, centered icon, large title, white card with takeaways, italic CTA footer
   * B: Dark bg, left accent bar, heading, takeaway list, CTA bar at bottom
   */
  buildSummarySlide(pptx, data, theme, variantIndex = 0) {
    const variant = variantIndex % 2;
    const slide = pptx.addSlide({ masterName: 'DARK_SLIDE' });
    const takeaways = data.takeaways || [];

    if (variant === 0) {
      // Variant A: Centered icon + large title + white card panel (PDF p10)

      // Centered icon
      slide.addText(this.getSlideIcon('summary'), {
        x: 5.2, y: 0.2, w: 2.9, h: 1.0,
        fontSize: 36, fontFace: theme.fonts.body,
        color: this.stripHash(theme.colors.text_light),
        align: 'center'
      });

      // Large centered title
      slide.addText(data.heading || 'Key Takeaways', {
        x: 0.8, y: 1.0, w: 11.7, h: 1.3,
        fontSize: 36, fontFace: theme.fonts.heading,
        color: this.stripHash(theme.colors.text_light),
        bold: true, align: 'center', valign: 'bottom'
      });

      // White card panel with accent top border
      const cardY = 2.6;
      const cardH = 3.4;
      this.addCardPanel(slide, pptx, 0.8, cardY, 11.7, cardH, theme);

      // Takeaway items inside white card (dark text)
      const takeawayItems = takeaways.map(text => ({
        text: `\u2713  ${text}`,
        options: {
          fontSize: 15, fontFace: theme.fonts.body,
          color: this.stripHash(theme.colors.text_dark),
          paraSpaceBefore: 4, paraSpaceAfter: 4, breakLine: true
        }
      }));
      slide.addText(takeawayItems, {
        x: 1.3, y: cardY + 0.3, w: 10.7, h: cardH - 0.5, valign: 'top'
      });

      // CTA as italic accent footer
      if (data.call_to_action) {
        slide.addText(data.call_to_action, {
          x: 0.8, y: 6.3, w: 11.7, h: 0.6,
          fontSize: 15, fontFace: theme.fonts.heading,
          color: this.stripHash(theme.colors.accent_color),
          italic: true, align: 'center'
        });
      }

    } else {
      // Variant B: Left accent bar + heading + takeaways + CTA bar
      this.addLeftAccentBar(slide, pptx, 0.6, 0.4, 6.5, theme.colors.accent_color);

      slide.addText(data.heading || 'Key Takeaways', {
        x: 1.0, y: 0.4, w: 11.3, h: 0.9,
        fontSize: 26, fontFace: theme.fonts.heading,
        color: this.stripHash(theme.colors.text_light),
        bold: true, valign: 'bottom'
      });

      slide.addShape(pptx.ShapeType.rect, {
        x: 1.0, y: 1.4, w: 1.8, h: 0.05,
        fill: { color: this.stripHash(theme.colors.accent_color) }
      });

      const takeawayItems = takeaways.map(text => ({
        text: `\u2713  ${text}`,
        options: {
          fontSize: 16, fontFace: theme.fonts.body,
          color: this.stripHash(theme.colors.text_light),
          paraSpaceBefore: 4, paraSpaceAfter: 4, breakLine: true
        }
      }));
      slide.addText(takeawayItems, { x: 1.2, y: 1.7, w: 11.1, h: 3.5, valign: 'top' });

      if (data.call_to_action) {
        slide.addShape(pptx.ShapeType.rect, {
          x: 1.5, y: 5.6, w: 10.3, h: 1.0,
          fill: { color: this.stripHash(theme.colors.accent_color) },
          rectRadius: 0.15
        });
        slide.addText(data.call_to_action, {
          x: 1.5, y: 5.6, w: 10.3, h: 1.0,
          fontSize: 16, fontFace: theme.fonts.body,
          color: 'FFFFFF', bold: true, align: 'center', valign: 'middle'
        });
      }
    }
  }

  // ─── PDF CONTENT EXTRACTION HELPERS ──────────────────────────────────
  // Generic helpers that extract content from any slide type for layout templates

  /** Get the slide title regardless of slide type */
  _getSlideTitle(data) {
    return data.title || data.heading || data.topic || '';
  }

  /** Get the slide items (bullets, takeaways, stats, column items) as string array */
  _getSlideItems(data) {
    if (data.bullets) return data.bullets;
    if (data.takeaways) return data.takeaways;
    if (data.stats) return data.stats.map(s => `${s.value} — ${s.label}`);
    if (data.left_items && data.right_items) return [...data.left_items, ...data.right_items];
    if (data.left_items) return data.left_items;
    if (data.right_items) return data.right_items;
    if (data.rows) return data.rows.map(r => r.join(' | '));
    if (data.image_description) return [data.image_description, data.caption].filter(Boolean);
    return [];
  }

  /** Get a subtitle/attribution/CTA string */
  _getSlideSubtitle(data) {
    return data.subtitle || data.attribution || data.call_to_action || data.caption || '';
  }

  /** Get the icon character: prefer data.icon, fall back to type-based */
  _getSlideIconChar(data) {
    return data.icon || this.getSlideIcon(data.slide_type);
  }

  /** Get a quote string if available */
  _getSlideQuote(data) {
    return data.quote || null;
  }

  /** Split an array into N roughly-equal groups */
  _splitIntoGroups(arr, n) {
    const groups = Array.from({ length: n }, () => []);
    arr.forEach((item, i) => groups[i % n].push(item));
    return groups;
  }

  // ─── PDF HELPERS ────────────────────────────────────────────────────

  /**
   * Draw a PDF icon using the Noto Sans Symbols 2 font.
   * Renders the icon character from slideData.icon or falls back to type-based icon.
   * @param {object} doc - PDFKit document
   * @param {string} iconChar - Unicode character to render
   * @param {number} x - left edge (or area left for centered alignment)
   * @param {number} y - top edge
   * @param {number} size - font size
   * @param {string} color - fill color
   * @param {object} opts - { width, align }
   */
  drawPdfIcon(doc, iconChar, x, y, size, color, opts = {}) {
    const width = opts.width || size * 2;
    const align = opts.align || 'left';
    try {
      doc.font(NOTO_SYMBOLS_FONT)
        .fontSize(size)
        .fillColor(color)
        .text(iconChar, x, y, { width, align, lineBreak: false });
    } catch {
      doc.font('Helvetica')
        .fontSize(size)
        .fillColor(color)
        .text(iconChar, x, y, { width, align, lineBreak: false });
    }
  }

  /**
   * Draw a full-width dark header band with white heading and accent underline
   */
  addPdfHeaderBand(doc, text, theme, pageW) {
    const bandH = 80;
    doc.rect(0, 0, pageW, bandH).fill(theme.colors.dark_bg);
    doc.rect(0, bandH, pageW, 3).fill(theme.colors.accent_color);
    doc.font('Times-Bold')
      .fontSize(28)
      .fillColor(theme.colors.text_light)
      .text(text, 40, 22, { width: pageW - 80 });
  }

  /**
   * Draw a card panel: rounded rect with colored top border, white body, subtle shadow
   */
  addPdfCardPanel(doc, x, y, w, h, theme, opts = {}) {
    const borderH = 5;
    const borderColor = opts.borderColor || theme.colors.card_border_top;
    const fillColor = opts.fill || theme.colors.card_bg;
    const radius = 4;
    // Shadow approximation
    doc.save();
    doc.opacity(0.06);
    doc.roundedRect(x + 2, y + 2, w, h, radius).fill('#000000');
    doc.restore();
    // Top accent border
    doc.roundedRect(x, y, w, borderH + radius, radius).fill(borderColor);
    // Card body (overlaps border bottom to create clean join)
    doc.roundedRect(x, y + borderH, w, h - borderH, radius).fill(fillColor);
  }

  /**
   * Draw a narrow vertical accent bar
   */
  addPdfLeftAccentBar(doc, x, y, h, color) {
    doc.rect(x, y, 5, h).fill(color);
  }

  // ─── PDF GENERATION ───────────────────────────────────────────────

  /**
   * Generate a presentation-style PDF (landscape pages mimicking slides)
   * Uses 10 distinct layout templates cycled for maximum visual variety.
   * @param {string} contentText - AI-generated JSON content
   * @param {string} videoTitle - Video title
   * @param {string} themeId - Theme preset ID or 'auto' (backward-compatible)
   * @returns {Promise<Buffer>} PDF buffer
   */
  async generateSlidePdf(contentText, videoTitle, themeId = 'auto') {
    const data = this.parseSlideJSON(contentText);
    const { theme: aiTheme, slides } = data;
    const theme = this.resolveTheme(themeId, aiTheme);

    return new Promise((resolve, reject) => {
      const chunks = [];
      const pageW = 960; // 16:9 widescreen width in points
      const pageH = 540; // 16:9 widescreen height in points

      const doc = new PDFDocument({
        size: [pageW, pageH],
        margin: 0,
        info: {
          Title: videoTitle || 'Slide Deck',
          Author: 'AmplifyContent.ai'
        }
      });

      // Register Noto Sans Symbols 2 font for icon rendering
      try {
        doc.registerFont('NotoSymbols', NOTO_SYMBOLS_FONT);
      } catch (fontErr) {
        logger.warn(`Could not register NotoSymbols font: ${fontErr.message}`);
      }

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const totalSlides = slides.length;
      let contentSlideCounter = 0;

      for (let i = 0; i < totalSlides; i++) {
        if (i > 0) doc.addPage();
        this.renderPdfSlide(doc, slides[i], theme, pageW, pageH, i, totalSlides, contentSlideCounter);
        // Count non-bookend slides for layout cycling
        if (i > 0 && i < totalSlides - 1) contentSlideCounter++;
      }

      doc.end();
    });
  }

  /**
   * Render a single slide to PDF using layout-index-based dispatch.
   * First slide → layout 1 (hero-centered), last → layout 10 (primary-bg-card).
   * Quote slides alternate between layouts 5 and 7. All others cycle layouts 2-9.
   */
  renderPdfSlide(doc, slideData, theme, pageW, pageH, slideIndex, totalSlides, contentSlideCounter) {
    let layoutNum;

    if (slideIndex === 0) {
      layoutNum = 1; // hero-centered (title)
    } else if (slideIndex === totalSlides - 1) {
      layoutNum = 10; // closing-dark-card (summary)
    } else if (slideData.slide_type === 'section_divider') {
      layoutNum = 9; // centered-dark-icon (only layout for section dividers)
    } else if (slideData.slide_type === 'quote') {
      // Alternate quote layouts between 5 (dark-quote-banner) and 7 (quote-accent-bar)
      layoutNum = contentSlideCounter % 2 === 0 ? 5 : 7;
    } else if (slideData.slide_type === 'two_column') {
      layoutNum = 4; // two-column-comparison (requires left/right data)
    } else if (slideData.slide_type === 'statistics') {
      layoutNum = 8; // three-column-filled (requires stats data)
    } else {
      // Cycle through general content layouts (safe for any bullet/text slide)
      const contentLayouts = [2, 6, 8, 2, 6, 8];
      layoutNum = contentLayouts[contentSlideCounter % contentLayouts.length];
    }

    try {
      switch (layoutNum) {
        case 1: this._pdfLayout1_heroCentered(doc, slideData, theme, pageW, pageH); break;
        case 2: this._pdfLayout2_headerIconBullets(doc, slideData, theme, pageW, pageH); break;
        case 3: this._pdfLayout3_threeColumnCards(doc, slideData, theme, pageW, pageH); break;
        case 4: this._pdfLayout4_twoColumnIconCards(doc, slideData, theme, pageW, pageH); break;
        case 5: this._pdfLayout5_darkQuoteBanner(doc, slideData, theme, pageW, pageH); break;
        case 6: this._pdfLayout6_iconSubheadingBullets(doc, slideData, theme, pageW, pageH); break;
        case 7: this._pdfLayout7_quoteAccentBar(doc, slideData, theme, pageW, pageH); break;
        case 8: this._pdfLayout8_threeColumnFilled(doc, slideData, theme, pageW, pageH); break;
        case 9: this._pdfLayout9_centeredDarkIcon(doc, slideData, theme, pageW, pageH); break;
        case 10: this._pdfLayout10_primaryBgCard(doc, slideData, theme, pageW, pageH); break;
        default: this._pdfLayout2_headerIconBullets(doc, slideData, theme, pageW, pageH); break;
      }
    } catch (err) {
      logger.warn(`Error rendering PDF layout ${layoutNum}: ${err.message}, falling back to layout 2`);
      doc.rect(0, 0, pageW, pageH).fill(theme.colors.light_bg);
      this._pdfLayout2_headerIconBullets(doc, slideData, theme, pageW, pageH);
    }
  }

  // ─── PDF LAYOUT TEMPLATES (10 distinct layouts) ─────────────────────

  /**
   * Layout 1: hero-centered — Dark bg, large centered icon, huge title, accent italic subtitle, small footer
   * Used for: first slide (title)
   */
  _pdfLayout1_heroCentered(doc, data, theme, pageW, pageH) {
    doc.rect(0, 0, pageW, pageH).fill(theme.colors.dark_bg);

    // Left accent bar — 40px wide, full height
    doc.rect(0, 0, 40, pageH).fill(theme.colors.accent_color);

    const icon = this._getSlideIconChar(data);
    this.drawPdfIcon(doc, icon, 0, 50, 56, theme.colors.accent_color, { width: pageW, align: 'center' });

    const title = this._getSlideTitle(data);
    const titleY = pageH * 0.28;
    const titleW = pageW - 120;
    doc.font('Times-Bold').fontSize(42);
    const titleH = doc.heightOfString(title, { width: titleW });
    doc.fillColor(theme.colors.text_light)
      .text(title, 60, titleY, { width: titleW, align: 'center' });

    const subtitle = this._getSlideSubtitle(data);
    if (subtitle) {
      doc.font('Times-Italic')
        .fontSize(26)
        .fillColor(theme.colors.accent_color)
        .text(subtitle, 100, titleY + titleH + 50, { width: pageW - 200, align: 'center' });
    }

    if (data.footer) {
      doc.font('Helvetica')
        .fontSize(14)
        .fillColor(theme.colors.text_light)
        .text(data.footer, 60, pageH * 0.75, { width: pageW - 120, align: 'center' });
    }
  }


  /** Layout 2: header-icon-bullets — Light bg, primary header band, white card + accent left bar + large icon, bullets */
  _pdfLayout2_headerIconBullets(doc, data, theme, pageW, pageH) {
    doc.rect(0, 0, pageW, pageH).fill(theme.colors.light_bg);
    this.addPdfHeaderBand(doc, this._getSlideTitle(data), theme, pageW);

    // Card panel with left accent bar
    this.addPdfCardPanel(doc, 36, 100, pageW - 72, pageH - 130, theme);
    this.addPdfLeftAccentBar(doc, 36, 100, pageH - 130, theme.colors.accent_color);

    // Large icon beside accent bar
    const icon = this._getSlideIconChar(data);
    this.drawPdfIcon(doc, icon, 50, 112, 32, theme.colors.primary_color, { width: 44 });

    const items = this._getSlideItems(data).slice(0, 6);
    const bulletAreaTop = 118;
    const bulletAreaBottom = pageH - 40;
    const bulletAreaH = bulletAreaBottom - bulletAreaTop;
    const bulletSpacing = bulletAreaH / Math.max(items.length, 1);
    let yPos = bulletAreaTop;
    for (const item of items) {
      doc.circle(110, yPos + 12, 4).fill(theme.colors.accent_color);
      doc.font('Helvetica').fontSize(22).fillColor(theme.colors.text_dark)
        .text(item, 126, yPos, { width: pageW - 200 });
      yPos += bulletSpacing;
    }
  }

  /** Layout 3: three-column-cards — Light bg, dark header + accent underline, 3 white cards with bold topic header + summary text */
  _pdfLayout3_threeColumnCards(doc, data, theme, pageW, pageH) {
    doc.rect(0, 0, pageW, pageH).fill(theme.colors.light_bg);
    this.addPdfHeaderBand(doc, this._getSlideTitle(data), theme, pageW);

    const items = this._getSlideItems(data).slice(0, 3);
    const gap = 16;
    const cardW = (pageW - 100 - gap * 2) / 3;
    const cardY = 105;
    const cardH = pageH - 130;
    const borderColors = [theme.colors.primary_color, theme.colors.accent_color, theme.colors.secondary_color];

    // Parse items into topic/summary pairs
    const cards = items.map(raw => {
      const pipeIdx = raw.indexOf('|');
      return {
        topic: pipeIdx > -1 ? raw.substring(0, pipeIdx) : '',
        summary: pipeIdx > -1 ? raw.substring(pipeIdx + 1) : raw
      };
    });

    // First pass: measure tallest header to align summary text across all cards
    const topicY = cardY + 20;
    let maxTopicH = 0;
    doc.font('Helvetica-Bold').fontSize(26);
    for (const card of cards) {
      if (card.topic) {
        const h = doc.heightOfString(card.topic, { width: cardW - 36 });
        if (h > maxTopicH) maxTopicH = h;
      }
    }
    const summaryY = topicY + maxTopicH + 16;

    // Second pass: render cards with aligned summary text
    for (let col = 0; col < cards.length; col++) {
      const xPos = 50 + col * (cardW + gap);
      this.addPdfCardPanel(doc, xPos, cardY, cardW, cardH, theme, { borderColor: borderColors[col] });

      // Bold topic header (H2 size)
      if (cards[col].topic) {
        doc.font('Helvetica-Bold').fontSize(26).fillColor(borderColors[col])
          .text(cards[col].topic, xPos + 18, topicY, { width: cardW - 36 });
      }

      // Summary text aligned to same Y across all cards
      doc.font('Helvetica').fontSize(22).fillColor(theme.colors.text_dark)
        .text(cards[col].summary, xPos + 18, summaryY, { width: cardW - 36 });
    }

    const subtitle = this._getSlideSubtitle(data);
    if (subtitle) {
      doc.font('Times-Italic').fontSize(13).fillColor(theme.colors.text_muted)
        .text(subtitle, 50, pageH - 40, { width: pageW - 100, align: 'center' });
    }
  }

  /** Layout 4: two-column-comparison — Light bg, dark header + accent underline, 2 white cards with bold H2 header + bulleted list (max 3) */
  _pdfLayout4_twoColumnIconCards(doc, data, theme, pageW, pageH) {
    doc.rect(0, 0, pageW, pageH).fill(theme.colors.light_bg);
    this.addPdfHeaderBand(doc, this._getSlideTitle(data), theme, pageW);

    const leftItems = (data.left_items || []).slice(0, 3);
    const rightItems = (data.right_items || []).slice(0, 3);
    const leftTitle = data.left_title || '';
    const rightTitle = data.right_title || '';
    const gap = 20;
    const cardW = (pageW - 100 - gap) / 2;
    const cardY = 105;
    const cardH = pageH - 130;
    const leftX = 50;
    const rightX = 50 + cardW + gap;
    const cardColors = [theme.colors.accent_color, theme.colors.primary_color];

    // Measure tallest header to align bullets across both cards
    const topicY = cardY + 20;
    let maxTopicH = 0;
    doc.font('Helvetica-Bold').fontSize(26);
    for (const title of [leftTitle, rightTitle]) {
      if (title) {
        const h = doc.heightOfString(title, { width: cardW - 36 });
        if (h > maxTopicH) maxTopicH = h;
      }
    }
    const bulletsY = topicY + maxTopicH + 36;

    // Render a card with header + bullets
    const renderCard = (xPos, title, items, color) => {
      this.addPdfCardPanel(doc, xPos, cardY, cardW, cardH, theme, { borderColor: color });

      // Bold topic header (H2 size)
      if (title) {
        doc.font('Helvetica-Bold').fontSize(26).fillColor(color)
          .text(title, xPos + 18, topicY, { width: cardW - 36 });
      }

      // Bulleted list aligned to same Y across both cards
      let yPos = bulletsY;
      for (const item of items) {
        doc.circle(xPos + 30, yPos + 12, 4).fill(color);
        doc.font('Helvetica').fontSize(22).fillColor(theme.colors.text_dark)
          .text(item, xPos + 46, yPos, { width: cardW - 64 });
        yPos += doc.heightOfString(item, { width: cardW - 64, fontSize: 22 }) + 18;
      }
    };

    renderCard(leftX, leftTitle, leftItems, cardColors[0]);
    renderCard(rightX, rightTitle, rightItems, cardColors[1]);
  }

  /** Layout 5: dark-quote-banner — Dark bg, title top-left, semi-transparent banner with accent italic quote, white bullets below */
  _pdfLayout5_darkQuoteBanner(doc, data, theme, pageW, pageH) {
    doc.rect(0, 0, pageW, pageH).fill(theme.colors.dark_bg);
    this.addPdfLeftAccentBar(doc, 26, 0, pageH, theme.colors.accent_color);

    const title = this._getSlideTitle(data);
    doc.font('Times-Bold').fontSize(28).fillColor(theme.colors.text_light)
      .text(title, 52, 26, { width: pageW - 110 });

    // Quote/subtitle banner — only uses quote or subtitle, never a bullet
    const bannerText = this._getSlideQuote(data) || this._getSlideSubtitle(data);
    let bulletsY = 90;

    if (bannerText) {
      doc.save();
      doc.opacity(0.15);
      doc.roundedRect(36, 75, pageW - 72, 60, 4).fill(theme.colors.accent_color);
      doc.restore();
      doc.font('Times-Italic').fontSize(17).fillColor(theme.colors.accent_color)
        .text(bannerText, 52, 85, { width: pageW - 110 });
      bulletsY = 150;
    }

    // All bullets rendered below the banner — none placed inside it
    const bulletItems = this._getSlideItems(data).slice(0, 6);
    for (const item of bulletItems) {
      doc.circle(60, bulletsY + 12, 4).fill(theme.colors.accent_color);
      doc.font('Helvetica').fontSize(22).fillColor(theme.colors.text_light)
        .text(item, 76, bulletsY, { width: pageW - 140 });
      bulletsY += doc.heightOfString(item, { width: pageW - 140, fontSize: 22 }) + 18;
      if (bulletsY > pageH - 30) break;
    }
  }

  /** Layout 6: icon-subheading-bullets — Dark bg, light header band, icon + bold accent subheading + accent underline, light bullets */
  _pdfLayout6_iconSubheadingBullets(doc, data, theme, pageW, pageH) {
    doc.rect(0, 0, pageW, pageH).fill(theme.colors.dark_bg);

    // Light header band (inverted from layout 2)
    const bandH = 80;
    doc.rect(0, 0, pageW, bandH).fill(theme.colors.light_bg);
    doc.rect(0, bandH, pageW, 3).fill(theme.colors.accent_color);
    doc.font('Times-Bold').fontSize(28).fillColor(theme.colors.text_dark)
      .text(this._getSlideTitle(data), 40, 22, { width: pageW - 80 });

    const icon = this._getSlideIconChar(data);
    const subtitle = this._getSlideSubtitle(data);
    let bulletsY = 100;

    if (subtitle) {
      this.drawPdfIcon(doc, icon, 40, 96, 28, theme.colors.accent_color, { width: 34 });
      doc.font('Helvetica-Bold').fontSize(20).fillColor(theme.colors.accent_color)
        .text(subtitle, 82, 98, { width: pageW - 140 });
      doc.rect(82, 126, pageW - 140, 3).fill(theme.colors.accent_color);
      bulletsY = 165;
    } else {
      this.drawPdfIcon(doc, icon, 40, 96, 28, theme.colors.accent_color, { width: 34 });
      bulletsY = 128;
    }

    const items = this._getSlideItems(data).slice(0, 6);
    for (const item of items) {
      doc.circle(60, bulletsY + 12, 4).fill(theme.colors.accent_color);
      doc.font('Helvetica').fontSize(22).fillColor(theme.colors.text_light)
        .text(item, 76, bulletsY, { width: pageW - 140 });
      bulletsY += doc.heightOfString(item, { width: pageW - 140, fontSize: 22 }) + 18;
      if (bulletsY > pageH - 30) break;
    }
  }

  /** Layout 7: quote-accent-bar — Light bg, dark header + accent underline, white card with thick accent left bar + italic text, bullets below */
  _pdfLayout7_quoteAccentBar(doc, data, theme, pageW, pageH) {
    doc.rect(0, 0, pageW, pageH).fill(theme.colors.light_bg);
    const heading = this._getSlideTitle(data);
    this.addPdfHeaderBand(doc, heading, theme, pageW);

    // White card with accent bar for quote
    const quote = this._getSlideQuote(data);
    const quoteText = quote || this._getSlideSubtitle(data);
    let contentY = 100;

    if (quoteText) {
      const cardH = 110;
      const cardTop = 100;
      this.addPdfCardPanel(doc, 36, cardTop, pageW - 72, cardH, theme);
      this.addPdfLeftAccentBar(doc, 36, cardTop, cardH, theme.colors.accent_color);

      // Measure text height to vertically center in card
      doc.font('Times-Italic').fontSize(22);
      const textH = doc.heightOfString(quoteText, { width: pageW - 130 });
      const textY = cardTop + (cardH - textH) / 2;
      doc.fillColor(theme.colors.text_dark)
        .text(quoteText, 56, textY, { width: pageW - 130 });

      if (data.attribution) {
        doc.font('Helvetica').fontSize(13).fillColor(theme.colors.text_muted)
          .text(`\u2014 ${data.attribution}`, 56, cardTop + cardH + 6, { width: pageW - 110, align: 'right' });
      }
      contentY = cardTop + cardH + 30;
    }

    const items = this._getSlideItems(data).slice(0, 6);
    for (const item of items) {
      doc.circle(60, contentY + 12, 4).fill(theme.colors.accent_color);
      doc.font('Helvetica').fontSize(22).fillColor(theme.colors.text_dark)
        .text(item, 76, contentY, { width: pageW - 140 });
      contentY += doc.heightOfString(item, { width: pageW - 140, fontSize: 22 }) + 18;
      if (contentY > pageH - 30) break;
    }
  }

  /** Layout 8: three-column-filled — Light bg, dark header with inline icon, 3 tall cards with colored backgrounds (primary/accent/secondary), white text */
  _pdfLayout8_threeColumnFilled(doc, data, theme, pageW, pageH) {
    doc.rect(0, 0, pageW, pageH).fill(theme.colors.light_bg);

    // Dark header band with inline icon
    const bandH = 80;
    doc.rect(0, 0, pageW, bandH).fill(theme.colors.dark_bg);
    doc.rect(0, bandH, pageW, 3).fill(theme.colors.accent_color);
    const icon = this._getSlideIconChar(data);
    this.drawPdfIcon(doc, icon, 30, 24, 26, theme.colors.accent_color, { width: 34 });
    doc.font('Times-Bold').fontSize(26).fillColor(theme.colors.text_light)
      .text(this._getSlideTitle(data), 70, 28, { width: pageW - 110 });

    const items = this._getSlideItems(data);
    const groups = this._splitIntoGroups(items, 3);
    const gap = 16;
    const cardW = (pageW - 100 - gap * 2) / 3;
    const cardY = 100;
    const cardH = pageH - 120;
    const fillColors = [theme.colors.primary_color, theme.colors.accent_color, theme.colors.primary_color];

    for (let col = 0; col < 3; col++) {
      const xPos = 50 + col * (cardW + gap);
      doc.roundedRect(xPos, cardY, cardW, cardH, 6).fill(fillColors[col]);

      // Use dark text on light backgrounds (accent), white text on dark backgrounds (primary)
      const textColor = this._luminance(fillColors[col]) > 0.3 ? theme.colors.text_dark : '#FFFFFF';

      let yPos = cardY + 20;
      for (const item of groups[col]) {
        doc.font('Helvetica').fontSize(22).fillColor(textColor)
          .text(item, xPos + 15, yPos, { width: cardW - 30 });
        yPos += doc.heightOfString(item, { width: cardW - 30, fontSize: 22 }) + 12;
        if (yPos > cardY + cardH - 10) break;
      }
    }
  }

  /** Layout 9: centered-dark-icon — Dark bg, centered large icon, centered title (section divider) */
  _pdfLayout9_centeredDarkIcon(doc, data, theme, pageW, pageH) {
    doc.rect(0, 0, pageW, pageH).fill(theme.colors.dark_bg);

    // Center icon and title vertically on the slide
    const icon = this._getSlideIconChar(data);
    const title = this._getSlideTitle(data);

    // Measure title height to calculate total content block
    doc.font('Times-Bold').fontSize(38);
    const titleH = doc.heightOfString(title, { width: pageW - 200 });
    const iconH = 60;
    const gap = 40;
    const totalH = iconH + gap + titleH;
    const startY = (pageH - totalH) / 2;

    this.drawPdfIcon(doc, icon, 0, startY, 48, theme.colors.accent_color, { width: pageW, align: 'center' });

    doc.font('Times-Bold').fontSize(38).fillColor(theme.colors.text_light)
      .text(title, 100, startY + iconH + gap, { width: pageW - 200, align: 'center' });
  }

  /** Layout 10: closing-dark-card — Dark bg (matches opening), circled icon, white title, white card with accent top bar + bullets, accent italic footer */
  _pdfLayout10_primaryBgCard(doc, data, theme, pageW, pageH) {
    doc.rect(0, 0, pageW, pageH).fill(theme.colors.dark_bg);

    // Circled icon with accent ring and white background
    const cx = pageW / 2;
    doc.circle(cx, 48, 32).fill(theme.colors.accent_color);
    doc.circle(cx, 48, 28).fill('#FFFFFF');
    const icon = this._getSlideIconChar(data);
    this.drawPdfIcon(doc, icon, cx - 28, 30, 34, theme.colors.primary_color, { width: 56, align: 'center' });

    // White title
    const title = this._getSlideTitle(data);
    doc.font('Times-Bold').fontSize(32).fillColor(theme.colors.text_light)
      .text(title, 60, 92, { width: pageW - 120, align: 'center' });

    // White card with accent top bar
    const cardY = 145;
    const cardH = pageH - 210;
    this.addPdfCardPanel(doc, 60, cardY, pageW - 120, cardH, theme);

    const items = this._getSlideItems(data).slice(0, 12);
    const cardLeft = 60;
    const cardRight = pageW - 60;
    const cardInner = 25;
    const bulletStartY = cardY + 32;

    if (items.length <= 6) {
      // Single column
      let yPos = bulletStartY;
      for (const item of items) {
        doc.circle(cardLeft + cardInner, yPos + 12, 4).fill(theme.colors.accent_color);
        doc.font('Helvetica').fontSize(22).fillColor(theme.colors.text_dark)
          .text(item, cardLeft + cardInner + 16, yPos, { width: cardRight - cardLeft - cardInner - 40 });
        yPos += doc.heightOfString(item, { width: cardRight - cardLeft - cardInner - 40, fontSize: 22 }) + 14;
        if (yPos > cardY + cardH - 10) break;
      }
    } else {
      // Two columns
      const colW = (cardRight - cardLeft - cardInner * 2) / 2 - 10;
      const leftX = cardLeft + cardInner;
      const rightX = cardLeft + (cardRight - cardLeft) / 2 + 10;
      const leftItems = items.slice(0, Math.ceil(items.length / 2));
      const rightItems = items.slice(Math.ceil(items.length / 2));

      let yPos = bulletStartY;
      for (const item of leftItems) {
        doc.circle(leftX, yPos + 10, 3).fill(theme.colors.accent_color);
        doc.font('Helvetica').fontSize(18).fillColor(theme.colors.text_dark)
          .text(item, leftX + 14, yPos, { width: colW - 14 });
        yPos += doc.heightOfString(item, { width: colW - 14, fontSize: 18 }) + 10;
        if (yPos > cardY + cardH - 10) break;
      }

      yPos = bulletStartY;
      for (const item of rightItems) {
        doc.circle(rightX, yPos + 10, 3).fill(theme.colors.accent_color);
        doc.font('Helvetica').fontSize(18).fillColor(theme.colors.text_dark)
          .text(item, rightX + 14, yPos, { width: colW - 14 });
        yPos += doc.heightOfString(item, { width: colW - 14, fontSize: 18 }) + 10;
        if (yPos > cardY + cardH - 10) break;
      }
    }

    // Accent italic footer
    const subtitle = this._getSlideSubtitle(data);
    if (subtitle) {
      doc.font('Times-Italic').fontSize(20).fillColor(theme.colors.accent_color)
        .text(subtitle, 60, pageH - 55, { width: pageW - 120, align: 'center' });
    }
  }


  /**
   * Generate sanitized filename
   * @param {string} videoTitle - Video title
   * @param {string} format - File format (pptx, pdf)
   * @returns {string} Sanitized filename
   */
  generateFilename(videoTitle, format) {
    const sanitized = (videoTitle || 'slide-deck')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 80)
      .toLowerCase();

    return `${sanitized}-slides.${format}`;
  }
}

// Export singleton + constants for route validation
const service = new SlideDeckGenerationService();
service.THEME_PRESETS = THEME_PRESETS;
service.VALID_THEME_IDS = VALID_THEME_IDS;

module.exports = service;
