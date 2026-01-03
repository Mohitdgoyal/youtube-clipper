import path from "path";
import fs from "fs";

export const PORT = process.env.PORT || 3001;

export const SUPABASE_URL = process.env.SUPABASE_URL as string;
export const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY as string;
export const BUCKET_NAME = process.env.SUPABASE_BUCKET || 'videos';

export const ALLOWED_ORIGIN = process.env.NODE_ENV === "production"
    ? "https://clippa.in"
    : "http://localhost:3000";

export const UPLOADS_DIR = path.join(__dirname, "../../uploads");

// Ensure directories exist
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}


export const BACKEND_SECRET = process.env.BACKEND_SECRET || 'dev-secret';
