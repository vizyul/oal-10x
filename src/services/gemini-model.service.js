const { GoogleGenAI } = require('@google/genai');
const { logger } = require('../utils');

/**
 * Gemini Model Service
 *
 * Resolves the latest GENERALLY-AVAILABLE Gemini Flash text model so the app
 * automatically tracks Google's newest flagship flash (e.g. gemini-3.5-flash
 * today, gemini-4-flash later) instead of a hardcoded version.
 *
 * Strategy:
 *   - AUTO (default): query the models API, keep plain GA "gemini-X.Y-flash"
 *     names (excludes -lite / -image / -preview / -tts / -latest / -001), and
 *     pick the highest version. Cached with a TTL; resolved at boot.
 *   - PINNED (GEMINI_MODEL_AUTO=false): always use process.env.GEMINI_MODEL.
 *   - Fallback chain if the API call fails: GEMINI_MODEL env -> hardcoded default.
 */

const HARDCODED_FALLBACK = 'gemini-2.5-flash';
const MODEL_CACHE_TTL_MS = parseInt(process.env.GEMINI_MODEL_CACHE_TTL_MS, 10) || (12 * 60 * 60 * 1000);
// Plain GA flash only: "gemini-2.5-flash", "gemini-3.5-flash", "gemini-4-flash"
const GA_FLASH_RE = /^gemini-(\d+)(?:\.(\d+))?-flash$/;

class GeminiModelService {
  constructor() {
    this.autoResolve = String(process.env.GEMINI_MODEL_AUTO || 'true').toLowerCase() !== 'false';
    this.envModel = process.env.GEMINI_MODEL || null;
    this._resolvedModel = null;
    this._resolvedAt = 0;
    this._resolving = null; // in-flight resolve promise (dedupe)
  }

  /**
   * Compare two "gemini-X.Y-flash" names by (major, minor). Returns the newer.
   */
  _isNewer(candidate, current) {
    if (!current) return true;
    const c = candidate.match(GA_FLASH_RE);
    const p = current.match(GA_FLASH_RE);
    if (!c) return false;
    if (!p) return true;
    const cMajor = parseInt(c[1], 10);
    const cMinor = parseInt(c[2] || '0', 10);
    const pMajor = parseInt(p[1], 10);
    const pMinor = parseInt(p[2] || '0', 10);
    if (cMajor !== pMajor) return cMajor > pMajor;
    return cMinor > pMinor;
  }

  /**
   * Query the models API and return the newest GA flash name, or null on failure.
   */
  async resolve() {
    if (!process.env.GOOGLE_AI_API_KEY) {
      return null;
    }
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
      const pager = await ai.models.list();

      let best = null;
      for await (const m of pager) {
        const name = (m.name || '').replace(/^models\//, '');
        if (!GA_FLASH_RE.test(name)) continue;

        // Must support text generation
        const methods = m.supportedActions || m.supportedGenerationMethods || [];
        if (methods.length && !methods.includes('generateContent')) continue;

        if (this._isNewer(name, best)) best = name;
      }

      if (best) {
        this._resolvedModel = best;
        this._resolvedAt = Date.now();
        logger.info(`Resolved latest GA Gemini Flash model: ${best}`);
        return best;
      }
      logger.warn('Gemini model resolve: no GA flash model matched; using fallback');
      return null;
    } catch (error) {
      logger.warn(`Gemini model resolve failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Resolve at startup (and refresh) without blocking callers. Safe to call
   * multiple times; dedupes concurrent resolves.
   */
  async warmUp() {
    if (!this.autoResolve) {
      logger.info(`Gemini model pinned via GEMINI_MODEL_AUTO=false: ${this.getTextModel()}`);
      return this.getTextModel();
    }
    if (this._resolving) return this._resolving;
    this._resolving = this.resolve().finally(() => { this._resolving = null; });
    return this._resolving;
  }

  /**
   * Get the model to use for Gemini TEXT generation (synchronous).
   * Fallback chain: pin -> resolved-latest -> env -> hardcoded default.
   * Triggers a non-blocking background refresh when the cache is stale.
   */
  getTextModel() {
    // Explicit pin wins
    if (!this.autoResolve) {
      return this.envModel || HARDCODED_FALLBACK;
    }

    const fresh = this._resolvedModel && (Date.now() - this._resolvedAt < MODEL_CACHE_TTL_MS);
    if (!fresh && !this._resolving) {
      // Refresh in the background; do not block this call
      this.warmUp().catch(() => {});
    }

    return this._resolvedModel || this.envModel || HARDCODED_FALLBACK;
  }
}

module.exports = new GeminiModelService();
