import Database from 'better-sqlite3';
import path from 'path';
import type {
  User, UserRow, Workspace, Task, SlackMessage, WorkspaceRow, TaskRow,
  MonitoredChannel, MonitoredChannelRow,
  Project, ProjectRow,
  ProjectMemo, ProjectMemoRow,
  ProjectDocument, ProjectDocumentRow,
} from '@/types';

const DB_PATH = process.env.DATABASE_PATH || './app.db';

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;

  const dbPath = path.isAbsolute(DB_PATH) ? DB_PATH : path.resolve(process.cwd(), DB_PATH);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initTables(db);
  return db;
}

function initTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      google_id TEXT UNIQUE,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      avatar_url TEXT,
      created_at TEXT NOT NULL,
      last_login_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      bot_token TEXT NOT NULL,
      signing_secret TEXT NOT NULL,
      app_token TEXT,
      user_token TEXT,
      target_user_id TEXT,
      user_id TEXT,
      team_id TEXT,
      is_active INTEGER DEFAULT 1,
      added_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      thread_ts TEXT NOT NULL,
      trigger_message TEXT NOT NULL,
      thread_messages TEXT NOT NULL DEFAULT '[]',
      status TEXT DEFAULT 'open',
      created_at TEXT NOT NULL,
      completed_at TEXT,
      window_position TEXT,
      window_size TEXT,
      is_minimized INTEGER DEFAULT 0,
      last_activity_at TEXT,
      related_channels TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS monitored_channels (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      channel_type TEXT DEFAULT 'channel',
      added_at TEXT NOT NULL,
      UNIQUE(workspace_id, channel_id)
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      readme TEXT DEFAULT '',
      workspace_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_memos (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      task_id TEXT,
      message_ts TEXT,
      message_user TEXT,
      message_text TEXT NOT NULL,
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      description TEXT DEFAULT '',
      extracted_text TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);

  // 既存DBのマイグレーション
  const columns = db.prepare("PRAGMA table_info(workspaces)").all() as { name: string }[];
  if (!columns.some((c) => c.name === 'user_id')) {
    db.exec('ALTER TABLE workspaces ADD COLUMN user_id TEXT');
  }
  if (!columns.some((c) => c.name === 'last_scan_at')) {
    db.exec('ALTER TABLE workspaces ADD COLUMN last_scan_at TEXT');
  }

  // projects テーブルのマイグレーション
  const projectColumns = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
  if (!projectColumns.some((c) => c.name === 'readme')) {
    db.exec("ALTER TABLE projects ADD COLUMN readme TEXT DEFAULT ''");
  }

  // project_memos テーブルのマイグレーション
  const memoColumns = db.prepare("PRAGMA table_info(project_memos)").all() as { name: string }[];
  if (!memoColumns.some((c) => c.name === 'message_url')) {
    db.exec("ALTER TABLE project_memos ADD COLUMN message_url TEXT");
  }

  // tasks テーブルのマイグレーション: last_activity_at
  const taskColumns = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
  if (!taskColumns.some((c) => c.name === 'last_activity_at')) {
    db.exec("ALTER TABLE tasks ADD COLUMN last_activity_at TEXT");
    // 既存タスクは created_at で初期化
    db.exec("UPDATE tasks SET last_activity_at = created_at WHERE last_activity_at IS NULL");
  }

  // tasks テーブルの重複クリーンアップ + ユニークインデックス追加
  try {
    // 既存の重複タスクを検出し、新しい方（created_at DESC）のみ残す
    db.exec(`
      DELETE FROM tasks WHERE id NOT IN (
        SELECT MIN(id) FROM tasks GROUP BY workspace_id, channel_id, thread_ts
      )
    `);
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_thread
      ON tasks (workspace_id, channel_id, thread_ts)
    `);
  } catch {
    // インデックスが既に存在する場合は無視
  }
}

// --- User CRUD ---

export function getUserByGoogleId(googleId: string): User | null {
  const row = getDb().prepare('SELECT * FROM users WHERE google_id = ?').get(googleId) as UserRow | undefined;
  return row ? rowToUser(row) : null;
}

export function getUserByEmail(email: string): User | null {
  const row = getDb().prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  return row ? rowToUser(row) : null;
}

export function upsertUser(data: { googleId: string; email: string; name: string; avatarUrl: string }): User {
  const now = new Date().toISOString();
  const existing = getUserByGoogleId(data.googleId);

  if (existing) {
    getDb().prepare(`
      UPDATE users SET name = ?, avatar_url = ?, last_login_at = ? WHERE google_id = ?
    `).run(data.name, data.avatarUrl, now, data.googleId);
    return { ...existing, name: data.name, avatarUrl: data.avatarUrl, lastLoginAt: now };
  }

  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4();
  getDb().prepare(`
    INSERT INTO users (id, google_id, email, name, avatar_url, created_at, last_login_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.googleId, data.email, data.name, data.avatarUrl, now, now);

  return {
    id,
    googleId: data.googleId,
    email: data.email,
    name: data.name,
    avatarUrl: data.avatarUrl,
    createdAt: now,
    lastLoginAt: now,
  };
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    googleId: row.google_id,
    email: row.email,
    name: row.name || '',
    avatarUrl: row.avatar_url || '',
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

// --- Workspace CRUD ---

export function getAllWorkspaces(): Workspace[] {
  const rows = getDb().prepare('SELECT * FROM workspaces ORDER BY added_at DESC').all() as WorkspaceRow[];
  return rows.map(rowToWorkspace);
}

export function getWorkspace(id: string): Workspace | null {
  const row = getDb().prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as WorkspaceRow | undefined;
  return row ? rowToWorkspace(row) : null;
}

export function createWorkspace(ws: Workspace): Workspace {
  getDb().prepare(`
    INSERT INTO workspaces (id, name, bot_token, signing_secret, app_token, user_token, target_user_id, user_id, team_id, is_active, added_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ws.id, ws.name, ws.botToken, ws.signingSecret, ws.appToken || null, ws.userToken || null, ws.targetUserId || null, ws.userId || null, ws.teamId, ws.isActive ? 1 : 0, ws.addedAt);
  return ws;
}

export function deleteWorkspace(id: string): boolean {
  const result = getDb().prepare('DELETE FROM workspaces WHERE id = ?').run(id);
  return result.changes > 0;
}

function rowToWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    botToken: row.bot_token,
    signingSecret: row.signing_secret,
    appToken: row.app_token || undefined,
    userToken: row.user_token || undefined,
    targetUserId: row.target_user_id || undefined,
    userId: row.user_id || undefined,
    teamId: row.team_id || '',
    isActive: row.is_active === 1,
    addedAt: row.added_at,
    lastScanAt: row.last_scan_at || undefined,
  };
}

export function updateWorkspaceScanTime(id: string, scanAt: string): void {
  getDb().prepare('UPDATE workspaces SET last_scan_at = ? WHERE id = ?').run(scanAt, id);
}

// --- User-scoped queries ---

export function getWorkspacesByUserId(userId: string): Workspace[] {
  const rows = getDb().prepare(
    'SELECT * FROM workspaces WHERE user_id = ? ORDER BY added_at DESC'
  ).all(userId) as WorkspaceRow[];
  return rows.map(rowToWorkspace);
}

export function getTasksByUserId(userId: string): Task[] {
  const rows = getDb().prepare(`
    SELECT t.* FROM tasks t
    INNER JOIN workspaces w ON t.workspace_id = w.id
    WHERE w.user_id = ?
    ORDER BY COALESCE(t.last_activity_at, t.created_at) DESC
  `).all(userId) as TaskRow[];
  return rows.map(rowToTask);
}

// --- Task CRUD ---

export function getAllTasks(): Task[] {
  const rows = getDb().prepare('SELECT * FROM tasks ORDER BY COALESCE(last_activity_at, created_at) DESC').all() as TaskRow[];
  return rows.map(rowToTask);
}

export function getTasksByWorkspace(workspaceId: string): Task[] {
  const rows = getDb().prepare('SELECT * FROM tasks WHERE workspace_id = ? ORDER BY COALESCE(last_activity_at, created_at) DESC').all(workspaceId) as TaskRow[];
  return rows.map(rowToTask);
}

export function getTaskByThread(workspaceId: string, channelId: string, threadTs: string): Task | null {
  const row = getDb().prepare(
    'SELECT * FROM tasks WHERE workspace_id = ? AND channel_id = ? AND thread_ts = ?'
  ).get(workspaceId, channelId, threadTs) as TaskRow | undefined;
  return row ? rowToTask(row) : null;
}

/**
 * ポーリング対象タスクを取得
 * - 全 open タスク
 * - 完了後 maxCompletedAgeDays 日以内の completed タスク
 */
export function getTasksForPolling(maxCompletedAgeDays: number = 7): Task[] {
  const cutoff = new Date(Date.now() - maxCompletedAgeDays * 24 * 60 * 60 * 1000).toISOString();
  const rows = getDb().prepare(`
    SELECT * FROM tasks
    WHERE status = 'open'
       OR (status = 'completed' AND completed_at > ?)
    ORDER BY created_at DESC
  `).all(cutoff) as TaskRow[];
  return rows.map(rowToTask);
}

export function createTask(task: Task): Task {
  const now = new Date().toISOString();
  // UNIQUE制約(workspace_id, channel_id, thread_ts)違反時は既存タスクを更新
  getDb().prepare(`
    INSERT INTO tasks (id, workspace_id, channel_id, channel_name, thread_ts, trigger_message, thread_messages, status, created_at, completed_at, window_position, window_size, is_minimized, last_activity_at, related_channels)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (workspace_id, channel_id, thread_ts) DO UPDATE SET
      thread_messages = excluded.thread_messages,
      status = CASE WHEN tasks.status = 'completed' THEN excluded.status ELSE tasks.status END,
      last_activity_at = excluded.last_activity_at
  `).run(
    task.id,
    task.workspaceId,
    task.channelId,
    task.channelName,
    task.threadTs,
    JSON.stringify(task.triggerMessage),
    JSON.stringify(task.threadMessages),
    task.status,
    task.createdAt,
    task.completedAt || null,
    JSON.stringify(task.windowPosition),
    JSON.stringify(task.windowSize),
    task.isMinimized ? 1 : 0,
    task.lastActivityAt || now,
    JSON.stringify(task.relatedChannels),
  );
  return task;
}

export function updateTask(id: string, updates: Partial<Task>): Task | null {
  const existing = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
  if (!existing) return null;

  const current = rowToTask(existing);
  const merged = { ...current, ...updates };

  // threadMessages が更新された場合は lastActivityAt を現在時刻に
  if (updates.threadMessages) {
    merged.lastActivityAt = new Date().toISOString();
  }

  getDb().prepare(`
    UPDATE tasks SET
      workspace_id = ?, channel_id = ?, channel_name = ?, thread_ts = ?,
      trigger_message = ?, thread_messages = ?, status = ?,
      created_at = ?, completed_at = ?, window_position = ?, window_size = ?,
      is_minimized = ?, last_activity_at = ?, related_channels = ?
    WHERE id = ?
  `).run(
    merged.workspaceId,
    merged.channelId,
    merged.channelName,
    merged.threadTs,
    JSON.stringify(merged.triggerMessage),
    JSON.stringify(merged.threadMessages),
    merged.status,
    merged.createdAt,
    merged.completedAt || null,
    JSON.stringify(merged.windowPosition),
    JSON.stringify(merged.windowSize),
    merged.isMinimized ? 1 : 0,
    merged.lastActivityAt || merged.createdAt,
    JSON.stringify(merged.relatedChannels),
    id,
  );
  return merged;
}

export function deleteTask(id: string): boolean {
  const result = getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id);
  return result.changes > 0;
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    channelId: row.channel_id,
    channelName: row.channel_name,
    threadTs: row.thread_ts,
    triggerMessage: JSON.parse(row.trigger_message) as SlackMessage,
    threadMessages: JSON.parse(row.thread_messages) as SlackMessage[],
    status: row.status as 'open' | 'completed',
    createdAt: row.created_at,
    completedAt: row.completed_at || undefined,
    windowPosition: row.window_position ? JSON.parse(row.window_position) : { x: 100, y: 100 },
    windowSize: row.window_size ? JSON.parse(row.window_size) : { width: 450, height: 500 },
    isMinimized: row.is_minimized === 1,
    lastActivityAt: row.last_activity_at || row.created_at,
    relatedChannels: row.related_channels ? JSON.parse(row.related_channels) : [],
  };
}

// --- Task Search ---

export function searchTasks(query: string, status?: string, userId?: string): Task[] {
  const likeParam = `%${query}%`;
  let sql = `
    SELECT t.* FROM tasks t
    ${userId ? 'INNER JOIN workspaces w ON t.workspace_id = w.id' : ''}
    WHERE (t.trigger_message LIKE ? OR t.thread_messages LIKE ?)
  `;
  const params: string[] = [likeParam, likeParam];

  if (status) {
    sql += ' AND t.status = ?';
    params.push(status);
  }
  if (userId) {
    sql += ' AND w.user_id = ?';
    params.push(userId);
  }
  sql += ' ORDER BY t.created_at DESC LIMIT 50';

  const rows = getDb().prepare(sql).all(...params) as TaskRow[];
  return rows.map(rowToTask);
}

// --- Monitored Channels CRUD ---

export function getMonitoredChannels(workspaceId: string): MonitoredChannel[] {
  const rows = getDb().prepare(
    'SELECT * FROM monitored_channels WHERE workspace_id = ? ORDER BY added_at ASC'
  ).all(workspaceId) as MonitoredChannelRow[];
  return rows.map(rowToMonitoredChannel);
}

export function addMonitoredChannel(data: {
  workspaceId: string;
  channelId: string;
  channelName: string;
  channelType?: string;
}): MonitoredChannel {
  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4();
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT OR IGNORE INTO monitored_channels (id, workspace_id, channel_id, channel_name, channel_type, added_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, data.workspaceId, data.channelId, data.channelName, data.channelType || 'channel', now);
  return {
    id,
    workspaceId: data.workspaceId,
    channelId: data.channelId,
    channelName: data.channelName,
    channelType: (data.channelType || 'channel') as MonitoredChannel['channelType'],
    addedAt: now,
  };
}

export function removeMonitoredChannel(workspaceId: string, channelId: string): boolean {
  const result = getDb().prepare(
    'DELETE FROM monitored_channels WHERE workspace_id = ? AND channel_id = ?'
  ).run(workspaceId, channelId);
  return result.changes > 0;
}

function rowToMonitoredChannel(row: MonitoredChannelRow): MonitoredChannel {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    channelId: row.channel_id,
    channelName: row.channel_name,
    channelType: row.channel_type as MonitoredChannel['channelType'],
    addedAt: row.added_at,
  };
}

// --- Projects CRUD ---

export function getAllProjects(): Project[] {
  const rows = getDb().prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as ProjectRow[];
  return rows.map(rowToProject);
}

export function getProject(id: string): Project | null {
  const row = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
  return row ? rowToProject(row) : null;
}

export function createProject(data: { name: string; description?: string; readme?: string; workspaceId?: string }): Project {
  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4();
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO projects (id, name, description, readme, workspace_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.name, data.description || '', data.readme || '', data.workspaceId || null, now, now);
  return {
    id,
    name: data.name,
    description: data.description || '',
    readme: data.readme || '',
    workspaceId: data.workspaceId,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateProject(id: string, updates: Partial<Project>): Project | null {
  const existing = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
  if (!existing) return null;
  const current = rowToProject(existing);
  const merged = { ...current, ...updates, updatedAt: new Date().toISOString() };
  getDb().prepare(`
    UPDATE projects SET name = ?, description = ?, readme = ?, workspace_id = ?, updated_at = ? WHERE id = ?
  `).run(merged.name, merged.description, merged.readme || '', merged.workspaceId || null, merged.updatedAt, id);
  return merged;
}

export function deleteProject(id: string): boolean {
  const result = getDb().prepare('DELETE FROM projects WHERE id = ?').run(id);
  return result.changes > 0;
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    readme: row.readme || '',
    workspaceId: row.workspace_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// --- Project Memos CRUD ---

export function getMemosByProject(projectId: string): ProjectMemo[] {
  const rows = getDb().prepare(
    'SELECT * FROM project_memos WHERE project_id = ? ORDER BY created_at ASC'
  ).all(projectId) as ProjectMemoRow[];
  return rows.map(rowToMemo);
}

export function createMemo(data: {
  projectId: string;
  taskId?: string;
  messageTs?: string;
  messageUser?: string;
  messageText: string;
  messageUrl?: string;
  note?: string;
}): ProjectMemo {
  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4();
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO project_memos (id, project_id, task_id, message_ts, message_user, message_text, message_url, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.projectId, data.taskId || null, data.messageTs || null, data.messageUser || null, data.messageText, data.messageUrl || null, data.note || '', now);
  return {
    id,
    projectId: data.projectId,
    taskId: data.taskId,
    messageTs: data.messageTs,
    messageUser: data.messageUser,
    messageText: data.messageText,
    messageUrl: data.messageUrl,
    note: data.note || '',
    createdAt: now,
  };
}

export function deleteMemo(id: string): boolean {
  const result = getDb().prepare('DELETE FROM project_memos WHERE id = ?').run(id);
  return result.changes > 0;
}

export function updateMemo(id: string, updates: { messageText?: string; note?: string }): ProjectMemo | null {
  const existing = getDb().prepare('SELECT * FROM project_memos WHERE id = ?').get(id) as ProjectMemoRow | undefined;
  if (!existing) return null;
  const current = rowToMemo(existing);
  const merged = {
    ...current,
    messageText: updates.messageText !== undefined ? updates.messageText : current.messageText,
    note: updates.note !== undefined ? updates.note : current.note,
  };
  getDb().prepare(`
    UPDATE project_memos SET message_text = ?, note = ? WHERE id = ?
  `).run(merged.messageText, merged.note, id);
  return merged;
}

function rowToMemo(row: ProjectMemoRow): ProjectMemo {
  return {
    id: row.id,
    projectId: row.project_id,
    taskId: row.task_id || undefined,
    messageTs: row.message_ts || undefined,
    messageUser: row.message_user || undefined,
    messageText: row.message_text,
    messageUrl: row.message_url || undefined,
    note: row.note,
    createdAt: row.created_at,
  };
}

// --- Project Documents CRUD ---

export function getDocumentsByProject(projectId: string): ProjectDocument[] {
  const rows = getDb().prepare(
    'SELECT * FROM project_documents WHERE project_id = ? ORDER BY created_at DESC'
  ).all(projectId) as ProjectDocumentRow[];
  return rows.map(rowToDocument);
}

export function getDocument(id: string): ProjectDocument | null {
  const row = getDb().prepare('SELECT * FROM project_documents WHERE id = ?').get(id) as ProjectDocumentRow | undefined;
  return row ? rowToDocument(row) : null;
}

export function createDocument(data: {
  projectId: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  description?: string;
  extractedText?: string;
}): ProjectDocument {
  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4();
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO project_documents (id, project_id, file_name, original_name, mime_type, size_bytes, description, extracted_text, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.projectId, data.fileName, data.originalName, data.mimeType, data.sizeBytes, data.description || '', data.extractedText || null, now);
  return {
    id,
    projectId: data.projectId,
    fileName: data.fileName,
    originalName: data.originalName,
    mimeType: data.mimeType,
    sizeBytes: data.sizeBytes,
    description: data.description || '',
    extractedText: data.extractedText,
    createdAt: now,
  };
}

export function updateDocument(id: string, updates: { description?: string; extractedText?: string }): ProjectDocument | null {
  const existing = getDb().prepare('SELECT * FROM project_documents WHERE id = ?').get(id) as ProjectDocumentRow | undefined;
  if (!existing) return null;
  const current = rowToDocument(existing);
  const merged = {
    ...current,
    description: updates.description !== undefined ? updates.description : current.description,
    extractedText: updates.extractedText !== undefined ? updates.extractedText : current.extractedText,
  };
  getDb().prepare(`
    UPDATE project_documents SET description = ?, extracted_text = ? WHERE id = ?
  `).run(merged.description, merged.extractedText || null, id);
  return merged;
}

export function deleteDocument(id: string): boolean {
  const result = getDb().prepare('DELETE FROM project_documents WHERE id = ?').run(id);
  return result.changes > 0;
}

function rowToDocument(row: ProjectDocumentRow): ProjectDocument {
  return {
    id: row.id,
    projectId: row.project_id,
    fileName: row.file_name,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    description: row.description,
    extractedText: row.extracted_text || undefined,
    createdAt: row.created_at,
  };
}
