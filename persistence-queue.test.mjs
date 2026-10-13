import assert from 'node:assert/strict';
import test from 'node:test';
import { SerializedOperationQueue, shouldAdoptIndexedSnapshot } from './persistence-queue.mjs';

test('serialized persistence operations preserve submission order', async () => {
  const queue = new SerializedOperationQueue();
  const order = [];
  let active = 0;
  let maximumActive = 0;

  const operation = (label) => queue.run(async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    order.push(`${label}:start`);
    await new Promise((resolve) => setTimeout(resolve, 5));
    order.push(`${label}:end`);
    active -= 1;
  });

  await Promise.all([operation('first'), operation('second'), operation('third')]);
  assert.deepEqual(order, [
    'first:start', 'first:end',
    'second:start', 'second:end',
    'third:start', 'third:end',
  ]);
  assert.equal(maximumActive, 1);
});

test('a failed persistence operation does not block later writes', async () => {
  const queue = new SerializedOperationQueue();
  await assert.rejects(queue.run(() => { throw new Error('disk full'); }), /disk full/);
  assert.equal(await queue.run(() => 'saved'), 'saved');
});

test('IndexedDB hydration cannot overwrite a state changed after hydration began', () => {
  const indexed = { updatedAt: 10 };
  const local = { updatedAt: 9 };
  assert.equal(shouldAdoptIndexedSnapshot(indexed, local, 4, 5), false);
  assert.equal(shouldAdoptIndexedSnapshot(indexed, local, 4, 4), true);
  assert.equal(shouldAdoptIndexedSnapshot({ updatedAt: 8 }, local, 4, 4), false);
  assert.equal(shouldAdoptIndexedSnapshot(null, local, 4, 4), false);
});
