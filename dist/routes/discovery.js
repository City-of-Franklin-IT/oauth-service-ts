import { Router } from 'express';
import { ENTRA_TENANT_ID, MCP_RESOURCE_PATH, MCP_SERVER_NAME } from '../config.js';
const BROKER_DOMAIN = 'https://mcp.franklintn.gov';
const router = Router();
router.get('/.well-known/oauth-authorization-server', (_req, res) => {
    res.json({
        issuer: BROKER_DOMAIN,
        authorization_endpoint: `${BROKER_DOMAIN}/authorize`,
        token_endpoint: `${BROKER_DOMAIN}/token`,
        jwks_uri: `https://login.microsoftonline.com/${ENTRA_TENANT_ID}/discovery/v2.0/keys`,
        scopes_supported: ['openid', 'profile', 'email'],
        response_types_supported: ['code'],
        response_modes_supported: ['query', 'form_post'],
        code_challenge_methods_supported: ['S256', 'plain']
    });
});
router.get(`/.well-known/oauth-protected-resource${MCP_RESOURCE_PATH}`, (_req, res) => {
    res.json({
        resource: `${BROKER_DOMAIN}${MCP_RESOURCE_PATH}`,
        authorization_servers: [BROKER_DOMAIN],
        scopes_supported: ['openid', 'profile', 'email'],
        bearer_methods_supported: ['header'],
        token_endpoint_auth_methods_supported: ['none']
    });
});
router.get('/.well-known/oauth-protected-resource/:path(*)', (req, res) => {
    const resourcePath = req.params.path ? `/${req.params.path}` : MCP_RESOURCE_PATH;
    const resourceEndpoint = `${BROKER_DOMAIN}${resourcePath}`;
    res.json({
        resource: `${MCP_SERVER_NAME}-mcp`,
        resource_endpoint: resourceEndpoint,
        authorization_server: BROKER_DOMAIN
    });
});
router.get('/.well-known/oauth-protected-resource', (_req, res) => {
    res.json({
        resource: `${MCP_SERVER_NAME}-mcp`,
        resource_endpoint: `${BROKER_DOMAIN}${MCP_RESOURCE_PATH}`,
        authorization_server: BROKER_DOMAIN
    });
});
export default router;
