# OAuth 2.0 Broker Service — Finance MCP Relay

A TypeScript Express.js OAuth 2.0 broker that sits between Claude and Microsoft Entra ID (Azure AD). Handles authorization code + PKCE flow, token exchange, group membership validation, and token validation for nginx `auth_request`.

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in the required variables:

```bash
cp .env.example .env
```

**Required variables:**
- `ENTRA_TENANT_ID` — Your Azure AD tenant ID
- `ENTRA_CLIENT_ID` — App registration client ID in Entra
- `ENTRA_CLIENT_SECRET` — App registration client secret
- `ENTRA_REQUIRED_GROUP_ID` — Object ID (GUID) of the "Claude Users" security group in Azure Portal → Entra ID → Groups
- `SERVICE_CALLBACK_URI` — Public URI where this service receives Entra callbacks (e.g., `https://finance-oauth.franklintn.gov/finance/auth/callback`)
- `CLAUDE_REDIRECT_URI` — Where Claude's callback expects to land (e.g., `https://claude.ai/api/mcp/auth_callback`)

### 3. Run dev server

```bash
npm run dev
```

Server listens on `127.0.0.1:3000` (port configurable via `PORT` env var).

### 4. Build for production

```bash
npm run build
npm start
```

## Endpoints

### `GET /authorize`

Initiate OAuth flow (called by Claude).

**Query params:**
- `state` — CSRF token (must be preserved and returned)
- `code_challenge` — PKCE challenge from Claude
- `code_challenge_method` — PKCE method (e.g., `S256`)
- `redirect_uri` — Where to redirect after auth

**Response:**
- 302 redirect to Entra login

---

### `GET /finance/auth/callback`

Receive redirect from Entra after user logs in.

**Query params:**
- `code` — Authorization code from Entra
- `state` — CSRF token (validated)

**Logic:**
1. Validates state (prevents replay attacks)
2. Exchanges code for token from Entra
3. Validates token signature and expiration
4. Checks user is in "Claude Users" group
5. Redirects Claude to its callback with the Entra `access_token` as `code` param

**Response:**
- 302 redirect to `CLAUDE_REDIRECT_URI?code=<token>&state=<state>` on success
- 400 or 302 to callback with `error=access_denied` on failure

---

### `POST /auth/validate`

Validate Bearer tokens on incoming MCP requests (called by nginx `auth_request`).

**Headers:**
- `Authorization: Bearer <token>` — JWT from Claude request

**Logic:**
1. Extracts and validates token signature
2. Checks token expiration
3. Verifies user is in "Claude Users" group
4. Sets `X-User-Email` header for nginx to forward

**Response:**
- 200 OK if token is valid
- 401 Unauthorized if token is invalid or user not authorized

---

## PKCE Flow

This broker implements dual PKCE:

1. **Inbound (Claude → Broker):** Claude sends `code_challenge`. Broker stores it for auditability, but does not actively use it in the Entra leg.

2. **Outbound (Broker → Entra):** Broker generates its own PKCE verifier+challenge pair. Uses the broker's `code_verifier` when exchanging code with Entra.

---

## Prerequisites

- **Entra app registration** with `groupMembershipClaims` set to `"SecurityGroup"` in the app manifest. Without this, the `groups` claim will not appear in tokens.
- **"Claude Users" security group** created in Entra. Note the group's **Object ID** (GUID) — this goes in `ENTRA_REQUIRED_GROUP_ID`.

---

## Deployment (systemd)

Create `/etc/systemd/system/oauth-broker.service`:

```ini
[Unit]
Description=Finance MCP OAuth Broker
After=network.target

[Service]
Type=simple
User=oauth-broker
WorkingDirectory=/opt/oauth-service
EnvironmentFile=/opt/oauth-service/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable oauth-broker
sudo systemctl start oauth-broker
```

---

## Nginx Configuration

Protect your MCP endpoints with `auth_request`:

```nginx
location /mcp/finance/ {
    auth_request /auth/validate;
    auth_request_set $user_email $upstream_http_x_user_email;
    proxy_set_header X-User-Email $user_email;
    proxy_pass http://127.0.0.1:8080/;  # Finance MCP relay
}

location = /auth/validate {
    internal;
    proxy_pass http://127.0.0.1:3000/auth/validate;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header Authorization $http_authorization;
}
```

---

## Logging

All requests are logged with method, path, status code, and duration:

```
[2026-05-13T15:30:45.123Z] GET /authorize 302 145ms
[2026-05-13T15:30:50.456Z] GET /finance/auth/callback 302 1250ms
[2026-05-13T15:35:20.789Z] POST /auth/validate 200 45ms
```

Errors are logged to stdout with full stack trace.

---

## Development Notes

- Uses native `fetch()` for all HTTP calls (no axios)
- JWKS public keys are cached for 1 hour with force-refresh on key rotation
- OAuth state is stored in-memory with 10-minute TTL
- Expired state entries are purged every 5 minutes
- Binds to `127.0.0.1` only — nginx is the TLS terminator and public proxy

---

## Testing Checklist

- [ ] `npm run typecheck` passes zero errors
- [ ] `npm run dev` starts and binds to `127.0.0.1:3000`
- [ ] `GET /authorize?state=test&code_challenge=xxx&code_challenge_method=S256&redirect_uri=https://...` → 302 redirect to Entra
- [ ] `GET /authorize` with missing params → 400
- [ ] Complete Entra login flow → `GET /finance/auth/callback?code=...&state=...` → 302 redirect to Claude callback
- [ ] Replay same state → 400 (state deleted after first use, prevents replay)
- [ ] `POST /auth/validate` with valid token + correct group → 200 + `X-User-Email` header
- [ ] `POST /auth/validate` with expired/invalid token → 401
- [ ] `POST /auth/validate` with user NOT in group → 401
- [ ] `POST /auth/validate` with no Authorization header → 401
