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
    model: 'claude-sonnet-4-6',
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

// --- プロジェクトメモ分析 ---

const memoSystemPrompt = `あなたはプロジェクトメモの内容を分析するAIアシスタントです。
プロジェクト概要(README)が提供されている場合は、プロジェクトの基本情報として活用してください。
ユーザーが保存したSlackメッセージやメモの内容と概要を基に、要約や質問への回答を行ってください。
回答は日本語で、簡潔かつ正確にしてください。`;

export async function analyzeMemos(
  memosContext: string,
  action: 'summarize' | 'chat',
  question?: string,
): Promise<string> {
  const anthropic = getClient();

  let userMessage = '';
  if (action === 'summarize') {
    userMessage = `以下のメモ内容を要約してください:\n\n${memosContext}`;
  } else {
    userMessage = `以下のメモ内容に基づいて質問に答えてください:\n\n${memosContext}\n\n質問: ${question}`;
  }

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: memoSystemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  return message.content[0].type === 'text' ? message.content[0].text : '';
}

// --- メモ → README 統合 ---

const memoToReadmeSystemPrompt = `あなたはプロジェクトの概要(README)を管理するAIアシスタントです。
メモの内容を既存のREADMEに適切に統合してください。

ルール:
- 既存のREADMEの構造と書式を維持してください
- メモの内容を要約し、適切な場所に追加してください
- 重複する情報は統合してください
- 全体の一貫性を保ってください
- Markdown形式で出力してください
- READMEが空の場合は、メモの内容を基に新しいREADMEを作成してください
- READMEのみを出力してください。説明や前置きは不要です。`;

export async function integrateMemoToReadme(
  memoText: string,
  currentReadme: string,
): Promise<string> {
  const anthropic = getClient();

  let userMessage = '';
  if (currentReadme.trim()) {
    userMessage = `現在のREADME:\n\n${currentReadme}\n\n---\n\n以下のメモ内容をREADMEに統合してください:\n\n${memoText}`;
  } else {
    userMessage = `READMEはまだありません。以下のメモ内容を基にREADMEを作成してください:\n\n${memoText}`;
  }

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: memoToReadmeSystemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  return message.content[0].type === 'text' ? message.content[0].text : '';
}
