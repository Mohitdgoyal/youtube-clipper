import { randomBytes } from "crypto";

/** Cryptographically strong job id (unpredictable for public URL guessing). */
export function createJobId(): string {
    return randomBytes(16).toString("hex");
}
