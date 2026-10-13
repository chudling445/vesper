export function normalizeRelatedFactIds(relatedFactIds, knownFactIds, ownerId, limit = 12) {
  if (!Array.isArray(relatedFactIds)) return [];
  const known = knownFactIds instanceof Set ? knownFactIds : new Set(knownFactIds || []);
  return [...new Set(relatedFactIds.filter((id) => typeof id === 'string' && id !== ownerId && known.has(id)))].slice(0, limit);
}

export function buildMemoryGraph(facts) {
  const validFacts = Array.isArray(facts) ? facts.filter((fact) => fact && typeof fact.id === 'string') : [];
  const ids = new Set(validFacts.map((fact) => fact.id));
  const nodes = validFacts.map((fact) => ({
    id: fact.id,
    category: typeof fact.category === 'string' ? fact.category : 'note',
    label: typeof fact.value === 'string' ? fact.value : '',
    source: fact.source === 'manual' ? 'manual' : 'conversation',
    updatedAt: Number.isFinite(Number(fact.updatedAt)) ? Number(fact.updatedAt) : 0,
  }));
  const edgeMap = new Map();
  for (const fact of validFacts) {
    for (const relatedId of normalizeRelatedFactIds(fact.relatedFactIds, ids, fact.id)) {
      const [source, target] = [fact.id, relatedId].sort();
      edgeMap.set(`${source}\u0000${target}`, { source, target });
    }
  }
  return { nodes, edges: [...edgeMap.values()] };
}
