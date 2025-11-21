/**
 * Prompt Sanitization Utility
 *
 * Prevents prompt injection attacks by sanitizing user-generated content
 * before it's included in AI prompts.
 */

class PromptSanitizer {
    constructor() {
        // Common prompt injection patterns to neutralize
        this.injectionPatterns = [
            // System/Role instruction patterns (including multilingual)
            /(?:^|\n)(?:system|user|assistant|human|ai|システム|ユーザー|アシスタント):\s*/gi,

            // Common instruction markers
            /\[INST\]|\[\/INST\]/gi,
            /<<SYS>>|<\/SYS>>/gi,
            /\[SYSTEM\]|\[\/SYSTEM\]/gi,
            /\[USER\]|\[\/USER\]/gi,
            /\[ASSISTANT\]|\[\/ASSISTANT\]/gi,

            // Prompt override attempts
            /ignore\s+(?:previous|all|above|prior)\s+(?:instructions|prompts|commands)/gi,
            /forget\s+(?:everything|all|previous|above)/gi,
            /new\s+(?:instructions|prompt|task|role)/gi,
            /instead\s+(?:of|do|follow)/gi,

            // Role switching attempts (more comprehensive)
            /(?:now\s+)?(?:you\s+are|act\s+as|pretend\s+to\s+be|roleplay\s+as)\s+(?:a\s+)?(?:different|new|another|hacker|admin)/gi,
            /(?:stop\s+being|no\s+longer)\s+(?:an?\s+)?(?:assistant|ai|chatbot)/gi,
            /now\s+you\s+are\s+(?:a\s+)?(?:different|new|hacker|admin)/gi,

            // Direct instruction overrides
            /^\s*(?:assistant|ai|chatbot|system)[:,]\s*/gi,
            /^\s*(?:ignore|disregard|override)\s+/gi,

            // Template injection attempts
            /\{\{\s*(?:system|prompt|instruction|override)\s*\}\}/gi,
            /%\s*(?:system|prompt|instruction|override)\s*%/gi,

            // Markdown/HTML injection
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            /<[^>]*(?:on\w+\s*=|javascript:)[^>]*>/gi,
        ];

        // Additional security patterns for extra safety
        this.suspiciousPatterns = [
            // Command execution attempts
            /(?:exec|eval|system|shell|cmd|command)\s*\(/gi,

            // Data extraction attempts
            /(?:show|display|print|output|reveal|expose)\s+(?:prompt|system|internal|hidden|secret)/gi,

            // Model manipulation
            /(?:temperature|top_p|max_tokens|model|engine)\s*[=:]/gi,
        ];
    }

    /**
     * Sanitize transcript content for safe inclusion in AI prompts
     * @param {string} transcript - Raw transcript text
     * @param {Object} options - Sanitization options
     * @returns {string} - Sanitized transcript
     */
    sanitizeTranscript(transcript, options = {}) {
        if (!transcript || typeof transcript !== 'string') {
            return '';
        }

        const {
            maxLength = 600000,       // Increased limit for longer transcripts
            preserveFormatting = true, // Keep basic formatting
            strictMode = false        // Enable extra strict sanitization
        } = options;

        let sanitized = transcript.trim();

        // Step 1: Length limiting (prevent overwhelming the model)
        if (sanitized.length > maxLength) {
            sanitized = sanitized.substring(0, maxLength) + '... [content truncated for safety]';
        }

        // Step 2: Remove or neutralize injection patterns
        this.injectionPatterns.forEach(pattern => {
            sanitized = sanitized.replace(pattern, (match) => {
                // Replace with safe equivalent that doesn't preserve the original
                return `[SANITIZED: ${match.trim().replace(/[:<>[\]]/g, '').substring(0, 20)}]`;
            });
        });

        // Step 3: Handle suspicious patterns
        if (strictMode) {
            this.suspiciousPatterns.forEach(pattern => {
                sanitized = sanitized.replace(pattern, '[SUSPICIOUS CONTENT REMOVED]');
            });
        }

        // Step 4: Escape template variables that could be misinterpreted
        sanitized = sanitized.replace(/\{\{([^}]+)\}\}/g, '&#123;&#123;$1&#125;&#125;');
        sanitized = sanitized.replace(/%([A-Z_]+)%/g, '&#37;$1&#37;');

        // Step 5: Clean up excessive whitespace but preserve structure
        if (preserveFormatting) {
            sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
        } else {
            sanitized = sanitized.replace(/\s+/g, ' ');
        }

        // Step 6: Add safety wrapper for extra protection
        return this.wrapSafeContent(sanitized);
    }

    /**
     * Wrap content in a safe container to clearly mark it as user content
     * @param {string} content - Content to wrap
     * @returns {string} - Wrapped content
     */
    wrapSafeContent(content) {
        return `[BEGIN USER_TRANSCRIPT]\n${content}\n[END USER_TRANSCRIPT]`;
    }

    /**
     * Validate that a prompt template is safe for processing
     * @param {string} promptTemplate - The prompt template to validate
     * @returns {Object} - Validation result with isValid and warnings
     */
    validatePromptTemplate(promptTemplate) {
        const warnings = [];
        let isValid = true;

        // Check for dynamic code execution
        if (/\$\{[^}]*(?:eval|exec|require|import)[^}]*\}/gi.test(promptTemplate)) {
            warnings.push('Template contains potentially dangerous dynamic code execution');
            isValid = false;
        }

        // Check for unsafe template variables (both ${VAR} and [INSERT VAR HERE] formats)
        const templateVarsDollar = promptTemplate.match(/\$\{([^}]+)\}/g);
        const templateVarsBracket = promptTemplate.match(/\[INSERT\s+([^]]+?)\s+HERE\]/gi);

        if (templateVarsDollar) {
            templateVarsDollar.forEach(variable => {
                if (!/^\$\{(?:TRANSCRIPT|VIDEO_ID|TITLE|DESCRIPTION)\}$/.test(variable)) {
                    warnings.push(`Unexpected template variable found: ${variable}`);
                }
            });
        }

        if (templateVarsBracket) {
            templateVarsBracket.forEach(variable => {
                if (!/^\[INSERT\s+(?:TRANSCRIPT|VIDEO_ID|TITLE|DESCRIPTION)\s+HERE\]$/i.test(variable)) {
                    warnings.push(`Unexpected template variable found: ${variable}`);
                }
            });
        }

        return { isValid, warnings };
    }

    /**
     * Safe template processing with additional security
     * @param {string} template - Prompt template
     * @param {Object} variables - Variables to substitute
     * @returns {string} - Processed template
     */
    processTemplate(template, variables = {}) {
        // Validate template first
        const validation = this.validatePromptTemplate(template);
        if (!validation.isValid) {
            throw new Error(`Unsafe template: ${validation.warnings.join(', ')}`);
        }

        // Sanitize all variables before substitution
        const sanitizedVars = {};
        for (const [key, value] of Object.entries(variables)) {
            if (key === 'TRANSCRIPT') {
                sanitizedVars[key] = this.sanitizeTranscript(value, { strictMode: true });
            } else if (typeof value === 'string') {
                sanitizedVars[key] = this.sanitizeGenericContent(value);
            } else {
                sanitizedVars[key] = value;
            }
        }

        // Process template with sanitized variables
        let processed = template;
        for (const [key, value] of Object.entries(sanitizedVars)) {
            // Handle both ${VARIABLE} and [INSERT VARIABLE HERE] formats
            const placeholderDollar = `\${${key}}`;
            const placeholderBracket = `[INSERT ${key} HERE]`;

            processed = processed.replace(new RegExp(this.escapeRegex(placeholderDollar), 'g'), value);
            processed = processed.replace(new RegExp(this.escapeRegex(placeholderBracket), 'g'), value);
        }

        return processed;
    }

    /**
     * Sanitize generic content (titles, descriptions, etc.)
     * @param {string} content - Content to sanitize
     * @returns {string} - Sanitized content
     */
    sanitizeGenericContent(content) {
        if (!content || typeof content !== 'string') {
            return '';
        }

        return content
            .replace(/[<>]/g, '') // Remove potential HTML/XML
            .replace(/\{\{|\}\}/g, '') // Remove template markers
            .replace(/javascript:/gi, '') // Remove javascript: URLs
            .trim();
    }

    /**
     * Escape string for use in regex
     * @param {string} string - String to escape
     * @returns {string} - Escaped string
     */
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

module.exports = new PromptSanitizer();
