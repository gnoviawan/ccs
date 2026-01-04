# Docker Deployment Guide

Deploy CCS Dashboard and CLIProxy API using Docker for remote access and team sharing.

---

## Quick Start

### 1. Build and Start

```bash
# Build and start the container
docker compose up -d

# View logs
docker compose logs -f ccs-dashboard
```

### 2. Access Dashboard

Open http://localhost:3000 in your browser.

### 3. Configure Claude Code Clients

On your local machine, configure Claude Code to use the remote proxy:

```bash
# Via CCS CLI
ccs gemini --proxy-host <server-ip> --proxy-port 8317

# Or via environment variables
export CCS_PROXY_HOST=<server-ip>
export CCS_PROXY_PORT=8317
ccs gemini
```

---

## Architecture

```
+------------------+     +------------------------+     +----------------+
|  Claude Code     | --> |  CCS Docker Container  | --> | Provider APIs  |
|  (Local Machine) |     |  - Dashboard (3000)    |     | (Gemini, etc)  |
+------------------+     |  - CLIProxy (8317)     |     +----------------+
                         +------------------------+
                                    |
                         +----------+----------+
                         |                     |
                    ccs-data             OAuth Tokens
                    (volume)             (in volume)
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CCS_CONFIG_DIR` | `/data/.ccs` | Config directory path |
| `CCS_DASHBOARD_HOST` | `0.0.0.0` | Dashboard bind address |
| `CCS_DASHBOARD_PORT` | `3000` | Dashboard port |
| `CCS_PROXY_HOST` | `0.0.0.0` | CLIProxy bind address |
| `CCS_PROXY_PORT` | `8317` | CLIProxy port |
| `CCS_PROXY_AUTH_TOKEN` | (none) | Optional auth token for remote access |

### Secure Remote Access

For production deployments, set an auth token:

```yaml
# docker-compose.yml
environment:
  - CCS_PROXY_AUTH_TOKEN=your-secret-token-here
```

Then on clients:

```bash
ccs gemini --proxy-auth-token your-secret-token-here
```

---

## Volumes

| Volume | Path | Purpose |
|--------|------|---------|
| `ccs-data` | `/data/.ccs` | Configuration, profiles, OAuth tokens |

### Backup Configuration

```bash
# Backup
docker run --rm -v ccs-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/ccs-backup.tar.gz /data

# Restore
docker run --rm -v ccs-data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/ccs-backup.tar.gz -C /
```

---

## Ports

| Port | Service | Protocol |
|------|---------|----------|
| 3000 | Dashboard UI | HTTP |
| 8317 | CLIProxy API | HTTP |

### Using HTTPS (Recommended for Production)

Use a reverse proxy like Nginx or Traefik:

```yaml
# docker-compose.override.yml
services:
  traefik:
    image: traefik:v2.10
    ports:
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./traefik:/etc/traefik
    networks:
      - ccs-network

  ccs-dashboard:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.ccs.rule=Host(`ccs.yourdomain.com`)"
      - "traefik.http.routers.ccs.tls.certresolver=letsencrypt"
```

---

## OAuth Authentication

### Important Limitation

OAuth providers (Gemini, Codex, etc.) require **browser-based authentication**. To authenticate:

1. Access the dashboard at http://localhost:3000
2. Go to **CLIProxy** section
3. Click **Authenticate** for each provider
4. Complete OAuth flow in browser
5. Tokens are stored in the `ccs-data` volume

### Headless OAuth (Alternative)

For truly headless servers, you can:

1. Authenticate on a local machine first
2. Copy the auth tokens to the server:

```bash
# On local machine
tar czf auth-tokens.tar.gz ~/.ccs/cliproxy/auth/

# Copy to server and restore
scp auth-tokens.tar.gz server:/tmp/
docker compose exec ccs-dashboard sh -c "tar xzf /tmp/auth-tokens.tar.gz -C /data/.ccs/"
```

---

## Development Mode

For development with hot reload:

```yaml
# docker-compose.override.yml
services:
  ccs-dashboard:
    build:
      target: builder
    volumes:
      - ./src:/app/src
      - ./ui/src:/app/ui/src
    command: ["bun", "run", "dev"]
```

```bash
docker compose up -d
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker compose logs ccs-dashboard

# Shell into container
docker compose exec ccs-dashboard sh
```

### Port Already in Use

```bash
# Use different ports
docker compose up -d -e CCS_DASHBOARD_PORT=3001
```

### Permission Issues

```bash
# Fix volume permissions
docker compose exec ccs-dashboard chown -R node:node /data/.ccs
```

### Health Check Failing

```bash
# Manual health check
docker compose exec ccs-dashboard wget -qO- http://localhost:3000/api/health
```

---

## Updates

```bash
# Pull latest and rebuild
docker compose pull
docker compose build --no-cache
docker compose up -d
```

---

## Uninstall

```bash
# Stop and remove containers
docker compose down

# Remove volumes (WARNING: deletes all data)
docker compose down -v
```
