import { NextRequest, NextResponse } from 'next/server';
import { getWorkspace, getAllWorkspaces, getTaskByThread, updateTask } from '@/lib/db';
import { getSlackClient, fetchThreadMessages } from '@/lib/slack';

/**
 * ファイルアップロード API
 * multipart/form-data でファイルを受信し、Slack にアップロードする
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const workspaceId = formData.get('workspaceId') as string | null;
    const channelId = formData.get('channelId') as string | null;
    const threadTs = formData.get('threadTs') as string | null;
    const initialComment = formData.get('initialComment') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }

    let botToken = '';
    let userToken = '';

    if (workspaceId) {
      const ws = getWorkspace(workspaceId);
      if (!ws) {
        return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
      }
      botToken = ws.botToken;
      userToken = ws.userToken || '';
    } else {
      const workspaces = getAllWorkspaces();
      if (workspaces.length > 0) {
        botToken = workspaces[0].botToken;
        userToken = workspaces[0].userToken || '';
      }
    }

    if (!botToken) {
      return NextResponse.json({ error: 'No bot token available' }, { status: 400 });
    }

    // userToken があればユーザー自身としてアップロード
    const client = getSlackClient(userToken || botToken);

    // File を Buffer に変換
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // files.uploadV2 でアップロード
    const uploadArgs: Record<string, unknown> = {
      channel_id: channelId,
      file: buffer,
      filename: file.name,
    };
    if (threadTs) {
      uploadArgs.thread_ts = threadTs;
    }
    if (initialComment) {
      uploadArgs.initial_comment = initialComment;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uploadResult = await client.filesUploadV2(uploadArgs as any);

    // アップロード後にスレッドメッセージを更新（Slackの処理待ちのため少し遅延）
    if (threadTs && workspaceId) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        const task = getTaskByThread(workspaceId, channelId, threadTs);
        if (task) {
          const messages = await fetchThreadMessages(botToken, channelId, threadTs, workspaceId);
          updateTask(task.id, { threadMessages: messages });
        }
      } catch (e) {
        console.error('Failed to refresh thread after upload:', e);
      }
    }

    return NextResponse.json({
      success: true,
      files: uploadResult.files || [],
    });
  } catch (error) {
    console.error('Failed to upload file:', error);
    const message = error instanceof Error ? error.message : 'Failed to upload file';
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
