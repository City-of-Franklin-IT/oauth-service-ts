import { Router } from "express";
import { validateToken, checkGroupMembership } from "../utils/jwt.js";
import { authCodeCache } from "../utils/authCodeCache.js";
const router = Router();
/**
 * OAuth 2.0 Token Endpoint
 *
 * POST /token
 * Exchanges authorization code for access token
 */
router.post("/token", async (req, res) => {
    try {
        const { grant_type, code, code_verifier } = req.body;
        if (grant_type !== "authorization_code") {
            return res.status(400).json({
                error: "invalid_grant",
                error_description: "Only authorization_code grant is supported"
            });
        }
        if (!code) {
            return res.status(400).json({
                error: "invalid_request",
                error_description: "Missing authorization code"
            });
        }
        if (!code_verifier) {
            return res.status(400).json({
                error: "invalid_request",
                error_description: "Missing code verifier"
            });
        }
        const authEntry = authCodeCache.get(code);
        if (!authEntry) {
            return res.status(400).json({
                error: "invalid_grant",
                error_description: "Invalid or expired authorization code"
            });
        }
        const claims = await validateToken(authEntry.access_token);
        if (!checkGroupMembership(claims)) {
            return res.status(403).json({
                error: "access_denied",
                error_description: "User does not have required group membership"
            });
        }
        authCodeCache.remove(code);
        res.json({
            access_token: authEntry.access_token,
            token_type: "Bearer",
            expires_in: authEntry.expires_in,
            scope: "openid profile email"
        });
    }
    catch (error) {
        console.error("❌ Token endpoint error:", error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        res.status(500).json({
            error: "server_error",
            error_description: `Token processing failed: ${errorMsg}`
        });
    }
});
export default router;
