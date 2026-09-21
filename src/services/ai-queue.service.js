const PQueue = require('p-queue').default || require('p-queue');
const { logger } = require('../utils');

/**
 * AI Queue Service
 *
 * Provides two global concurrency gates shared across the whole process so that
 * no matter how many videos a user imports, outbound work stays bounded:
 *
 *  1. aiQueue    - every outbound AI generation call funnels through this gate.
 *                  Caps total simultaneous provider calls (Gemini/OpenAI/Claude)
 *                  regardless of how many videos are processing, which prevents
 *                  the "429 Too Many Requests / quota exceeded" blowout that
 *                  happened when ~58 calls fired at once for a 29-video batch.
 *                  On a 429 the whole queue can be paused for the provider's
 *                  Retry-After window via pauseFor().
 *
 *  2. videoQueue - caps how many per-video pipelines (transcript + content
 *                  generation) run at once, so the app stages videos as
 *                  "queued -> processing" instead of firing them all at once.
 *
 *  3. token budget - a sliding-window limiter on Gemini INPUT tokens per minute.
 *                  Concurrency alone can't respect the provider quota
 *                  (GenerateContentPaidTierInputTokensPerModelPerMinute = 1,000,000/min)
 *                  because a single content-generation call can carry ~150k
 *                  transcript tokens. reserveTokens() paces calls so the trailing
 *                  60s never exceeds the budget, which is the guaranteed fix for
 *                  the token-per-minute 429 blowout.
 *
 * All limits are env-driven with safe defaults so they can be tuned without
 * code changes.
 */

const AI_MAX_CONCURRENCY = parseInt(process.env.AI_MAX_CONCURRENCY, 10) || 3;
const AI_MAX_PER_MINUTE = parseInt(process.env.AI_MAX_PER_MINUTE, 10) || 0; // 0 = disabled
const VIDEO_MAX_CONCURRENCY = parseInt(process.env.VIDEO_MAX_CONCURRENCY, 10) || 2;
// Input tokens per minute budget (headroom under the 1,000,000/min Gemini quota)
const AI_TOKENS_PER_MINUTE = parseInt(process.env.AI_TOKENS_PER_MINUTE, 10) || 800000;
const TOKEN_WINDOW_MS = 60000;

class AIQueueService {
  constructor() {
    const aiQueueOptions = { concurrency: AI_MAX_CONCURRENCY };

    // Optional per-minute rate cap (respects token-per-minute quotas)
    if (AI_MAX_PER_MINUTE > 0) {
      aiQueueOptions.interval = 60000;
      aiQueueOptions.intervalCap = AI_MAX_PER_MINUTE;
    }

    this.aiQueue = new PQueue(aiQueueOptions);
    this.videoQueue = new PQueue({ concurrency: VIDEO_MAX_CONCURRENCY });

    // Rate-limit pause bookkeeping (guards against overlapping pauses)
    this._resumeTimer = null;
    this._pausedUntil = 0;

    // Sliding-window token accounting: events in the trailing TOKEN_WINDOW_MS
    this._tokenEvents = []; // [{ t: epochMs, tokens: number }]
    this._tokensUsed = 0;   // running sum of _tokenEvents[].tokens

    logger.info(
      `AI queue initialized: aiConcurrency=${AI_MAX_CONCURRENCY}, ` +
      `perMinute=${AI_MAX_PER_MINUTE > 0 ? AI_MAX_PER_MINUTE : 'unlimited'}, ` +
      `tokensPerMinute=${AI_TOKENS_PER_MINUTE}, ` +
      `videoConcurrency=${VIDEO_MAX_CONCURRENCY}`
    );
  }

  /**
   * Rough token estimate from text length (~4 chars/token for English).
   * Matches observed data (600k chars transcript ≈ 150k tokens).
   * @param {...string} texts - one or more strings to include
   * @returns {number} estimated token count
   */
  estimateTokens(...texts) {
    const chars = texts.reduce((sum, t) => sum + (t ? String(t).length : 0), 0);
    return Math.ceil(chars / 4);
  }

  /**
   * Drop token events older than the sliding window and keep the running sum
   * in step. Returns the current epoch ms.
   */
  _pruneTokenEvents() {
    const now = Date.now();
    while (this._tokenEvents.length && now - this._tokenEvents[0].t >= TOKEN_WINDOW_MS) {
      this._tokensUsed -= this._tokenEvents[0].tokens;
      this._tokenEvents.shift();
    }
    if (this._tokensUsed < 0) this._tokensUsed = 0; // guard against float/reconcile drift
    return now;
  }

  /**
   * Reserve input-token budget before a Gemini call, awaiting until the
   * trailing-60s usage plus this reservation fits under AI_TOKENS_PER_MINUTE.
   * A single call larger than the whole budget is clamped so it still runs once
   * the window clears (never deadlocks).
   * @param {number} estTokens - estimated input tokens for the call
   */
  async reserveTokens(estTokens) {
    const budget = AI_TOKENS_PER_MINUTE;
    const want = Math.max(0, Math.min(estTokens || 0, budget)); // clamp to budget

    for (;;) {
      const now = this._pruneTokenEvents();

      if (this._tokensUsed + want <= budget) {
        const event = { t: now, tokens: want };
        this._tokenEvents.push(event);
        this._tokensUsed += want;
        return event; // handle for reconcileTokens
      }

      // Wait until enough of the oldest events age out to fit `want`.
      const need = this._tokensUsed + want - budget;
      let freed = 0;
      let resumeAt = now + TOKEN_WINDOW_MS;
      for (const e of this._tokenEvents) {
        freed += e.tokens;
        if (freed >= need) {
          resumeAt = e.t + TOKEN_WINDOW_MS;
          break;
        }
      }
      const waitMs = Math.max(50, resumeAt - now + 50);
      logger.debug(`Token budget full (${this._tokensUsed}/${budget}); waiting ~${Math.round(waitMs / 1000)}s`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  /**
   * Correct a reservation once the real input-token count is known (from
   * usageMetadata), so estimate drift self-corrects within the window. Takes
   * the handle returned by reserveTokens so it adjusts the RIGHT event even when
   * many calls interleave. No-op if that event already aged out of the window.
   * @param {Object} eventHandle - the object returned by reserveTokens
   * @param {number} actualTokens - measured input tokens actually billed
   */
  reconcileTokens(eventHandle, actualTokens) {
    if (!eventHandle || typeof actualTokens !== 'number' || Number.isNaN(actualTokens)) return;
    const actual = Math.max(0, Math.min(actualTokens, AI_TOKENS_PER_MINUTE));
    const delta = actual - eventHandle.tokens;
    if (delta === 0) return;

    // Only adjust if the event is still within the sliding window
    const idx = this._tokenEvents.indexOf(eventHandle);
    if (idx === -1) return; // aged out; no longer affects the budget

    eventHandle.tokens += delta;
    this._tokensUsed += delta;
    if (this._tokensUsed < 0) this._tokensUsed = 0;
  }

  /**
   * Enqueue an outbound AI generation call through the global AI gate.
   * @param {Function} fn - async function performing the AI call
   * @param {Object} [opts] - p-queue options (e.g. { priority })
   * @returns {Promise<*>} resolves with fn's result
   */
  runAI(fn, opts = {}) {
    return this.aiQueue.add(fn, opts);
  }

  /**
   * Enqueue a per-video processing pipeline through the video gate.
   * @param {Function} fn - async function performing the video pipeline
   * @param {Object} [opts] - p-queue options (e.g. { priority })
   * @returns {Promise<*>} resolves with fn's result
   */
  runVideo(fn, opts = {}) {
    return this.videoQueue.add(fn, opts);
  }

  /**
   * Globally pause the AI queue for the given duration so ALL in-flight
   * workers back off together after a 429, then auto-resume. If a longer
   * pause is already scheduled it is kept; a longer requested pause extends it.
   * @param {number} ms - pause duration in milliseconds
   */
  pauseFor(ms) {
    if (!ms || ms <= 0) return;

    const now = Date.now();
    const resumeAt = now + ms;

    // Already paused for at least as long - nothing to extend
    if (resumeAt <= this._pausedUntil) {
      return;
    }

    this._pausedUntil = resumeAt;

    if (!this.aiQueue.isPaused) {
      this.aiQueue.pause();
    }
    logger.warn(`AI queue paused for ~${Math.round(ms / 1000)}s due to provider rate limit (429)`);

    if (this._resumeTimer) {
      clearTimeout(this._resumeTimer);
    }
    this._resumeTimer = setTimeout(() => {
      this.aiQueue.start();
      this._pausedUntil = 0;
      this._resumeTimer = null;
      logger.info('AI queue resumed after rate-limit pause');
    }, this._pausedUntil - now);
  }

  /**
   * Snapshot of queue depth/activity (useful for logging/diagnostics).
   */
  getStats() {
    this._pruneTokenEvents();
    return {
      ai: {
        size: this.aiQueue.size,
        pending: this.aiQueue.pending,
        isPaused: this.aiQueue.isPaused
      },
      video: {
        size: this.videoQueue.size,
        pending: this.videoQueue.pending
      },
      tokens: {
        usedLastMinute: this._tokensUsed,
        budget: AI_TOKENS_PER_MINUTE
      }
    };
  }
}

module.exports = new AIQueueService();
