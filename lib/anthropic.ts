import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return client;
}

const systemPrompt = `あなたはSlackの返信を補助するAIアシスタントです。
以下のスレッドの内容を読み、ユーザーが送るべき適切な返信を1〜3案提案してください。
返信は日本語で、簡潔でプロフェッショナルなトーンにしてください。
出力はJSON形式で { "suggestions": ["案1", "案2", "案3"] } としてください。
JSON以外のテキストは出力しないでください。`;

export async function generateReplySuggestions(
  threadContext: string,
): Promise<string[]> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: threadContext,
      },
    ],
  });

  const responseText =
    message.content[0].type === 'text' ? message.content[0].text : '';

  try {
    // JSON部分を抽出
    const jsonMatch = responseText.match(/\{[\s\S]*"suggestions"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.suggestions || [];
    }
    return [responseText];
  } catch {
    return [responseText];
  }
}
