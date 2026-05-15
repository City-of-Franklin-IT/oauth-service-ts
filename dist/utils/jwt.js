import jwt from "jsonwebtoken";
import jwksRsa from "jwks-rsa";
import { ENTRA_AUTHORITY, ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_REQUIRED_GROUP_IDS } from "../config.js";
const jwksClient = jwksRsa({
    jwksUri: `${ENTRA_AUTHORITY}/${ENTRA_TENANT_ID}/discovery/v2.0/keys`,
    cache: true,
    cacheMaxEntries: 10,
    cacheMaxAge: 60 * 60 * 1000
});
/**
 * Validate JWT token from Entra
 *
 * Verifies signature, expiration, issuer, and audience
 */
export async function validateToken(token) {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header.kid) {
        throw new Error("Invalid token format");
    }
    const signingKey = await jwksClient.getSigningKey(decoded.header.kid);
    const publicKey = signingKey.getPublicKey();
    const claims = jwt.verify(token, publicKey, {
        algorithms: ["RS256"],
        audience: `api://${ENTRA_CLIENT_ID}`
    });
    const validIssuers = [
        `${ENTRA_AUTHORITY}/${ENTRA_TENANT_ID}/v2.0`,
        `https://sts.windows.net/${ENTRA_TENANT_ID}/`
    ];
    if (!validIssuers.some(iss => claims.iss.startsWith(iss.replace(/\/$/, "")))) {
        throw new Error(`Invalid issuer: ${claims.iss}`);
    }
    return claims;
}
export function checkGroupMembership(claims) {
    if (ENTRA_REQUIRED_GROUP_IDS.length === 0)
        return true;
    return claims.groups?.some(group => ENTRA_REQUIRED_GROUP_IDS.includes(group)) ?? false;
}
