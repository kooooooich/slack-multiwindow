import { NextRequest, NextResponse } from 'next/server';
import { getAllProjects, createProject, updateProject, deleteProject } from '@/lib/db';

export async function GET() {
  const projects = getAllProjects();
  return NextResponse.json(projects);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, workspaceId, readme } = body;
    if (!name) {
      return NextResponse.json({ error: 'name required' }, { status: 400 });
    }
    const project = createProject({ name, description, workspaceId, readme });
    return NextResponse.json(project);
  } catch {
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }
    const project = updateProject(id, updates);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    return NextResponse.json(project);
  } catch {
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }
  const success = deleteProject(id);
  return NextResponse.json({ success });
}
