/**
 * Slide Deck Generation Service
 * Generates PPTX presentations and slide-style PDFs from AI-structured JSON content
 */

const PptxGenJS = require('pptxgenjs');
const PDFDocument = require('pdfkit');
const { logger } = require('../utils');

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
      throw new Error(`Invalid slide deck JSON: ${parseError.message}`);
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

    // Derive dark_bg from primary, light_bg from background
    return {
      id: 'auto',
      name: 'Auto',
      colors: {
        primary_color: primary,
        secondary_color: secondary,
        accent_color: accent,
        dark_bg: primary,
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
   * Get a unicode icon for a slide type
   */
  getSlideIcon(slideType) {
    const icons = {
      title: '\u2726',           // four-pointed star
      section_divider: '\u2756', // black diamond minus white X
      bullets: '\u2022',         // bullet
      quote: '\u201C',           // left double quotation
      two_column: '\u2637',      // trigram
      statistics: '\u2191',      // upwards arrow
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

  // ─── PDF GENERATION (UNCHANGED) ─────────────────────────────────────

  /**
   * Generate a presentation-style PDF (landscape pages mimicking slides)
   * @param {string} contentText - AI-generated JSON content
   * @param {string} videoTitle - Video title
   * @returns {Promise<Buffer>} PDF buffer
   */
  async generateSlidePdf(contentText, videoTitle) {
    const data = this.parseSlideJSON(contentText);
    const { theme, slides } = data;

    return new Promise((resolve, reject) => {
      const chunks = [];
      const doc = new PDFDocument({
        layout: 'landscape',
        size: 'LETTER',
        margin: 0,
        info: {
          Title: videoTitle || 'Slide Deck',
          Author: 'AmplifyContent.ai'
        }
      });

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageW = 792; // Letter landscape width in points
      const pageH = 612; // Letter landscape height in points

      for (let i = 0; i < slides.length; i++) {
        if (i > 0) doc.addPage();

        const slideData = slides[i];
        this.renderPdfSlide(doc, slideData, theme, pageW, pageH);
      }

      doc.end();
    });
  }

  /**
   * Render a single slide to PDF
   */
  renderPdfSlide(doc, slideData, theme, pageW, pageH) {
    // Background
    doc.rect(0, 0, pageW, pageH).fill(theme.background_color);

    // Bottom accent bar
    doc.rect(0, pageH - 40, pageW, 40).fill(theme.primary_color);

    switch (slideData.slide_type) {
      case 'title':
        this.renderPdfTitleSlide(doc, slideData, theme, pageW, pageH);
        break;
      case 'section_divider':
        this.renderPdfSectionDivider(doc, slideData, theme, pageW, pageH);
        break;
      case 'quote':
        this.renderPdfQuoteSlide(doc, slideData, theme, pageW, pageH);
        break;
      case 'statistics':
        this.renderPdfStatisticsSlide(doc, slideData, theme, pageW, pageH);
        break;
      case 'summary':
        this.renderPdfSummarySlide(doc, slideData, theme, pageW, pageH);
        break;
      default:
        // bullets, two_column, table, image_placeholder all get bullet treatment in PDF
        this.renderPdfBulletsSlide(doc, slideData, theme, pageW, pageH);
        break;
    }
  }

  renderPdfTitleSlide(doc, data, theme, pageW, pageH) {
    // Top accent line
    doc.rect(0, 0, pageW, 6).fill(theme.accent_color);

    // Title
    doc.font('Helvetica-Bold')
      .fontSize(32)
      .fillColor(theme.primary_color)
      .text(data.title || 'Presentation', 60, pageH * 0.3, {
        width: pageW - 120,
        align: 'center'
      });

    // Subtitle
    if (data.subtitle) {
      doc.font('Helvetica')
        .fontSize(16)
        .fillColor(theme.secondary_color)
        .text(data.subtitle, 100, pageH * 0.3 + 60, {
          width: pageW - 200,
          align: 'center'
        });
    }

    // Footer
    if (data.footer) {
      doc.font('Helvetica-Oblique')
        .fontSize(11)
        .fillColor(theme.secondary_color)
        .text(data.footer, 60, pageH * 0.72, {
          width: pageW - 120,
          align: 'center'
        });
    }
  }

  renderPdfSectionDivider(doc, data, theme, pageW, pageH) {
    // Full background
    doc.rect(0, 0, pageW, pageH).fill(theme.primary_color);

    // Accent bar
    doc.rect(100, pageH * 0.45, 120, 4).fill(theme.accent_color);

    // Heading
    doc.font('Helvetica-Bold')
      .fontSize(28)
      .fillColor('#FFFFFF')
      .text(data.heading || 'Section', 100, pageH * 0.48, {
        width: pageW - 200
      });
  }

  renderPdfBulletsSlide(doc, data, theme, pageW) {
    // Heading
    doc.font('Helvetica-Bold')
      .fontSize(22)
      .fillColor(theme.primary_color)
      .text(data.heading || '', 60, 40, { width: pageW - 120 });

    // Accent underline
    doc.rect(60, 72, 100, 3).fill(theme.accent_color);

    // Bullets
    const bullets = data.bullets || [];
    let yPos = 95;

    for (const bullet of bullets) {
      // Bullet dot
      doc.circle(72, yPos + 8, 3).fill(theme.accent_color);

      doc.font('Helvetica')
        .fontSize(14)
        .fillColor(theme.text_color)
        .text(bullet, 85, yPos, { width: pageW - 160 });

      yPos += doc.heightOfString(bullet, { width: pageW - 160 }) + 12;
    }
  }

  renderPdfQuoteSlide(doc, data, theme, pageW, pageH) {
    // Decorative quote mark
    doc.font('Helvetica')
      .fontSize(72)
      .fillColor(theme.accent_color)
      .opacity(0.3)
      .text('\u201C', 50, 40);
    doc.opacity(1);

    // Quote text
    doc.font('Helvetica-Oblique')
      .fontSize(18)
      .fillColor(theme.text_color)
      .text(data.quote || '', 100, pageH * 0.25, {
        width: pageW - 200,
        align: 'center'
      });

    // Attribution
    if (data.attribution) {
      doc.font('Helvetica')
        .fontSize(12)
        .fillColor(theme.secondary_color)
        .text(`\u2014 ${data.attribution}`, 100, pageH * 0.65, {
          width: pageW - 200,
          align: 'right'
        });
    }
  }

  renderPdfStatisticsSlide(doc, data, theme, pageW) {
    // Heading
    doc.font('Helvetica-Bold')
      .fontSize(22)
      .fillColor(theme.primary_color)
      .text(data.heading || 'Key Statistics', 60, 40, { width: pageW - 120 });

    doc.rect(60, 72, 100, 3).fill(theme.accent_color);

    const stats = data.stats || [];
    const count = Math.min(stats.length, 4);
    const colWidth = (pageW - 120) / count;

    for (let i = 0; i < count; i++) {
      const stat = stats[i];
      const xPos = 60 + (i * colWidth);

      doc.font('Helvetica-Bold')
        .fontSize(34)
        .fillColor(theme.accent_color)
        .text(stat.value || '', xPos, 120, {
          width: colWidth - 20,
          align: 'center'
        });

      doc.font('Helvetica')
        .fontSize(12)
        .fillColor(theme.text_color)
        .text(stat.label || '', xPos, 170, {
          width: colWidth - 20,
          align: 'center'
        });
    }
  }

  renderPdfSummarySlide(doc, data, theme, pageW, pageH) {
    // Heading
    doc.font('Helvetica-Bold')
      .fontSize(22)
      .fillColor(theme.primary_color)
      .text(data.heading || 'Key Takeaways', 60, 40, { width: pageW - 120 });

    doc.rect(60, 72, 100, 3).fill(theme.accent_color);

    // Takeaways
    const takeaways = data.takeaways || [];
    let yPos = 95;

    for (const takeaway of takeaways) {
      doc.font('Helvetica')
        .fontSize(14)
        .fillColor(theme.text_color)
        .text(`\u2713  ${takeaway}`, 70, yPos, { width: pageW - 160 });

      yPos += doc.heightOfString(`\u2713  ${takeaway}`, { width: pageW - 160 }) + 10;
    }

    // Call to action bar
    if (data.call_to_action) {
      const ctaY = pageH - 100;
      doc.roundedRect(100, ctaY, pageW - 200, 40, 4).fill(theme.accent_color);

      doc.font('Helvetica-Bold')
        .fontSize(14)
        .fillColor('#FFFFFF')
        .text(data.call_to_action, 100, ctaY + 12, {
          width: pageW - 200,
          align: 'center'
        });
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
