import { Router, Request, Response } from 'express'

const router = Router()

router.get('/.well-known/oauth-authorization-server', (_req: Request, res: Response) => {
  res.json({
    issuer: 'https://mcp.franklintn.gov',
    authorization_endpoint: 'https://mcp.franklintn.gov/authorize',
    token_endpoint: 'https://mcp.franklintn.gov/token',
    jwks_uri: `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}/discovery/v2.0/keys`,
    scopes_supported: ['openid', 'profile', 'email'],
    response_types_supported: ['code'],
    response_modes_supported: ['query', 'form_post'],
    code_challenge_methods_supported: ['S256', 'plain']
  })
})

router.get('/.well-known/oauth-protected-resource/mcp/finance', (_req: Request, res: Response) => {
  res.json({
    resource: 'https://mcp.franklintn.gov/mcp/finance',
    authorization_servers: ['https://mcp.franklintn.gov'],
    scopes_supported: ['openid', 'profile', 'email'],
    bearer_methods_supported: ['header'],
    token_endpoint_auth_methods_supported: ['none']
  })
})

router.get('/.well-known/oauth-protected-resource/:path(*)', (req: Request, res: Response) => {
  const resourcePath = req.params.path ? `/${req.params.path}` : '/mcp/finance'
  const resourceEndpoint = `https://mcp.franklintn.gov${resourcePath}`

  res.json({
    resource: 'finance-mcp',
    resource_endpoint: resourceEndpoint,
    authorization_server: 'https://mcp.franklintn.gov'
  })
})

router.get('/.well-known/oauth-protected-resource', (_req: Request, res: Response) => {
  res.json({
    resource: 'finance-mcp',
    resource_endpoint: 'https://mcp.franklintn.gov/mcp/finance',
    authorization_server: 'https://mcp.franklintn.gov'
  })
})

export default router
