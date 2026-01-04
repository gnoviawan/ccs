/**
 * WebSocket Handler (Phase 04)
 *
 * Manages WebSocket connections, broadcasts file changes, and handles client messages.
 * Also broadcasts project selection events during OAuth flows.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createFileWatcher, FileChangeEvent } from './file-watcher';
import { info, warn } from '../utils/ui';
import {
  projectSelectionEvents,
  type ProjectSelectionPrompt,
} from '../cliproxy/project-selection-handler';
import { deviceCodeEvents, type DeviceCodePrompt } from '../cliproxy/device-code-handler';
import { remoteOAuthEvents, type RemoteOAuthPrompt } from '../cliproxy/remote-oauth-handler';

export interface WSMessage {
  type: string;
  [key: string]: unknown;
}

export function setupWebSocket(wss: WebSocketServer): { cleanup: () => void } {
  // Track connected clients
  const clients = new Set<WebSocket>();

  // Broadcast message to all clients
  function broadcast(message: WSMessage): void {
    const data = JSON.stringify(message);
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  // Handle new connections
  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(info(`[WS] Client connected (${clients.size} total)`));

    // Send welcome message
    ws.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));

    // Handle client messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleClientMessage(ws, message);
      } catch {
        console.log(warn('[WS] Invalid message format'));
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      clients.delete(ws);
      console.log(info(`[WS] Client disconnected (${clients.size} remaining)`));
    });

    ws.on('error', (err) => {
      console.log(warn(`[WS] Error: ${err.message}`));
      clients.delete(ws);
    });
  });

  // Handle incoming client messages
  function handleClientMessage(ws: WebSocket, message: WSMessage): void {
    switch (message.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;
      case 'subscribe':
        // Future: selective subscriptions
        break;
      default:
        console.log(warn(`[WS] Unknown message type: ${message.type}`));
    }
  }

  // Setup file watcher
  const watcher = createFileWatcher((event: FileChangeEvent) => {
    console.log(info(`[FS] ${event.type}: ${event.path}`));
    broadcast({
      type: event.type,
      path: event.path,
      timestamp: event.timestamp,
    });
  });

  // Listen for project selection events and broadcast to clients
  const handleProjectSelectionRequired = (prompt: ProjectSelectionPrompt): void => {
    console.log(info(`[WS] Broadcasting project selection prompt (session: ${prompt.sessionId})`));
    broadcast({
      type: 'projectSelectionRequired',
      ...prompt,
      timestamp: Date.now(),
    });
  };

  const handleProjectSelectionTimeout = (sessionId: string): void => {
    console.log(info(`[WS] Project selection timed out (session: ${sessionId})`));
    broadcast({
      type: 'projectSelectionTimeout',
      sessionId,
      timestamp: Date.now(),
    });
  };

  const handleProjectSelectionSubmitted = (response: {
    sessionId: string;
    selectedId: string;
  }): void => {
    console.log(info(`[WS] Project selection submitted (session: ${response.sessionId})`));
    broadcast({
      type: 'projectSelectionSubmitted',
      ...response,
      timestamp: Date.now(),
    });
  };

  // Listen for device code events and broadcast to clients
  const handleDeviceCodeReceived = (prompt: DeviceCodePrompt): void => {
    console.log(info(`[WS] Broadcasting device code (session: ${prompt.sessionId})`));
    broadcast({
      type: 'deviceCodeReceived',
      ...prompt,
      timestamp: Date.now(),
    });
  };

  const handleDeviceCodeCompleted = (sessionId: string): void => {
    console.log(info(`[WS] Device code auth completed (session: ${sessionId})`));
    broadcast({
      type: 'deviceCodeCompleted',
      sessionId,
      timestamp: Date.now(),
    });
  };

  const handleDeviceCodeFailed = (data: { sessionId: string; error?: string }): void => {
    console.log(info(`[WS] Device code auth failed (session: ${data.sessionId})`));
    broadcast({
      type: 'deviceCodeFailed',
      ...data,
      timestamp: Date.now(),
    });
  };

  const handleDeviceCodeExpired = (sessionId: string): void => {
    console.log(info(`[WS] Device code expired (session: ${sessionId})`));
    broadcast({
      type: 'deviceCodeExpired',
      sessionId,
      timestamp: Date.now(),
    });
  };

  // Listen for remote OAuth events and broadcast to clients
  const handleRemoteOAuthUrlDetected = (prompt: RemoteOAuthPrompt): void => {
    console.log(info(`[WS] Broadcasting remote OAuth URL (session: ${prompt.sessionId})`));
    broadcast({
      type: 'remoteOAuthUrlReceived',
      ...prompt,
      timestamp: Date.now(),
    });
  };

  const handleRemoteOAuthCompleted = (sessionId: string): void => {
    console.log(info(`[WS] Remote OAuth completed (session: ${sessionId})`));
    broadcast({
      type: 'remoteOAuthCompleted',
      sessionId,
      timestamp: Date.now(),
    });
  };

  const handleRemoteOAuthFailed = (data: { sessionId: string; error?: string }): void => {
    console.log(info(`[WS] Remote OAuth failed (session: ${data.sessionId})`));
    broadcast({
      type: 'remoteOAuthFailed',
      ...data,
      timestamp: Date.now(),
    });
  };

  const handleRemoteOAuthExpired = (sessionId: string): void => {
    console.log(info(`[WS] Remote OAuth expired (session: ${sessionId})`));
    broadcast({
      type: 'remoteOAuthExpired',
      sessionId,
      timestamp: Date.now(),
    });
  };

  // Subscribe to project selection events
  projectSelectionEvents.on('selection:required', handleProjectSelectionRequired);
  projectSelectionEvents.on('selection:timeout', handleProjectSelectionTimeout);
  projectSelectionEvents.on('selection:submitted', handleProjectSelectionSubmitted);

  // Subscribe to device code events
  deviceCodeEvents.on('deviceCode:received', handleDeviceCodeReceived);
  deviceCodeEvents.on('deviceCode:completed', handleDeviceCodeCompleted);
  deviceCodeEvents.on('deviceCode:failed', handleDeviceCodeFailed);
  deviceCodeEvents.on('deviceCode:expired', handleDeviceCodeExpired);

  // Subscribe to remote OAuth events
  remoteOAuthEvents.on('remoteOAuth:urlDetected', handleRemoteOAuthUrlDetected);
  remoteOAuthEvents.on('remoteOAuth:completed', handleRemoteOAuthCompleted);
  remoteOAuthEvents.on('remoteOAuth:failed', handleRemoteOAuthFailed);
  remoteOAuthEvents.on('remoteOAuth:expired', handleRemoteOAuthExpired);

  // Cleanup function
  const cleanup = (): void => {
    watcher.close();

    // Unsubscribe from project selection events
    projectSelectionEvents.off('selection:required', handleProjectSelectionRequired);
    projectSelectionEvents.off('selection:timeout', handleProjectSelectionTimeout);
    projectSelectionEvents.off('selection:submitted', handleProjectSelectionSubmitted);

    // Unsubscribe from device code events
    deviceCodeEvents.off('deviceCode:received', handleDeviceCodeReceived);
    deviceCodeEvents.off('deviceCode:completed', handleDeviceCodeCompleted);
    deviceCodeEvents.off('deviceCode:failed', handleDeviceCodeFailed);
    deviceCodeEvents.off('deviceCode:expired', handleDeviceCodeExpired);

    // Unsubscribe from remote OAuth events
    remoteOAuthEvents.off('remoteOAuth:urlDetected', handleRemoteOAuthUrlDetected);
    remoteOAuthEvents.off('remoteOAuth:completed', handleRemoteOAuthCompleted);
    remoteOAuthEvents.off('remoteOAuth:failed', handleRemoteOAuthFailed);
    remoteOAuthEvents.off('remoteOAuth:expired', handleRemoteOAuthExpired);

    clients.forEach((client) => {
      client.close(1001, 'Server shutting down');
    });
    clients.clear();
  };

  return { cleanup };
}
