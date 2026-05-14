# OAuth Service Implementation Plan - Finance MCP Relay

## Overview
Build a Node.js OAuth 2.0 broker service that sits between Claude and Entra AD. This service handles authorization, token exchange, and validation for the Finance MCP relay.

## Architecture
- **Port**: 3000 (localhost, proxied through nginx)
- **Framework**: Express.js
- **Key Dependencies**: 
  - `express` - HTTP server
  - `axios` - HTTP client for Entra calls
  - `jsonwebtoken` - JWT validation
  - `dotenv` - Environment variables
  - `node-cache` - Token caching (optional, for performance)

## Environment Variables Required
```
ENTRA_TENANT_ID=<from Entra app registration>
ENTRA_CLIENT_ID=<from Entra app registration>
ENTRA_CLIENT_SECRET=<from Entra app registration>
CLAUDE_REDIRECT_URI=https://claude.ai/api/mcp/auth_callback
ENTRA_AUTHORITY=https://login.microsoftonline.com
ENTRA_REQUIRED_GROUP=Claude Users
```

## Endpoints to Implement

### 1. GET /authorize
**Purpose**: Initiate OAuth flow (called by Claude via relay)

**Request Query Params**:
- `response_type` - Always "code"
- `client_id` - Claude's client ID
- `redirect_uri` - Where to redirect after auth (claude.ai callback)
- `state` - CSRF token (must preserve and return)
- `code_challenge` - PKCE challenge
- `code_challenge_method` - PKCE method (S256)

**Logic**:
1. Store state + code_challenge in session/cache
2. Redirect user to Entra login: `https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/authorize`
3. Pass along client_id, redirect_uri, state, code_challenge

**Response**: 302 redirect to Entra login

---

### 2. GET /finance/auth/callback
**Purpose**: Handle redirect from Entra after user logs in

**Request Query Params**:
- `code` - Authorization code from Entra
- `state` - CSRF token (validate matches)

**Logic**:
1. Validate state matches what we stored
2. Exchange authorization code for token:
   - POST to `https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token`
   - Body: `grant_type=authorization_code&code={code}&client_id={ENTRA_CLIENT_ID}&client_secret={ENTRA_CLIENT_SECRET}&redirect_uri={CALLBACK_URI}&code_verifier={PKCE_VERIFIER}`
3. Validate returned JWT:
   - Check signature
   - Check token not expired
   - Extract user info + group memberships
4. Verify user is in "Claude Users" group
5. Redirect to `redirect_uri` (Claude callback) with auth code or error

**Response**: 302 redirect back to Claude with authorization code

---

### 3. POST /auth/validate
**Purpose**: Validate Bearer tokens on incoming MCP requests (called by nginx auth_request)

**Request Headers**:
- `Authorization: Bearer <token>` - JWT from Claude request

**Logic**:
1. Extract token from Authorization header
2. Validate JWT signature (using Entra public keys)
3. Check token not expired
4. Verify `appid` claim matches ENTRA_CLIENT_ID
5. Extract user groups from token
6. Verify user is in "Claude Users" group
7. Return 200 if valid, 401 if invalid

**Response**: 
- 200 OK if token valid + user in correct group
- 401 Unauthorized if token invalid or user not authorized
- Set response headers with user email for logging

---

## Key Implementation Details

### PKCE Support
- Store `code_challenge` from /authorize request
- Generate `code_verifier` (43-128 char random string)
- Include in token exchange request

### Token Validation
- Cache Entra public keys (JWKS endpoint: `https://login.microsoftonline.com/common/discovery/v2.0/keys`)
- Validate JWT signature with cached public keys
- Check expiration (`exp` claim)
- Verify issuer (`iss` claim) matches your tenant

### Group Membership Check
- Entra tokens include `groups` claim with security group object IDs
- Map "Claude Users" group name to its object ID
- Verify user's token contains that group ID

### Error Handling
- Invalid state → 403 Forbidden
- Invalid token → 401 Unauthorized
- Entra communication error → 500 Internal Server Error with logging
- Missing required groups → 403 Forbidden

### Session/State Management
- Use in-memory cache or Redis for storing state + code_challenge
- Set 10-minute expiration on stored state (prevent replay attacks)
- Clean up expired entries periodically

## File Structure
```
oauth-service/
├── .env
├── .env.example
├── package.json
├── index.js (main entry point)
├── routes/
│   ├── authorize.js
│   ├── callback.js
│   └── validate.js
├── middleware/
│   ├── errorHandler.js
│   └── logging.js
└── utils/
    ├── entra.js (Entra API calls)
    ├── jwt.js (JWT validation)
    └── cache.js (state/token caching)
```

## Dependencies to Install
```bash
npm install express axios jsonwebtoken dotenv node-cache cors
npm install --save-dev nodemon
```

## Testing Checklist
- [ ] Start service on localhost:3000
- [ ] Hit /authorize endpoint, verify redirect to Entra
- [ ] Complete login in Entra, verify callback received
- [ ] Verify token exchange successful
- [ ] Test /auth/validate with valid token → 200
- [ ] Test /auth/validate with invalid token → 401
- [ ] Test /auth/validate with user NOT in Claude Users group → 403
- [ ] Verify state validation (replay attack prevention)

## Deployment Notes
- Run with `NODE_ENV=production`
- Use process manager (PM2, systemd)
- Monitor logs for Entra authentication failures
- Rotate secrets periodically
- Use HTTPS for all external communication (nginx handles this)
