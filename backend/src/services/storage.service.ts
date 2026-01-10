import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_KEY, BUCKET_NAME, CHUNKED_UPLOAD_THRESHOLD } from "../constants";
import fs from "fs";


const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
});

export const storageService = {
    async uploadFile(path: string, bufferOrStream: Buffer | NodeJS.ReadableStream, contentType: string = 'video/mp4') {
        // If it's a stream, we need to get the file size first
        let buffer: Buffer;

        if (Buffer.isBuffer(bufferOrStream)) {
            buffer = bufferOrStream;
        } else {
            // Convert stream to buffer to check size
            const chunks: Buffer[] = [];
            for await (const chunk of bufferOrStream) {
                if (Buffer.isBuffer(chunk)) {
                    chunks.push(chunk);
                } else if (typeof chunk === 'string') {
                    chunks.push(Buffer.from(chunk, 'utf-8'));
                } else {
                    chunks.push(Buffer.from(chunk as Uint8Array));
                }
            }
            buffer = Buffer.concat(chunks);
        }

        // Use standard upload for files under threshold
        const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(path, buffer, {
                contentType,
                upsert: true,
                // Enable duplex for better streaming performance
                duplex: 'half'
            });

        if (error) throw error;

        const { data } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(path);

        return data.publicUrl;
    },

    async deleteFile(path: string) {
        const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([path]);
        if (error) throw error;
    },

    async listBuckets() {
        return await supabase.storage.listBuckets();
    },

    async listFiles() {
        return await supabase.storage.from(BUCKET_NAME).list();
    },

    async getSignedDownloadUrl(path: string, filename: string) {
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .createSignedUrl(path, 60, {
                download: filename
            });
        if (error) throw error;
        return data.signedUrl;
    }
};
