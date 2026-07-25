/**
 * Type definitions for job-related data structures
 */

export type JobStatus = "processing" | "ready" | "error" | "cancelled";
export type JobStage = "queued" | "downloading" | "processing" | "uploading" | "done";

/**
 * Data structure for updating a job in the database.
 * All fields are optional since updates may only modify specific fields.
 */
export interface JobUpdate {
  status?: JobStatus;
  stage?: JobStage;
  progress?: number;
  error?: string;
  public_url?: string;
  storage_path?: string;
}
