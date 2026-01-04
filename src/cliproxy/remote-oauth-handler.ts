/**
 * Remote OAuth Handler
 *
 * Manages remote OAuth flow for deployed CCS instances.
 * When CCS is running in a Docker container behind a reverse proxy,
 * OAuth callbacks can't reach the container's localhost.
 *
 * This module:
 * 1. Detects deployed mode (CCS_PROXY_HOST set)
 * 2. Registers pending remote OAuth sessions
 * 3. Provides callback URL relay functionality
 *
 * Events emitted:
 * - remoteOAuth:urlDetected - When OAuth URL is detected in deployed mode
 * - remoteOAuth:completed - When callback relay succeeds
 * - remoteOAuth:failed - When callback relay fails
 */

import { EventEmitter } from 'events';
import { isDeployedMode } from './auth/environment-detector';

// Re-export for consumers who import from this module
export { isDeployedMode };

/**
 * Remote OAuth prompt data sent to UI
 */
export interface RemoteOAuthPrompt {
  sessionId: string;
  provider: string;
  oauthUrl: string;
  callbackPort: number;
  expiresAt: number;
}

/**
 * Pending remote OAuth session
 */
interface RemoteOAuthSession {
  prompt: RemoteOAuthPrompt;
  createdAt: number;
  timeout: NodeJS.Timeout;
}

// Global event emitter for remote OAuth events
export const remoteOAuthEvents = new EventEmitter();

// Pending sessions by session ID
const pendingSessions = new Map<string, RemoteOAuthSession>();

// Default timeout for remote OAuth (5 minutes - OAuth URLs typically expire after 10 min)
export const REMOTE_OAUTH_TIMEOUT_MS = 300000;

/**
 * Register a new remote OAuth session
 *
 * @param prompt - Remote OAuth prompt data
 */
export function registerRemoteOAuthSession(prompt: RemoteOAuthPrompt): void {
  // Clear any existing session with same ID
  if (pendingSessions.has(prompt.sessionId)) {
    const existing = pendingSessions.get(prompt.sessionId);
    if (existing) {
      clearTimeout(existing.timeout);
    }
    pendingSessions.delete(prompt.sessionId);
  }

  // Set timeout for session expiry
  const timeout = setTimeout(() => {
    const session = pendingSessions.get(prompt.sessionId);
    if (session) {
      pendingSessions.delete(prompt.sessionId);
      remoteOAuthEvents.emit('remoteOAuth:expired', prompt.sessionId);
    }
  }, REMOTE_OAUTH_TIMEOUT_MS);

  // Store session
  pendingSessions.set(prompt.sessionId, {
    prompt,
    createdAt: Date.now(),
    timeout,
  });

  // Emit event for WebSocket broadcast
  remoteOAuthEvents.emit('remoteOAuth:urlDetected', prompt);
}

/**
 * Get a pending remote OAuth session
 *
 * @param sessionId - Session ID to look up
 * @returns Session prompt or null if not found
 */
export function getRemoteOAuthSession(sessionId: string): RemoteOAuthPrompt | null {
  const session = pendingSessions.get(sessionId);
  return session ? session.prompt : null;
}

/**
 * Check if there's a pending remote OAuth session
 *
 * @param sessionId - Session ID to check
 */
export function hasPendingRemoteOAuthSession(sessionId: string): boolean {
  return pendingSessions.has(sessionId);
}

/**
 * Parse callback URL to extract code and state
 *
 * @param callbackUrl - Full callback URL with query params
 * @returns Object with code and state, or null if invalid
 */
export function parseCallbackUrl(callbackUrl: string): { code: string; state: string } | null {
  try {
    const url = new URL(callbackUrl);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code) {
      return null;
    }

    return { code, state: state || '' };
  } catch (error) {
    console.warn('[remote-oauth] Failed to parse callback URL:', error);
    return null;
  }
}

/**
 * Submit callback URL from user
 *
 * Parses the URL to extract OAuth code/state parameters.
 *
 * @param sessionId - Session ID for the OAuth flow
 * @param callbackUrl - Full callback URL pasted by user
 * @returns Parsed code and state, or null if parsing failed
 */
export function submitCallbackUrl(
  sessionId: string,
  callbackUrl: string
): { code: string; state: string; callbackPort: number } | null {
  const session = pendingSessions.get(sessionId);

  if (!session) {
    return null;
  }

  const parsed = parseCallbackUrl(callbackUrl);

  if (!parsed) {
    return null;
  }

  return {
    ...parsed,
    callbackPort: session.prompt.callbackPort,
  };
}

/**
 * Complete a remote OAuth session (after successful relay)
 *
 * @param sessionId - Session ID to complete
 */
export function completeRemoteOAuthSession(sessionId: string): boolean {
  const session = pendingSessions.get(sessionId);

  if (!session) {
    return false;
  }

  clearTimeout(session.timeout);
  pendingSessions.delete(sessionId);

  remoteOAuthEvents.emit('remoteOAuth:completed', sessionId);

  return true;
}

/**
 * Fail a remote OAuth session
 *
 * @param sessionId - Session ID to fail
 * @param error - Error message
 */
export function failRemoteOAuthSession(sessionId: string, error: string): boolean {
  const session = pendingSessions.get(sessionId);

  if (!session) {
    return false;
  }

  clearTimeout(session.timeout);
  pendingSessions.delete(sessionId);

  remoteOAuthEvents.emit('remoteOAuth:failed', { sessionId, error });

  return true;
}

/**
 * Cancel a remote OAuth session
 *
 * @param sessionId - Session ID to cancel
 */
export function cancelRemoteOAuthSession(sessionId: string): boolean {
  const session = pendingSessions.get(sessionId);

  if (!session) {
    return false;
  }

  clearTimeout(session.timeout);
  pendingSessions.delete(sessionId);

  return true;
}

export default {
  remoteOAuthEvents,
  registerRemoteOAuthSession,
  getRemoteOAuthSession,
  hasPendingRemoteOAuthSession,
  parseCallbackUrl,
  submitCallbackUrl,
  completeRemoteOAuthSession,
  failRemoteOAuthSession,
  cancelRemoteOAuthSession,
  REMOTE_OAUTH_TIMEOUT_MS,
};
