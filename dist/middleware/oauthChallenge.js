const oauthChallengeMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401);
        res.setHeader('WWW-Authenticate', 'Bearer realm="finance-mcp", resource_metadata_uri="https://mcp.franklintn.gov/.well-known/oauth-protected-resource/mcp/finance"');
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
