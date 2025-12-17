/**
 * ============================================================================
 * VECTHARE KEYWORD SYSTEM
 * ============================================================================
 * Keyword extraction and boosting for vector search.
 *
 * EXTRACTION LEVELS:
 *   - off: No auto-extraction, only manual/WI trigger keys
 *   - minimal: Title only (first line), max 3 keywords
 *   - balanced: Header area (first 300 chars), max 8 keywords
 *   - aggressive: Full text scan, max 15 keywords
 *
 * FREQUENCY-BASED WEIGHTING:
 *   Words that appear more often get higher weights.
 *   Formula: baseWeight + (frequency - minFreq) * 0.1
 *   Example: base 1.5x, word appears 5x (min 2) → 1.5 + (5-2)*0.1 = 1.8x
 *
 * BOOST MATH (Additive):
 *   Each keyword has a weight (e.g., 1.5x, 2.0x, 3.0x).
 *   The boost above 1.0 is added together:
 *     - "magic" (1.5x) + "divine" (2.0x) = 1 + 0.5 + 1.0 = 2.5x total boost
 *
 * @version 4.0.0
 * ============================================================================
 */

/** Extraction level configurations */
export const EXTRACTION_LEVELS = {
    off: {
        label: 'Off',
        description: 'No auto-extraction, only WI trigger keys',
        enabled: false,
    },
    minimal: {
        label: 'Minimal',
        description: 'First 500 chars, max 3 keywords',
        enabled: true,
        headerSize: 500,
        minFrequency: 1,
        maxKeywords: 3,
    },
    balanced: {
        label: 'Balanced',
        description: 'First 1000 chars, max 8 keywords',
        enabled: true,
        headerSize: 1000,
        minFrequency: 1,
        maxKeywords: 8,
    },
    aggressive: {
        label: 'Aggressive',
        description: 'Full text scan, max 15 keywords',
        enabled: true,
        headerSize: null, // null = full text
        minFrequency: 1,
        maxKeywords: 15,
    },
};

/** Default extraction level */
export const DEFAULT_EXTRACTION_LEVEL = 'balanced';

/** Default base weight for keywords */
export const DEFAULT_BASE_WEIGHT = 1.5;

/** Weight increment per frequency count above minimum */
const FREQUENCY_WEIGHT_INCREMENT = 0.1;

/** Maximum weight cap (prevent runaway weights) */
const MAX_KEYWORD_WEIGHT = 3.0;

/**
 * Common words that shouldn't be auto-extracted as keywords
 * Comprehensive English stopwords list
 */
const KEYWORD_STOP_WORDS = new Set([
    // Articles & determiners
    'the', 'a', 'an', 'this', 'that', 'these', 'those', 'some', 'any', 'each',
    'every', 'both', 'either', 'neither', 'such', 'what', 'which', 'whose',

    // Pronouns
    'i', 'me', 'my', 'mine', 'myself',
    'you', 'your', 'yours', 'yourself', 'yourselves',
    'he', 'him', 'his', 'himself',
    'she', 'her', 'hers', 'herself',
    'it', 'its', 'itself',
    'we', 'us', 'our', 'ours', 'ourselves',
    'they', 'them', 'their', 'theirs', 'themselves',
    'who', 'whom', 'whose', 'whoever', 'whomever',
    'someone', 'anyone', 'everyone', 'nobody', 'somebody', 'anybody', 'everybody',
    'something', 'anything', 'everything', 'nothing',

    // Conjunctions
    'and', 'or', 'but', 'nor', 'so', 'yet', 'for', 'because', 'although', 'though',
    'while', 'whereas', 'unless', 'until', 'since', 'once', 'when', 'whenever',
    'where', 'wherever', 'whether', 'if', 'then', 'than', 'that', 'as',

    // Prepositions
    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'into', 'onto',
    'upon', 'out', 'off', 'over', 'under', 'above', 'below', 'between', 'among',
    'through', 'during', 'before', 'after', 'behind', 'beside', 'besides',
    'beyond', 'within', 'without', 'about', 'around', 'against', 'along',
    'across', 'toward', 'towards', 'near', 'inside', 'outside',

    // Common verbs (be, have, do, modal)
    'be', 'am', 'is', 'are', 'was', 'were', 'been', 'being',
    'have', 'has', 'had', 'having',
    'do', 'does', 'did', 'doing', 'done',
    'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'can', 'could',
    'need', 'dare', 'ought', 'used',
    'get', 'gets', 'got', 'getting', 'gotten',
    'make', 'makes', 'made', 'making',
    'go', 'goes', 'went', 'going', 'gone',
    'come', 'comes', 'came', 'coming',
    'take', 'takes', 'took', 'taking', 'taken',
    'give', 'gives', 'gave', 'giving', 'given',
    'say', 'says', 'said', 'saying',
    'know', 'knows', 'knew', 'knowing', 'known',
    'think', 'thinks', 'thought', 'thinking',
    'see', 'sees', 'saw', 'seeing', 'seen',
    'want', 'wants', 'wanted', 'wanting',
    'use', 'uses', 'used', 'using',
    'find', 'finds', 'found', 'finding',
    'tell', 'tells', 'told', 'telling',
    'ask', 'asks', 'asked', 'asking',
    'seem', 'seems', 'seemed', 'seeming',
    'feel', 'feels', 'felt', 'feeling',
    'try', 'tries', 'tried', 'trying',
    'leave', 'leaves', 'left', 'leaving',
    'call', 'calls', 'called', 'calling',
    'keep', 'keeps', 'kept', 'keeping',
    'let', 'lets', 'letting',
    'begin', 'begins', 'began', 'beginning', 'begun',
    'show', 'shows', 'showed', 'showing', 'shown',
    'hear', 'hears', 'heard', 'hearing',
    'play', 'plays', 'played', 'playing',
    'run', 'runs', 'ran', 'running',
    'move', 'moves', 'moved', 'moving',
    'live', 'lives', 'lived', 'living',
    'believe', 'believes', 'believed', 'believing',
    'hold', 'holds', 'held', 'holding',
    'bring', 'brings', 'brought', 'bringing',
    'happen', 'happens', 'happened', 'happening',
    'write', 'writes', 'wrote', 'writing', 'written',
    'provide', 'provides', 'provided', 'providing',
    'sit', 'sits', 'sat', 'sitting',
    'stand', 'stands', 'stood', 'standing',
    'lose', 'loses', 'lost', 'losing',
    'pay', 'pays', 'paid', 'paying',
    'meet', 'meets', 'met', 'meeting',
    'include', 'includes', 'included', 'including',
    'continue', 'continues', 'continued', 'continuing',
    'set', 'sets', 'setting',
    'learn', 'learns', 'learned', 'learning',
    'change', 'changes', 'changed', 'changing',
    'lead', 'leads', 'led', 'leading',
    'understand', 'understands', 'understood', 'understanding',
    'watch', 'watches', 'watched', 'watching',
    'follow', 'follows', 'followed', 'following',
    'stop', 'stops', 'stopped', 'stopping',
    'create', 'creates', 'created', 'creating',
    'speak', 'speaks', 'spoke', 'speaking', 'spoken',
    'read', 'reads', 'reading',
    'allow', 'allows', 'allowed', 'allowing',
    'add', 'adds', 'added', 'adding',
    'spend', 'spends', 'spent', 'spending',
    'grow', 'grows', 'grew', 'growing', 'grown',
    'open', 'opens', 'opened', 'opening',
    'walk', 'walks', 'walked', 'walking',
    'win', 'wins', 'won', 'winning',
    'offer', 'offers', 'offered', 'offering',
    'remember', 'remembers', 'remembered', 'remembering',
    'consider', 'considers', 'considered', 'considering',
    'appear', 'appears', 'appeared', 'appearing',
    'buy', 'buys', 'bought', 'buying',
    'wait', 'waits', 'waited', 'waiting',
    'serve', 'serves', 'served', 'serving',
    'die', 'dies', 'died', 'dying',
    'send', 'sends', 'sent', 'sending',
    'expect', 'expects', 'expected', 'expecting',
    'build', 'builds', 'built', 'building',
    'stay', 'stays', 'stayed', 'staying',
    'fall', 'falls', 'fell', 'falling', 'fallen',
    'cut', 'cuts', 'cutting',
    'reach', 'reaches', 'reached', 'reaching',
    'kill', 'kills', 'killed', 'killing',
    'remain', 'remains', 'remained', 'remaining',

    // Adverbs
    'very', 'really', 'quite', 'just', 'only', 'even', 'also', 'still', 'already',
    'always', 'never', 'ever', 'often', 'sometimes', 'usually', 'rarely', 'seldom',
    'now', 'then', 'here', 'there', 'today', 'yesterday', 'tomorrow',
    'soon', 'later', 'early', 'late', 'again', 'once', 'twice',
    'much', 'more', 'most', 'less', 'least', 'well', 'better', 'best',
    'far', 'further', 'fast', 'hard', 'long', 'short', 'high', 'low',
    'almost', 'nearly', 'probably', 'perhaps', 'maybe', 'certainly', 'definitely',
    'however', 'therefore', 'thus', 'hence', 'otherwise', 'anyway', 'besides',
    'instead', 'rather', 'else', 'too', 'enough', 'especially', 'particularly',

    // Adjectives (very common/generic)
    'good', 'great', 'best', 'better', 'bad', 'worse', 'worst',
    'new', 'old', 'young', 'big', 'small', 'large', 'little', 'long', 'short',
    'high', 'low', 'same', 'different', 'other', 'another', 'next', 'last',
    'first', 'second', 'third', 'many', 'much', 'few', 'several', 'own',
    'certain', 'sure', 'true', 'real', 'right', 'wrong', 'able', 'possible',
    'likely', 'important', 'main', 'major', 'full', 'whole', 'general',

    // Numbers
    'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'hundred', 'thousand', 'million', 'billion', 'first', 'second', 'third',

    // Time-related
    'time', 'times', 'year', 'years', 'month', 'months', 'week', 'weeks',
    'day', 'days', 'hour', 'hours', 'minute', 'minutes', 'moment', 'moments',

    // Question words
    'how', 'why', 'what', 'when', 'where', 'which', 'who', 'whom', 'whose',

    // Other common words
    'thing', 'things', 'way', 'ways', 'place', 'places', 'part', 'parts',
    'case', 'cases', 'point', 'points', 'fact', 'facts', 'kind', 'kinds',
    'sort', 'sorts', 'type', 'types', 'form', 'forms', 'example', 'examples',
    'like', 'back', 'even', 'still', 'well', 'just', 'only', 'over',

    // Section headers / formatting (lorebook specific)
    'note', 'notes', 'warning', 'important', 'section', 'chapter',
    'biology', 'psychology', 'moves', 'worship', 'limitations',
    'manifestation', 'sustenance', 'perception', 'responsibility', 'tolerance', 'authority',
    'mythic', 'signature', 'foil',

    // RP/chat specific
    'character', 'characters', 'user', 'assistant', 'system', 'message', 'messages',
    'response', 'responses', 'reply', 'replies', 'chat', 'chats',
]);

/**
 * Extract keywords from a lorebook entry
 * @param {object} entry - Lorebook entry with key array
 * @returns {string[]} Array of keywords
 */
export function extractLorebookKeywords(entry) {
    if (!entry) return [];

    const keywords = [];

    // Primary keys (trigger words)
    if (Array.isArray(entry.key)) {
        entry.key.forEach(k => {
            if (k && typeof k === 'string' && k.trim()) {
                const normalized = k.trim().toLowerCase();
                // Filter out stop words - they're too common to be useful as keywords
                if (!KEYWORD_STOP_WORDS.has(normalized) && normalized.length >= 2) {
                    keywords.push(normalized);
                }
            }
        });
    }

    // Secondary keys
    if (Array.isArray(entry.keysecondary)) {
        entry.keysecondary.forEach(k => {
            if (k && typeof k === 'string' && k.trim()) {
                const normalized = k.trim().toLowerCase();
                // Filter out stop words
                if (!KEYWORD_STOP_WORDS.has(normalized) && normalized.length >= 2) {
                    keywords.push(normalized);
                }
            }
        });
    }

    return [...new Set(keywords)]; // Dedupe
}

/**
 * Extract keywords from plain text with configurable extraction level
 *
 * Returns keywords with frequency-based weights.
 * Higher frequency = higher weight (capped at MAX_KEYWORD_WEIGHT)
 *
 * @param {string} text - Text to extract from
 * @param {object} options - Extraction options
 * @param {string} options.level - Extraction level: 'off', 'minimal', 'balanced', 'aggressive'
 * @param {number} options.baseWeight - Base weight for keywords (default 1.5)
 * @returns {Array<{text: string, weight: number}>} Array of weighted keywords
 */
export function extractTextKeywords(text, options = {}) {
    if (!text || typeof text !== 'string') return [];

    const level = options.level || DEFAULT_EXTRACTION_LEVEL;
    const baseWeight = options.baseWeight || DEFAULT_BASE_WEIGHT;
    const config = EXTRACTION_LEVELS[level];

    // If extraction is disabled, return empty
    if (!config || !config.enabled) {
        return [];
    }

    // Step 1: Clean text - remove example citations and italics
    let cleanedText = text.replace(/\([^)]+\)/g, ' '); // Remove (parenthetical citations)
    cleanedText = cleanedText.replace(/\*[^*]+\*/g, ' '); // Remove *italicized examples*

    // Step 2: Determine scan area based on level
    const scanArea = config.headerSize
        ? cleanedText.substring(0, config.headerSize)
        : cleanedText;

    // Step 3: Extract and count words
    const topicWords = scanArea.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    const wordCounts = new Map();

    for (const word of topicWords) {
        if (KEYWORD_STOP_WORDS.has(word)) continue;
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }

    // Step 4: Filter by minimum frequency and build weighted keywords
    const weightedKeywords = [];

    for (const [word, count] of wordCounts) {
        if (count >= config.minFrequency) {
            // Calculate weight based on frequency
            // More occurrences = higher weight
            const frequencyBonus = (count - config.minFrequency) * FREQUENCY_WEIGHT_INCREMENT;
            const weight = Math.min(MAX_KEYWORD_WEIGHT, baseWeight + frequencyBonus);

            weightedKeywords.push({ text: word, weight, frequency: count });
        }
    }

    // Step 5: Extract compound terms (e.g., "divine/time", "time_god")
    const compoundMatches = scanArea.match(/\b\w+[/_]\w+\b/gi) || [];
    for (const compound of compoundMatches) {
        const normalized = compound.toLowerCase().replace(/[/_]/g, '_');
        if (normalized.length >= 4) {
            // Compound terms get a slight weight bonus
            weightedKeywords.push({
                text: normalized,
                weight: Math.min(MAX_KEYWORD_WEIGHT, baseWeight + 0.2),
                frequency: 1,
            });
        }
    }

    // Step 6: Sort by weight (highest first), dedupe, and limit
    const seen = new Set();
    const result = [];

    weightedKeywords.sort((a, b) => b.weight - a.weight);

    for (const kw of weightedKeywords) {
        if (!seen.has(kw.text)) {
            seen.add(kw.text);
            result.push(kw);
            if (result.length >= config.maxKeywords) break;
        }
    }

    if (result.length > 0) {
        console.debug(`[VectHare Keyword Extraction] Extracted text keywords (${level} level): [${result.map(k => `${k.text}(${k.weight.toFixed(2)}x, freq:${k.frequency})`).join(', ')}] from: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`);
    }

    return result;
}

/**
 * Simple string array version for backwards compatibility
 * @param {string} text - Text to extract from
 * @param {object} options - Extraction options
 * @returns {string[]} Array of keyword strings
 */
export function extractTextKeywordsSimple(text, options = {}) {
    return extractTextKeywords(text, options).map(kw => kw.text);
}

/**
 * Extract keywords from chat messages using proper noun detection
 * Finds capitalized words mid-sentence (names, places, etc.)
 *
 * @param {string} text - Chat message text
 * @param {object} options - Extraction options
 * @param {number} options.baseWeight - Base weight for keywords (default 1.5)
 * @param {number} options.maxKeywords - Maximum keywords to return (default 8)
 * @returns {Array<{text: string, weight: number}>} Array of weighted keywords
 */
export function extractChatKeywords(text, options = {}) {
    if (!text || typeof text !== 'string') return [];

    const baseWeight = options.baseWeight || DEFAULT_BASE_WEIGHT;
    const maxKeywords = options.maxKeywords || 8;

    const keywords = [];
    const seen = new Set();

    // Find capitalized words that aren't at sentence start
    // Looks for capital letter followed by lowercase, not preceded by sentence-ending punctuation
    const properNounRegex = /(?<![.!?]\s*)(?<=\s|^"|^'|^\*|"|'|\*)\b([A-Z][a-z]{2,})\b/g;
    let match;

    while ((match = properNounRegex.exec(text)) !== null) {
        const word = match[1].toLowerCase();

        // Skip common words that happen to be capitalized
        if (KEYWORD_STOP_WORDS.has(word)) continue;

        // Skip if already seen
        if (seen.has(word)) continue;
        seen.add(word);

        keywords.push({ text: word, weight: baseWeight });

        if (keywords.length >= maxKeywords) break;
    }

    if (keywords.length > 0) {
        console.debug(`[VectHare Keyword Extraction] Extracted chat keywords: [${keywords.map(k => `${k.text}(${k.weight.toFixed(2)}x)`).join(', ')}] from text: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`);
    }

    return keywords;
}

/**
 * Extract keywords using BM25/TF-IDF scoring
 * Finds the most distinctive and important words in a text by:
 * 1. Splitting text into sentences (mini-corpus)
 * 2. Calculating TF-IDF for each word
 * 3. Returning top-scoring words as keywords
 *
 * This is better than proper noun extraction because it finds
 * contextually important words, not just capitalized names.
 *
 * Respects extraction levels:
 * - minimal: First 100 chars, max 3 keywords, min freq 1
 * - balanced: First 300 chars, max 8 keywords, min freq 2
 * - aggressive: Full text, max 15 keywords, min freq 3
 *
 * @param {string} text - Text to extract keywords from
 * @param {object} options - Extraction options
 * @param {string} options.level - Extraction level: 'minimal', 'balanced', 'aggressive' (default: 'balanced')
 * @param {number} options.baseWeight - Base weight for keywords (default 1.5)
 * @param {number} options.maxKeywords - Override max keywords (uses level default if not set)
 * @param {number} options.minWordLength - Minimum word length (default 3)
 * @returns {Array<{text: string, weight: number, tfidf: number}>} Weighted keywords
 */
export function extractBM25Keywords(text, options = {}) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) return [];

    // Get extraction level config
    const level = options.level || DEFAULT_EXTRACTION_LEVEL;
    const config = EXTRACTION_LEVELS[level];

    // If extraction is disabled, return empty
    if (!config || !config.enabled) return [];

    const baseWeight = options.baseWeight || DEFAULT_BASE_WEIGHT;
    const maxKeywords = options.maxKeywords || config.maxKeywords || 8;
    const minFrequency = config.minFrequency || 1;
    const minWordLength = options.minWordLength || 3;

    // Apply header size limit (scan area)
    let scanText = text;
    if (config.headerSize && text.length > config.headerSize) {
        // For minimal/balanced, focus on the beginning of the text
        scanText = text.substring(0, config.headerSize);
        // Try to end at a word boundary
        const lastSpace = scanText.lastIndexOf(' ');
        if (lastSpace > config.headerSize * 0.8) {
            scanText = scanText.substring(0, lastSpace);
        }
    }

    // Split into sentences (mini-corpus for IDF calculation)
    const sentences = scanText
        .split(/[.!?\n]+/)
        .map(s => s.trim())
        .filter(s => s.length > 10); // Skip very short fragments

    if (sentences.length === 0) {
        // Fallback: treat whole text as one sentence
        sentences.push(scanText);
    }

    // Tokenize each sentence
    const tokenizeSentence = (s) => {
        return s
            .toLowerCase()
            .replace(/[^\w\s'-]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length >= minWordLength && !KEYWORD_STOP_WORDS.has(t));
    };

    const sentenceTokens = sentences.map(tokenizeSentence);

    // Calculate document frequency (how many sentences contain each word)
    const docFreq = new Map();
    for (const tokens of sentenceTokens) {
        const uniqueTokens = new Set(tokens);
        for (const token of uniqueTokens) {
            docFreq.set(token, (docFreq.get(token) || 0) + 1);
        }
    }

    // Calculate term frequency across entire scan area
    const allTokens = sentenceTokens.flat();
    const termFreq = new Map();
    for (const token of allTokens) {
        termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }

    // Calculate TF-IDF for each unique word
    const numSentences = sentences.length;
    const tfidfScores = [];

    for (const [word, tf] of termFreq.entries()) {
        // Skip words below minimum frequency threshold
        if (tf < minFrequency) continue;

        const df = docFreq.get(word) || 1;

        // IDF: log((N + 1) / (df + 1)) + 1 (smoothed to avoid log(0))
        const idf = Math.log((numSentences + 1) / (df + 1)) + 1;

        // TF-IDF score
        const tfidf = tf * idf;

        // Boost for capitalized words (likely proper nouns/names)
        // Check in original text to preserve case info
        const isCapitalized = text.includes(word.charAt(0).toUpperCase() + word.slice(1));
        const capitalBoost = isCapitalized ? 1.3 : 1.0;

        tfidfScores.push({
            text: word,
            tf: tf,
            idf: idf,
            tfidf: tfidf * capitalBoost,
            isCapitalized
        });
    }

    // Sort by TF-IDF score (highest first)
    tfidfScores.sort((a, b) => b.tfidf - a.tfidf);

    // Take top N and assign weights based on relative TF-IDF
    const topWords = tfidfScores.slice(0, maxKeywords);

    if (topWords.length === 0) return [];

    const maxTfidf = topWords[0].tfidf;
    const keywords = topWords.map(w => ({
        text: w.text,
        // Weight scales from baseWeight to baseWeight + 0.5 based on TF-IDF rank
        weight: baseWeight + (w.tfidf / maxTfidf) * 0.5,
        tfidf: w.tfidf
    }));

    if (keywords.length > 0) {
        console.debug(`[VectHare BM25 Keywords] Level=${level}, scanned ${scanText.length}/${text.length} chars, ${sentences.length} sentences → [${keywords.map(k => `${k.text}(${k.weight.toFixed(2)}x)`).join(', ')}]`);
    }

    return keywords;
}

/**
 * Normalize a keyword to { text, weight } format
 * Handles both string and object formats
 * @param {string|object} kw - Keyword (string or { text, weight })
 * @param {number} defaultWeight - Default weight for string keywords
 * @returns {{ text: string, weight: number }}
 */
function normalizeKeyword(kw, defaultWeight = DEFAULT_BASE_WEIGHT) {
    if (typeof kw === 'string') {
        return { text: kw.toLowerCase(), weight: defaultWeight };
    }
    if (kw && typeof kw === 'object' && kw.text) {
        return {
            text: kw.text.toLowerCase(),
            weight: typeof kw.weight === 'number' ? kw.weight : defaultWeight
        };
    }
    return null;
}

/**
 * Check if query contains a keyword
 * @param {string} query - Search query (lowercased)
 * @param {string} keyword - Keyword to check (lowercased)
 * @returns {boolean}
 */
function queryHasKeyword(query, keyword) {
    if (!query || !keyword) return false;
    return query.includes(keyword);
}

/**
 * Apply keyword boost to search results
 * Uses ADDITIVE math: boost = 1 + sum(weight - 1) for each matched keyword
 *
 * Examples:
 *   - Match "magic" (1.5x): boost = 1 + 0.5 = 1.5x
 *   - Match "magic" (1.5x) + "divine" (2.0x): boost = 1 + 0.5 + 1.0 = 2.5x
 *   - Match 7 keywords at 1.5x each: boost = 1 + (0.5 × 7) = 4.5x
 *
 * @param {Array} results - Search results [{text, score, keywords, ...}]
 * @param {string} query - The search query
 * @returns {Array} Results with boosted scores, sorted by score desc
 */
export function applyKeywordBoost(results, query) {
    if (!results || !Array.isArray(results) || !query) return results;

    const queryLower = query.toLowerCase();

    console.log(`[VectHare Keyword Boost] Starting keyword boost for query: "${query}"`);

    const boosted = results.map(result => {
        const rawKeywords = result.keywords || result.metadata?.keywords || [];
        const matchedKeywords = [];
        let boostSum = 0;

        for (const kw of rawKeywords) {
            const normalized = normalizeKeyword(kw);
            if (!normalized) continue;

            if (queryHasKeyword(queryLower, normalized.text)) {
                matchedKeywords.push(normalized);
                // Additive: add the boost portion (weight - 1.0)
                boostSum += (normalized.weight - 1.0);
            }
        }

        // Final boost: 1.0 + sum of all matched boosts
        const boost = 1.0 + boostSum;

        if (matchedKeywords.length > 0) {
            console.log(`[VectHare Keyword Boost] Result matched ${matchedKeywords.length} keyword(s): [${matchedKeywords.map(k => `${k.text}(${k.weight.toFixed(2)}x)`).join(', ')}] → boost: ${boost.toFixed(2)}x, score: ${result.score.toFixed(4)} → ${(result.score * boost).toFixed(4)}`);
        }

        return {
            ...result,
            score: result.score * boost,
            originalScore: result.score,
            keywordBoost: boost,
            matchedKeywords: matchedKeywords.map(k => k.text),
            matchedKeywordsWithWeights: matchedKeywords,
            keywordBoosted: matchedKeywords.length > 0,
        };
    });

    // Sort by boosted score
    boosted.sort((a, b) => b.score - a.score);

    const boostedCount = boosted.filter(r => r.keywordBoosted).length;
    console.log(`[VectHare Keyword Boost] Applied keyword boosts to ${boostedCount}/${boosted.length} results`);

    return boosted;
}

/**
 * Calculate overfetch amount for keyword boosting
 * We fetch more results than requested so boosted items can surface
 * @param {number} topK - Requested number of results
 * @returns {number} Amount to actually fetch
 */
export function getOverfetchAmount(topK) {
    // Fetch 2x the requested amount (min 10, max 100)
    return Math.min(100, Math.max(10, topK * 2));
}

/**
 * Apply keyword boosts and trim to requested topK
 * This is the main entry point for the query pipeline
 * @param {Array} results - Search results
 * @param {string} query - Search query
 * @param {number} topK - Number of results to return
 * @returns {Array} Boosted and trimmed results
 */
export function applyKeywordBoosts(results, query, topK) {
    const boosted = applyKeywordBoost(results, query);
    return boosted.slice(0, topK);
}
