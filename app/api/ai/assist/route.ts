import { NextRequest, NextResponse } from 'next/server';
import { generateReplySuggestions } from '@/lib/anthropic';

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY is not configured' },
        { status: 500 },
      );
    }

    const { messages, triggerMessage } = await req.json();

    if (!messages && !triggerMessage) {
      return NextResponse.json(
        { error: 'messages or triggerMessage is required' },
        { status: 400 },
      );
    }

    // スレッドコンテキストを構築
    let context = '以下はSlackスレッドの会話です:\n\n';

    const allMessages = messages || [triggerMessage];
    for (const msg of allMessages) {
      context += `[${msg.userName}]: ${msg.text}\n`;
    }

    context += '\n上記のスレッドに対する適切な返信案を提案してください。';

    const suggestions = await generateReplySuggestions(context);

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('AI assist error:', error);
    return NextResponse.json(
      { error: 'AI assist failed' },
      { status: 500 },
    );
  }
}
