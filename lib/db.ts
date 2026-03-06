import Database from 'better-sqlite3';
import path from 'path';
import type { User, UserRow, Workspace, Task, SlackMessage, WorkspaceRow, TaskRow } from '@/types';

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
      related_channels TEXT DEFAULT '[]'
    );
  `);

  // 既存DBのマイグレーション: user_id カラムがなければ追加
  const columns = db.prepare("PRAGMA table_info(workspaces)").all() as { name: string }[];
  if (!columns.some((c) => c.name === 'user_id')) {
    db.exec('ALTER TABLE workspaces ADD COLUMN user_id TEXT');
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
  };
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
    ORDER BY t.created_at DESC
  `).all(userId) as TaskRow[];
  return rows.map(rowToTask);
}

// --- Task CRUD ---

export function getAllTasks(): Task[] {
  const rows = getDb().prepare('SELECT * FROM tasks ORDER BY created_at DESC').all() as TaskRow[];
  return rows.map(rowToTask);
}

export function getTasksByWorkspace(workspaceId: string): Task[] {
  const rows = getDb().prepare('SELECT * FROM tasks WHERE workspace_id = ? ORDER BY created_at DESC').all(workspaceId) as TaskRow[];
  return rows.map(rowToTask);
}

export function getTaskByThread(workspaceId: string, channelId: string, threadTs: string): Task | null {
  const row = getDb().prepare(
    'SELECT * FROM tasks WHERE workspace_id = ? AND channel_id = ? AND thread_ts = ?'
  ).get(workspaceId, channelId, threadTs) as TaskRow | undefined;
  return row ? rowToTask(row) : null;
}

export function createTask(task: Task): Task {
  getDb().prepare(`
    INSERT INTO tasks (id, workspace_id, channel_id, channel_name, thread_ts, trigger_message, thread_messages, status, created_at, completed_at, window_position, window_size, is_minimized, related_channels)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    JSON.stringify(task.relatedChannels),
  );
  return task;
}

export function updateTask(id: string, updates: Partial<Task>): Task | null {
  const existing = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
  if (!existing) return null;

  const current = rowToTask(existing);
  const merged = { ...current, ...updates };

  getDb().prepare(`
    UPDATE tasks SET
      workspace_id = ?, channel_id = ?, channel_name = ?, thread_ts = ?,
      trigger_message = ?, thread_messages = ?, status = ?,
      created_at = ?, completed_at = ?, window_position = ?, window_size = ?,
      is_minimized = ?, related_channels = ?
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
    relatedChannels: row.related_channels ? JSON.parse(row.related_channels) : [],
  };
}
