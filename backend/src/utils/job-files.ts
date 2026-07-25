import fs from "fs";
import path from "path";
import { UPLOADS_DIR } from "../constants";

/** Remove all upload artifacts for a job id (mp4, parts, vtt, fast). */
export async function deleteJobArtifacts(id: string): Promise<void> {
    if (!fs.existsSync(UPLOADS_DIR)) return;

    let names: string[];
    try {
        names = await fs.promises.readdir(UPLOADS_DIR);
    } catch {
        return;
    }

    const prefix = `clip-${id}`;
    await Promise.all(
        names
            .filter((name) => name === prefix || name.startsWith(`${prefix}.`) || name.startsWith(`${prefix}-`))
            .map((name) =>
                fs.promises.unlink(path.join(UPLOADS_DIR, name)).catch(() => undefined)
            )
    );
}
