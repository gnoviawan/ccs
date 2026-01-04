/**
 * Remote OAuth Hook
 *
 * Listens for WebSocket remote OAuth events and manages dialog state.
 * Used in deployed mode when OAuth callbacks can't reach the server directly
 * and users need to manually relay the callback URL.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';

export interface RemoteOAuthPrompt {
  sessionId: string;
  provider: string;
  oauthUrl: string;
  callbackPort: number;
  expiresAt: number;
}

interface RemoteOAuthState {
  isOpen: boolean;
  prompt: RemoteOAuthPrompt | null;
  error: string | null;
  isSubmitting: boolean;
}

/** Provider display names for user-friendly messages */
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  gemini: 'Google Gemini',
  codex: 'Amazon CodeWhisperer',
  agy: 'Anthropic',
  kiro: 'Kiro',
  iflow: 'iFlow',
};

export function useRemoteOAuth() {
  const [state, setState] = useState<RemoteOAuthState>({
    isOpen: false,
    prompt: null,
    error: null,
    isSubmitting: false,
  });

  // Listen for WebSocket messages via custom events
  useEffect(() => {
    const handleMessage = (event: CustomEvent<{ type: string; [key: string]: unknown }>) => {
      const data = event.detail;

      if (data.type === 'remoteOAuthUrlReceived') {
        console.log('[RemoteOAuth] Received prompt:', data.sessionId);
        const displayName = PROVIDER_DISPLAY_NAMES[data.provider as string] || data.provider;
        toast.info(`${displayName} remote authorization required`);

        setState({
          isOpen: true,
          prompt: {
            sessionId: data.sessionId as string,
            provider: data.provider as string,
            oauthUrl: data.oauthUrl as string,
            callbackPort: data.callbackPort as number,
            expiresAt: data.expiresAt as number,
          },
          error: null,
          isSubmitting: false,
        });
      } else if (data.type === 'remoteOAuthCompleted') {
        console.log('[RemoteOAuth] Auth completed:', data.sessionId);
        setState((prev) => {
          if (prev.prompt && prev.prompt.sessionId === data.sessionId) {
            const displayName =
              PROVIDER_DISPLAY_NAMES[prev.prompt.provider] || prev.prompt.provider;
            toast.success(`${displayName} authentication successful!`);
            return { isOpen: false, prompt: null, error: null, isSubmitting: false };
          }
          return prev;
        });
      } else if (data.type === 'remoteOAuthFailed') {
        console.log('[RemoteOAuth] Auth failed:', data.sessionId, data.error);
        setState((prev) => {
          if (prev.prompt && prev.prompt.sessionId === data.sessionId) {
            const displayName =
              PROVIDER_DISPLAY_NAMES[prev.prompt.provider] || prev.prompt.provider;
            toast.error(`${displayName} authentication failed`);
            return {
              isOpen: false,
              prompt: null,
              error: data.error as string,
              isSubmitting: false,
            };
          }
          return prev;
        });
      } else if (data.type === 'remoteOAuthExpired') {
        console.log('[RemoteOAuth] Session expired:', data.sessionId);
        setState((prev) => {
          if (prev.prompt?.sessionId === data.sessionId) {
            toast.error('Remote OAuth session expired. Please try again.');
            return {
              isOpen: false,
              prompt: null,
              error: 'Session expired',
              isSubmitting: false,
            };
          }
          return prev;
        });
      }
    };

    // Listen for custom ws-message events dispatched by useWebSocket
    window.addEventListener('ws-message', handleMessage as EventListener);

    return () => {
      window.removeEventListener('ws-message', handleMessage as EventListener);
    };
  }, []);

  const handleClose = useCallback(() => {
    setState({ isOpen: false, prompt: null, error: null, isSubmitting: false });
  }, []);

  const handleOpenUrl = useCallback(() => {
    if (state.prompt?.oauthUrl) {
      window.open(state.prompt.oauthUrl, '_blank', 'noopener,noreferrer');
    }
  }, [state.prompt]);

  const handleSubmitCallback = useCallback(
    async (callbackUrl: string) => {
      if (!state.prompt) {
        return { success: false, error: 'No active session' };
      }

      setState((prev) => ({ ...prev, isSubmitting: true, error: null }));

      try {
        const response = await fetch('/api/cliproxy/auth/callback-relay', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: state.prompt.sessionId,
            callbackUrl,
          }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          // Success - the WebSocket event will close the dialog
          return { success: true };
        } else {
          const errorMessage = data.error || 'Failed to submit callback URL';
          setState((prev) => ({ ...prev, isSubmitting: false, error: errorMessage }));
          return { success: false, error: errorMessage };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Network error';
        setState((prev) => ({ ...prev, isSubmitting: false, error: errorMessage }));
        return { success: false, error: errorMessage };
      }
    },
    [state.prompt]
  );

  return useMemo(
    () => ({
      isOpen: state.isOpen,
      prompt: state.prompt,
      error: state.error,
      isSubmitting: state.isSubmitting,
      onClose: handleClose,
      onOpenUrl: handleOpenUrl,
      onSubmitCallback: handleSubmitCallback,
    }),
    [
      state.isOpen,
      state.prompt,
      state.error,
      state.isSubmitting,
      handleClose,
      handleOpenUrl,
      handleSubmitCallback,
    ]
  );
}
