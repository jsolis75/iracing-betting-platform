import { createClient } from '@supabase/supabase-js';

// Get Supabase URL and key from environment
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
}

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseKey);

// Helper function to get database connection (for server-side)
export async function getDbConnection() {
    const { Pool } = require('pg');

    const pool = new Pool({
        connectionString: process.env.POSTGRES1_URL,
        ssl: { rejectUnauthorized: false }
    });

    return pool;
}
