import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_KEY, BUCKET_NAME } from "../constants";


const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
});

export const storageService = {
    async uploadFile(path: string, buffer: Buffer | NodeJS.ReadableStream, contentType: string = 'video/mp4') {
        const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(path, buffer, {
                contentType,
                upsert: true,
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

