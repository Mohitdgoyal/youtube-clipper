import { Router } from "express";
import { getCookiesHealth } from "../utils/cookies-health";

const router = Router();

router.get("/health/cookies", (_req, res) => {
    return res.json(getCookiesHealth());
});

export default router;
