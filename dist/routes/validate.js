import express from "express";
import { validateToken, checkGroupMembership } from "../utils/jwt.js";
const router = express.Router();
/**
 * Validate Bearer token
 *
 * POST /auth/validate
 */
const validateHandler = async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        console.log("Missing or invalid auth header");
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    const token = authHeader.slice(7);
    try {
        console.log("Validating token...");
        const claims = await validateToken(token);
        console.log("Token valid, user:", claims.upn);
        if (!checkGroupMembership(claims)) {
            console.log("User not in required group:", claims.groups);
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const userEmail = claims.preferred_username ?? claims.upn ?? "";
        res.setHeader("X-User-Email", userEmail);
        console.log("Auth successful for:", userEmail);
        res.status(200).send("");
    }
    catch (err) {
        console.error("Token validation failed:", err);
        res.status(401).json({ error: "Unauthorized" });
    }
};
router.post("/auth/validate", validateHandler);
router.get("/auth/validate", validateHandler);
export default router;
