import { NextRequest, NextResponse } from 'next/server';
import { searchTasks } from '@/lib/db';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q');
  const status = request.nextUrl.searchParams.get('status') || undefined;

  if (!q || q.trim().length === 0) {
    return NextResponse.json([]);
  }

  try {
    const tasks = searchTasks(q.trim(), status);
    return NextResponse.json(tasks);
  } catch {
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
