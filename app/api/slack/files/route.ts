import { NextRequest, NextResponse } from 'next/server';
import { getWorkspace, getAllWorkspaces } from '@/lib/db';

/**
 * ファイルプロキシ API
 * Slack のプライベート URL にBot Tokenでアクセスし、バイナリをストリームで返す
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');
    const fileUrl = searchParams.get('fileUrl');

    if (!fileUrl) {
      return NextResponse.json({ error: 'fileUrl is required' }, { status: 400 });
    }

    let botToken: string | undefined;

    if (workspaceId) {
      const ws = getWorkspace(workspaceId);
      if (!ws) {
        return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
      }
      botToken = ws.botToken;
    } else {
      const workspaces = getAllWorkspaces();
      if (workspaces.length > 0) {
        botToken = workspaces[0].botToken;
      }
    }

    if (!botToken) {
      return NextResponse.json({ error: 'No bot token available' }, { status: 400 });
    }

    // Slack のプライベート URL にアクセス
    const response = await fetch(fileUrl, {
      headers: {
        Authorization: `Bearer ${botToken}`,
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch file: ${response.status}` },
        { status: response.status },
      );
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const body = response.body;

    if (!body) {
      return NextResponse.json({ error: 'Empty response body' }, { status: 500 });
    }

    return new NextResponse(body as ReadableStream, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Failed to proxy file:', error);
    return NextResponse.json(
      { error: 'Failed to proxy file' },
      { status: 500 },
    );
  }
}
