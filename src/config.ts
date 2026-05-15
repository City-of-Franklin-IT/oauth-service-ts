import "dotenv/config"

const BROKER_DOMAIN = "https://mcp.franklintn.gov"

export const MCP_SERVER_NAME = process.env.MCP_SERVER_NAME
export const ENTRA_TENANT_ID = "f6644f52-f834-4a2f-a433-e6bc40d7c17f"
export const ENTRA_CLIENT_ID = "20d66e95-659a-4308-b9e2-b65bfb2baf6a"
export const ENTRA_CLIENT_SECRET = process.env.ENTRA_CLIENT_SECRET
export const ENTRA_AUTHORITY = "https://login.microsoftonline.com"
export const ENTRA_REQUIRED_GROUP_IDS = process.env.ENTRA_REQUIRED_GROUP_IDS?.split(',').map(id => id.trim()).filter(id => id.length > 0) ?? []
export const CLAUDE_REDIRECT_URI = "https://claude.ai/api/mcp/auth_callback"
export const PORT = parseInt(process.env.PORT ?? "3000", 10)

export const SERVICE_CALLBACK_URI = MCP_SERVER_NAME ? `${BROKER_DOMAIN}/${MCP_SERVER_NAME}/auth/callback` : undefined
export const MCP_RESOURCE_PATH = MCP_SERVER_NAME ? `/mcp/${MCP_SERVER_NAME}` : undefined

export function validateConfig(): void {

  const required = [
    { name: "MCP_SERVER_NAME", value: MCP_SERVER_NAME },
    { name: "ENTRA_CLIENT_SECRET", value: ENTRA_CLIENT_SECRET },
    { name: "ENTRA_REQUIRED_GROUP_IDS", value: ENTRA_REQUIRED_GROUP_IDS.length > 0 ? "set" : null }
  ]

  const missing = required.filter(({ value }) => !value).map(({ name }) => name)
  if(missing.length > 0) {
    throw new Error(`Missing required environment variables: ${ missing.join(", ") }`)
  }
}
