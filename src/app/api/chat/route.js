import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// GET - Fetch recent chat messages
export async function GET() {
    try {
        const supabase = getSupabaseClient();

        const { data, error } = await supabase
            .from('chat_messages')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            console.error('Error fetching messages:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Reverse to show oldest first (chronological order)
        const messages = data ? data.reverse().map(msg => ({
            ...msg,
            timestamp: msg.created_at // Map created_at to timestamp for frontend compatibility
        })) : [];

        return NextResponse.json({ messages });
    } catch (error) {
        console.error('Error in chat API:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST - Post a new message
export async function POST(request) {
    try {
        const { username, message } = await request.json();

        if (!message || !message.trim()) {
            return NextResponse.json({ error: 'Message required' }, { status: 400 });
        }

        const supabase = getSupabaseClient();

        const { data, error } = await supabase
            .from('chat_messages')
            .insert([
                {
                    username: username || 'Guest',
                    message: message.trim(),
                    // created_at is automatically set by default value
                }
            ])
            .select()
            .single();

        if (error) {
            console.error('Error posting message:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: {
                ...data,
                timestamp: data.created_at
            }
        });
    } catch (error) {
        console.error('Error in chat API:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
