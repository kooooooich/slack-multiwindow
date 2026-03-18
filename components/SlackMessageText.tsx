'use client';

import React from 'react';
import { parseMrkdwn } from '@/lib/mrkdwn';

interface SlackMessageTextProps {
  text: string;
  customEmojis?: Record<string, string>;
}

/**
 * Slack mrkdwn テキストを HTML としてレンダリングするコンポーネント
 */
const SlackMessageText = React.memo(function SlackMessageText({
  text,
  customEmojis,
}: SlackMessageTextProps) {
  const html = parseMrkdwn(text, customEmojis);

  return (
    <div
      className="text-xs text-gray-400 mt-0.5 slack-mrkdwn"
      style={{ overflowWrap: 'break-word', wordBreak: 'break-word', overflow: 'hidden', maxWidth: '100%' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

export default SlackMessageText;
