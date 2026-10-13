import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMemoryGraph, normalizeRelatedFactIds } from './memory-graph.mjs';

test('memory links exclude dangling, duplicate, and self references', () => {
  assert.deepEqual(
    normalizeRelatedFactIds(['a', 'a', 'missing', 'owner', 3, 'b'], ['a', 'b', 'owner'], 'owner'),
    ['a', 'b'],
  );
});

test('memory graph exposes local provenance labels and deduplicates undirected edges', () => {
  const graph = buildMemoryGraph([
    { id: 'a', category: 'project', value: 'Vesper', source: 'manual', updatedAt: 12, relatedFactIds: ['b', 'missing', 'a'] },
    { id: 'b', category: 'goal', value: 'ship locally', source: 'conversation', relatedFactIds: ['a'] },
    null,
  ]);
  assert.deepEqual(graph.nodes, [
    { id: 'a', category: 'project', label: 'Vesper', source: 'manual', updatedAt: 12 },
    { id: 'b', category: 'goal', label: 'ship locally', source: 'conversation', updatedAt: 0 },
  ]);
  assert.deepEqual(graph.edges, [{ source: 'a', target: 'b' }]);
});
