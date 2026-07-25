import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { ALLOWED_ORIGIN, UPLOADS_DIR } from "./constants";
import { authMiddleware } from "./middleware/auth.middleware";
import jobRoutes from "./routes/job.routes";
import formatRoutes from "./routes/format.routes";
import healthRoutes from "./routes/health.routes";
import { errorMiddleware } from "./middleware/error.middleware";
import { verifyDownloadSignature } from "./utils/signed-url";

export const app = express();

// Railway / reverse proxies: use X-Forwarded-For for req.ip (rate limits)
app.set("trust proxy", 1);

const corsOptions: cors.CorsOptions = {
    origin: ALLOWED_ORIGIN,
    credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "32kb" }));

// Public routes
app.get("/api/ping", (_req, res) => { res.json({ success: true }) });
app.get("/", (_req, res) => { res.send("Server is alive!") });

// Signed upload downloads only (HMAC + expiry required)
app.get("/uploads/:filename", (req, res) => {
    const safeName = path.basename(req.params.filename);
    const uploadsRoot = path.resolve(UPLOADS_DIR);
    const filePath = path.resolve(uploadsRoot, safeName);

    if (!filePath.startsWith(uploadsRoot + path.sep) && filePath !== uploadsRoot) {
        return res.status(400).json({ error: "Invalid filename" });
    }

    const verified = verifyDownloadSignature(safeName, req.query.expires, req.query.sig);
    if (!verified.ok) {
        return res.status(verified.status).json({ error: verified.error });
    }

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File not found" });
    }

    const downloadName =
        typeof req.query.download === "string" && req.query.download.length > 0
            ? path.basename(req.query.download)
            : undefined;

    if (downloadName) {
        return res.download(filePath, downloadName);
    }

    return res.sendFile(filePath);
});

// Protected API routes
app.use("/api", authMiddleware);
app.use("/api", jobRoutes);
app.use("/api", formatRoutes);
app.use("/api", healthRoutes);

// Error handling
app.use(errorMiddleware);
