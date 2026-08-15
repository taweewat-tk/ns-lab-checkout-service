import { Router, Request, Response, NextFunction } from 'express';
import { login } from '../services/authService';
import { rateLimit } from '../middleware/rateLimit';
import { requireAuth, authedUsername } from '../middleware/requireAuth';

export const authRouter = Router();

// Brute-force guard on password attempts. Keying on IP + username caps guesses
// against any single account; it does not stop credential stuffing that spreads
// one guess across many usernames from the same IP.
//
// `req.ip` is only trustworthy once `trust proxy` matches the real deployment —
// setting it blindly lets clients spoof their IP via X-Forwarded-For.
const loginLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  keyOf: (req) => `${req.ip ?? 'unknown'}:${String(req.body?.username ?? '')}`,
  resetOnSuccess: true,
});

authRouter.post('/login', loginLimiter, async (req: Request, res: Response, next: NextFunction) => {
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

authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  res.status(200).json({ username: authedUsername(req) });
});
