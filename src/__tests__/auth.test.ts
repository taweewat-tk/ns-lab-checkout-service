import { createUser, verifyPassword } from '../services/authService';

describe('password hashing', () => {
  it('verifies the correct password and rejects a wrong one', async () => {
    const user = await createUser('alice', 'secret123');
    await expect(verifyPassword('secret123', user)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', user)).resolves.toBe(false);
  });
});
