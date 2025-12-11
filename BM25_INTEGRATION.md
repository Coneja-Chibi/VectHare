# BM25 Keyword Scoring Integration

## Overview

VectHare now includes BM25 (Best Match 25) keyword scoring as an alternative to the traditional keyword boost method. BM25 is a probabilistic ranking function widely used in information retrieval, inspired by Langchain's BM25 retriever implementation.

## What is BM25?

BM25 is a ranking algorithm that scores documents based on:

1. **Term Frequency (TF)**: How often query terms appear in a document
2. **Inverse Document Frequency (IDF)**: How rare/common a term is across all documents
3. **Document Length Normalization**: Adjusts scores for varying document lengths

### BM25 Formula

```
BM25(D, Q) = Σ IDF(qi) × (f(qi, D) × (k1 + 1)) / (f(qi, D) + k1 × (1 - b + b × |D| / avgdl))
```

Where:
- `D` = document
- `Q` = query
- `qi` = query term i
- `f(qi, D)` = frequency of term qi in document D
- `|D|` = length of document D
- `avgdl` = average document length in corpus
- `k1` = term frequency saturation parameter (default: 1.5)
- `b` = length normalization parameter (default: 0.75)

## Scoring Methods

VectHare offers three keyword scoring methods:

### 1. Keyword Boost (Traditional)
- Uses manually extracted keywords with assigned weights
- Additive boost: `score = vector_score × (1 + Σ(weight - 1))`
- Fast and simple
- Good when keywords are well-curated

### 2. BM25 (Langchain-style)
- Probabilistic keyword relevance scoring
- Considers entire document content, not just keywords
- Automatic term weighting based on corpus statistics
- Better for general text matching

### 3. Hybrid (Both)
- Combines keyword boost and BM25 scoring
- First applies keyword boost, then BM25
- Weights: 60% keyword-boosted score + 40% BM25 score
- Best of both worlds

## Configuration

### Settings

```javascript
{
  keyword_scoring_method: 'keyword',  // 'keyword', 'bm25', or 'hybrid'
  bm25_k1: 1.5,                       // TF saturation (1.2-2.0 typical)
  bm25_b: 0.75                        // Length normalization (0-1)
}
```

### UI Controls

In VectHare settings panel:
1. **Keyword Scoring Method** dropdown: Choose scoring algorithm
2. **BM25 k1**: Controls how quickly term frequency saturates
   - Lower (1.0): Terms saturate quickly
   - Higher (2.0): Terms can contribute more with high frequency
3. **BM25 b**: Controls document length penalty
   - 0: No length normalization
   - 1: Full length normalization
   - 0.75: Balanced (recommended)

## Implementation Details

### File Structure

```
core/
  ├── bm25-scorer.js          # BM25 implementation
  ├── core-vector-api.js      # Integration point
  └── keyword-boost.js        # Traditional keyword boost
```

### Key Functions

#### `BM25Scorer` class
```javascript
const scorer = new BM25Scorer({ k1: 1.5, b: 0.75 });
scorer.indexDocuments(documents);  // Index corpus
const results = scorer.search(query, topK);
```

#### `applyBM25Scoring()`
```javascript
const results = applyBM25Scoring(vectorResults, query, {
  k1: 1.5,
  b: 0.75,
  alpha: 0.5,  // Vector score weight
  beta: 0.5    // BM25 score weight
});
```

### Integration Flow

```
1. Vector Search
   ↓
2. Get top K×2 results (overfetch)
   ↓
3. Apply Scoring Method:
   - keyword: Traditional boost
   - bm25: BM25 scoring
   - hybrid: Both methods
   ↓
4. Re-rank and return top K
```

## Performance Considerations

### BM25 Complexity
- Indexing: O(n × m) where n = documents, m = avg tokens
- Querying: O(n × q) where q = query tokens
- Memory: O(n × unique_terms) for TF maps

### Recommendations
- Use **keyword boost** for small result sets (< 20 documents)
- Use **BM25** for larger corpuses with diverse content
- Use **hybrid** when you have good keywords but want general text matching too

## Examples

### Example 1: BM25-only scoring

```javascript
const settings = {
  keyword_scoring_method: 'bm25',
  bm25_k1: 1.5,
  bm25_b: 0.75
};

const results = await queryCollection(
  'vecthare_chat_...',
  'What did we discuss about magic?',
  10,
  settings
);

// Results include:
// - score: Combined vector + BM25 score
// - vectorScore: Original vector similarity
// - bm25Score: BM25 keyword relevance
// - normalizedBM25: BM25 score normalized to [0, 1]
```

### Example 2: Hybrid scoring

```javascript
const settings = {
  keyword_scoring_method: 'hybrid',
  bm25_k1: 1.8,
  bm25_b: 0.6
};

// First applies keyword boost, then BM25
// Results combine manual keyword curation with statistical relevance
```

## Comparison with Traditional Keyword Boost

| Feature | Keyword Boost | BM25 | Hybrid |
|---------|---------------|------|--------|
| Speed | Fast | Medium | Slower |
| Setup | Requires keywords | Automatic | Requires keywords |
| Accuracy | Good with curated keywords | Good for general text | Best overall |
| Corpus-aware | No | Yes | Yes |
| Length normalization | No | Yes | Yes |

## Best Practices

1. **For chat RAG**: Start with keyword boost, switch to hybrid if needed
2. **For document search**: Use BM25 or hybrid
3. **For small collections (< 50 chunks)**: Keyword boost is sufficient
4. **For large collections (> 200 chunks)**: BM25 provides better ranking

## Tuning Parameters

### k1 (Term Frequency Saturation)
- **1.2**: Conservative, good for short documents
- **1.5**: Balanced (default)
- **2.0**: Aggressive, good for long documents

### b (Length Normalization)
- **0.0**: No penalty for length (good for uniform-length docs)
- **0.75**: Balanced penalty (default)
- **1.0**: Full penalty (good for varying-length docs)

## Future Enhancements

Potential improvements:
- [ ] BM25+ (BM25 with additional term saturation)
- [ ] BM25F (field-aware BM25 for structured documents)
- [ ] Cached BM25 scores for static collections
- [ ] Custom IDF precomputation for large corpuses
- [ ] Per-collection BM25 parameter tuning

## References

- [Langchain BM25 Retriever](https://js.langchain.com/docs/integrations/retrievers/bm25)
- [BM25 Wikipedia](https://en.wikipedia.org/wiki/Okapi_BM25)
- [Robertson & Zaragoza (2009) - The Probabilistic Relevance Framework: BM25 and Beyond](https://www.staff.city.ac.uk/~sbrp622/papers/foundations_bm25_review.pdf)
