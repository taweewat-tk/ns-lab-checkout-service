import { createAsyncStore } from '../repositories/asyncStore';

describe('asyncStore', () => {
  describe('has', () => {
    it('returns true when the item exists', async () => {
      const store = createAsyncStore<{ id: string }>((item) => item.id);
      await store.put({ id: 'a' });
      await expect(store.has('a')).resolves.toBe(true);
    });

    it('returns false when the item does not exist', async () => {
      const store = createAsyncStore<{ id: string }>((item) => item.id);
      await expect(store.has('missing')).resolves.toBe(false);
    });
  });
});
