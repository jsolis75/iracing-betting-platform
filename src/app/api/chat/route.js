// In-memory message storage (resets on server restart)
let messages = [];

export async function GET() {
    return Response.json({ messages });
}

export async function POST(request) {
    try {
        const { username, message } = await request.json();

        if (!message || !message.trim()) {
            return Response.json(
                { error: 'Message cannot be empty' },
                { status: 400 }
            );
        }

        const newMessage = {
            username: username || 'Guest',
            message: message.trim(),
            timestamp: new Date().toISOString(),
        };

        messages.push(newMessage);

        // Keep only last 100 messages
        if (messages.length > 100) {
            messages = messages.slice(-100);
        }

        return Response.json({ success: true, message: newMessage });
    } catch (error) {
        console.error('Chat API error:', error);
        return Response.json(
            { error: 'Failed to send message' },
            { status: 500 }
        );
    }
}
