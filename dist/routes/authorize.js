import express from "express";
import { generatePkce, buildEntraAuthUrl } from "../utils/entra.js";
import { stateCache } from "../utils/cache.js";
const router = express.Router();
/**
 * Initiate OAuth flow
 *
 * GET /authorize
 */
router.get("/authorize", (req, res) => {
    const { state, code_challenge, code_challenge_method, redirect_uri } = req.query;
    if (!state || !code_challenge || !code_challenge_method || !redirect_uri) {
        res.status(400).json({ error: "Missing required parameters" });
        return;
    }
    const stateStr = String(state);
    const pkce = generatePkce();
    const expiresAt = Date.now() + 10 * 60 * 1000;
    stateCache.set(stateStr, {
        claudeCodeChallenge: String(code_challenge),
        claudeCodeChallengeMethod: String(code_challenge_method),
        claudeRedirectUri: String(redirect_uri),
        brokerCodeVerifier: pkce.verifier,
        expiresAt
    });
    const entraUrl = buildEntraAuthUrl(stateStr, pkce.challenge);
    res.redirect(302, entraUrl);
});
export default router;
