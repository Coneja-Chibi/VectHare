/**
 * Unit tests for world-info-integration.js
 * Tests semantic World Info activation and lorebook vectorization helpers
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies - paths relative to the module under test (core/world-info-integration.js)
vi.mock('../core/../../../../extensions.js', () => ({
    extension_settings: {},
    getContext: vi.fn(() => ({
        chat: [],
        groupId: null,
        name2: 'TestCharacter',
        characterId: 'char123',
    })),
}));

vi.mock('../core/../../../../../script.js', () => ({
    setExtensionPrompt: vi.fn(),
    getCurrentChatId: vi.fn(() => 'chat123'),
}));

vi.mock('../core/core-vector-api.js', () => ({
    queryCollection: vi.fn(),
}));

vi.mock('../core/collection-metadata.js', () => ({
    getCollectionMeta: vi.fn(),
    isCollectionEnabled: vi.fn(),
    shouldCollectionActivate: vi.fn(),
}));

vi.mock('../core/collection-ids.js', () => ({
    parseRegistryKey: vi.fn((key) => ({
        backend: 'standard',
        source: 'local',
        collectionId: key.split(':').pop() || key,
    })),
    buildLorebookCollectionId: vi.fn((name, scope) => `lorebook_${scope}_${name}`),
}));

vi.mock('../core/constants.js', () => ({
    EXTENSION_PROMPT_TAG: 'vecthare_world_info',
}));

vi.mock('../core/conditional-activation.js', () => ({
    buildSearchContext: vi.fn(() => ({
        recentMessages: [],
        generationType: 'normal',
        isGroupChat: false,
    })),
}));

import { getContext } from '../core/../../../../extensions.js';
import { setExtensionPrompt, getCurrentChatId } from '../core/../../../../../script.js';
import { queryCollection } from '../core/core-vector-api.js';
import { getCollectionMeta, isCollectionEnabled, shouldCollectionActivate } from '../core/collection-metadata.js';
import { parseRegistryKey, buildLorebookCollectionId } from '../core/collection-ids.js';
import { buildSearchContext } from '../core/conditional-activation.js';

import {
    getSemanticWorldInfoEntries,
    isLorebookVectorized,
    getLorebooksVectorizationStatus,
    getLorebookVectorStats,
    enhanceWorldInfoEntriesUI,
    initializeWorldInfoIntegration,
    applySemanticEntriesToPrompt,
} from '../core/world-info-integration.js';

// ============================================================================
// getSemanticWorldInfoEntries Tests
// ============================================================================

describe('getSemanticWorldInfoEntries', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default mock implementations
        isCollectionEnabled.mockReturnValue(true);
        shouldCollectionActivate.mockResolvedValue(true);
        getCollectionMeta.mockReturnValue({ sourceName: 'Test Lorebook' });
    });

    it('should return empty array when world info is disabled', async () => {
        const settings = { enabled_world_info: false };
        const result = await getSemanticWorldInfoEntries(['hello'], [], settings);
        expect(result).toEqual([]);
    });

    it('should return empty array when no recent messages', async () => {
        const settings = { enabled_world_info: true };
        const result = await getSemanticWorldInfoEntries([], [], settings);
        expect(result).toEqual([]);
    });

    it('should return empty array when messages are empty strings', async () => {
        const settings = { enabled_world_info: true };
        const result = await getSemanticWorldInfoEntries(['', '   '], [], settings);
        expect(result).toEqual([]);
    });

    it('should query lorebook collections and return matching entries', async () => {
        const settings = {
            enabled_world_info: true,
            world_info_threshold: 0.3,
            world_info_top_k: 3,
            vecthare_collection_registry: ['lorebook_global_test'],
        };

        queryCollection.mockResolvedValue({
            hashes: [1, 2],
            metadata: [
                { uid: 'entry1', text: 'Dragon content', keywords: ['dragon'], score: 0.8 },
                { uid: 'entry2', text: 'Wizard content', keywords: ['wizard'], score: 0.5 },
            ],
        });

        const result = await getSemanticWorldInfoEntries(['Tell me about dragons'], [], settings);

        expect(result).toHaveLength(2);
        expect(result[0].uid).toBe('entry1');
        expect(result[0].score).toBe(0.8);
        expect(result[0].vectorActivated).toBe(true);
    });

    it('should filter entries below threshold', async () => {
        const settings = {
            enabled_world_info: true,
            world_info_threshold: 0.6,
            world_info_top_k: 3,
            vecthare_collection_registry: ['lorebook_global_test'],
        };

        queryCollection.mockResolvedValue({
            hashes: [1, 2],
            metadata: [
                { uid: 'entry1', text: 'High score', score: 0.8 },
                { uid: 'entry2', text: 'Low score', score: 0.4 },
            ],
        });

        const result = await getSemanticWorldInfoEntries(['query'], [], settings);

        expect(result).toHaveLength(1);
        expect(result[0].uid).toBe('entry1');
    });

    it('should use lower threshold for hybrid search', async () => {
        const settings = {
            enabled_world_info: true,
            world_info_threshold: 0.5,
            hybrid_search_enabled: true,
            world_info_top_k: 3,
            vecthare_collection_registry: ['lorebook_global_test'],
        };

        queryCollection.mockResolvedValue({
            hashes: [1],
            metadata: [
                { uid: 'entry1', text: 'Content', score: 0.45 }, // 0.45 > 0.5 * 0.8 = 0.4
            ],
        });

        const result = await getSemanticWorldInfoEntries(['query'], [], settings);

        expect(result).toHaveLength(1);
    });

    it('should sort entries by score descending', async () => {
        const settings = {
            enabled_world_info: true,
            world_info_threshold: 0.3,
            world_info_top_k: 5,
            vecthare_collection_registry: ['lorebook_global_test'],
        };

        queryCollection.mockResolvedValue({
            hashes: [1, 2, 3],
            metadata: [
                { uid: 'entry1', text: 'Mid', score: 0.5 },
                { uid: 'entry2', text: 'High', score: 0.9 },
                { uid: 'entry3', text: 'Low', score: 0.4 },
            ],
        });

        const result = await getSemanticWorldInfoEntries(['query'], [], settings);

        expect(result[0].score).toBe(0.9);
        expect(result[1].score).toBe(0.5);
        expect(result[2].score).toBe(0.4);
    });

    it('should deduplicate with active entries by UID', async () => {
        const settings = {
            enabled_world_info: true,
            world_info_threshold: 0.3,
            world_info_top_k: 3,
            vecthare_collection_registry: ['lorebook_global_test'],
        };

        queryCollection.mockResolvedValue({
            hashes: [1, 2],
            metadata: [
                { uid: 'entry1', text: 'Content 1', score: 0.8 },
                { uid: 'entry2', text: 'Content 2', score: 0.7 },
            ],
        });

        const activeEntries = [{ uid: 'entry1', content: 'Already active' }];
        const result = await getSemanticWorldInfoEntries(['query'], activeEntries, settings);

        expect(result).toHaveLength(1);
        expect(result[0].uid).toBe('entry2');
    });

    it('should deduplicate with active entries by content', async () => {
        const settings = {
            enabled_world_info: true,
            world_info_threshold: 0.3,
            world_info_top_k: 3,
            vecthare_collection_registry: ['lorebook_global_test'],
        };

        queryCollection.mockResolvedValue({
            hashes: [1, 2],
            metadata: [
                { uid: 'entry1', text: 'Duplicate Content', score: 0.8 },
                { uid: 'entry2', text: 'Unique Content', score: 0.7 },
            ],
        });

        const activeEntries = [{ uid: 'other', content: 'Duplicate Content' }];
        const result = await getSemanticWorldInfoEntries(['query'], activeEntries, settings);

        expect(result).toHaveLength(1);
        expect(result[0].uid).toBe('entry2');
    });

    it('should skip non-lorebook collections', async () => {
        const settings = {
            enabled_world_info: true,
            world_info_threshold: 0.3,
            world_info_top_k: 3,
            vecthare_collection_registry: ['chat_history_123', 'lorebook_global_test'],
        };

        queryCollection.mockResolvedValue({
            hashes: [1],
            metadata: [{ uid: 'entry1', text: 'Content', score: 0.8 }],
        });

        await getSemanticWorldInfoEntries(['query'], [], settings);

        // Should only query the lorebook collection, not chat_history
        expect(queryCollection).toHaveBeenCalledTimes(1);
    });

    it('should skip disabled collections', async () => {
        const settings = {
            enabled_world_info: true,
            world_info_threshold: 0.3,
            world_info_top_k: 3,
            vecthare_collection_registry: ['lorebook_global_disabled', 'lorebook_global_enabled'],
        };

        isCollectionEnabled.mockImplementation((id) => id.includes('enabled'));

        queryCollection.mockResolvedValue({
            hashes: [1],
            metadata: [{ uid: 'entry1', text: 'Content', score: 0.8 }],
        });

        await getSemanticWorldInfoEntries(['query'], [], settings);

        // Should only query the enabled collection
        expect(queryCollection).toHaveBeenCalledTimes(1);
    });

    it('should skip collections that fail activation filters', async () => {
        const settings = {
            enabled_world_info: true,
            world_info_threshold: 0.3,
            world_info_top_k: 3,
            vecthare_collection_registry: ['lorebook_global_blocked', 'lorebook_global_allowed'],
        };

        // Only 'allowed' collection passes activation
        shouldCollectionActivate.mockImplementation((id) => Promise.resolve(id.includes('allowed')));

        queryCollection.mockResolvedValue({
            hashes: [1],
            metadata: [{ uid: 'entry1', text: 'Content', score: 0.8 }],
        });

        await getSemanticWorldInfoEntries(['query'], [], settings);

        // Should only query collections that pass activation (the 'allowed' one)
        expect(queryCollection).toHaveBeenCalledTimes(1);
    });

    it('should handle query errors gracefully', async () => {
        const settings = {
            enabled_world_info: true,
            world_info_threshold: 0.3,
            world_info_top_k: 3,
            vecthare_collection_registry: ['lorebook_global_test'],
        };

        queryCollection.mockRejectedValue(new Error('Query failed'));

        const result = await getSemanticWorldInfoEntries(['query'], [], settings);

        expect(result).toEqual([]);
    });

    it('should use default query depth when not specified', async () => {
        const settings = {
            enabled_world_info: true,
            world_info_threshold: 0.3,
            world_info_top_k: 3,
            vecthare_collection_registry: ['lorebook_global_test'],
        };

        queryCollection.mockResolvedValue({ hashes: [], metadata: [] });

        const messages = ['msg1', 'msg2', 'msg3', 'msg4', 'msg5'];
        await getSemanticWorldInfoEntries(messages, [], settings);

        // Default depth is 3, so query should include last 3 messages
        expect(queryCollection).toHaveBeenCalledWith(
            expect.any(String),
            'msg3\nmsg4\nmsg5',
            expect.any(Number),
            settings
        );
    });

    it('should respect custom query depth', async () => {
        const settings = {
            enabled_world_info: true,
            world_info_query_depth: 2,
            world_info_threshold: 0.3,
            world_info_top_k: 3,
            vecthare_collection_registry: ['lorebook_global_test'],
        };

        queryCollection.mockResolvedValue({ hashes: [], metadata: [] });

        const messages = ['msg1', 'msg2', 'msg3', 'msg4', 'msg5'];
        await getSemanticWorldInfoEntries(messages, [], settings);

        expect(queryCollection).toHaveBeenCalledWith(
            expect.any(String),
            'msg4\nmsg5',
            expect.any(Number),
            settings
        );
    });

    it('should include lorebook name and collection info in results', async () => {
        const settings = {
            enabled_world_info: true,
            world_info_threshold: 0.3,
            world_info_top_k: 3,
            vecthare_collection_registry: ['lorebook_global_test'],
        };

        getCollectionMeta.mockReturnValue({ sourceName: 'My Lorebook' });
        queryCollection.mockResolvedValue({
            hashes: [1],
            metadata: [{ uid: 'entry1', text: 'Content', score: 0.8 }],
        });

        const result = await getSemanticWorldInfoEntries(['query'], [], settings);

        expect(result[0].lorebookName).toBe('My Lorebook');
        expect(result[0].collectionId).toBeDefined();
        expect(result[0].registryKey).toBeDefined();
    });
});

// ============================================================================
// isLorebookVectorized Tests
// ============================================================================

describe('isLorebookVectorized', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return true when lorebook is in registry', () => {
        buildLorebookCollectionId.mockReturnValue('lorebook_global_testbook');
        const settings = {
            vecthare_collection_registry: ['lorebook_global_testbook', 'other_collection'],
        };

        const result = isLorebookVectorized('testbook', settings);

        expect(result).toBe(true);
        expect(buildLorebookCollectionId).toHaveBeenCalledWith('testbook', 'global');
    });

    it('should return false when lorebook is not in registry', () => {
        buildLorebookCollectionId.mockReturnValue('lorebook_global_missing');
        const settings = {
            vecthare_collection_registry: ['lorebook_global_other'],
        };

        const result = isLorebookVectorized('missing', settings);

        expect(result).toBe(false);
    });

    it('should return false when registry is empty', () => {
        buildLorebookCollectionId.mockReturnValue('lorebook_global_test');
        const settings = {
            vecthare_collection_registry: [],
        };

        const result = isLorebookVectorized('test', settings);

        expect(result).toBe(false);
    });

    it('should return false when registry is undefined', () => {
        buildLorebookCollectionId.mockReturnValue('lorebook_global_test');
        const settings = {};

        const result = isLorebookVectorized('test', settings);

        expect(result).toBe(false);
    });
});

// ============================================================================
// getLorebooksVectorizationStatus Tests
// ============================================================================

describe('getLorebooksVectorizationStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return Map with status for each lorebook', () => {
        buildLorebookCollectionId.mockImplementation((name) => `lorebook_global_${name}`);
        const settings = {
            vecthare_collection_registry: ['lorebook_global_book1', 'lorebook_global_book3'],
        };

        const result = getLorebooksVectorizationStatus(['book1', 'book2', 'book3'], settings);

        expect(result).toBeInstanceOf(Map);
        expect(result.get('book1')).toBe(true);
        expect(result.get('book2')).toBe(false);
        expect(result.get('book3')).toBe(true);
    });

    it('should return empty Map for empty input', () => {
        const settings = { vecthare_collection_registry: [] };
        const result = getLorebooksVectorizationStatus([], settings);

        expect(result).toBeInstanceOf(Map);
        expect(result.size).toBe(0);
    });

    it('should handle all false when registry is empty', () => {
        buildLorebookCollectionId.mockImplementation((name) => `lorebook_global_${name}`);
        const settings = { vecthare_collection_registry: [] };

        const result = getLorebooksVectorizationStatus(['book1', 'book2'], settings);

        expect(result.get('book1')).toBe(false);
        expect(result.get('book2')).toBe(false);
    });
});

// ============================================================================
// getLorebookVectorStats Tests
// ============================================================================

describe('getLorebookVectorStats', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return null when lorebook is not vectorized', async () => {
        buildLorebookCollectionId.mockReturnValue('lorebook_global_missing');
        getCollectionMeta.mockReturnValue(null);

        const result = await getLorebookVectorStats('missing', {});

        expect(result).toBeNull();
    });

    it('should return stats when lorebook is vectorized', async () => {
        buildLorebookCollectionId.mockReturnValue('lorebook_global_test');
        getCollectionMeta.mockReturnValue({
            sourceName: 'Test Lorebook',
            chunkCount: 42,
            createdAt: '2024-01-01',
            scope: 'global',
            settings: { strategy: 'per_entry' },
        });
        isCollectionEnabled.mockReturnValue(true);

        const result = await getLorebookVectorStats('test', {});

        expect(result).toEqual({
            collectionId: 'lorebook_global_test',
            sourceName: 'Test Lorebook',
            chunkCount: 42,
            createdAt: '2024-01-01',
            enabled: true,
            strategy: 'per_entry',
            scope: 'global',
        });
    });

    it('should use default values for missing fields', async () => {
        buildLorebookCollectionId.mockReturnValue('lorebook_global_test');
        getCollectionMeta.mockReturnValue({
            sourceName: 'Test',
        });
        isCollectionEnabled.mockReturnValue(false);

        const result = await getLorebookVectorStats('test', {});

        expect(result.chunkCount).toBe(0);
        expect(result.strategy).toBe('per_entry');
        expect(result.scope).toBe('global');
        expect(result.enabled).toBe(false);
    });
});

// ============================================================================
// enhanceWorldInfoEntriesUI Tests
// ============================================================================

describe('enhanceWorldInfoEntriesUI', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return entries unchanged when lorebook is not vectorized', () => {
        buildLorebookCollectionId.mockReturnValue('lorebook_global_test');
        const settings = { vecthare_collection_registry: [] };
        const entries = [
            { uid: 1, content: 'Entry 1' },
            { uid: 2, content: 'Entry 2' },
        ];

        const result = enhanceWorldInfoEntriesUI('test', entries, settings);

        expect(result).toEqual(entries);
        expect(result[0].vectorized).toBeUndefined();
    });

    it('should add vector status when lorebook is vectorized', () => {
        buildLorebookCollectionId.mockReturnValue('lorebook_global_test');
        const settings = { vecthare_collection_registry: ['lorebook_global_test'] };
        const entries = [
            { uid: 1, content: 'Entry 1' },
            { uid: 2, content: 'Entry 2' },
        ];

        const result = enhanceWorldInfoEntriesUI('test', entries, settings);

        expect(result[0].vectorized).toBe(true);
        expect(result[0].vectorStatus).toEqual({
            isVectorized: true,
            canUseSemanticActivation: true,
            lorebookVectorized: true,
        });
        expect(result[1].vectorized).toBe(true);
    });

    it('should preserve original entry properties', () => {
        buildLorebookCollectionId.mockReturnValue('lorebook_global_test');
        const settings = { vecthare_collection_registry: ['lorebook_global_test'] };
        const entries = [
            { uid: 1, content: 'Entry 1', customField: 'custom' },
        ];

        const result = enhanceWorldInfoEntriesUI('test', entries, settings);

        expect(result[0].uid).toBe(1);
        expect(result[0].content).toBe('Entry 1');
        expect(result[0].customField).toBe('custom');
    });

    it('should handle empty entries array', () => {
        buildLorebookCollectionId.mockReturnValue('lorebook_global_test');
        const settings = { vecthare_collection_registry: ['lorebook_global_test'] };

        const result = enhanceWorldInfoEntriesUI('test', [], settings);

        expect(result).toEqual([]);
    });
});

// ============================================================================
// initializeWorldInfoIntegration Tests
// ============================================================================

describe('initializeWorldInfoIntegration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Clean up global
        delete globalThis.window;
        globalThis.window = {};
    });

    afterEach(() => {
        delete globalThis.window;
    });

    it('should expose functions on window.VectHare_WorldInfo', () => {
        initializeWorldInfoIntegration();

        expect(window.VectHare_WorldInfo).toBeDefined();
        expect(window.VectHare_WorldInfo.getSemanticEntries).toBe(getSemanticWorldInfoEntries);
        expect(window.VectHare_WorldInfo.isLorebookVectorized).toBe(isLorebookVectorized);
        expect(window.VectHare_WorldInfo.getVectorizationStatus).toBe(getLorebooksVectorizationStatus);
        expect(window.VectHare_WorldInfo.getVectorStats).toBe(getLorebookVectorStats);
        expect(window.VectHare_WorldInfo.enhanceEntriesUI).toBe(enhanceWorldInfoEntriesUI);
    });
});

// ============================================================================
// applySemanticEntriesToPrompt Tests
// ============================================================================

describe('applySemanticEntriesToPrompt', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        isCollectionEnabled.mockReturnValue(true);
        shouldCollectionActivate.mockResolvedValue(true);
        getCollectionMeta.mockReturnValue({ sourceName: 'Test' });
    });

    it('should do nothing when settings is null', async () => {
        await applySemanticEntriesToPrompt([], null);

        expect(setExtensionPrompt).not.toHaveBeenCalled();
    });

    it('should do nothing when world info is disabled', async () => {
        await applySemanticEntriesToPrompt([], { enabled_world_info: false });

        expect(setExtensionPrompt).not.toHaveBeenCalled();
    });

    it('should do nothing when no entries found', async () => {
        const settings = {
            enabled_world_info: true,
            vecthare_collection_registry: ['lorebook_global_test'],
        };

        queryCollection.mockResolvedValue({ hashes: [], metadata: [] });

        await applySemanticEntriesToPrompt([{ mes: 'Hello' }], settings);

        expect(setExtensionPrompt).not.toHaveBeenCalled();
    });

    it('should inject entries into extension prompt', async () => {
        const settings = {
            enabled_world_info: true,
            world_info_threshold: 0.3,
            world_info_top_k: 3,
            position: 1,
            depth: 3,
            vecthare_collection_registry: ['lorebook_global_test'],
        };

        queryCollection.mockResolvedValue({
            hashes: [1, 2],
            metadata: [
                { uid: 'entry1', text: 'Dragon lore content', score: 0.8 },
                { uid: 'entry2', text: 'Wizard lore content', score: 0.7 },
            ],
        });

        const chat = [
            { mes: 'Tell me about dragons', is_system: false },
        ];

        await applySemanticEntriesToPrompt(chat, settings);

        expect(setExtensionPrompt).toHaveBeenCalledWith(
            'vecthare_world_info',
            expect.stringContaining('Dragon lore content'),
            1,
            3,
            false
        );
    });

    it('should filter out system messages', async () => {
        const settings = {
            enabled_world_info: true,
            world_info_threshold: 0.3,
            world_info_top_k: 3,
            vecthare_collection_registry: ['lorebook_global_test'],
        };

        queryCollection.mockResolvedValue({ hashes: [], metadata: [] });

        const chat = [
            { mes: 'System message', is_system: true },
            { mes: 'User message', is_system: false },
        ];

        await applySemanticEntriesToPrompt(chat, settings);

        // Should only include non-system messages in query
        expect(queryCollection).toHaveBeenCalledWith(
            expect.any(String),
            'User message',
            expect.any(Number),
            settings
        );
    });

    it('should prepend RAG context wrapper if configured', async () => {
        const settings = {
            enabled_world_info: true,
            world_info_threshold: 0.3,
            world_info_top_k: 3,
            rag_context: '[Relevant Information]',
            vecthare_collection_registry: ['lorebook_global_test'],
        };

        queryCollection.mockResolvedValue({
            hashes: [1],
            metadata: [{ uid: 'entry1', text: 'Content', score: 0.8 }],
        });

        await applySemanticEntriesToPrompt([{ mes: 'Query' }], settings);

        expect(setExtensionPrompt).toHaveBeenCalledWith(
            'vecthare_world_info',
            expect.stringContaining('[Relevant Information]'),
            expect.any(Number),
            expect.any(Number),
            false
        );
    });

    it('should use default position and depth when not specified', async () => {
        const settings = {
            enabled_world_info: true,
            world_info_threshold: 0.3,
            world_info_top_k: 3,
            vecthare_collection_registry: ['lorebook_global_test'],
        };

        queryCollection.mockResolvedValue({
            hashes: [1],
            metadata: [{ uid: 'entry1', text: 'Content', score: 0.8 }],
        });

        await applySemanticEntriesToPrompt([{ mes: 'Query' }], settings);

        expect(setExtensionPrompt).toHaveBeenCalledWith(
            'vecthare_world_info',
            expect.any(String),
            0, // default position
            2, // default depth
            false
        );
    });

    it('should handle errors gracefully', async () => {
        const settings = {
            enabled_world_info: true,
            vecthare_collection_registry: ['lorebook_global_test'],
        };

        queryCollection.mockRejectedValue(new Error('Query failed'));

        // Should not throw
        await expect(applySemanticEntriesToPrompt([{ mes: 'Query' }], settings)).resolves.not.toThrow();
        expect(setExtensionPrompt).not.toHaveBeenCalled();
    });

    it('should use entry key as fallback when content is empty', async () => {
        const settings = {
            enabled_world_info: true,
            world_info_threshold: 0.3,
            world_info_top_k: 3,
            vecthare_collection_registry: ['lorebook_global_test'],
        };

        queryCollection.mockResolvedValue({
            hashes: [1],
            metadata: [
                { uid: 'entry1', text: '', keywords: ['dragon', 'fire'], score: 0.8 },
            ],
        });

        await applySemanticEntriesToPrompt([{ mes: 'Query' }], settings);

        expect(setExtensionPrompt).toHaveBeenCalledWith(
            'vecthare_world_info',
            expect.stringContaining('dragon'),
            expect.any(Number),
            expect.any(Number),
            false
        );
    });
});

// ============================================================================
// Edge Cases and Integration Tests
// ============================================================================

describe('Edge Cases', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        isCollectionEnabled.mockReturnValue(true);
        shouldCollectionActivate.mockResolvedValue(true);
        getCollectionMeta.mockReturnValue({ sourceName: 'Test' });
    });

    it('should handle entries with complex key formats', async () => {
        const settings = {
            enabled_world_info: true,
            world_info_threshold: 0.3,
            world_info_top_k: 3,
            vecthare_collection_registry: ['lorebook_global_test'],
        };

        queryCollection.mockResolvedValue({
            hashes: [1],
            metadata: [{
                uid: 'entry1',
                text: 'Content',
                keywords: [
                    { text: 'dragon', weight: 1.5 },
                    { keyword: 'fire' },
                    'simple string',
                ],
                score: 0.8,
            }],
        });

        const result = await getSemanticWorldInfoEntries(['query'], [], settings);

        expect(result).toHaveLength(1);
        expect(result[0].key).toEqual([
            { text: 'dragon', weight: 1.5 },
            { keyword: 'fire' },
            'simple string',
        ]);
    });

    it('should handle null metadata gracefully', async () => {
        const settings = {
            enabled_world_info: true,
            world_info_threshold: 0.3,
            world_info_top_k: 3,
            vecthare_collection_registry: ['lorebook_global_test'],
        };

        queryCollection.mockResolvedValue({
            hashes: [1],
            metadata: null,
        });

        const result = await getSemanticWorldInfoEntries(['query'], [], settings);

        expect(result).toEqual([]);
    });

    it('should handle missing score field', async () => {
        const settings = {
            enabled_world_info: true,
            world_info_threshold: 0.3,
            world_info_top_k: 3,
            vecthare_collection_registry: ['lorebook_global_test'],
        };

        queryCollection.mockResolvedValue({
            hashes: [1],
            metadata: [{ uid: 'entry1', text: 'Content' }], // no score field
        });

        const result = await getSemanticWorldInfoEntries(['query'], [], settings);

        // Score defaults to 0, which is below threshold
        expect(result).toEqual([]);
    });

    it('should handle deduplication with case-insensitive content matching', async () => {
        const settings = {
            enabled_world_info: true,
            world_info_threshold: 0.3,
            world_info_top_k: 3,
            vecthare_collection_registry: ['lorebook_global_test'],
        };

        queryCollection.mockResolvedValue({
            hashes: [1],
            metadata: [{ uid: 'entry1', text: 'DRAGON CONTENT', score: 0.8 }],
        });

        const activeEntries = [{ uid: 'other', content: 'dragon content' }];
        const result = await getSemanticWorldInfoEntries(['query'], activeEntries, settings);

        expect(result).toEqual([]);
    });

    it('should handle deduplication with whitespace trimming', async () => {
        const settings = {
            enabled_world_info: true,
            world_info_threshold: 0.3,
            world_info_top_k: 3,
            vecthare_collection_registry: ['lorebook_global_test'],
        };

        queryCollection.mockResolvedValue({
            hashes: [1],
            metadata: [{ uid: 'entry1', text: '  Content with spaces  ', score: 0.8 }],
        });

        const activeEntries = [{ uid: 'other', content: 'Content with spaces' }];
        const result = await getSemanticWorldInfoEntries(['query'], activeEntries, settings);

        expect(result).toEqual([]);
    });

    it('should handle multiple lorebook collections', async () => {
        const settings = {
            enabled_world_info: true,
            world_info_threshold: 0.3,
            world_info_top_k: 3,
            vecthare_collection_registry: [
                'lorebook_global_book1',
                'lorebook_global_book2',
            ],
        };

        getCollectionMeta.mockImplementation((id) => ({
            sourceName: id.includes('book1') ? 'Book One' : 'Book Two',
        }));

        queryCollection
            .mockResolvedValueOnce({
                hashes: [1],
                metadata: [{ uid: 'entry1', text: 'From book 1', score: 0.8 }],
            })
            .mockResolvedValueOnce({
                hashes: [2],
                metadata: [{ uid: 'entry2', text: 'From book 2', score: 0.7 }],
            });

        const result = await getSemanticWorldInfoEntries(['query'], [], settings);

        expect(result).toHaveLength(2);
        expect(result[0].lorebookName).toBe('Book One');
        expect(result[1].lorebookName).toBe('Book Two');
    });
});
