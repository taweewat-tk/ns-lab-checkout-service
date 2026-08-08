/** Yield to the event loop so concurrent callers actually interleave. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * A tiny async key-value store that mimics a real (latent) datastore.
 * Every operation awaits a tick, which is what makes concurrency bugs
 * in callers observable.
 */
export function createAsyncStore<T>(key: (item: T) => string) {
  const map = new Map<string, T>();
  return {
    async get(id: string): Promise<T | undefined> {
      await tick();
      return map.get(id);
    },
    async has(id: string): Promise<boolean> {
      await tick();
      return map.has(id);
    },
    async put(item: T): Promise<T> {
      await tick();
      map.set(key(item), item);
      return item;
    },
    async all(): Promise<T[]> {
      await tick();
      return Array.from(map.values());
    },
    async seed(items: T[]): Promise<void> {
      map.clear();
      for (const item of items) map.set(key(item), item);
    },
  };
}
