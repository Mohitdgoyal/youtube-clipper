import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { PORT, ALLOWED_ORIGIN } from "./constants";
import { authMiddleware } from "./middleware/auth.middleware";
import jobRoutes from "./routes/job.routes";
import formatRoutes from "./routes/format.routes";
import { errorMiddleware } from "./middleware/error.middleware";
import { dbService } from "./services/storage.service";

dotenv.config();

const app = express();

const corsOptions: cors.CorsOptions = {
  origin: ALLOWED_ORIGIN,
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// Public routes
app.get("/api/ping", (_req, res) => res.json({ success: true }));
app.get("/", (req, res) => res.send("Server is alive!"));

// Protected routes
app.use("/api", authMiddleware);
app.use("/api", jobRoutes);
app.use("/api", formatRoutes);

// Error handling
app.use(errorMiddleware);

// Cleanup task
async function cleanupTask() {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await dbService.cleanupOldJobs(twentyFourHoursAgo);
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  cleanupTask();
});
