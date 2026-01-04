import { app } from "./app";
import { PORT } from "./constants";
import { dbService } from "./services/db.service";

async function cleanupTask() {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await dbService.cleanupOldJobs(twentyFourHoursAgo);
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  cleanupTask();
});
