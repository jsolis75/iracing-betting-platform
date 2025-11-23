import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export async function POST(request) {
    try {
        const { userId } = await request.json();

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }

        const supabase = getSupabaseClient();

        // Reset balance to 1000
        const { data, error } = await supabase
            .from('users')
            .update({ balance: 1000 })
            .eq('id', userId)
            .select()
            .single();

        if (error) {
            console.error('Error resetting balance:', error);
            return NextResponse.json({ error: 'Failed to reset balance' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            user: data
        });

    } catch (error) {
        console.error('Error in reset-balance:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
