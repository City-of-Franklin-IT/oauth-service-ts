import express from "express";
import { randomBytes } from "crypto";
import { exchangeCodeForToken } from "../utils/entra.js";
import { validateToken, checkGroupMembership } from "../utils/jwt.js";
import { stateCache } from "../utils/cache.js";
import { authCodeCache } from "../utils/authCodeCache.js";
import { SERVICE_CALLBACK_URI, MCP_SERVER_NAME } from "../config.js";
const router = express.Router();
router.get(`/${MCP_SERVER_NAME}/auth/callback`, async (req, res) => {
    const { code, state, error, error_description } = req.query;
    if (error) {
        res.status(400).send(`<html><body>Authentication error: ${error} - ${error_description ?? ""}</body></html>`);
        return;
    }
    const stateStr = String(state);
    const stateEntry = stateCache.get(stateStr);
    if (!stateEntry) {
        res.status(400).send("<html><body>Invalid or expired state</body></html>");
        return;
    }
    stateCache.remove(stateStr);
    try {
        const tokenResponse = await exchangeCodeForToken(String(code), stateEntry.brokerCodeVerifier, SERVICE_CALLBACK_URI);
        const claims = await validateToken(tokenResponse.access_token);
        if (!checkGroupMembership(claims)) {
            const errorUrl = new URL(stateEntry.claudeRedirectUri);
            errorUrl.searchParams.set("error", "access_denied");
            errorUrl.searchParams.set("error_description", "User not in required group");
            errorUrl.searchParams.set("state", stateStr);
            res.redirect(302, errorUrl.toString());
            return;
        }
        const authCode = randomBytes(32).toString("hex");
        authCodeCache.set(authCode, {
            access_token: tokenResponse.access_token,
            expires_in: tokenResponse.expires_in,
            expiresAt: Date.now() + (tokenResponse.expires_in * 1000)
        });
        const callbackUrl = new URL(stateEntry.claudeRedirectUri);
        callbackUrl.searchParams.set("code", authCode);
        callbackUrl.searchParams.set("state", stateStr);
        res.redirect(302, callbackUrl.toString());
    }
    catch (err) {
        console.error("Token exchange or validation failed:", err);
        res.status(500).send("<html><body>Authentication failed</body></html>");
    }
});
export default router;
