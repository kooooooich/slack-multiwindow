export interface Workspace {
  id: string;
  name: string;
  botToken: string;
  signingSecret: string;
  appToken?: string;
  userToken?: string;     // User OAuth Token (xoxp-...) 自分として返信する場合に使用
  targetUserId?: string;  // 監視対象ユーザーID（このユーザーへのメンションをタスク化）
  teamId: string;
  addedAt: string;
  isActive: boolean;
}

export interface SlackReaction {
  name: string;       // emoji name without colons, e.g. "thumbsup"
  count: number;
  users: string[];    // user IDs who reacted
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
  createdAt: string;
  completedAt?: string;
  windowPosition: { x: number; y: number };
  windowSize: { width: number; height: number };
  isMinimized: boolean;
  relatedChannels: string[];
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
  created_at: string;
  completed_at: string | null;
  window_position: string | null;
  window_size: string | null;
  is_minimized: number;
  related_channels: string | null;
}

export interface WorkspaceRow {
  id: string;
  name: string;
  bot_token: string;
  signing_secret: string;
  app_token: string | null;
  user_token: string | null;
  target_user_id: string | null;
  team_id: string | null;
  is_active: number;
  added_at: string;
}
