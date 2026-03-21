export interface User {
  id: string;
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string;
  createdAt: string;
  lastLoginAt: string;
}

export interface UserRow {
  id: string;
  google_id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
  last_login_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  botToken: string;
  signingSecret: string;
  appToken?: string;
  userToken?: string;     // User OAuth Token (xoxp-...) 自分として返信する場合に使用
  targetUserId?: string;  // 監視対象ユーザーID（このユーザーへのメンションをタスク化）
  userId?: string;        // 所有者のユーザーID（Google認証時に紐づけ）
  teamId: string;
  addedAt: string;
  isActive: boolean;
  lastScanAt?: string;    // 最後のメンションスキャン日時
}

export interface SlackReaction {
  name: string;       // emoji name without colons, e.g. "thumbsup"
  count: number;
  users: string[];    // user IDs who reacted
}

export interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  size: number;
  urlPrivate: string;       // Slack private URL（認証が必要）
  thumbUrl?: string;         // サムネイル URL
  permalink?: string;
}

export interface SlackMessage {
  id: string;
  workspaceId: string;
  channelId: string;
  channelName: string;
  threadTs?: string;
  ts: string;
  userId: string;
  userName: string;
  avatarUrl?: string;          // Slack profile image URL
  text: string;
  isDirectMention: boolean;
  isThreadParticipant: boolean;
  reactions?: SlackReaction[];  // reactions on this message
  files?: SlackFile[];          // file attachments
  replyCount?: number;          // thread reply count
}

export interface Task {
  id: string;
  workspaceId: string;
  channelId: string;
  channelName: string;
  threadTs: string;
  triggerMessage: SlackMessage;
  threadMessages: SlackMessage[];
  status: 'open' | 'completed';
  projectId?: string;
  createdAt: string;
  completedAt?: string;
  windowPosition: { x: number; y: number };
  windowSize: { width: number; height: number };
  isMinimized: boolean;
  lastActivityAt: string;
  /** @deprecated チャネル一覧機能に集約。常に空配列 */
  relatedChannels: string[];
}

// --- 監視チャネル ---

export interface MonitoredChannel {
  id: string;
  workspaceId: string;
  channelId: string;
  channelName: string;
  channelType: 'channel' | 'dm' | 'group_dm';
  addedAt: string;
}

export interface MonitoredChannelRow {
  id: string;
  workspace_id: string;
  channel_id: string;
  channel_name: string;
  channel_type: string;
  added_at: string;
}

// --- プロジェクト & メモ ---

export interface Project {
  id: string;
  name: string;
  description: string;
  readme: string;
  workspaceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRow {
  id: string;
  name: string;
  description: string;
  readme: string;
  workspace_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectMemo {
  id: string;
  projectId: string;
  taskId?: string;
  messageTs?: string;
  messageUser?: string;
  messageText: string;
  messageUrl?: string;
  note: string;
  createdAt: string;
}

export interface ProjectMemoRow {
  id: string;
  project_id: string;
  task_id: string | null;
  message_ts: string | null;
  message_user: string | null;
  message_text: string;
  message_url: string | null;
  note: string;
  created_at: string;
}

// --- プロジェクト ドキュメント ---

export interface ProjectDocument {
  id: string;
  projectId: string;
  fileName: string;       // 保存ファイル名（UUID付き）
  originalName: string;   // 元ファイル名
  mimeType: string;
  sizeBytes: number;
  description: string;    // ユーザーが付ける概要
  extractedText?: string; // AI分析用に抽出したテキスト
  createdAt: string;
}

export interface ProjectDocumentRow {
  id: string;
  project_id: string;
  file_name: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  description: string;
  extracted_text: string | null;
  created_at: string;
}

export interface AiSuggestion {
  taskId: string;
  suggestion: string;
  generatedAt: string;
}

export interface TaskRow {
  id: string;
  workspace_id: string;
  channel_id: string;
  channel_name: string;
  thread_ts: string;
  trigger_message: string;
  thread_messages: string;
  status: string;
  project_id: string | null;
  created_at: string;
  completed_at: string | null;
  window_position: string | null;
  window_size: string | null;
  is_minimized: number;
  last_activity_at: string | null;
  related_channels: string | null;
}

// --- プロジェクト チャネル紐付け ---

export interface ProjectChannel {
  id: string;
  projectId: string;
  channelId: string;
  channelName: string;
  addedAt: string;
}

export interface ProjectChannelRow {
  id: string;
  project_id: string;
  channel_id: string;
  channel_name: string;
  added_at: string;
}

export interface WorkspaceRow {
  id: string;
  name: string;
  bot_token: string;
  signing_secret: string;
  app_token: string | null;
  user_token: string | null;
  target_user_id: string | null;
  user_id: string | null;
  team_id: string | null;
  is_active: number;
  added_at: string;
  last_scan_at: string | null;
}
