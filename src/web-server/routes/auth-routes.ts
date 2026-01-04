/**
 * Dashboard Authentication Routes
 *
 * Provides login/logout/status endpoints for dashboard authentication.
 */

import { Router } from 'express';
import { handleLogin, handleLogout, handleAuthStatus } from '../auth-middleware';

const router = Router();

/**
 * POST /api/auth/login
 * Authenticate with password
 */
router.post('/login', handleLogin);

/**
 * POST /api/auth/logout
 * Clear session
 */
router.post('/logout', handleLogout);

/**
 * GET /api/auth/status
 * Check auth status
 */
router.get('/status', handleAuthStatus);

export const authRoutes = router;
