import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const supabase = getSupabaseServiceClient();

        // Find users with null balance
        const { data: users, error } = await supabase
            .from('users')
            .select('id, username, balance')
            .is('balance', null);

        if (error) throw error;

        const updates = [];
        for (const user of users) {
            // Set null balance to 0 (or 1000 if you want to reset to default starting balance)
            const { error: updateError } = await supabase
                .from('users')
                .update({ balance: 0 })
                .eq('id', user.id);
            
            if (!updateError) {
                updates.push({ username: user.username, oldBalance: null, newBalance: 0 });
            }
        }

        return NextResponse.json({ 
            message: `Fixed ${updates.length} users with null balance`,
            updates 
        });

    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
