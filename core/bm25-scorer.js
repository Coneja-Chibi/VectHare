/**
 * ============================================================================
 * BM25 KEYWORD SCORING
 * ============================================================================
 * Implementation of BM25 (Best Match 25) algorithm for keyword-based scoring
 * Based on Langchain's BM25 retriever approach
 *
 * BM25 is a probabilistic ranking function that scores documents based on:
 * - Term frequency (TF): how often a term appears in a document
 * - Inverse document frequency (IDF): how rare/common a term is across all documents
 * - Document length normalization: adjusts for varying document lengths
 *
 * @version 1.0.0
 * ============================================================================
 */

/**
 * Default BM25 parameters
 * k1: Term frequency saturation parameter (1.2-2.0 typical)
 * b: Length normalization parameter (0.75 typical)
 */
const DEFAULT_K1 = 1.5;
const DEFAULT_B = 0.75;

/**
 * Simple tokenizer - splits text into words
 * @param {string} text - Text to tokenize
 * @returns {string[]} Array of tokens (lowercase words)
 */
function tokenize(text) {
    if (!text || typeof text !== 'string') return [];
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
        .split(/\s+/)
        .filter(token => token.length > 0);
}

/**
 * Calculate term frequency (TF) for a document
 * @param {string[]} tokens - Document tokens
 * @returns {Map<string, number>} Map of term -> frequency
 */
function calculateTermFrequency(tokens) {
    const tf = new Map();
    for (const token of tokens) {
        tf.set(token, (tf.get(token) || 0) + 1);
    }
    return tf;
}

/**
 * Calculate inverse document frequency (IDF) for all terms
 * IDF = log((N - df + 0.5) / (df + 0.5) + 1)
 * where N = total documents, df = documents containing term
 *
 * @param {Array<Map<string, number>>} documentTermFreqs - TF maps for all documents
 * @param {number} totalDocs - Total number of documents
 * @returns {Map<string, number>} Map of term -> IDF score
 */
function calculateIDF(documentTermFreqs, totalDocs) {
    const documentFrequency = new Map();

    // Count how many documents contain each term
    for (const tfMap of documentTermFreqs) {
        const uniqueTerms = new Set(tfMap.keys());
        for (const term of uniqueTerms) {
            documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
        }
    }

    // Calculate IDF for each term
    const idf = new Map();
    for (const [term, df] of documentFrequency.entries()) {
        // BM25 IDF formula with smoothing
        const idfScore = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1);
        idf.set(term, idfScore);
    }

    return idf;
}

/**
 * BM25 Scorer class
 * Maintains corpus statistics for efficient scoring
 */
export class BM25Scorer {
    /**
     * @param {object} options - BM25 parameters
     * @param {number} options.k1 - Term frequency saturation (default: 1.5)
     * @param {number} options.b - Length normalization (default: 0.75)
     */
    constructor(options = {}) {
        this.k1 = options.k1 ?? DEFAULT_K1;
        this.b = options.b ?? DEFAULT_B;

        // Corpus statistics
        this.documents = [];
        this.documentTermFreqs = [];
        this.documentLengths = [];
        this.avgDocLength = 0;
        this.idf = new Map();
        this.totalDocs = 0;
    }

    /**
     * Index a corpus of documents
     * @param {Array<{text: string, id?: any}>} documents - Documents to index
     */
    indexDocuments(documents) {
        this.documents = documents;
        this.totalDocs = documents.length;
        this.documentTermFreqs = [];
        this.documentLengths = [];

        // Tokenize and calculate TF for each document
        let totalLength = 0;
        for (const doc of documents) {
            const tokens = tokenize(doc.text);
            const tf = calculateTermFrequency(tokens);

            this.documentTermFreqs.push(tf);
            this.documentLengths.push(tokens.length);
            totalLength += tokens.length;
        }

        // Calculate average document length
        this.avgDocLength = this.totalDocs > 0 ? totalLength / this.totalDocs : 0;

        // Calculate IDF for all terms in corpus
        this.idf = calculateIDF(this.documentTermFreqs, this.totalDocs);

        console.log(`[BM25] Indexed ${this.totalDocs} documents, avg length: ${this.avgDocLength.toFixed(1)} tokens`);
    }

    /**
     * Score a single document against a query
     * BM25 formula:
     * score = Σ(IDF(qi) * (f(qi, D) * (k1 + 1)) / (f(qi, D) + k1 * (1 - b + b * |D| / avgdl)))
     *
     * @param {string[]} queryTokens - Query tokens
     * @param {number} docIndex - Document index in corpus
     * @returns {number} BM25 score
     */
    scoreDocument(queryTokens, docIndex) {
        const docTF = this.documentTermFreqs[docIndex];
        const docLength = this.documentLengths[docIndex];

        let score = 0;

        for (const token of queryTokens) {
            const tf = docTF.get(token) || 0;
            if (tf === 0) continue; // Term not in document

            const idf = this.idf.get(token) || 0;

            // Length normalization factor
            const lengthNorm = 1 - this.b + this.b * (docLength / this.avgDocLength);

            // BM25 term score
            const termScore = idf * (tf * (this.k1 + 1)) / (tf + this.k1 * lengthNorm);

            score += termScore;
        }

        return score;
    }

    /**
     * Score all documents against a query and return ranked results
     * @param {string} query - Search query
     * @param {number} topK - Number of top results to return
     * @returns {Array<{index: number, score: number, document: object}>} Ranked results
     */
    search(query, topK = 10) {
        const queryTokens = tokenize(query);

        if (queryTokens.length === 0) {
            console.warn('[BM25] Empty query, returning empty results');
            return [];
        }

        // Score all documents
        const scores = [];
        for (let i = 0; i < this.totalDocs; i++) {
            const score = this.scoreDocument(queryTokens, i);
            scores.push({
                index: i,
                score: score,
                document: this.documents[i]
            });
        }

        // Sort by score descending and take topK
        scores.sort((a, b) => b.score - a.score);
        return scores.slice(0, topK);
    }

    /**
     * Score specific documents (by indices) against a query
     * Useful when you already have candidates from vector search
     *
     * @param {string} query - Search query
     * @param {Array<number>} indices - Document indices to score
     * @returns {Map<number, number>} Map of index -> BM25 score
     */
    scoreDocumentSubset(query, indices) {
        const queryTokens = tokenize(query);
        const scores = new Map();

        if (queryTokens.length === 0) {
            return scores;
        }

        for (const idx of indices) {
            if (idx >= 0 && idx < this.totalDocs) {
                const score = this.scoreDocument(queryTokens, idx);
                scores.set(idx, score);
            }
        }

        return scores;
    }
}

/**
 * Create a BM25 scorer from search results
 * Helper function for quick BM25 scoring without pre-indexing
 *
 * @param {Array<{text: string, hash?: number}>} results - Search results
 * @param {object} options - BM25 parameters
 * @returns {BM25Scorer} Initialized BM25 scorer
 */
export function createBM25Scorer(results, options = {}) {
    const scorer = new BM25Scorer(options);
    scorer.indexDocuments(results);
    return scorer;
}

/**
 * Apply BM25 scores to search results and re-rank
 * Combines vector similarity with BM25 keyword relevance
 *
 * @param {Array} results - Vector search results [{text, score, hash, ...}]
 * @param {string} query - Search query
 * @param {object} options - Scoring options
 * @param {number} options.k1 - BM25 k1 parameter
 * @param {number} options.b - BM25 b parameter
 * @param {number} options.alpha - Weight for vector score (default: 0.5)
 * @param {number} options.beta - Weight for BM25 score (default: 0.5)
 * @returns {Array} Re-ranked results with BM25 scores
 */
export function applyBM25Scoring(results, query, options = {}) {
    if (!results || results.length === 0) return results;

    const {
        k1 = DEFAULT_K1,
        b = DEFAULT_B,
        alpha = 0.5,  // Weight for vector similarity
        beta = 0.5    // Weight for BM25 score
    } = options;

    console.log(`[BM25] Applying BM25 scoring to ${results.length} results (k1=${k1}, b=${b}, α=${alpha}, β=${beta})`);

    // Create BM25 scorer
    const scorer = createBM25Scorer(results, { k1, b });

    // Score all results
    const queryTokens = tokenize(query);
    const maxBM25Score = Math.max(...results.map((_, idx) => scorer.scoreDocument(queryTokens, idx)), 0.0001);

    // Combine scores
    const scoredResults = results.map((result, idx) => {
        const bm25Score = scorer.scoreDocument(queryTokens, idx);
        const normalizedBM25 = maxBM25Score > 0 ? bm25Score / maxBM25Score : 0;

        // Normalize vector score to [0, 1] range (assuming it's already in [0, 1])
        const normalizedVector = result.originalScore ?? result.score;

        // Combined score: weighted sum of vector and BM25 scores
        const combinedScore = alpha * normalizedVector + beta * normalizedBM25;

        return {
            ...result,
            score: combinedScore,
            vectorScore: normalizedVector,
            bm25Score: bm25Score,
            normalizedBM25: normalizedBM25,
            originalScore: result.originalScore ?? result.score
        };
    });

    // Sort by combined score
    scoredResults.sort((a, b) => b.score - a.score);

    console.log(`[BM25] Top result: vector=${scoredResults[0].vectorScore.toFixed(4)}, bm25=${scoredResults[0].bm25Score.toFixed(4)}, combined=${scoredResults[0].score.toFixed(4)}`);

    return scoredResults;
}
