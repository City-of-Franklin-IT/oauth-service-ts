import express from "express"
import { exchangeCodeForToken } from "../utils/entra.js"
import { validateToken, checkGroupMembership } from "../utils/jwt.js"
import { stateCache } from "../utils/cache.js"
import { ENTRA_REQUIRED_GROUP_ID } from "../config.js"

const router = express.Router()

/**
 * Handle Entra callback
 *
 * GET /finance/auth/callback
 */
router.get("/finance/auth/callback", async (req, res) => {

  const { code, state, error, error_description } = req.query

  if(error) {
    res.status(400).send(`<html><body>Authentication error: ${ error } - ${ error_description ?? "" }</body></html>`)
    return
  }

  const stateStr = String(state)
  const stateEntry = stateCache.get(stateStr)

  if(!stateEntry) {
    res.status(400).send("<html><body>Invalid or expired state</body></html>")
    return
  }

  stateCache.remove(stateStr)

  try {
    const tokenResponse = await exchangeCodeForToken(String(code), stateEntry.brokerCodeVerifier)
    console.log("Token exchange successful, token:", tokenResponse.access_token?.substring(0, 20) + "...")

    const claims = await validateToken(tokenResponse.access_token)
    console.log("Token validation successful for user:", claims.upn)
    console.log("Token groups claim:", claims.groups)
    console.log("Required group ID:", ENTRA_REQUIRED_GROUP_ID)

    if(!checkGroupMembership(claims)) {
      console.log("User not in required group - groups:", claims.groups)
      const errorUrl = new URL(stateEntry.claudeRedirectUri)
      errorUrl.searchParams.set("error", "access_denied")
      errorUrl.searchParams.set("error_description", "User not in required group")
      errorUrl.searchParams.set("state", stateStr)
      res.redirect(302, errorUrl.toString())
      return
    }

    const callbackUrl = new URL(stateEntry.claudeRedirectUri)
    callbackUrl.searchParams.set("code", tokenResponse.access_token)
    callbackUrl.searchParams.set("state", stateStr)
    console.log("Redirecting to Claude callback with token")
    res.redirect(302, callbackUrl.toString())
  } catch(err) {
    console.error("Token exchange or validation failed:", err)
    res.status(500).send("<html><body>Authentication failed</body></html>")
  }
})

export default router
