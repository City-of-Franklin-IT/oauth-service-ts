# OAuth 2.0 Broker Service

An Express.js-based OAuth 2.0 broker that mediates authentication between Claude and Microsoft Entra ID (Azure AD). This service implements the authorization code flow with PKCE support, token validation, and group membership verification for the Finance MCP relay.

## Purpose

This service acts as a secure intermediary for OAuth flows in the Finance MCP relay architecture. It handles:

- **OAuth authorization initiation** — Redirects users to Entra login
- **Token exchange** — Exchanges authorization codes for access tokens
- **Token validation** — Validates JWT tokens from Claude requests
- **Group membership verification** — Ensures only members of the "Claude Users" group can access resources
- **PKCE support** — Implements Proof Key for Public Clients for enhanced security

## Architecture

The service follows a standard OAuth 2.0 authorization code flow with PKCE:

1. **Client (Claude)** initiates auth → **/authorize** endpoint
2. User redirected to Entra login with PKCE challenge
3. User authenticates with Entra
4. Entra redirects back to **/finance/auth/callback** with authorization code
5. Service exchanges code for token (with PKCE verifier)
6. Service validates token and group membership
7. Redirects to Claude callback URL with token
8. Claude can validate tokens via **/auth/validate** endpoint

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+
- Entra ID (Microsoft Azure) app registration with:
  - Client ID
  - Client secret
  - Configured redirect URIs
  - "Claude Users" security group with members
  - Group membership claims enabled in app manifest

### Installation

```bash
npm install
npm run build
npm start
```

### Development

```bash
npm run dev
```

Starts the service with hot reload via `tsx watch`. Server listens on `127.0.0.1:3000`.

## Configuration

All configuration is loaded from environment variables. Create a `.env` file in the project root:

```env
# Entra ID Configuration
ENTRA_TENANT_ID=<your-tenant-guid>
ENTRA_CLIENT_ID=<app-registration-client-id>
ENTRA_CLIENT_SECRET=<app-registration-client-secret>
ENTRA_AUTHORITY=https://login.microsoftonline.com
ENTRA_REQUIRED_GROUP_ID=<claude-users-group-guid>

# Service URLs
SERVICE_CALLBACK_URI=https://cofasv32.franklintn.gov/finance/auth/callback
CLAUDE_REDIRECT_URI=https://claude.ai/api/mcp/auth_callback

# Server Configuration
PORT=3000
NODE_ENV=production
```

### Required Environment Variables

| Variable | Description | Example |
|---|---|---|
| `ENTRA_TENANT_ID` | Azure AD tenant GUID | `12345678-1234-1234-1234-123456789012` |
| `ENTRA_CLIENT_ID` | App registration client ID | `87654321-4321-4321-4321-210987654321` |
| `ENTRA_CLIENT_SECRET` | App registration client secret | `abc123xyz...` |
| `ENTRA_REQUIRED_GROUP_ID` | "Claude Users" group GUID | `11111111-2222-3333-4444-555555555555` |
| `SERVICE_CALLBACK_URI` | Public callback URL | `https://cofasv32.franklintn.gov/finance/auth/callback` |
| `CLAUDE_REDIRECT_URI` | Claude's callback URL | `https://claude.ai/api/mcp/auth_callback` |

### Optional Environment Variables

| Variable | Default | Description |
|---|---|---|
| `ENTRA_AUTHORITY` | `https://login.microsoftonline.com` | Entra authority endpoint |
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Environment mode |

## Project Structure

```
src/
├── index.ts              # Express app entry point
├── config.ts             # Environment configuration and validation
├── types.ts              # TypeScript interfaces
├── middleware/
│   ├── logging.ts        # Request/response logging
│   └── errorHandler.ts   # Global error handling
├── routes/
│   ├── authorize.ts      # GET /authorize — Start OAuth flow
│   ├── callback.ts       # GET /finance/auth/callback — Handle Entra callback
│   └── validate.ts       # POST /auth/validate — Validate tokens
└── utils/
    ├── entra.ts          # Entra API operations (PKCE, token exchange)
    ├── jwt.ts            # JWT validation and group verification
    └── cache.ts          # In-memory state cache
```

## API Endpoints

### GET /authorize

Initiates OAuth flow. Generates PKCE challenge and stores state in cache.

**Query Parameters:**
- `state` — CSRF token (required)
- `code_challenge` — PKCE challenge from Claude (required)
- `code_challenge_method` — PKCE method, typically "S256" (required)
- `redirect_uri` — Claude's callback URL (required)

**Response:**
- `302` redirect to Entra login

**Example:**
```
GET /authorize?state=abc123&code_challenge=xyz789&code_challenge_method=S256&redirect_uri=https://claude.ai/callback
```

**Errors:**
- `400` — Missing required parameters

---

### GET /finance/auth/callback

Handles redirect from Entra after user login. Exchanges authorization code for token, validates token and group membership.

**Query Parameters:**
- `code` — Authorization code from Entra (on success)
- `state` — CSRF token (on success)
- `error` — Error code (on failure)
- `error_description` — Error details (on failure)

**Response:**
- `302` redirect to Claude callback URL with token (on success)
- `302` redirect to Claude callback URL with error (on group membership failure)
- `400` HTML error page (invalid/expired state)
- `500` HTML error page (token exchange failure)

**Logic:**
1. Validates state (prevents replay attacks)
2. Exchanges code for token from Entra
3. Validates token signature and expiration
4. Checks user is in "Claude Users" group
5. Redirects Claude to its callback with the Entra `access_token` as `code` param

---

### POST /auth/validate

Validates JWT tokens on incoming Claude requests. Used by nginx `auth_request` directive for MCP relay protection.

**Headers:**
- `Authorization: Bearer <token>` — Token to validate

**Response:**
- `200 OK` — Token valid and user in required group
- `401 Unauthorized` — Invalid, expired, or missing token
- `401 Unauthorized` — User not in required group
- `500 Internal Server Error` — JWT validation error

**Response Headers (on success):**
- `X-User-Email` — User's email (if available in token)
- `X-User-OID` — User's Azure AD object ID

**Example:**
```bash
curl -X POST \
  -H "Authorization: Bearer eyJhbGc..." \
  http://localhost:3000/auth/validate
```

---

## PKCE Flow

This broker implements dual PKCE for maximum security:

1. **Inbound (Claude → Broker):** Claude sends `code_challenge` and `code_challenge_method`. Broker stores them for auditability.

2. **Outbound (Broker → Entra):** Broker generates its own PKCE verifier+challenge pair. Uses the broker's `code_verifier` when exchanging code with Entra.

This dual approach ensures:
- Claude's PKCE is preserved (auditability)
- Broker's PKCE protects the broker-to-Entra exchange
- Defense in depth against code interception

## Key Implementation Details

### Token Validation

JWT tokens from Entra are validated using:

- **JWKS (JSON Web Key Set)** — Entra's public keys cached with 1-hour TTL and force-refresh on rotation
- **Signature verification** — RS256 algorithm with Entra's public key
- **Claims validation** — Expiration (`exp`), issuer (`iss`), audience (`aud`)
- **Group membership** — Verifies user's `groups` claim contains `ENTRA_REQUIRED_GROUP_ID`

### State Management

OAuth state and PKCE verifier are stored in in-memory cache with 10-minute TTL:

- **Prevents replay attacks** — State deleted immediately after use
- **Automatic cleanup** — Expired entries cleaned up periodically
- **No persistence** — State lost on service restart (acceptable for short-lived auth flows)

### Middleware

**Request Logger** (`middleware/logging.ts`)
- Logs incoming requests with method, path, and status
- Structured ISO 8601 timestamp format for easy parsing

**Error Handler** (`middleware/errorHandler.ts`)
- Catches unhandled errors
- Returns JSON error responses with status codes
- Logs stack traces for debugging

## Dependencies

| Package | Version | Purpose |
|---|---|---|
| `express` | ^4.x | HTTP server framework |
| `dotenv` | ^16.x | Environment variable loading |
| `jsonwebtoken` | ^9.x | JWT parsing and validation |
| `jwks-rsa` | ^3.x | JWKS key caching and verification |

### Dev Dependencies

| Package | Version | Purpose |
|---|---|---|
| `typescript` | ^5.x | Type checking and compilation |
| `tsx` | ^4.x | TypeScript execution and watch |
| `@types/node` | ^20.x | Node.js type definitions |
| `@types/express` | ^4.x | Express type definitions |

## Development

### Type Checking

```bash
npm run typecheck
```

Runs TypeScript compiler in check-only mode. Zero errors required before deployment.

### Build

```bash
npm run build
```

Compiles TypeScript to JavaScript in the `dist/` directory. Output is ready for production deployment.

### Local Testing

Start the service in development mode:

```bash
npm run dev
```

Test the `/authorize` endpoint:

```bash
curl "http://localhost:3000/authorize?state=test123&code_challenge=abc&code_challenge_method=S256&redirect_uri=https://example.com"
```

Expected: 302 redirect to Entra login

Test `/auth/validate` without token:

```bash
curl -X POST http://localhost:3000/auth/validate
```

Expected: 401 Unauthorized

### Testing Checklist

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

## Deployment

For production deployment on `cofasv32`, see [DEPLOYMENT_PROD.md](./DEPLOYMENT_PROD.md).

Key deployment considerations:

- **Service runs on `127.0.0.1:3000`** — Only accessible locally, proxied through nginx
- **Systemd service** — Managed by `oauth-broker` service with auto-restart
- **TLS/HTTPS** — All public traffic proxied through nginx with TLS
- **Secrets management** — `.env` file permissions restricted to `600`
- **Logging** — Journalctl integration via systemd

Example systemd service file:

```ini
[Unit]
Description=Finance MCP OAuth Broker
Documentation=https://github.com/franklintn/oauth-service-ts
After=network.target

[Service]
Type=simple
User=oauth-broker
Group=oauth-broker
WorkingDirectory=/opt/oauth-service
EnvironmentFile=/opt/oauth-service/.env
ExecStart=/usr/bin/node /opt/oauth-service/dist/index.js
Restart=on-failure
RestartSec=10
StartLimitInterval=600
StartLimitBurst=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=oauth-broker

[Install]
WantedBy=multi-user.target
```

## Nginx Configuration

Protect MCP endpoints with `auth_request`:

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

## Logging

All requests are logged with structured format:

```
[2026-05-13T15:30:45.123Z] GET /authorize 302 145ms
[2026-05-13T15:30:50.456Z] GET /finance/auth/callback 302 1250ms
[2026-05-13T15:35:20.789Z] POST /auth/validate 200 45ms
```

View production logs via systemd:

```bash
sudo journalctl -u oauth-broker -f         # Real-time
sudo journalctl -u oauth-broker -n 100     # Last 100 lines
sudo journalctl -u oauth-broker -p err     # Errors only
```

## Security

### HTTPS/TLS

- All public endpoints require HTTPS (enforced by nginx reverse proxy)
- Service binds to `127.0.0.1:3000` only (not exposed to public)
- Nginx handles TLS termination and certificate rotation

### Token Security

- JWKS public keys cached with forced refresh on key rotation
- Token signature verified with RS256 (industry standard)
- Token expiration checked before validation
- Sensitive data (tokens, secrets) never logged
- Bearer tokens accepted only in Authorization header

### State & PKCE Security

- State stored with 10-minute TTL (prevents replay attacks)
- State deleted immediately after use
- PKCE verifier never exposed in logs or responses
- Code verifier transmitted only in server-to-server requests (not to client)

### Access Control

- Group membership verified for all authenticated requests
- Only "Claude Users" group members can access resources
- Group ID stored as environment variable (not hardcoded)

## Monitoring

### Health Check

Manual health check via curl:

```bash
curl http://localhost:3000/
```

The service responds to any request path. Non-OAuth endpoints return 404.

### Key Metrics

Monitor these via logs:

- **Token validation success rate** — Track failures in logs
- **Entra API response time** — Should be < 500ms
- **Memory usage** — Watch for memory leaks in state cache
- **Certificate expiration** — Alert 30 days before renewal

### Alerts to Set Up

```bash
# Alert if more than 10 auth failures in 5 minutes
journalctl -u oauth-broker -S "5 min ago" | grep -c "401\|access_denied" | awk '$1 > 10 { print "AUTH FAILURE ALERT" }'
```

## Troubleshooting

### 401 Unauthorized on /auth/validate

**Cause:** Token invalid, expired, or user not in group

**Solution:**
1. Verify token is not expired: Use `jwt.io` to decode (base64url decode payload)
2. Check user is in "Claude Users" group (Azure Portal → Groups)
3. Verify `ENTRA_REQUIRED_GROUP_ID` matches in `.env`
4. Check token claims: `oid`, `groups`, `exp`, `iss`

### 302 Redirect Loop on /authorize

**Cause:** Misconfigured redirect URIs or PKCE mismatch

**Solution:**
1. Verify `SERVICE_CALLBACK_URI` matches Entra app registration
2. Verify `CLAUDE_REDIRECT_URI` is correct
3. Check PKCE challenge/verifier length (43-128 chars)
4. Review nginx reverse proxy headers preservation

### Service Crashes on Startup

**Cause:** Missing environment variables or Node.js version mismatch

**Solution:**
1. Check `.env` file exists: `cat .env`
2. Verify all required variables are set: `npm run dev` output
3. Check Node.js version: `node --version` (needs 18+)
4. Check logs: `journalctl -u oauth-broker -p err`

### JWKS Fetch Fails

**Cause:** Network connectivity or Entra outage

**Solution:**
1. Verify internet connectivity: `curl https://login.microsoftonline.com`
2. Check firewall allows outbound HTTPS to Entra
3. Verify `ENTRA_TENANT_ID` is correct
4. Check service logs for HTTP error details

## References

- [OAuth 2.0 Authorization Code Flow](https://tools.ietf.org/html/rfc6749#section-1.3.1)
- [PKCE (RFC 7636)](https://tools.ietf.org/html/rfc7636)
- [Microsoft Entra ID Documentation](https://learn.microsoft.com/en-us/azure/active-directory/)
- [Express.js Documentation](https://expressjs.com/)
- [JSON Web Tokens (JWT)](https://jwt.io/)
- [JWKS (JSON Web Key Set)](https://tools.ietf.org/html/rfc7517)

## License

Internal use only. Developed for Franklin, Tennessee municipal government.

## Support

For questions or issues:

1. Check logs: `sudo journalctl -u oauth-broker`
2. Review [DEPLOYMENT_PROD.md](./DEPLOYMENT_PROD.md) for deployment details
3. Review [oauth_service_plan.md](./oauth_service_plan.md) for architecture details
4. Contact the development team
