/**
 * WebSocket Hook (Phase 04)
 *
 * Manages WebSocket connection, auto-reconnect, and React Query invalidation.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface WSMessage {
  type: string;
  path?: string;
  timestamp?: number;
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export function useWebSocket() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<() => void>(() => {});

  const handleMessage = useCallback(
    (message: WSMessage) => {
      switch (message.type) {
        case 'connected':
          console.log('[WS] Server acknowledged connection');
          break;

        case 'config-changed':
          queryClient.invalidateQueries({ queryKey: ['profiles'] });
          queryClient.invalidateQueries({ queryKey: ['cliproxy'] });
          toast.info('Configuration updated externally');
          break;

        case 'settings-changed':
          queryClient.invalidateQueries({ queryKey: ['profiles'] });
          toast.info('Settings file updated');
          break;

        case 'profiles-changed':
          queryClient.invalidateQueries({ queryKey: ['accounts'] });
          toast.info('Accounts updated');
          break;

        case 'proxy-status-changed':
          queryClient.invalidateQueries({ queryKey: ['proxy-status'] });
          break;

        case 'pong':
          // Heartbeat response
          break;

        default:
          console.log(`[WS] Unknown message: ${message.type}`);
      }
    },
    [queryClient]
  );

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus('connecting');
    // Use wss:// for HTTPS, ws:// for HTTP
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${wsProtocol}//${window.location.host}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      reconnectAttempts.current = 0;
      console.log('[WS] Connected');
    };

    ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);
        handleMessage(message);

        // Dispatch custom event for other hooks to listen (e.g., project selection)
        window.dispatchEvent(new CustomEvent('ws-message', { detail: message }));
      } catch {
        console.log('[WS] Invalid message');
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      wsRef.current = null;

      // Attempt reconnect with exponential backoff
      if (reconnectAttempts.current < maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectAttempts.current++;
        console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`);
        // Use ref to avoid stale closure
        reconnectTimeoutRef.current = setTimeout(() => {
          connectRef.current();
        }, delay);
      }
    };

    ws.onerror = () => {
      console.log('[WS] Connection error');
    };
  }, [handleMessage]);

  // Keep ref in sync
  connectRef.current = connect;

  const disconnect = useCallback(() => {
    reconnectAttempts.current = maxReconnectAttempts; // Prevent reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    wsRef.current?.close();
  }, []);

  // Initial connection - use ref to satisfy linter
  useEffect(() => {
    connectRef.current();
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Heartbeat to keep connection alive
  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return useMemo(() => ({ status, connect, disconnect }), [status, connect, disconnect]);
}
