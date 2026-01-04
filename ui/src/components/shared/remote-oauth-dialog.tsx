/**
 * Remote OAuth Dialog Component
 *
 * Displays during remote OAuth flow when CCS is deployed behind a reverse proxy.
 * Users need to:
 * 1. Open the OAuth URL in their browser
 * 2. Complete authentication
 * 3. Copy the callback URL from their browser's address bar
 * 4. Paste it here for relay to the server
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ExternalLink,
  Copy,
  Check,
  Loader2,
  KeyRound,
  ClipboardPaste,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

interface RemoteOAuthDialogProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  provider: string;
  oauthUrl: string;
  callbackPort: number;
  expiresAt: number;
  isSubmitting: boolean;
  error: string | null;
  onOpenUrl: () => void;
  onSubmitCallback: (callbackUrl: string) => Promise<{ success: boolean; error?: string }>;
}

/** Provider display names */
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  gemini: 'Google Gemini',
  codex: 'Amazon CodeWhisperer',
  agy: 'Anthropic',
  kiro: 'Kiro',
  iflow: 'iFlow',
};

/** Provider specific instructions */
const PROVIDER_INSTRUCTIONS: Record<string, string> = {
  gemini: 'Sign in with your Google account that has Gemini API access.',
  codex: 'Sign in with your AWS account that has CodeWhisperer access.',
  agy: 'Sign in with your Google account to authorize Anthropic access.',
  kiro: 'Sign in with your account to authorize Kiro access.',
  iflow: 'Sign in with your account to authorize iFlow access.',
};

export function RemoteOAuthDialog({
  open,
  onClose,
  sessionId,
  provider,
  oauthUrl,
  expiresAt,
  isSubmitting,
  error,
  onOpenUrl,
  onSubmitCallback,
}: RemoteOAuthDialogProps) {
  const [callbackUrl, setCallbackUrl] = useState('');
  const [hasCopiedUrl, setHasCopiedUrl] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  // Calculate and update remaining time
  useEffect(() => {
    if (!open) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const updateTime = () => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setTimeRemaining(remaining);
      if (remaining === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    updateTime();
    timer = setInterval(updateTime, 1000);

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [open, expiresAt]);

  const handleCopyOAuthUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(oauthUrl);
      setHasCopiedUrl(true);
      toast.success('OAuth URL copied to clipboard');
      setTimeout(() => setHasCopiedUrl(false), 2000);
    } catch {
      toast.error('Failed to copy URL');
    }
  }, [oauthUrl]);

  const handlePasteCallback = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setCallbackUrl(text);
      toast.success('Pasted from clipboard');
    } catch {
      toast.error('Failed to paste from clipboard');
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!callbackUrl.trim()) {
      toast.error('Please paste the callback URL');
      return;
    }

    // Validate URL format
    if (!callbackUrl.includes('code=')) {
      toast.error('Invalid callback URL - must contain "code=" parameter');
      return;
    }

    await onSubmitCallback(callbackUrl);
  }, [callbackUrl, onSubmitCallback]);

  const providerDisplay = PROVIDER_DISPLAY_NAMES[provider] || provider;
  const instructions =
    PROVIDER_INSTRUCTIONS[provider] || 'Complete the authorization in your browser.';

  // Format remaining time
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isExpired = timeRemaining === 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-lg" data-session-id={sessionId}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5" />
            Remote Authorization: {providerDisplay}
          </DialogTitle>
          <DialogDescription>
            Complete authentication in your browser, then paste the callback URL below.
            {timeRemaining !== null && timeRemaining > 0 && (
              <span className="text-muted-foreground ml-1">
                (Expires in {formatTime(timeRemaining)})
              </span>
            )}
            {isExpired && (
              <span className="text-destructive ml-1 font-medium">(Session expired)</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Step 1: Open OAuth URL */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs">
                1
              </span>
              Open the login page
            </div>
            <p className="text-sm text-muted-foreground pl-8">{instructions}</p>
            <div className="flex gap-2 pl-8">
              <Button onClick={onOpenUrl} className="flex-1" disabled={isExpired}>
                <ExternalLink className="w-4 h-4 mr-2" />
                Open Login
              </Button>
              <Button variant="outline" onClick={handleCopyOAuthUrl} disabled={isExpired}>
                {hasCopiedUrl ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Step 2: Complete auth and copy URL */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs">
                2
              </span>
              Complete authentication
            </div>
            <p className="text-sm text-muted-foreground pl-8">
              After logging in, your browser will show an error page (localhost not found).{' '}
              <strong>Copy the full URL</strong> from your browser&apos;s address bar.
            </p>
          </div>

          {/* Step 3: Paste callback URL */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs">
                3
              </span>
              Paste the callback URL
            </div>
            <div className="pl-8 space-y-2">
              <Label htmlFor="callback-url" className="sr-only">
                Callback URL
              </Label>
              <div className="flex gap-2">
                <Input
                  id="callback-url"
                  placeholder="http://localhost:51121/oauth-callback?code=..."
                  value={callbackUrl}
                  onChange={(e) => setCallbackUrl(e.target.value)}
                  disabled={isSubmitting || isExpired}
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handlePasteCallback}
                  disabled={isSubmitting || isExpired}
                  title="Paste from clipboard"
                >
                  <ClipboardPaste className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Error display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Submit button */}
          <Button
            onClick={handleSubmit}
            className="w-full"
            disabled={isSubmitting || isExpired || !callbackUrl.trim()}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Completing authentication...
              </>
            ) : (
              'Complete Authentication'
            )}
          </Button>

          {/* Help text */}
          <p className="text-xs text-muted-foreground text-center">
            This extra step is required because CCS is running on a remote server.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
