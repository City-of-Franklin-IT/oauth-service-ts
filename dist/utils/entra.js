import { randomBytes, createHash } from "crypto";
import { ENTRA_AUTHORITY, ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET, SERVICE_CALLBACK_URI } from "../config.js";
export function generatePkce() {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    return { verifier, challenge };
}
export function buildEntraAuthUrl(state, brokerCodeChallenge) {
    const params = new URLSearchParams({
        client_id: ENTRA_CLIENT_ID,
        response_type: "code",
        redirect_uri: SERVICE_CALLBACK_URI,
        scope: `api://${ENTRA_CLIENT_ID}/access openid profile email`,
        state,
        code_challenge: brokerCodeChallenge,
        code_challenge_method: "S256"
    });
    return `${ENTRA_AUTHORITY}/${ENTRA_TENANT_ID}/oauth2/v2.0/authorize?${params.toString()}`;
}
/**
 * Exchange authorization code for token
 *
 * POST ${ ENTRA_AUTHORITY }/${ ENTRA_TENANT_ID }/oauth2/v2.0/token
 */
export async function exchangeCodeForToken(code, codeVerifier, redirectUri) {
    const tokenUrl = `https://login.microsoftonline.com/${ENTRA_TENANT_ID}/oauth2/v2.0/token`;
    const bodyObj = {
        grant_type: "authorization_code",
        code,
        client_id: ENTRA_CLIENT_ID,
        client_secret: ENTRA_CLIENT_SECRET,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
    };
    try {
        const response = await fetch(tokenUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams(bodyObj).toString()
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(`Entra token exchange failed: ${response.status} ${response.statusText} - ${data.error_description || JSON.stringify(data)}`);
        }
        return data;
    }
    catch (error) {
        console.error('Token exchange error:', error);
        throw error;
    }
}
