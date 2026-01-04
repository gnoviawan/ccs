/**
 * Dashboard Authentication Middleware
 *
 * Simple password-based authentication for the CCS Dashboard.
 * Enabled via CCS_DASHBOARD_PASSWORD environment variable.
 *
 * When enabled:
 * - All routes require authentication except /api/auth/* and static assets
 * - Session is stored in a signed cookie
 * - Login page is shown for unauthenticated requests
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import crypto from 'crypto';

/** Session cookie name */
const SESSION_COOKIE = 'ccs_session';

/** Session expiry in milliseconds (24 hours) */
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** Secret for signing cookies (generated at runtime if not set) */
let cookieSecret: string;

/**
 * Get or generate the cookie signing secret.
 * Uses CCS_COOKIE_SECRET env var or generates a random one.
 */
function getCookieSecret(): string {
  if (!cookieSecret) {
    cookieSecret = process.env.CCS_COOKIE_SECRET || crypto.randomBytes(32).toString('hex');
  }
  return cookieSecret;
}

/**
 * Check if dashboard authentication is enabled.
 * Enabled when CCS_DASHBOARD_PASSWORD is set and non-empty.
 */
export function isAuthEnabled(): boolean {
  const password = process.env.CCS_DASHBOARD_PASSWORD;
  return Boolean(password && password.trim().length > 0);
}

/**
 * Get the configured dashboard password.
 */
function getDashboardPassword(): string | undefined {
  return process.env.CCS_DASHBOARD_PASSWORD?.trim();
}

/**
 * Sign a value with the cookie secret.
 */
function signValue(value: string): string {
  const secret = getCookieSecret();
  const signature = crypto.createHmac('sha256', secret).update(value).digest('base64url');
  return `${value}.${signature}`;
}

/**
 * Verify and extract a signed value.
 */
function verifySignedValue(signedValue: string): string | null {
  const parts = signedValue.split('.');
  if (parts.length !== 2) return null;

  const [value, signature] = parts;
  const secret = getCookieSecret();
  const expectedSignature = crypto.createHmac('sha256', secret).update(value).digest('base64url');

  // Timing-safe comparison
  if (signature.length !== expectedSignature.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return null;
  }

  return value;
}

/**
 * Create a session token with expiry.
 */
function createSessionToken(): string {
  const expiry = Date.now() + SESSION_EXPIRY_MS;
  const token = crypto.randomBytes(16).toString('hex');
  return signValue(`${token}:${expiry}`);
}

/**
 * Verify a session token is valid and not expired.
 */
function verifySessionToken(signedToken: string): boolean {
  const value = verifySignedValue(signedToken);
  if (!value) return false;

  const parts = value.split(':');
  if (parts.length !== 2) return false;

  const expiry = parseInt(parts[1], 10);
  if (isNaN(expiry)) return false;

  return Date.now() < expiry;
}

/**
 * Check if a request is authenticated.
 */
function isAuthenticated(req: Request): boolean {
  const sessionCookie = req.cookies?.[SESSION_COOKIE];
  if (!sessionCookie) return false;
  return verifySessionToken(sessionCookie);
}

/**
 * Routes that don't require authentication.
 */
const PUBLIC_ROUTES = ['/api/auth/login', '/api/auth/logout', '/api/auth/status', '/api/health'];

/**
 * Check if a path is a public route (no auth required).
 */
function isPublicRoute(path: string): boolean {
  return PUBLIC_ROUTES.some((route) => path === route || path.startsWith(route + '/'));
}

/**
 * Authentication middleware.
 * If auth is enabled, protects all routes except public ones.
 */
export function authMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    // If auth is not enabled, pass through
    if (!isAuthEnabled()) {
      return next();
    }

    // Public routes don't require auth
    if (isPublicRoute(req.path)) {
      return next();
    }

    // Check if authenticated
    if (isAuthenticated(req)) {
      return next();
    }

    // API routes return 401
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized', requiresAuth: true });
    }

    // Non-API routes (UI) - let the SPA handle showing login
    // The UI will check /api/auth/status and show login if needed
    return next();
  };
}

/**
 * Login handler - validates password and sets session cookie.
 */
export function handleLogin(req: Request, res: Response): void {
  const { password } = req.body;
  const expectedPassword = getDashboardPassword();

  if (!expectedPassword) {
    res.status(400).json({ error: 'Authentication not configured' });
    return;
  }

  if (!password || typeof password !== 'string') {
    res.status(400).json({ error: 'Password required' });
    return;
  }

  // Timing-safe comparison
  const passwordBuffer = Buffer.from(password);
  const expectedBuffer = Buffer.from(expectedPassword);

  let isValid = false;
  if (passwordBuffer.length === expectedBuffer.length) {
    isValid = crypto.timingSafeEqual(passwordBuffer, expectedBuffer);
  }

  if (!isValid) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }

  // Create session
  const sessionToken = createSessionToken();

  res.cookie(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_EXPIRY_MS,
    path: '/',
  });

  res.json({ success: true });
}

/**
 * Logout handler - clears session cookie.
 */
export function handleLogout(_req: Request, res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ success: true });
}

/**
 * Auth status handler - returns whether auth is required and current status.
 */
export function handleAuthStatus(req: Request, res: Response): void {
  const authEnabled = isAuthEnabled();
  const authenticated = authEnabled ? isAuthenticated(req) : true;

  res.json({
    authEnabled,
    authenticated,
  });
}
