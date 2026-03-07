/**
 * Slack mrkdwn → HTML 変換
 *
 * Slack の mrkdwn は標準 Markdown と異なる独自フォーマット。
 * XSS 対策としてテキスト部分は事前にエスケープしてから変換する。
 */

// 標準絵文字の name → Unicode マッピング
const STANDARD_EMOJI: Record<string, string> = {
  thumbsup: '\u{1F44D}',
  '+1': '\u{1F44D}',
  thumbsdown: '\u{1F44E}',
  '-1': '\u{1F44E}',
  heart: '\u{2764}\u{FE0F}',
  eyes: '\u{1F440}',
  white_check_mark: '\u{2705}',
  heavy_check_mark: '\u{2714}\u{FE0F}',
  rocket: '\u{1F680}',
  tada: '\u{1F389}',
  pray: '\u{1F64F}',
  fire: '\u{1F525}',
  thinking_face: '\u{1F914}',
  clap: '\u{1F44F}',
  smile: '\u{1F604}',
  ok_hand: '\u{1F44C}',
  raised_hands: '\u{1F64C}',
  muscle: '\u{1F4AA}',
  star: '\u{2B50}',
  sparkles: '\u{2728}',
  wave: '\u{1F44B}',
  laughing: '\u{1F606}',
  joy: '\u{1F602}',
  sweat_smile: '\u{1F605}',
  sob: '\u{1F62D}',
  skull: '\u{1F480}',
  warning: '\u{26A0}\u{FE0F}',
  bulb: '\u{1F4A1}',
  memo: '\u{1F4DD}',
  '100': '\u{1F4AF}',
  x: '\u{274C}',
  check: '\u{2714}\u{FE0F}',
  point_up: '\u{261D}\u{FE0F}',
  point_down: '\u{1F447}',
  point_left: '\u{1F448}',
  point_right: '\u{1F449}',
  raising_hand: '\u{1F64B}',
  bow: '\u{1F647}',
  see_no_evil: '\u{1F648}',
  hear_no_evil: '\u{1F649}',
  speak_no_evil: '\u{1F64A}',
  grinning: '\u{1F600}',
  smiley: '\u{1F603}',
  grin: '\u{1F601}',
  wink: '\u{1F609}',
  blush: '\u{1F60A}',
  relaxed: '\u{263A}\u{FE0F}',
  slightly_smiling_face: '\u{1F642}',
  upside_down_face: '\u{1F643}',
  yum: '\u{1F60B}',
  sunglasses: '\u{1F60E}',
  heart_eyes: '\u{1F60D}',
  kissing_heart: '\u{1F618}',
  thinking: '\u{1F914}',
  neutral_face: '\u{1F610}',
  expressionless: '\u{1F611}',
  unamused: '\u{1F612}',
  rolling_eyes: '\u{1F644}',
  grimacing: '\u{1F62C}',
  lying_face: '\u{1F925}',
  relieved: '\u{1F60C}',
  pensive: '\u{1F614}',
  sleepy: '\u{1F62A}',
  sleeping: '\u{1F634}',
  mask: '\u{1F637}',
  face_with_thermometer: '\u{1F912}',
  nerd_face: '\u{1F913}',
  confused: '\u{1F615}',
  worried: '\u{1F61F}',
  frowning: '\u{1F626}',
  persevere: '\u{1F623}',
  confounded: '\u{1F616}',
  tired_face: '\u{1F62B}',
  weary: '\u{1F629}',
  cry: '\u{1F622}',
  disappointed: '\u{1F61E}',
  angry: '\u{1F620}',
  rage: '\u{1F621}',
  triumph: '\u{1F624}',
  scream: '\u{1F631}',
  fearful: '\u{1F628}',
  cold_sweat: '\u{1F630}',
  hushed: '\u{1F62F}',
  flushed: '\u{1F633}',
  zzz: '\u{1F4A4}',
  boom: '\u{1F4A5}',
  sweat_drops: '\u{1F4A6}',
  dash: '\u{1F4A8}',
  hankey: '\u{1F4A9}',
  poop: '\u{1F4A9}',
  tongue: '\u{1F445}',
  eyes_emoji: '\u{1F440}',
  ear: '\u{1F442}',
  nose: '\u{1F443}',
  dog: '\u{1F436}',
  cat: '\u{1F431}',
  mouse: '\u{1F42D}',
  hamster: '\u{1F439}',
  rabbit: '\u{1F430}',
  bear: '\u{1F43B}',
  panda_face: '\u{1F43C}',
  penguin: '\u{1F427}',
  chicken: '\u{1F414}',
  bird: '\u{1F426}',
  sunny: '\u{2600}\u{FE0F}',
  cloud: '\u{2601}\u{FE0F}',
  umbrella: '\u{2614}',
  snowflake: '\u{2744}\u{FE0F}',
  zap: '\u{26A1}',
  cherry_blossom: '\u{1F338}',
  rose: '\u{1F339}',
  tulip: '\u{1F337}',
  four_leaf_clover: '\u{1F340}',
  christmas_tree: '\u{1F384}',
  gift: '\u{1F381}',
  balloon: '\u{1F388}',
  confetti_ball: '\u{1F38A}',
  trophy: '\u{1F3C6}',
  medal: '\u{1F3C5}',
  gem: '\u{1F48E}',
  ribbon: '\u{1F380}',
  bell: '\u{1F514}',
  loudspeaker: '\u{1F4E2}',
  mega: '\u{1F4E3}',
  speech_balloon: '\u{1F4AC}',
  thought_balloon: '\u{1F4AD}',
  email: '\u{1F4E7}',
  mailbox: '\u{1F4EB}',
  pencil: '\u{270F}\u{FE0F}',
  pencil2: '\u{270F}\u{FE0F}',
  scissors: '\u{2702}\u{FE0F}',
  paperclip: '\u{1F4CE}',
  pushpin: '\u{1F4CC}',
  lock: '\u{1F512}',
  unlock: '\u{1F513}',
  key: '\u{1F511}',
  hammer: '\u{1F528}',
  wrench: '\u{1F527}',
  gear: '\u{2699}\u{FE0F}',
  link: '\u{1F517}',
  chart_with_upwards_trend: '\u{1F4C8}',
  chart_with_downwards_trend: '\u{1F4C9}',
  bar_chart: '\u{1F4CA}',
  clipboard: '\u{1F4CB}',
  calendar: '\u{1F4C5}',
  file_folder: '\u{1F4C1}',
  open_file_folder: '\u{1F4C2}',
  page_facing_up: '\u{1F4C4}',
  bookmark: '\u{1F516}',
  label: '\u{1F3F7}\u{FE0F}',
  computer: '\u{1F4BB}',
  iphone: '\u{1F4F1}',
  phone: '\u{260E}\u{FE0F}',
  tv: '\u{1F4FA}',
  camera: '\u{1F4F7}',
  video_camera: '\u{1F4F9}',
  cd: '\u{1F4BF}',
  dvd: '\u{1F4C0}',
  hourglass: '\u{231B}',
  timer_clock: '\u{23F2}\u{FE0F}',
  stopwatch: '\u{23F1}\u{FE0F}',
  alarm_clock: '\u{23F0}',
  clock: '\u{1F570}\u{FE0F}',
  infinity: '\u{267E}\u{FE0F}',
  recycle: '\u{267B}\u{FE0F}',
  white_circle: '\u{26AA}',
  black_circle: '\u{26AB}',
  red_circle: '\u{1F534}',
  blue_circle: '\u{1F535}',
  large_blue_diamond: '\u{1F537}',
  large_orange_diamond: '\u{1F536}',
  small_blue_diamond: '\u{1F539}',
  small_orange_diamond: '\u{1F538}',
  arrow_up: '\u{2B06}\u{FE0F}',
  arrow_down: '\u{2B07}\u{FE0F}',
  arrow_left: '\u{2B05}\u{FE0F}',
  arrow_right: '\u{27A1}\u{FE0F}',
  heavy_plus_sign: '\u{2795}',
  heavy_minus_sign: '\u{2796}',
  heavy_division_sign: '\u{2797}',
  heavy_multiplication_x: '\u{2716}\u{FE0F}',
  exclamation: '\u{2757}',
  question: '\u{2753}',
  grey_exclamation: '\u{2755}',
  grey_question: '\u{2754}',
  bangbang: '\u{203C}\u{FE0F}',
  interrobang: '\u{2049}\u{FE0F}',
  jp: '\u{1F1EF}\u{1F1F5}',
  us: '\u{1F1FA}\u{1F1F8}',
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Slack mrkdwn テキストを HTML に変換する
 * @param text - Slack メッセージテキスト（mrkdwn フォーマット）
 * @param customEmojis - カスタム絵文字マップ (name -> imageUrl)。省略時は標準絵文字のみ
 */
export function parseMrkdwn(
  text: string,
  customEmojis?: Record<string, string>,
): string {
  if (!text) return '';

  // 1. コードブロックとインラインコードを先に抽出して保護
  const codeBlocks: string[] = [];
  const inlineCodes: string[] = [];

  // コードブロック ```...``` を保護
  let processed = text.replace(/```([\s\S]*?)```/g, (_, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(code);
    return `\x00CODEBLOCK_${idx}\x00`;
  });

  // インラインコード `...` を保護
  processed = processed.replace(/`([^`\n]+)`/g, (_, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(code);
    return `\x00INLINECODE_${idx}\x00`;
  });

  // 2. HTML エスケープ（コード以外の部分）
  processed = escapeHtml(processed);

  // 3. Slack リンク変換 <URL|label> or <URL>
  processed = processed.replace(
    /&lt;(https?:\/\/[^|&]+)\|([^&]+)&gt;/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-[#4A9EFF] hover:underline">$2</a>',
  );
  processed = processed.replace(
    /&lt;(https?:\/\/[^&]+)&gt;/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-[#4A9EFF] hover:underline">$1</a>',
  );

  // 4. メンション変換 <@U123|name> or <@U123>
  processed = processed.replace(
    /&lt;@([A-Z0-9]+)\|([^&]+)&gt;/g,
    '<span class="text-[#4A9EFF] bg-[#4A9EFF]/10 px-0.5 rounded font-medium">@$2</span>',
  );
  processed = processed.replace(
    /&lt;@([A-Z0-9]+)&gt;/g,
    '<span class="text-[#4A9EFF] bg-[#4A9EFF]/10 px-0.5 rounded font-medium">@$1</span>',
  );

  // 5. チャンネルリンク <#C123|channel-name> or <#C123>
  processed = processed.replace(
    /&lt;#([A-Z0-9]+)\|([^&]+)&gt;/g,
    '<span class="text-[#4A9EFF] bg-[#4A9EFF]/10 px-0.5 rounded">#$2</span>',
  );
  processed = processed.replace(
    /&lt;#([A-Z0-9]+)&gt;/g,
    '<span class="text-[#4A9EFF] bg-[#4A9EFF]/10 px-0.5 rounded">#$1</span>',
  );

  // 6. 太字 *bold*（URL 内の * は避ける）
  processed = processed.replace(
    /(?<!\w)\*([^\s*](?:[^*]*[^\s*])?)\*(?!\w)/g,
    '<strong>$1</strong>',
  );

  // 7. 斜体 _italic_
  processed = processed.replace(
    /(?<!\w)_([^\s_](?:[^_]*[^\s_])?)_(?!\w)/g,
    '<em>$1</em>',
  );

  // 8. 取り消し線 ~strike~
  processed = processed.replace(
    /(?<!\w)~([^\s~](?:[^~]*[^\s~])?)~(?!\w)/g,
    '<del>$1</del>',
  );

  // 9. 引用 > (行頭)
  processed = processed.replace(
    /^&gt;\s?(.*)$/gm,
    '<blockquote class="border-l-2 border-gray-500 pl-2 text-gray-500 italic">$1</blockquote>',
  );

  // 9.5. リスト変換（箇条書き: - item, • item / 番号付き: 1. item）
  // 連続する箇条書き行をまとめて <ul> で囲む
  processed = processed.replace(
    /((?:^[-•]\s+.+$\n?)+)/gm,
    (block: string) => {
      const items = block
        .split('\n')
        .filter((line: string) => line.trim())
        .map((line: string) => {
          const content = line.replace(/^[-•]\s+/, '');
          return `<li>${content}</li>`;
        })
        .join('');
      return `<ul class="list-disc list-inside ml-2 space-y-0.5">${items}</ul>\n`;
    },
  );

  // 連続する番号付きリスト行をまとめて <ol> で囲む
  processed = processed.replace(
    /((?:^\d+[.)]\s+.+$\n?)+)/gm,
    (block: string) => {
      const items = block
        .split('\n')
        .filter((line: string) => line.trim())
        .map((line: string) => {
          const content = line.replace(/^\d+[.)]\s+/, '');
          return `<li>${content}</li>`;
        })
        .join('');
      return `<ol class="list-decimal list-inside ml-2 space-y-0.5">${items}</ol>\n`;
    },
  );

  // 10. 絵文字 :emoji_name:
  processed = processed.replace(/:([a-zA-Z0-9_+-]+):/g, (match, name) => {
    // カスタム絵文字チェック
    if (customEmojis && customEmojis[name]) {
      return `<img src="${escapeHtml(customEmojis[name])}" alt=":${escapeHtml(name)}:" class="inline-block w-5 h-5 align-text-bottom" title=":${escapeHtml(name)}:">`;
    }
    // 標準絵文字チェック
    if (STANDARD_EMOJI[name]) {
      return STANDARD_EMOJI[name];
    }
    // 見つからない場合はそのまま
    return match;
  });

  // 11. 改行を <br> に変換（ただし <ul>/<ol>/<li> タグの前後は除外）
  processed = processed.replace(/\n(?!<\/?(?:ul|ol|li))/g, '<br>');
  // リスト系HTMLタグ前後の余分な改行を除去
  processed = processed.replace(/\n(<\/?(?:ul|ol))/g, '$1');

  // 12. コードブロックを復元
  for (let i = 0; i < codeBlocks.length; i++) {
    const escapedCode = escapeHtml(codeBlocks[i].trim());
    processed = processed.replace(
      `\x00CODEBLOCK_${i}\x00`,
      `<pre class="bg-[#0D1117] border border-white/10 rounded p-2 my-1 overflow-x-auto"><code class="text-[11px] text-gray-300">${escapedCode}</code></pre>`,
    );
  }

  // 13. インラインコードを復元
  for (let i = 0; i < inlineCodes.length; i++) {
    const escapedCode = escapeHtml(inlineCodes[i]);
    processed = processed.replace(
      `\x00INLINECODE_${i}\x00`,
      `<code class="bg-[#0D1117] border border-white/10 rounded px-1 py-0.5 text-[11px] text-[#E06C75]">${escapedCode}</code>`,
    );
  }

  return processed;
}

/**
 * 絵文字名を表示用の文字列（Unicode or img）に変換
 */
export function resolveEmoji(
  name: string,
  customEmojis?: Record<string, string>,
): { type: 'unicode'; value: string } | { type: 'custom'; url: string } | null {
  if (customEmojis && customEmojis[name]) {
    return { type: 'custom', url: customEmojis[name] };
  }
  if (STANDARD_EMOJI[name]) {
    return { type: 'unicode', value: STANDARD_EMOJI[name] };
  }
  return null;
}

export { STANDARD_EMOJI };
