import { Router, Request, Response, NextFunction } from 'express';
import { login, verifyToken } from '../services/authService';

export const authRouter = Router();

authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  const username = req.body?.username;
  const password = req.body?.password;
  if (!username || !password) {
    next(new Error('username and password are required'));
    return;
  }
  try {
    const result = await login(username, password);
    res.status(200).json(result);
  } catch {
    res.status(401).json({ error: 'invalid credentials' });
  }
});

authRouter.get('/me', (req: Request, res: Response) => {
  const header = req.header('Authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'invalid or expired token' });
    return;
  }
  try {
    const username = verifyToken(token);
    res.status(200).json({ username });
  } catch {
    res.status(401).json({ error: 'invalid or expired token' });
  }
});
