import { timingSafeEqual } from "crypto";
import { Request, Response, NextFunction } from "express";
import { BACKEND_SECRET } from "../constants";

function safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
        // Compare against self to keep roughly constant work without throwing
        timingSafeEqual(bufA, bufA);
        return false;
    }
    return timingSafeEqual(bufA, bufB);
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized: Missing or invalid token" });
    }

    const token = authHeader.slice("Bearer ".length);

    if (!safeEqual(token, BACKEND_SECRET)) {
        return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }

    // Shared-secret auth (service-to-service). Not per-user identity.
    next();
};
