import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_KEY } from "../constants";
import { JobUpdate } from "../types/job";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
});

export const dbService = {
    async createJob(id: string, userId: string) {
        const { error } = await supabase
            .from('jobs')
            .insert([{ id, user_id: userId, status: 'processing' }]);
        if (error) throw error;
    },

    async updateJob(id: string, data: JobUpdate) {
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
