/**
 * Type definitions for job-related data structures
 */

export type JobStatus = 'processing' | 'ready' | 'error';
export type JobStage = 'downloading' | 'processing' | 'uploading' | 'done';

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

/**
 * Full job record as stored in the database
 */
export interface Job {
  id: string;
  user_id: string;
  status: JobStatus;
  stage?: JobStage;
  progress?: number;
  error?: string;
  public_url?: string;
  storage_path?: string;
  created_at?: string;
}

/**
 * Standard API error structure
 */
export interface ApiError extends Error {
  status?: number;
  code?: string;
}
