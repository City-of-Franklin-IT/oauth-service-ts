# Production Deployment Plan — cofasv32

OAuth 2.0 Broker Service deployment to production server `cofasv32`.

## Pre-Deployment Checklist

### Entra ID Configuration (Admin Task)
- [ ] App registration created in Entra ID (`finance-oauth-prod`)
- [ ] Client secret generated and securely stored
- [ ] Redirect URI registered: `https://cofasv32.franklintn.gov/finance/auth/callback`
- [ ] App manifest updated: `groupMembershipClaims` set to `"SecurityGroup"`
- [ ] API permissions granted (e.g., `Directory.Read.All` for groups, `User.Read`)
- [ ] "Claude Users" security group exists and object ID (GUID) noted

### Server Preparation (cofasv32)
- [ ] SSH access configured for deployment user
- [ ] Node.js 18+ installed: `node --version`
- [ ] npm 9+ installed: `npm --version`
- [ ] `/opt/oauth-service` directory created and owned by `oauth-broker` user
- [ ] Systemd available and functioning
- [ ] Nginx installed and configured with TLS (reverse proxy)
- [ ] Firewall rules: port 3000 open from nginx only (127.0.0.1)
- [ ] Firewall rules: port 443/80 open to public (nginx)

### DNS & TLS
- [ ] DNS A record: `cofasv32.franklintn.gov` → server IP
- [ ] TLS certificate installed (`/etc/nginx/ssl/cofasv32.crt` + `/etc/nginx/ssl/cofasv32.key`)
  - Self-signed OK for internal, or use Let's Encrypt
- [ ] Certificate valid for at least 30 days
- [ ] HSTS headers configured in nginx if using HTTPS

---

## Deployment Steps

### 1. Clone and Build on Build Machine (or directly on cofasv32)

```bash
# On your local machine or CI/CD:
git clone https://github.com/franklintn/oauth-service-ts.git
cd oauth-service-ts
npm install
npm run build
```

### 2. Transfer Build Artifacts to cofasv32

Option A: Use git on server directly
```bash
ssh oauth-broker@cofasv32
cd /opt/oauth-service
git clone https://github.com/franklintn/oauth-service-ts.git .
npm install --production
npm run build
```

Option B: SCP build artifacts
```bash
scp -r dist/ oauth-broker@cofasv32:/opt/oauth-service/
scp -r node_modules/ oauth-broker@cofasv32:/opt/oauth-service/  # or npm install on server
scp package.json package-lock.json oauth-broker@cofasv32:/opt/oauth-service/
```

### 3. Create OAuth Broker User (if not exists)

```bash
sudo useradd -r -s /bin/bash -d /opt/oauth-service oauth-broker
sudo mkdir -p /opt/oauth-service
sudo chown -R oauth-broker:oauth-broker /opt/oauth-service
```

### 4. Set Up Environment File

Create `/opt/oauth-service/.env` with production values:

```bash
sudo nano /opt/oauth-service/.env
```

**Contents:**
```
ENTRA_TENANT_ID=<your-tenant-guid>
ENTRA_CLIENT_ID=<app-registration-client-id>
ENTRA_CLIENT_SECRET=<app-registration-client-secret>
ENTRA_AUTHORITY=https://login.microsoftonline.com
ENTRA_REQUIRED_GROUP_ID=<claude-users-group-guid>
SERVICE_CALLBACK_URI=https://cofasv32.franklintn.gov/finance/auth/callback
CLAUDE_REDIRECT_URI=https://claude.ai/api/mcp/auth_callback
PORT=3000
NODE_ENV=production
```

**Secure the file:**
```bash
sudo chmod 600 /opt/oauth-service/.env
sudo chown oauth-broker:oauth-broker /opt/oauth-service/.env
```

### 5. Create Systemd Service File

Create `/etc/systemd/system/oauth-broker.service`:

```bash
sudo nano /etc/systemd/system/oauth-broker.service
```

**Contents:**
```ini
[Unit]
Description=Finance MCP OAuth 2.0 Broker
Documentation=https://github.com/franklintn/oauth-service-ts
After=network.target

[Service]
Type=simple
User=oauth-broker
Group=oauth-broker
WorkingDirectory=/opt/oauth-service
EnvironmentFile=/opt/oauth-service/.env
ExecStart=/usr/bin/node /opt/oauth-service/dist/index.js

# Restart policy
Restart=on-failure
RestartSec=10
StartLimitInterval=600
StartLimitBurst=3

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/opt/oauth-service

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=oauth-broker

[Install]
WantedBy=multi-user.target
```

### 6. Enable and Start Service

```bash
sudo systemctl daemon-reload
sudo systemctl enable oauth-broker
sudo systemctl start oauth-broker

# Verify it's running
sudo systemctl status oauth-broker
sudo journalctl -u oauth-broker -n 50   # Last 50 log lines
```

### 7. Configure Nginx Reverse Proxy

Edit `/etc/nginx/sites-available/cofasv32` (or equivalent):

```nginx
upstream oauth_broker {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name cofasv32.franklintn.gov;

    # TLS Configuration
    ssl_certificate /etc/nginx/ssl/cofasv32.crt;
    ssl_certificate_key /etc/nginx/ssl/cofasv32.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # OAuth endpoints
    location /authorize {
        proxy_pass http://oauth_broker;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_redirect off;
    }

    location /finance/auth/callback {
        proxy_pass http://oauth_broker;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_redirect off;
    }

    # Internal auth_request endpoint (for MCP relay)
    location /auth/validate {
        proxy_pass http://oauth_broker;
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
        proxy_set_header Authorization $http_authorization;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        access_log off;  # Reduce log noise
    }

    # Health check endpoint (optional)
    location /health {
        access_log off;
        return 200 "OK\n";
        add_header Content-Type text/plain;
    }

    # Redirect HTTP to HTTPS
    error_page 497 =301 https://$server_name$request_uri;
}

server {
    listen 80;
    listen [::]:80;
    server_name cofasv32.franklintn.gov;
    return 301 https://$server_name$request_uri;
}
```

### 8. Enable Nginx Site and Test

```bash
sudo ln -s /etc/nginx/sites-available/cofasv32 /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 9. Verify Deployment

```bash
# Check service status
sudo systemctl status oauth-broker

# Check logs
sudo journalctl -u oauth-broker -f    # Follow logs

# Test authorize endpoint
curl -v "https://cofasv32.franklintn.gov/authorize?state=test123&code_challenge=abc&code_challenge_method=S256&redirect_uri=https://example.com"

# Test health (if added)
curl -v "https://cofasv32.franklintn.gov/health"

# Test auth/validate endpoint (should fail gracefully with missing token)
curl -X POST "https://cofasv32.franklintn.gov/auth/validate"
```

---

## Post-Deployment Configuration

### 1. Register Service Callback URI in Entra

In Azure Portal → App Registration → Authentication → Redirect URIs, add:
```
https://cofasv32.franklintn.gov/finance/auth/callback
```

### 2. Configure MCP Relay to Use Auth

In nginx config for MCP relay (e.g., `/etc/nginx/sites-available/mcp-relay`):

```nginx
location /mcp/finance/ {
    auth_request /auth/validate;
    auth_request_set $user_email $upstream_http_x_user_email;
    
    proxy_set_header X-User-Email $user_email;
    proxy_pass http://127.0.0.1:8080/;  # Finance MCP relay
}

location = /auth/validate {
    internal;
    proxy_pass https://cofasv32.franklintn.gov/auth/validate;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header Authorization $http_authorization;
    proxy_ssl_verify off;  # If self-signed cert, otherwise remove
}
```

### 3. Set Up Log Rotation

Create `/etc/logrotate.d/oauth-broker`:

```
/var/log/oauth-broker.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 oauth-broker oauth-broker
    sharedscripts
    postrotate
        systemctl reload oauth-broker > /dev/null 2>&1 || true
    endscript
}
```

---

## Monitoring & Alerting

### 1. Check Service Health

```bash
# Manual health check
sudo systemctl status oauth-broker

# Automated daily health check (cron)
0 2 * * * oauth-broker /usr/local/bin/oauth-broker-healthcheck.sh
```

### 2. Monitor Logs

```bash
# Real-time logs
sudo journalctl -u oauth-broker -f

# Last 100 errors
sudo journalctl -u oauth-broker -p err -n 100

# Logs since last boot
sudo journalctl -u oauth-broker -b
```

### 3. Metrics to Watch

- **Token validation success rate** — Track failures in logs
- **Entra API response time** — Should be < 500ms
- **Memory usage** — Check with `top` or systemd resource monitoring
- **Certificate expiration** — Alert 30 days before renewal

### 4. Set Up Alerts (if monitoring available)

Example: Check for repeated 401 errors:

```bash
# Alert if more than 10 auth failures in 5 minutes
sudo journalctl -u oauth-broker -S "5 min ago" | grep -c "Unauthorized" | awk '$1 > 10 { print "AUTH FAILURE ALERT" }'
```

---

## Rollback Plan

### If Service Fails

```bash
# 1. Revert to previous version
cd /opt/oauth-service
git log --oneline | head -5
git revert <commit-hash>
npm run build

# 2. Restart service
sudo systemctl restart oauth-broker
sudo systemctl status oauth-broker
```

### If Entra Token Exchange Fails

- Check `.env` values (especially `ENTRA_CLIENT_SECRET`)
- Verify Entra app is still active
- Check `SERVICE_CALLBACK_URI` matches Entra registration
- Logs: `sudo journalctl -u oauth-broker -p err`

### If Nginx Can't Reach Service

```bash
# Check if service is running
sudo systemctl status oauth-broker

# Check if port 3000 is listening
sudo netstat -tlnp | grep 3000

# Check service logs
sudo journalctl -u oauth-broker -n 20
```

---

## Security Considerations

### 1. Environment Secrets

- `ENTRA_CLIENT_SECRET` is in `.env` → restrict file permissions to `600`
- Consider using a secrets manager (HashiCorp Vault, AWS Secrets Manager) for rotation
- Never commit `.env` to git

### 2. TLS/HTTPS

- All public endpoints use HTTPS (nginx enforces)
- Redirect HTTP → HTTPS
- Certificate renewed automatically (if Let's Encrypt) or manually before expiry

### 3. Network Access

- Service binds to `127.0.0.1:3000` only (localhost, not public)
- Nginx is the only public-facing proxy
- Firewall rules: port 3000 restricted to nginx IP

### 4. Token Validation

- JWKS keys cached 1 hour with forced refresh on rotation
- Token signature verified with RS256 (industry standard)
- Token expiration checked before use
- Group membership verified against `ENTRA_REQUIRED_GROUP_ID`

### 5. PKCE & State

- State stored in-memory with 10-minute TTL (prevents replay)
- State deleted immediately after use
- PKCE verifier never exposed in logs

### 6. Logging

- Sensitive data (tokens, secrets) never logged
- Errors logged with stack trace for debugging
- Access logs available for audit (nginx + journalctl)

---

## Maintenance Schedule

### Daily
- Monitor logs for errors: `sudo journalctl -u oauth-broker -p err`
- Spot-check health: `curl https://cofasv32.franklintn.gov/health`

### Weekly
- Review failed authentication attempts
- Check certificate expiration: `openssl x509 -enddate -noout -in /etc/nginx/ssl/cofasv32.crt`
- Verify JWKS refresh is working (check logs)

### Monthly
- Review Entra app permissions and group memberships
- Test failover / rollback procedure
- Update npm dependencies: `npm audit`
- Review and rotate logs

### Quarterly
- TLS certificate renewal check
- Entra client secret rotation (if applicable)
- Full deployment test (stage environment)

---

## Support & Troubleshooting

### Common Issues

**Issue: 401 Unauthorized on `/auth/validate`**
- Check token is not expired: `jwt.io` decode
- Verify user is in "Claude Users" group (Azure Portal)
- Check `ENTRA_REQUIRED_GROUP_ID` matches in `.env`

**Issue: 302 redirect loop on `/authorize`**
- Check `CLAUDE_REDIRECT_URI` is correct
- Verify `SERVICE_CALLBACK_URI` matches Entra registration
- Check nginx reverse proxy is preserving headers correctly

**Issue: Service crashes on startup**
- Check `.env` file exists: `cat /opt/oauth-service/.env`
- Check all required env vars are set
- Check Node.js version: `node --version` (needs 18+)
- Check logs: `sudo journalctl -u oauth-broker`

**Issue: JWKS fetch fails**
- Check internet connectivity to `login.microsoftonline.com`
- Check firewall rules allow outbound HTTPS
- Verify `ENTRA_TENANT_ID` is correct

### Contact & Documentation

- **OAuth Broker Repository:** `https://github.com/franklintn/oauth-service-ts`
- **Service Logs:** `sudo journalctl -u oauth-broker -f`
- **Nginx Config:** `/etc/nginx/sites-available/cofasv32`
- **Service Config:** `/opt/oauth-service/.env`
- **Systemd Status:** `sudo systemctl status oauth-broker`

---

## Deployment Verification Checklist

After completing all steps, verify:

- [ ] Service is running: `sudo systemctl status oauth-broker`
- [ ] Service starts on boot: `sudo systemctl is-enabled oauth-broker`
- [ ] HTTPS working: `curl -v https://cofasv32.franklintn.gov/health`
- [ ] Logs are clean (no repeated errors): `sudo journalctl -u oauth-broker`
- [ ] Nginx reverse proxy working: `curl -I https://cofasv32.franklintn.gov/authorize`
- [ ] Entra callback URI registered in Azure Portal
- [ ] MCP relay auth_request points to correct service
- [ ] TLS certificate valid: `openssl x509 -enddate -noout -in /etc/nginx/ssl/cofasv32.crt`
- [ ] User can reach `/authorize` endpoint (gets 302 or 400, not 502)
- [ ] Monitoring/alerting configured
- [ ] Rollback plan documented and tested

---

**Deployment Date:** _______________

**Deployed By:** _______________

**Notes:** ________________________________________________________________
