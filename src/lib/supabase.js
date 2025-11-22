import { createClient } from '@supabase/supabase-js';

// Get Supabase URL and key from environment
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Create Supabase client
export const supabase = supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// Get Supabase client for server-side use
export function getSupabaseClient() {
    if (!supabase) {
        throw new Error('Supabase client not initialized. Check environment variables.');
    }
    return supabase;
}
