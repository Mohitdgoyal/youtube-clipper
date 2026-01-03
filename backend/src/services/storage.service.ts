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
    }
};

export const dbService = {
    async createJob(id: string, userId: string) {
        const { error } = await supabase
            .from('jobs')
            .insert([{ id, user_id: userId, status: 'processing' }]);
        if (error) throw error;
    },

    async updateJob(id: string, data: any) {
        const { error } = await supabase
            .from('jobs')
            .update(data)
            .eq('id', id);
        if (error) throw error;
    },

    async getJob(id: string) {
        const { data, error } = await supabase
            .from('jobs')
            .select('*')
            .eq('id', id)
            .single();
        if (error) return null;
        return data;
    },

    async deleteJob(id: string) {
        const { error } = await supabase
            .from('jobs')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    async cleanupOldJobs(twentyFourHoursAgo: string) {
        return await supabase
            .from('jobs')
            .delete()
            .lt('created_at', twentyFourHoursAgo);
    }
};
