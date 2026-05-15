import { MCP_SERVER_NAME, MCP_RESOURCE_PATH } from '../config.js';
const BROKER_DOMAIN = 'https://mcp.franklintn.gov';
const oauthChallengeMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401);
        res.setHeader('WWW-Authenticate', `Bearer realm="${MCP_SERVER_NAME}-mcp", resource_metadata_uri="${BROKER_DOMAIN}/.well-known/oauth-protected-resource${MCP_RESOURCE_PATH}"`);
        res.setHeader('Content-Type', 'application/json');
        res.json({
            error: 'unauthorized',
            error_description: 'OAuth authentication required.'
        });
        return;
    }
    next();
};
export default oauthChallengeMiddleware;
