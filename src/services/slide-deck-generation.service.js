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

  // ─── PDF HELPERS ────────────────────────────────────────────────────

  /**
   * Draw a PDF icon as a vector shape at a position.
   * Uses PDFKit path primitives — no special fonts needed.
   * @param {object} doc - PDFKit document
   * @param {string} slideType - one of: title, section_divider, bullets, quote, two_column, statistics, table, image_placeholder, summary
   * @param {number} x - left edge (or area left for centered alignment)
   * @param {number} y - top edge
   * @param {number} size - logical size (matches font-size scale)
   * @param {string} color - fill/stroke color
   * @param {object} opts - { width, align }
   */
  drawPdfIcon(doc, slideType, x, y, size, color, opts = {}) {
    doc.save();

    const width = opts.width || size * 2;
    const align = opts.align || 'left';
    // Center of the drawing area
    let cx = align === 'center' ? x + width / 2 : x + size * 0.4;
    const cy = y + size * 0.45;
    const r = size * 0.3; // base radius

    switch (slideType) {
      case 'title': {
        // 4-pointed star (tall diamond)
        doc.path(
          `M ${cx} ${cy - r * 1.4} ` +
          `L ${cx + r * 0.55} ${cy} ` +
          `L ${cx} ${cy + r * 1.4} ` +
          `L ${cx - r * 0.55} ${cy} Z`
        ).fill(color);
        break;
      }
      case 'section_divider': {
        // Thick vertical bar
        const bw = r * 0.5;
        const bh = r * 3;
        doc.rect(cx - bw / 2, cy - bh / 2, bw, bh).fill(color);
        break;
      }
      case 'bullets': {
        // Filled circle
        doc.circle(cx, cy, r * 0.6).fill(color);
        break;
      }
      case 'quote': {
        // Use Times-Bold curly double-quote (U+201C is WinAnsi char 147, renders fine)
        doc.font('Times-Bold')
          .fontSize(size)
          .fillColor(color)
          .text('\u201C', x, y, { width, align });
        doc.restore();
        return; // early return — text handled by PDFKit
      }
      case 'two_column': {
        // Two vertical bars
        const bw2 = r * 0.35;
        const bh2 = r * 2.5;
        const gap = r * 0.8;
        doc.rect(cx - gap / 2 - bw2, cy - bh2 / 2, bw2, bh2).fill(color);
        doc.rect(cx + gap / 2, cy - bh2 / 2, bw2, bh2).fill(color);
        break;
      }
      case 'statistics': {
        // Right-pointing triangle
        doc.path(
          `M ${cx - r * 0.6} ${cy - r} ` +
          `L ${cx + r} ${cy} ` +
          `L ${cx - r * 0.6} ${cy + r} Z`
        ).fill(color);
        break;
      }
      case 'table': {
        // Grid: square outline with center cross
        const gs = r * 1.1;
        const lw = Math.max(1, size * 0.05);
        doc.rect(cx - gs, cy - gs, gs * 2, gs * 2).lineWidth(lw).stroke(color);
        doc.moveTo(cx, cy - gs).lineTo(cx, cy + gs).lineWidth(lw).stroke(color);
        doc.moveTo(cx - gs, cy).lineTo(cx + gs, cy).lineWidth(lw).stroke(color);
        break;
      }
      case 'image_placeholder': {
        // Circle outline with small mountain triangle inside
        const cr = r * 1.2;
        const lw2 = Math.max(1, size * 0.05);
        doc.circle(cx, cy, cr).lineWidth(lw2).stroke(color);
        const mr = r * 0.55;
        doc.path(
          `M ${cx - mr} ${cy + mr * 0.5} ` +
          `L ${cx} ${cy - mr * 0.5} ` +
          `L ${cx + mr} ${cy + mr * 0.5} Z`
        ).fill(color);
        break;
      }
      case 'summary': {
        // Checkmark stroke
        const lw3 = Math.max(1.5, size * 0.1);
        doc.path(
          `M ${cx - r * 0.7} ${cy + r * 0.05} ` +
          `L ${cx - r * 0.1} ${cy + r * 0.65} ` +
          `L ${cx + r * 0.8} ${cy - r * 0.55}`
        ).lineWidth(lw3).lineJoin('round').lineCap('round').stroke(color);
        break;
      }
      default: {
        doc.circle(cx, cy, r * 0.6).fill(color);
      }
    }

    doc.restore();
  }

  /**
   * Draw a full-width dark header band with white heading and accent underline
   */
  addPdfHeaderBand(doc, text, theme, pageW) {
    const bandH = 80;
    doc.rect(0, 0, pageW, bandH).fill(theme.colors.dark_bg);
    doc.rect(0, bandH, pageW, 3).fill(theme.colors.accent_color);
    doc.font('Times-Bold')
      .fontSize(26)
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

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Track variant cycling per slide type
      const slideTypeCounts = {};

      for (let i = 0; i < slides.length; i++) {
        if (i > 0) doc.addPage();

        const slideData = slides[i];
        const type = slideData.slide_type;
        const variantIndex = slideTypeCounts[type] || 0;
        slideTypeCounts[type] = variantIndex + 1;

        this.renderPdfSlide(doc, slideData, theme, pageW, pageH, variantIndex);
      }

      doc.end();
    });
  }

  /**
   * Render a single slide to PDF with theme-aware backgrounds and variant dispatch
   */
  renderPdfSlide(doc, slideData, theme, pageW, pageH, variantIndex = 0) {
    const type = slideData.slide_type;
    const isDark = this.isDarkSlide(type, theme);

    // Background — dark slides override handled per-variant for bullets
    doc.rect(0, 0, pageW, pageH).fill(isDark ? theme.colors.dark_bg : theme.colors.light_bg);

    switch (type) {
      case 'title':
        this.renderPdfTitleSlide(doc, slideData, theme, pageW, pageH);
        break;
      case 'section_divider':
        this.renderPdfSectionDivider(doc, slideData, theme, pageW, pageH, variantIndex);
        break;
      case 'bullets':
        this.renderPdfBulletsSlide(doc, slideData, theme, pageW, pageH, variantIndex);
        break;
      case 'quote':
        this.renderPdfQuoteSlide(doc, slideData, theme, pageW, pageH, variantIndex);
        break;
      case 'two_column':
        this.renderPdfTwoColumnSlide(doc, slideData, theme, pageW, pageH, variantIndex);
        break;
      case 'statistics':
        this.renderPdfStatisticsSlide(doc, slideData, theme, pageW, pageH, variantIndex);
        break;
      case 'table':
        this.renderPdfTableSlide(doc, slideData, theme, pageW, pageH);
        break;
      case 'image_placeholder':
        this.renderPdfImagePlaceholderSlide(doc, slideData, theme, pageW, pageH);
        break;
      case 'summary':
        this.renderPdfSummarySlide(doc, slideData, theme, pageW, pageH, variantIndex);
        break;
      default:
        this.renderPdfBulletsSlide(doc, slideData, theme, pageW, pageH, variantIndex);
        break;
    }
  }

  // ─── PDF SLIDE RENDERERS ──────────────────────────────────────────

  /**
   * Title slide — dark bg, left accent bar, centered icon, serif title, accent subtitle
   */
  renderPdfTitleSlide(doc, data, theme, pageW, pageH) {
    // Left accent bar
    this.addPdfLeftAccentBar(doc, 26, 0, pageH, theme.colors.accent_color);

    // Centered icon
    this.drawPdfIcon(doc, 'title', 0, 60, 44, theme.colors.accent_color, { width: pageW, align: 'center' });

    // Title — large serif
    doc.font('Times-Bold')
      .fontSize(38)
      .fillColor(theme.colors.text_light)
      .text(data.title || 'Presentation', 60, pageH * 0.28, {
        width: pageW - 120,
        align: 'center'
      });

    // Subtitle — accent italic
    if (data.subtitle) {
      doc.font('Times-Italic')
        .fontSize(18)
        .fillColor(theme.colors.accent_color)
        .text(data.subtitle, 100, pageH * 0.28 + 70, {
          width: pageW - 200,
          align: 'center'
        });
    }

    // Footer
    if (data.footer) {
      doc.font('Helvetica')
        .fontSize(12)
        .fillColor(theme.colors.text_light)
        .text(data.footer, 60, pageH * 0.75, {
          width: pageW - 120,
          align: 'center'
        });
    }
  }

  /**
   * Section divider — 2 variants
   * A: Centered icon + centered title + accent subtitle
   * B: Left-aligned + large decorative icon at 50% opacity
   */
  renderPdfSectionDivider(doc, data, theme, pageW, pageH, variantIndex = 0) {
    const variant = variantIndex % 2;

    if (variant === 0) {
      // Variant A: centered icon + centered title
      this.addPdfLeftAccentBar(doc, 26, 0, pageH, theme.colors.accent_color);

      this.drawPdfIcon(doc, 'section_divider', 0, 60, 44, theme.colors.accent_color, { width: pageW, align: 'center' });

      doc.font('Times-Bold')
        .fontSize(34)
        .fillColor(theme.colors.text_light)
        .text(data.heading || 'Section', 60, pageH * 0.35, {
          width: pageW - 120,
          align: 'center'
        });

      if (data.subtitle) {
        doc.font('Times-Italic')
          .fontSize(16)
          .fillColor(theme.colors.accent_color)
          .text(data.subtitle, 100, pageH * 0.35 + 55, {
            width: pageW - 200,
            align: 'center'
          });
      }
    } else {
      // Variant B: left-aligned heading + decorative icon right
      this.addPdfLeftAccentBar(doc, 44, 60, pageH - 120, theme.colors.accent_color);

      // Large decorative icon at right, 50% opacity
      doc.save();
      doc.opacity(0.5);
      this.drawPdfIcon(doc, 'section_divider', pageW - 200, pageH * 0.2, 100, theme.colors.accent_color, { width: 160, align: 'center' });
      doc.restore();

      doc.font('Times-Bold')
        .fontSize(30)
        .fillColor(theme.colors.text_light)
        .text(data.heading || 'Section', 70, pageH * 0.40, {
          width: pageW - 280
        });

      // Accent underline
      doc.rect(70, pageH * 0.40 + 50, 140, 4).fill(theme.colors.accent_color);
    }
  }

  /**
   * Bullets slide — 3 variants
   * A: Light bg, header band, white card + accent bar, bullets
   * B: Dark bg override, muted banner + white bullets
   * C: Light bg, header band, icon + subtitle emphasis, bullets
   */
  renderPdfBulletsSlide(doc, data, theme, pageW, pageH, variantIndex = 0) {
    const variant = variantIndex % 3;
    const bullets = data.bullets || [];

    if (variant === 0) {
      // Variant A: Light bg + dark header band + card with accent bar
      this.addPdfHeaderBand(doc, data.heading || '', theme, pageW);

      // Card panel with left accent bar
      this.addPdfCardPanel(doc, 36, 100, pageW - 72, pageH - 130, theme);
      this.addPdfLeftAccentBar(doc, 36, 100, pageH - 130, theme.colors.accent_color);

      // Icon beside accent bar
      this.drawPdfIcon(doc, 'bullets', 50, 112, 22, theme.colors.primary_color, { width: 40 });

      let yPos = 115;
      for (const bullet of bullets) {
        doc.circle(110, yPos + 8, 3).fill(theme.colors.accent_color);
        doc.font('Helvetica')
          .fontSize(14)
          .fillColor(theme.colors.text_dark)
          .text(bullet, 122, yPos, { width: pageW - 190 });
        yPos += doc.heightOfString(bullet, { width: pageW - 190 }) + 12;
      }

    } else if (variant === 1) {
      // Variant B: Dark bg override + heading + muted banner + white bullets
      doc.rect(0, 0, pageW, pageH).fill(theme.colors.dark_bg);
      this.addPdfLeftAccentBar(doc, 26, 0, pageH, theme.colors.accent_color);

      doc.font('Times-Bold')
        .fontSize(26)
        .fillColor(theme.colors.text_light)
        .text(data.heading || '', 52, 26, { width: pageW - 110 });

      // Muted banner for subtitle
      const subtitle = data.subtitle || '';
      let bulletsY = 85;
      if (subtitle) {
        doc.roundedRect(36, 72, pageW - 72, 55, 4).fill(theme.colors.secondary_color);
        doc.font('Times-Italic')
          .fontSize(15)
          .fillColor(theme.colors.accent_color)
          .text(subtitle, 52, 82, { width: pageW - 110 });
        bulletsY = 145;
      }

      for (const bullet of bullets) {
        doc.circle(60, bulletsY + 8, 3).fill(theme.colors.accent_color);
        doc.font('Helvetica')
          .fontSize(14)
          .fillColor(theme.colors.text_light)
          .text(bullet, 74, bulletsY, { width: pageW - 140 });
        bulletsY += doc.heightOfString(bullet, { width: pageW - 140 }) + 12;
      }

    } else {
      // Variant C: Light bg + header band + icon + subtitle emphasis + bullets
      this.addPdfHeaderBand(doc, data.heading || '', theme, pageW);

      const subtitle = data.subtitle || '';
      let bulletsY = 100;
      if (subtitle) {
        this.drawPdfIcon(doc, 'bullets', 40, 96, 20, theme.colors.accent_color, { width: 30 });
        doc.font('Helvetica-Bold')
          .fontSize(15)
          .fillColor(theme.colors.primary_color)
          .text(subtitle, 80, 98, { width: pageW - 140 });
        doc.rect(80, 120, pageW - 140, 3).fill(theme.colors.accent_color);
        bulletsY = 138;
      }

      for (const bullet of bullets) {
        doc.circle(60, bulletsY + 8, 3).fill(theme.colors.accent_color);
        doc.font('Helvetica')
          .fontSize(14)
          .fillColor(theme.colors.text_dark)
          .text(bullet, 74, bulletsY, { width: pageW - 140 });
        bulletsY += doc.heightOfString(bullet, { width: pageW - 140 }) + 12;
      }
    }
  }

  /**
   * Quote slide — 2 variants
   * A: Dark bg, accent-bordered panel, large translucent quote mark
   * B: Light bg, header band, white card with accent bar
   */
  renderPdfQuoteSlide(doc, data, theme, pageW, pageH, variantIndex = 0) {
    const variant = variantIndex % 2;

    if (variant === 0) {
      // Variant A: Dark bg + accent-bordered panel + large quote mark
      this.addPdfLeftAccentBar(doc, 26, 0, pageH, theme.colors.accent_color);

      // Bordered panel
      doc.roundedRect(80, 70, pageW - 160, pageH - 160, 8)
        .lineWidth(1.5)
        .stroke(theme.colors.accent_color);

      // Large translucent quote mark
      doc.save();
      doc.opacity(0.25);
      this.drawPdfIcon(doc, 'quote', 90, 40, 120, theme.colors.accent_color, { width: 200 });
      doc.restore();

      // Quote text
      doc.font('Times-Italic')
        .fontSize(20)
        .fillColor(theme.colors.text_light)
        .text(data.quote || '', 130, pageH * 0.25, {
          width: pageW - 260,
          align: 'center'
        });

      // Separator
      doc.rect(pageW / 2 - 60, pageH * 0.62, 120, 3).fill(theme.colors.accent_color);

      // Attribution
      if (data.attribution) {
        doc.font('Helvetica')
          .fontSize(13)
          .fillColor(theme.colors.accent_color)
          .text(`\u2014 ${data.attribution}`, 130, pageH * 0.66, {
            width: pageW - 260,
            align: 'right'
          });
      }

    } else {
      // Variant B: Light bg + header band + white card with accent bar
      const heading = data.heading || data.attribution || 'Notable Quote';
      // Redraw light bg since quote is normally dark
      doc.rect(0, 0, pageW, pageH).fill(theme.colors.light_bg);
      this.addPdfHeaderBand(doc, heading, theme, pageW);

      // White card with accent bar
      this.addPdfCardPanel(doc, 36, 100, pageW - 72, 220, theme);
      this.addPdfLeftAccentBar(doc, 36, 100, 220, theme.colors.accent_color);

      // Quote text inside card
      doc.font('Times-Italic')
        .fontSize(18)
        .fillColor(theme.colors.text_dark)
        .text(data.quote || '', 70, 130, {
          width: pageW - 150
        });

      // Attribution below card
      if (data.attribution) {
        doc.font('Helvetica')
          .fontSize(12)
          .fillColor(theme.colors.text_muted)
          .text(`\u2014 ${data.attribution}`, 70, 340, {
            width: pageW - 150,
            align: 'right'
          });
      }
    }
  }

  /**
   * Statistics slide — 2 variants
   * A: Header band + white cards with accent top borders
   * B: Colored-fill cards alternating primary/accent
   */
  renderPdfStatisticsSlide(doc, data, theme, pageW, pageH, variantIndex = 0) {
    const variant = variantIndex % 2;
    const stats = data.stats || [];
    const count = Math.min(stats.length, 4);
    if (count === 0) return;

    this.addPdfHeaderBand(doc, data.heading || 'Key Statistics', theme, pageW);

    const totalWidth = pageW - 100;
    const gap = 16;
    const cardW = (totalWidth - gap * (count - 1)) / count;
    const cardY = 110;
    const cardH = pageH - 140;

    if (variant === 0) {
      // Variant A: White cards with accent top border
      for (let i = 0; i < count; i++) {
        const stat = stats[i];
        const xPos = 50 + i * (cardW + gap);

        this.addPdfCardPanel(doc, xPos, cardY, cardW, cardH, theme);

        doc.font('Times-Bold')
          .fontSize(34)
          .fillColor(theme.colors.accent_color)
          .text(stat.value || '', xPos + 10, cardY + 60, {
            width: cardW - 20,
            align: 'center'
          });

        doc.font('Helvetica')
          .fontSize(12)
          .fillColor(theme.colors.text_dark)
          .text(stat.label || '', xPos + 10, cardY + 120, {
            width: cardW - 20,
            align: 'center'
          });
      }
    } else {
      // Variant B: Colored-fill cards alternating primary/accent
      for (let i = 0; i < count; i++) {
        const stat = stats[i];
        const xPos = 50 + i * (cardW + gap);
        const fillColor = i % 2 === 1 ? theme.colors.accent_color : theme.colors.primary_color;

        doc.roundedRect(xPos, cardY, cardW, cardH, 6).fill(fillColor);

        doc.font('Times-Bold')
          .fontSize(34)
          .fillColor('#FFFFFF')
          .text(stat.value || '', xPos + 10, cardY + 60, {
            width: cardW - 20,
            align: 'center'
          });

        doc.font('Helvetica')
          .fontSize(12)
          .fillColor('#FFFFFF')
          .text(stat.label || '', xPos + 10, cardY + 120, {
            width: cardW - 20,
            align: 'center'
          });
      }
    }
  }

  /**
   * Summary slide — 2 variants
   * A: Dark bg, centered icon + title, white card with checkmarks, CTA footer
   * B: Dark bg, accent bar + heading, white bullets, accent CTA button
   */
  renderPdfSummarySlide(doc, data, theme, pageW, pageH, variantIndex = 0) {
    const variant = variantIndex % 2;
    const takeaways = data.takeaways || [];

    if (variant === 0) {
      // Variant A: Centered icon + large title + white card panel
      this.drawPdfIcon(doc, 'summary', 0, 20, 30, theme.colors.text_light, { width: pageW, align: 'center' });

      doc.font('Times-Bold')
        .fontSize(30)
        .fillColor(theme.colors.text_light)
        .text(data.heading || 'Key Takeaways', 60, 65, {
          width: pageW - 120,
          align: 'center'
        });

      // White card panel
      const cardY = 120;
      const cardH = pageH - 200;
      this.addPdfCardPanel(doc, 60, cardY, pageW - 120, cardH, theme);

      let yPos = cardY + 20;
      for (const takeaway of takeaways) {
        // Draw checkmark icon, then text in Helvetica
        this.drawPdfIcon(doc, 'summary', 85, yPos, 14, theme.colors.accent_color, { width: 20 });
        doc.font('Helvetica')
          .fontSize(14)
          .fillColor(theme.colors.text_dark)
          .text(takeaway, 108, yPos, { width: pageW - 200 });
        yPos += doc.heightOfString(takeaway, { width: pageW - 200 }) + 10;
      }

      // CTA as italic accent footer
      if (data.call_to_action) {
        doc.font('Times-Italic')
          .fontSize(14)
          .fillColor(theme.colors.accent_color)
          .text(data.call_to_action, 60, pageH - 60, {
            width: pageW - 120,
            align: 'center'
          });
      }

    } else {
      // Variant B: Left accent bar + heading + takeaways + accent CTA button
      this.addPdfLeftAccentBar(doc, 44, 30, pageH - 60, theme.colors.accent_color);

      doc.font('Times-Bold')
        .fontSize(24)
        .fillColor(theme.colors.text_light)
        .text(data.heading || 'Key Takeaways', 70, 35, {
          width: pageW - 140
        });

      doc.rect(70, 70, 100, 4).fill(theme.colors.accent_color);

      let yPos = 95;
      for (const takeaway of takeaways) {
        doc.circle(80, yPos + 8, 3).fill(theme.colors.accent_color);
        doc.font('Helvetica')
          .fontSize(14)
          .fillColor(theme.colors.text_light)
          .text(takeaway, 94, yPos, { width: pageW - 170 });
        yPos += doc.heightOfString(takeaway, { width: pageW - 170 }) + 10;
      }

      // CTA button
      if (data.call_to_action) {
        const ctaY = pageH - 80;
        const ctaW = pageW - 200;
        doc.roundedRect(100, ctaY, ctaW, 40, 6).fill(theme.colors.accent_color);
        doc.font('Helvetica-Bold')
          .fontSize(14)
          .fillColor('#FFFFFF')
          .text(data.call_to_action, 100, ctaY + 12, {
            width: ctaW,
            align: 'center'
          });
      }
    }
  }

  /**
   * Two-column slide — 2 variants
   * A: Header band + two white cards with icons
   * B: Two colored-fill cards (primary/accent) with white text
   */
  renderPdfTwoColumnSlide(doc, data, theme, pageW, pageH, variantIndex = 0) {
    const variant = variantIndex % 2;

    this.addPdfHeaderBand(doc, data.heading || '', theme, pageW);

    const cardY = 100;
    const cardH = pageH - 130;
    const gap = 16;
    const cardW = (pageW - 100 - gap) / 2;
    const leftX = 50;
    const rightX = 50 + cardW + gap;

    if (variant === 0) {
      // Variant A: Two white cards with icons above titles
      this.addPdfCardPanel(doc, leftX, cardY, cardW, cardH, theme);
      this.addPdfCardPanel(doc, rightX, cardY, cardW, cardH, theme);

      // Left icon + title
      this.drawPdfIcon(doc, 'two_column', leftX, cardY + 15, 22, theme.colors.accent_color, { width: cardW, align: 'center' });
      if (data.left_title) {
        doc.font('Helvetica-Bold')
          .fontSize(14)
          .fillColor(theme.colors.accent_color)
          .text(data.left_title, leftX + 15, cardY + 50, { width: cardW - 30, align: 'center' });
      }

      // Right icon + title
      this.drawPdfIcon(doc, 'two_column', rightX, cardY + 15, 22, theme.colors.primary_color, { width: cardW, align: 'center' });
      if (data.right_title) {
        doc.font('Helvetica-Bold')
          .fontSize(14)
          .fillColor(theme.colors.primary_color)
          .text(data.right_title, rightX + 15, cardY + 50, { width: cardW - 30, align: 'center' });
      }

      // Left items
      let leftY = cardY + 80;
      for (const item of (data.left_items || [])) {
        doc.circle(leftX + 22, leftY + 7, 3).fill(theme.colors.accent_color);
        doc.font('Helvetica')
          .fontSize(12)
          .fillColor(theme.colors.text_dark)
          .text(item, leftX + 34, leftY, { width: cardW - 50 });
        leftY += doc.heightOfString(item, { width: cardW - 50 }) + 8;
      }

      // Right items
      let rightY = cardY + 80;
      for (const item of (data.right_items || [])) {
        doc.circle(rightX + 22, rightY + 7, 3).fill(theme.colors.primary_color);
        doc.font('Helvetica')
          .fontSize(12)
          .fillColor(theme.colors.text_dark)
          .text(item, rightX + 34, rightY, { width: cardW - 50 });
        rightY += doc.heightOfString(item, { width: cardW - 50 }) + 8;
      }

    } else {
      // Variant B: Two colored-fill cards
      doc.roundedRect(leftX, cardY, cardW, cardH, 6).fill(theme.colors.primary_color);
      doc.roundedRect(rightX, cardY, cardW, cardH, 6).fill(theme.colors.accent_color);

      // Left title
      if (data.left_title) {
        doc.font('Helvetica-Bold')
          .fontSize(15)
          .fillColor('#FFFFFF')
          .text(data.left_title, leftX + 15, cardY + 20, { width: cardW - 30, align: 'center' });
      }
      // Right title
      if (data.right_title) {
        doc.font('Helvetica-Bold')
          .fontSize(15)
          .fillColor('#FFFFFF')
          .text(data.right_title, rightX + 15, cardY + 20, { width: cardW - 30, align: 'center' });
      }

      // Left items (white text)
      let leftY = cardY + 55;
      for (const item of (data.left_items || [])) {
        doc.font('Helvetica')
          .fontSize(12)
          .fillColor('#FFFFFF')
          .text(item, leftX + 20, leftY, { width: cardW - 40, align: 'center' });
        leftY += doc.heightOfString(item, { width: cardW - 40 }) + 8;
      }

      // Right items (white text)
      let rightY = cardY + 55;
      for (const item of (data.right_items || [])) {
        doc.font('Helvetica')
          .fontSize(12)
          .fillColor('#FFFFFF')
          .text(item, rightX + 20, rightY, { width: cardW - 40, align: 'center' });
        rightY += doc.heightOfString(item, { width: cardW - 40 }) + 8;
      }
    }
  }

  /**
   * Table slide — header band + table with dark header row, alternating row colors
   */
  renderPdfTableSlide(doc, data, theme, pageW, pageH) {
    this.addPdfHeaderBand(doc, data.heading || '', theme, pageW);

    const headers = data.headers || [];
    const rows = data.rows || [];
    if (headers.length === 0) return;

    const tableX = 50;
    const tableW = pageW - 100;
    const colW = tableW / headers.length;
    const rowH = 32;
    let yPos = 105;

    // Header row — dark bg
    doc.rect(tableX, yPos, tableW, rowH).fill(theme.colors.dark_bg);
    for (let i = 0; i < headers.length; i++) {
      doc.font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#FFFFFF')
        .text(headers[i], tableX + i * colW + 6, yPos + 8, {
          width: colW - 12,
          align: 'center'
        });
    }
    yPos += rowH;

    // Data rows with alternating colors
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const fillColor = r % 2 === 0 ? theme.colors.light_bg : theme.colors.card_bg;
      doc.rect(tableX, yPos, tableW, rowH).fill(fillColor);

      // Cell borders
      doc.save();
      doc.lineWidth(0.5).strokeColor('#CBD5E0');
      doc.rect(tableX, yPos, tableW, rowH).stroke();
      for (let i = 1; i < headers.length; i++) {
        doc.moveTo(tableX + i * colW, yPos).lineTo(tableX + i * colW, yPos + rowH).stroke();
      }
      doc.restore();

      for (let i = 0; i < headers.length; i++) {
        doc.font('Helvetica')
          .fontSize(10)
          .fillColor(theme.colors.text_dark)
          .text((row[i] || ''), tableX + i * colW + 6, yPos + 8, {
            width: colW - 12,
            align: 'center'
          });
      }
      yPos += rowH;
      if (yPos > pageH - 40) break; // Prevent overflow
    }
  }

  /**
   * Image placeholder slide — header band + white card + dashed accent border + icon
   */
  renderPdfImagePlaceholderSlide(doc, data, theme, pageW, pageH) {
    this.addPdfHeaderBand(doc, data.heading || '', theme, pageW);

    // White card panel
    this.addPdfCardPanel(doc, 100, 110, pageW - 200, pageH - 190, theme);

    // Dashed border inner area
    doc.roundedRect(130, 140, pageW - 260, pageH - 260, 6)
      .lineWidth(1.5)
      .dash(6, { space: 4 })
      .stroke(theme.colors.accent_color);
    doc.undash();

    // Placeholder icon
    doc.save();
    doc.opacity(0.4);
    this.drawPdfIcon(doc, 'image_placeholder', 0, pageH * 0.3, 48, theme.colors.text_muted, { width: pageW, align: 'center' });
    doc.restore();

    // Description text
    doc.font('Helvetica')
      .fontSize(13)
      .fillColor(theme.colors.text_muted)
      .text(data.image_description || '[Image Placeholder]', 150, pageH * 0.52, {
        width: pageW - 300,
        align: 'center'
      });

    // Caption
    if (data.caption) {
      doc.font('Helvetica-Oblique')
        .fontSize(11)
        .fillColor(theme.colors.text_muted)
        .text(data.caption, 130, pageH - 100, {
          width: pageW - 260,
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
