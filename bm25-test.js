/**
 * BM25 Scorer Test Suite
 * Run this in browser console to test BM25 implementation
 */

import { BM25Scorer, createBM25Scorer, applyBM25Scoring } from './core/bm25-scorer.js';

// Test corpus
const testDocuments = [
    { text: 'The wizard cast a powerful fire spell at the dragon', id: 1 },
    { text: 'Magic spells require concentration and mana', id: 2 },
    { text: 'The dragon breathed fire across the battlefield', id: 3 },
    { text: 'Ancient wizards studied magic in the tower', id: 4 },
    { text: 'She learned a new healing spell today', id: 5 },
];

// Test 1: Basic BM25 scoring
console.log('=== Test 1: Basic BM25 Scoring ===');
const scorer = new BM25Scorer({ k1: 1.5, b: 0.75 });
scorer.indexDocuments(testDocuments);

const query1 = 'wizard magic spell';
const results1 = scorer.search(query1, 3);

console.log(`Query: "${query1}"`);
results1.forEach((result, i) => {
    console.log(`${i + 1}. [Score: ${result.score.toFixed(4)}] ${result.document.text}`);
});

// Test 2: BM25 with different parameters
console.log('\n=== Test 2: Parameter Tuning ===');
const scorer2 = new BM25Scorer({ k1: 2.0, b: 0.5 });
scorer2.indexDocuments(testDocuments);

const query2 = 'dragon fire';
const results2 = scorer2.search(query2, 3);

console.log(`Query: "${query2}" (k1=2.0, b=0.5)`);
results2.forEach((result, i) => {
    console.log(`${i + 1}. [Score: ${result.score.toFixed(4)}] ${result.document.text}`);
});

// Test 3: Combining with vector scores
console.log('\n=== Test 3: Hybrid Scoring (Vector + BM25) ===');

// Simulate vector search results
const vectorResults = [
    { text: testDocuments[0].text, score: 0.85, hash: 1001 },
    { text: testDocuments[1].text, score: 0.75, hash: 1002 },
    { text: testDocuments[2].text, score: 0.70, hash: 1003 },
    { text: testDocuments[3].text, score: 0.65, hash: 1004 },
    { text: testDocuments[4].text, score: 0.60, hash: 1005 },
];

const query3 = 'fire dragon';
const hybridResults = applyBM25Scoring(vectorResults, query3, {
    k1: 1.5,
    b: 0.75,
    alpha: 0.5,  // 50% vector
    beta: 0.5    // 50% BM25
});

console.log(`Query: "${query3}" (α=0.5 vector, β=0.5 BM25)`);
hybridResults.forEach((result, i) => {
    console.log(`${i + 1}. [Combined: ${result.score.toFixed(4)}, Vector: ${result.vectorScore.toFixed(4)}, BM25: ${result.bm25Score.toFixed(4)}] ${result.text.substring(0, 50)}...`);
});

// Test 4: Edge cases
console.log('\n=== Test 4: Edge Cases ===');

// Empty query
console.log('Empty query:');
const emptyResults = scorer.search('', 5);
console.log(`Results: ${emptyResults.length} (should be 0)`);

// Query with no matches
console.log('\nQuery with uncommon terms:');
const noMatchResults = scorer.search('quantum physics equations', 5);
noMatchResults.forEach((result, i) => {
    console.log(`${i + 1}. [Score: ${result.score.toFixed(4)}] ${result.document.text}`);
});

// Single document corpus
console.log('\nSingle document corpus:');
const singleScorer = new BM25Scorer();
singleScorer.indexDocuments([{ text: 'The lonely document', id: 99 }]);
const singleResults = singleScorer.search('lonely', 1);
console.log(`Result: [Score: ${singleResults[0]?.score.toFixed(4) || 'N/A'}] ${singleResults[0]?.document.text || 'None'}`);

// Test 5: Performance benchmark
console.log('\n=== Test 5: Performance Benchmark ===');

// Create larger corpus
const largeDocs = [];
for (let i = 0; i < 100; i++) {
    largeDocs.push({
        text: `Document ${i}: ${['magic', 'wizard', 'spell', 'dragon', 'fire', 'healing', 'mana', 'power'][i % 8]} content with some random text`,
        id: i
    });
}

console.log(`Indexing ${largeDocs.length} documents...`);
const startIndex = performance.now();
const perfScorer = new BM25Scorer();
perfScorer.indexDocuments(largeDocs);
const indexTime = performance.now() - startIndex;
console.log(`Indexing time: ${indexTime.toFixed(2)}ms`);

console.log('Searching corpus...');
const startSearch = performance.now();
const perfResults = perfScorer.search('magic wizard spell dragon', 10);
const searchTime = performance.now() - startSearch;
console.log(`Search time: ${searchTime.toFixed(2)}ms`);
console.log(`Results found: ${perfResults.length}`);

console.log('\n=== All Tests Complete ===');

// Export for manual testing
export const testBM25 = {
    scorer,
    testDocuments,
    runBasicTest: () => scorer.search('wizard spell', 3),
    runHybridTest: () => applyBM25Scoring(vectorResults, 'fire dragon', { alpha: 0.5, beta: 0.5 })
};
