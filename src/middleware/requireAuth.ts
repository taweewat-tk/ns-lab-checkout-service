import { Request, Response, NextFunction, RequestHandler } from 'express';
import { verifyToken } from '../services/authService';

declare global {
  namespace Express {
    interface Request {
      auth?: { username: string };
    }
  }
}

/**
 * Rejects a request unless it carries a valid `Authorization: Bearer <token>`,
 * and hangs the verified identity on `req.auth`.
 *
 * Answers 401 directly instead of calling `next(err)`: errorHandler turns every
 * forwarded error into a 400, which would hide the authentication failure.
 */
export const requireAuth: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const [scheme, token] = (req.header('Authorization') ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'invalid or expired token' });
    return;
  }
  try {
    req.auth = { username: verifyToken(token) };
  } catch {
    res.status(401).json({ error: 'invalid or expired token' });
    return;
  }
  next();
};

/**
 * Reads the identity that `requireAuth` established. Throws rather than
 * returning undefined, so a route wired up without `requireAuth` fails loudly
 * instead of quietly treating the caller as anonymous.
 */
export function authedUsername(req: Request): string {
  const username = req.auth?.username;
  if (!username) throw new Error('route is missing requireAuth');
  return username;
}
