/**
 * Auth Module - Barrel Export
 *
 * Re-exports all auth-related functionality from submodules.
 */

// Types and configurations
export type { AuthStatus, ProviderOAuthConfig, OAuthOptions } from './auth-types';
export {
  OAUTH_CALLBACK_PORTS,
  OAUTH_CONFIGS,
  PROVIDER_AUTH_PREFIXES,
  PROVIDER_TYPE_VALUES,
  getOAuthConfig,
} from './auth-types';

// Token management
export {
  getProviderTokenDir,
  isTokenFileForProvider,
  isAuthenticated,
  getAuthStatus,
  getAllAuthStatus,
  clearAuth,
  registerAccountFromToken,
  displayAuthStatus,
} from './token-manager';

// Environment detection
export {
  isHeadlessEnvironment,
  killProcessOnPort,
  getTimeoutTroubleshooting,
  showStep,
  isDeployedMode,
} from './environment-detector';

// OAuth handling
export { triggerOAuth, ensureAuth } from './oauth-handler';
