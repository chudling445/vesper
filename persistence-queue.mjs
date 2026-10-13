export class SerializedOperationQueue {
  #tail = Promise.resolve();

  run(operation) {
    const result = this.#tail.catch(() => undefined).then(operation);
    this.#tail = result;
    return result;
  }
}

export function shouldAdoptIndexedSnapshot(indexedState, localState, startingRevision, currentRevision) {
  return Boolean(indexedState)
    && startingRevision === currentRevision
    && Number(indexedState.updatedAt) >= Number(localState.updatedAt);
}
