import "dotenv/config";
export const ENTRA_TENANT_ID = process.env.ENTRA_TENANT_ID;
export const ENTRA_CLIENT_ID = process.env.ENTRA_CLIENT_ID;
export const ENTRA_CLIENT_SECRET = process.env.ENTRA_CLIENT_SECRET;
export const ENTRA_AUTHORITY = process.env.ENTRA_AUTHORITY ?? "https://login.microsoftonline.com";
export const ENTRA_REQUIRED_GROUP_ID = process.env.ENTRA_REQUIRED_GROUP_ID;
export const SERVICE_CALLBACK_URI = process.env.SERVICE_CALLBACK_URI;
export const CLAUDE_REDIRECT_URI = process.env.CLAUDE_REDIRECT_URI;
export const PORT = parseInt(process.env.PORT ?? "3000", 10);
export function validateConfig() {
    const required = [
        { name: "ENTRA_TENANT_ID", value: ENTRA_TENANT_ID },
        { name: "ENTRA_CLIENT_ID", value: ENTRA_CLIENT_ID },
        { name: "ENTRA_CLIENT_SECRET", value: ENTRA_CLIENT_SECRET },
        { name: "ENTRA_REQUIRED_GROUP_ID", value: ENTRA_REQUIRED_GROUP_ID },
        { name: "SERVICE_CALLBACK_URI", value: SERVICE_CALLBACK_URI },
        { name: "CLAUDE_REDIRECT_URI", value: CLAUDE_REDIRECT_URI }
    ];
    const missing = required.filter(({ value }) => !value).map(({ name }) => name);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
    }
}
