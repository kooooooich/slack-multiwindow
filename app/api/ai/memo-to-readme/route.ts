import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/db';
import { integrateMemoToReadme } from '@/lib/anthropic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, memoText } = body;

    if (!projectId || !memoText) {
      return NextResponse.json({ error: 'projectId, memoText required' }, { status: 400 });
    }

    const project = getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const currentReadme = project.readme || '';
    const updatedReadme = await integrateMemoToReadme(memoText, currentReadme);

    return NextResponse.json({ result: updatedReadme });
  } catch (error) {
    console.error('[AI Memo-to-Readme] Error:', error);
    return NextResponse.json({ error: 'AI integration failed' }, { status: 500 });
  }
}
