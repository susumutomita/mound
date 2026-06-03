export const HELP = `mound — 草野球チーム向け試合成立 CLI

使い方:
  mound <command> [subcommand] [--flags]

コマンド:
  init                                       DB を初期化する
  team create --name <N> [--area <A>]        チームを作成
  team list                                  チーム一覧
  member add --team <ID> --name <N> [--email <E>] [--role ADMIN|MEMBER]
  member list --team <ID>
  game create --team <ID> --title <T> [--date YYYY-MM-DD] [--ground <G>] [--min-players <N>] [--note <NOTE>]
  game list [--team <ID>] [--status DRAFT|COLLECTING|CONFIRMED|...]
  game show <ID>
  game transition <ID> --to COLLECTING|CONFIRMED|COMPLETED|SETTLED|CANCELLED
  rsvp set --game <ID> --member <ID> --response AVAILABLE|UNAVAILABLE|MAYBE
  rsvp list --game <ID>
  rsvp summary --game <ID>
  audit --target <ID> [--type game|team|member]
  agenda [--team <ID>] [--horizon-days N]    いま注意すべき試合 (メニューバー向け)
  ground import [--file PATH | --stdin]      外部スクレイパの JSON を取り込む
  ground list [--source S] [--date YYYY-MM-DD]
  ground diff [--since ISO | --minutes N] [--source S] [--game-date YYYY-MM-DD]
  ground sync [--region R] [--bin PATH] [--timeout-ms N] [--notify --team T]
  ground match --game <GAME_ID>              試合の date+会場に合う空きを列挙
  notify add --team <ID> --kind DISCORD|SLACK|LINE --webhook <URL> [--secret S] [--target T] [--label L]
  notify list --team <ID>
  notify remove <ID>
  notify test <ID> [--message TEXT]
  watch add --team <ID> [--source S] [--facility PATTERN] [--weekdays sat,sun] [--time-from HH:MM] [--time-to HH:MM] [--label L]
  watch list --team <ID>
  watch remove <ID>
  watch test --team <ID>
  observe add --team <ID> --kind <KIND> --body <TEXT> [--member <ID>] [--subject S] [--source S]
  observe list --team <ID> [--kind <KIND>] [--member <ID>]
  knowledge set --team <ID> --key <K> --value <V> [--category C] [--member ID] [--origin HUMAN|LEARNED] [--confidence 0..1] [--source S]
  knowledge list --team <ID> [--category C] [--member ID] [--key K]
  knowledge get --team <ID> --key <K> [--member ID]
  knowledge forget <ID>

環境変数 (追加):
  MOUND_NOTIFY_MODE     log-only | disabled | (未指定=実 HTTP)

サブコマンドの詳細:
  mound <command> [subcommand] --help        例: mound game create --help

グローバルフラグ:
  --json       JSON 出力 (エージェント連携向け)
  --help       このヘルプ
  --version    バージョン

環境変数:
  MOUND_DB_URL          libSQL URL (例: file:./mound.db, libsql://...turso.io)
  MOUND_DB_AUTH_TOKEN   Turso 認証トークン
`;

export const VERSION = "0.1.0";

// サブコマンド単位のヘルプ。エージェントが mound <cmd> [sub] --help だけで
// 正確なフラグ仕様と出力スキーマを取れるよう、JSON 出力の shape も併記する。
export const COMMAND_HELP: Record<string, string> = {
  init: `mound init — DB を初期化する

使い方:
  mound init [--json]

説明:
  $MOUND_DB_URL (未設定なら ~/.mound/mound.db) にスキーマを適用する。
  既存 DB に対しても安全 (PRAGMA user_version で lazy migration)。

JSON 出力:
  { "ok": true }
`,

  team: `mound team — チーム管理

サブコマンド:
  team create --name <N> [--area <A>] [--json]
  team list [--json]

詳細:
  mound team create --help
  mound team list --help
`,

  "team create": `mound team create — チームを作成する

使い方:
  mound team create --name <NAME> [--area <AREA>] [--json]

フラグ:
  --name   (必須) チーム名 (1..80 文字)
  --area   (任意) 本拠地エリア (..80 文字)

JSON 出力:
  Team { id, name, home_area, created_at, updated_at }

エラー:
  - UsageError: フラグ不足 / バリデーション失敗 (exit 2)
`,

  "team list": `mound team list — チーム一覧

使い方:
  mound team list [--json]

JSON 出力:
  Team[] (created_at 昇順)
`,

  member: `mound member — メンバー管理

サブコマンド:
  member add  --team <TEAM_ID> --name <N> [--email <E>] [--role ADMIN|MEMBER] [--json]
  member list --team <TEAM_ID> [--json]

詳細:
  mound member add --help
  mound member list --help
`,

  "member add": `mound member add — メンバーを追加する

使い方:
  mound member add --team <TEAM_ID> --name <NAME> [--email <EMAIL>] [--role ADMIN|MEMBER] [--json]

フラグ:
  --team    (必須) チーム ID
  --name    (必須) メンバー名
  --email   (任意) メールアドレス
  --role    (任意) ADMIN | MEMBER (既定: MEMBER)

JSON 出力:
  Member { id, team_id, name, email, role, created_at, updated_at }

エラー:
  - TeamNotFoundError: team が存在しない (exit 2)
`,

  "member list": `mound member list — メンバー一覧

使い方:
  mound member list --team <TEAM_ID> [--json]

フラグ:
  --team    (必須) チーム ID

JSON 出力:
  Member[]
`,

  game: `mound game — 試合管理

サブコマンド:
  game create     --team <TEAM_ID> --title <T> [--date YYYY-MM-DD] [--ground <G>] [--min-players <N>] [--note <NOTE>] [--json]
  game list       [--team <TEAM_ID>] [--status <STATUS>] [--json]
  game show       <GAME_ID> [--json]
  game transition <GAME_ID> --to <STATUS> [--json]

状態遷移 (有効パス):
  DRAFT      → COLLECTING / CONFIRMED / CANCELLED
  COLLECTING → CONFIRMED (要 AVAILABLE >= min_players) / CANCELLED
  CONFIRMED  → COMPLETED (要 game_date が経過) / CANCELLED
  COMPLETED  → SETTLED
  SETTLED / CANCELLED は終端

詳細:
  mound game create --help
  mound game show --help
  mound game transition --help
`,

  "game create": `mound game create — 試合を DRAFT で作成

使い方:
  mound game create --team <TEAM_ID> --title <TITLE> \\
    [--date YYYY-MM-DD] [--ground <NAME>] [--min-players <N>] [--note <TEXT>] [--json]

フラグ:
  --team          (必須) チーム ID
  --title         (必須) タイトル (1..120 文字)
  --date          (任意) 試合日 (YYYY-MM-DD)
  --ground        (任意) グラウンド名 (..80 文字)
  --min-players   (任意) 成立最低人数 (1..30, 既定: 9)
  --note          (任意) メモ (..500 文字)

JSON 出力:
  Game { id, team_id, title, status: "DRAFT", game_date, ground_name, min_players, note, ... }
`,

  "game list": `mound game list — 試合一覧

使い方:
  mound game list [--team <TEAM_ID>] [--status <STATUS>] [--json]

フラグ:
  --team    (任意) チーム ID で絞り込み
  --status  (任意) DRAFT | COLLECTING | CONFIRMED | COMPLETED | SETTLED | CANCELLED

JSON 出力:
  Game[]
`,

  "game show": `mound game show — 試合詳細を表示

使い方:
  mound game show <GAME_ID> [--json]

JSON 出力:
  {
    "game": Game,
    "rsvp_summary": { available, unavailable, maybe, no_response },
    "rsvp_breakdown": { available: MemberRsvp[], unavailable: MemberRsvp[], maybe: MemberRsvp[], no_response: MemberRsvp[] },
    "available_transitions": GameStatus[]   // 現状態から遷移可能な状態リスト
  }

エラー:
  - GameNotFoundError: 該当試合なし (exit 2)
`,

  "game transition": `mound game transition — 試合の状態を遷移させる

使い方:
  mound game transition <GAME_ID> --to <STATUS> [--json]

フラグ:
  --to   (必須) 遷移先 (DRAFT | COLLECTING | CONFIRMED | COMPLETED | SETTLED | CANCELLED)

ガード条件:
  - COLLECTING → CONFIRMED:  AVAILABLE >= min_players
  - CONFIRMED  → COMPLETED:  game_date が現在日以前

JSON 出力 (成功時):
  Game (更新後)

JSON 出力 (失敗時):
  {
    "ok": false,
    "error": "<日本語メッセージ>",
    "from": GameStatus,
    "to": GameStatus,
    "available_transitions": GameStatus[],
    "rsvp_summary"?: {...},      // 人数不足のとき
    "min_players"?: number        // 人数不足のとき
  }
`,

  rsvp: `mound rsvp — 出欠管理

サブコマンド:
  rsvp set     --game <GAME_ID> --member <MEMBER_ID> --response <RESPONSE> [--json]
  rsvp list    --game <GAME_ID> [--json]
  rsvp summary --game <GAME_ID> [--team <TEAM_ID>] [--json]

詳細:
  mound rsvp set --help
  mound rsvp list --help
  mound rsvp summary --help
`,

  "rsvp set": `mound rsvp set — 出欠を記録する (upsert)

使い方:
  mound rsvp set --game <GAME_ID> --member <MEMBER_ID> --response <RESPONSE> [--json]

フラグ:
  --game      (必須) 試合 ID
  --member    (必須) メンバー ID
  --response  (必須) AVAILABLE | UNAVAILABLE | MAYBE | NO_RESPONSE

JSON 出力:
  Rsvp { id, game_id, member_id, response, responded_at, ... }

エラー:
  - CrossTeamRsvpError: member の所属チームが game と一致しない (exit 2)
  - GameNotFoundError / MemberNotFoundError
`,

  "rsvp list": `mound rsvp list — 出欠を全メンバー分一覧

使い方:
  mound rsvp list --game <GAME_ID> [--json]

JSON 出力:
  MemberRsvp[] (member_id, member_name, member_role, response, responded_at)
`,

  "rsvp summary": `mound rsvp summary — 集計だけ取り出す

使い方:
  mound rsvp summary --game <GAME_ID> [--team <TEAM_ID>] [--json]

JSON 出力:
  { available, unavailable, maybe, no_response }
`,

  audit: `mound audit — 監査ログを表示

使い方:
  mound audit --target <ID> [--type game|team|member] [--json]

フラグ:
  --target  (必須) 対象 ID
  --type    (任意) game | team | member (既定: game)

JSON 出力:
  AuditLog[] { id, actor, action, target_type, target_id, before_json, after_json, created_at }
`,

  ground: `mound ground — 外部スクレイパ (ground-reservation 等) との接続

サブコマンド:
  ground import [--file PATH | --stdin] [--json]
  ground list   [--source S] [--date YYYY-MM-DD] [--json]
  ground diff   [--since ISO | --minutes N] [--source S] [--game-date YYYY-MM-DD] [--json]
  ground sync   [--region R] [--bin PATH] [--timeout-ms N] [--notify --team T] [--json]
  ground match  --game <GAME_ID> [--json]

詳細:
  mound ground import --help
  mound ground list --help
  mound ground diff --help
  mound ground sync --help
  mound ground match --help
`,

  "ground import": `mound ground import — 外部スクレイパの JSON を取り込む

使い方:
  mound ground import --file <PATH> [--json]
  mound ground import --stdin       [--json]

説明:
  susumutomita/ground-reservation の \`ground-monitoring --json\` 出力を読み込み、
  ground_slots テーブルに upsert する。(source, facility_name, date_iso,
  time_range) のキーで一意。新規行のみ first_seen_at に取り込み時刻を入れる。

JSON 出力:
  {
    "scraped_at": ISO8601,
    "total_records": number,
    "inserted": number,
    "updated": number,
    "regions_with_errors": [{ "region": string, "errors": string[] }]
  }

エラー:
  - UsageError: --file / --stdin 未指定、JSON 不正、schema 不一致 (exit 2)
`,

  "ground sync": `mound ground sync — ground-monitoring を呼んで import + (任意で) 通知まで 1 コマンド

使い方:
  mound ground sync [--region all|<R>] [--bin PATH] [--timeout-ms N] \\
    [--notify --team <ID>] [--json]

フラグ:
  --region       (任意) all | yokohama | hiratsuka | kanagawa | kamakura |
                       fujisawa | samukawa | ayase (既定: all)
  --bin          (任意) ground-monitoring の絶対パス (既定: PATH から解決)
  --timeout-ms   (任意) scraper のタイムアウト ms (既定: 60000)
  --notify       (任意) 検出された新規 slot を通知する (要 --team)
  --team         (--notify 必須) 通知先チーム ID

挙動:
  1. now() を beforeSyncAt として記録
  2. <bin> --region <R> --json を spawn
  3. exit code / stderr / timeout を見て失敗なら exit 1
  4. stdout JSON を import (mound ground import と同じロジック)
  5. detectNewSlots({ since: beforeSyncAt }) で「今回 sync で初観測」slot を抽出
  6. --notify --team が指定されていれば notifyGroundCancellation で送信

JSON 出力:
  {
    "region": string,
    "bin": string,
    "scraped_at": ISO8601,
    "total_records": number,
    "inserted": number,
    "updated": number,
    "regions_with_errors": [{ "region": string, "errors": string[] }],
    "new_slots": GroundSlot[],
    "notifications"?: NotificationDeliveryResult[]
  }
`,

  "ground match": `mound ground match — 試合の日付・会場に整合する空き枠を列挙

使い方:
  mound ground match --game <GAME_ID> [--json]

挙動:
  game.game_date と game.ground_name を使い、同日かつ facility_name に
  ground_name を部分文字列として含む ground_slots を返す。どちらかが
  null の場合は空配列。

JSON 出力:
  {
    "game": Game,
    "count": number,
    "matching_slots": GroundSlot[]
  }

エラー:
  - GameNotFoundError: 該当 game なし (exit 2)
  - UsageError: --game 未指定 (exit 2)
`,

  "ground diff": `mound ground diff — 直近キャンセル候補 (新規観測 slot) を抽出

使い方:
  mound ground diff [--since YYYY-MM-DDTHH:MM:SSZ] [--minutes N] \\
    [--source <SOURCE>] [--game-date YYYY-MM-DD] [--json]

フラグ:
  --since      (任意) ISO8601 で閾値時刻。これ以降に first_seen された slot
  --minutes    (任意) now - N 分以降に first_seen された slot (--since 未指定時の既定 60)
  --source     (任意) スクレイパ source ID で絞り込み
  --game-date  (任意) 試合日 (YYYY-MM-DD) で絞り込み

JSON 出力:
  { "since": ISO8601, "count": number, "slots": GroundSlot[] }

エラー:
  - UsageError: --since と --minutes 同時指定、--since が不正 ISO (exit 2)
`,

  "ground list": `mound ground list — 取り込み済みの空き枠を表示

使い方:
  mound ground list [--source <SOURCE>] [--date YYYY-MM-DD] [--json]

フラグ:
  --source  (任意) スクレイパ source ID (yokohama, kanagawa, ...)
  --date    (任意) 日付 (YYYY-MM-DD) で絞り込み

JSON 出力:
  GroundSlot[] { id, slot_key, source, facility_name, date_iso, date_raw,
                 time_range, status, raw, scraped_at, first_seen_at, ingested_at }
`,

  notify: `mound notify — Discord / Slack / LINE への通知チャネル

サブコマンド:
  notify add --team <ID> --kind DISCORD|SLACK|LINE --webhook <URL> [--secret S] [--target T] [--label L]
  notify list   --team <ID>
  notify remove <ID>
  notify test   <ID> [--message TEXT]

トリガ:
  - 試合の状態遷移 (game transition) が成功するとチームの enabled channel に送信
  - 送信失敗してもドメイン操作は成功扱い (fire-and-forget)

環境変数:
  MOUND_NOTIFY_MODE=log-only   実 HTTP を叩かず stderr に出すだけ (dev/test)
  MOUND_NOTIFY_MODE=disabled   すべての送信を no-op にする
  未指定                       実 HTTP (Discord/Slack/LINE) を叩く
`,

  "notify add": `mound notify add — 通知チャネルを追加

使い方:
  mound notify add --team <TEAM_ID> --kind <DISCORD|SLACK|LINE> \\
    --webhook <URL> [--secret <TOKEN>] [--target <ID>] [--label <NAME>] [--json]

フラグ:
  --team      (必須) 通知先チームの ID
  --kind      (必須) DISCORD | SLACK | LINE
  --webhook   (必須) Webhook URL (LINE は https://api.line.me/v2/bot/message/push)
  --secret    (任意 / LINE 必須) チャネルアクセストークン
  --target    (任意 / LINE 必須) 送信先 userId / groupId
  --label     (任意) 表示名

JSON 出力:
  NotificationChannel { id, team_id, kind, webhook_url, secret, target, label,
                        enabled, created_at, updated_at }
`,

  "notify list": `mound notify list — チームの通知チャネル一覧

使い方:
  mound notify list --team <TEAM_ID> [--json]

JSON 出力:
  NotificationChannel[] (webhook_url / secret も含む。秘匿に注意)
`,

  "notify remove": `mound notify remove — 通知チャネルを削除

使い方:
  mound notify remove <ID> [--json]

JSON 出力:
  { "ok": boolean, "id": string }
`,

  "notify test": `mound notify test — 通知チャネルに即時テスト送信

使い方:
  mound notify test <ID> [--message TEXT] [--json]

フラグ:
  --message  (任意) 送信文面 (デフォルトはテスト文)

JSON 出力:
  NotificationDeliveryResult { channel_id, channel_kind, ok, status_code, error }
`,

  watch: `mound watch — チームごとの「気になるグラウンド条件」

サブコマンド:
  watch add    --team <ID> [--source S] [--facility PATTERN] [--weekdays sat,sun] \\
               [--time-from HH:MM] [--time-to HH:MM] [--label L] [--json]
  watch list   --team <ID> [--json]
  watch remove <ID> [--json]
  watch test   --team <ID> [--json]   # 現在の ground_slots と watch を照合して可視化

挙動:
  - team に watch が 1 件も無ければ ground sync --notify は従来どおり全 new_slots を送る
  - watch が 1 件以上あるとき: どれかにマッチ (OR) した new_slots だけ通知に乗る
  - 各 watch 内: source / facility_pattern / weekdays / time_from / time_to は AND
  - facility_pattern は SQL LIKE (% = 任意の文字列, _ = 任意の 1 文字)
`,

  "watch add": `mound watch add — チームに「気になるグラウンド条件」を 1 件登録

使い方:
  mound watch add --team <TEAM_ID> \\
    [--source <SOURCE>] \\
    [--facility <LIKE_PATTERN>] \\
    [--weekdays sat,sun] \\
    [--time-from HH:MM] [--time-to HH:MM] \\
    [--label <NAME>] [--json]

フラグ:
  --team       (必須) チーム ID
  --source     (任意) yokohama / hiratsuka / kanagawa / kamakura / fujisawa / samukawa / ayase
  --facility   (任意) facility_name の SQL LIKE パターン (例: '%野球場%' / '田端%')
  --weekdays   (任意) sun,mon,tue,wed,thu,fri,sat の CSV
  --time-from  (任意) slot の開始がこれ以降 (HH:MM)
  --time-to    (任意) slot の終了がこれ以前 (HH:MM)
  --label      (任意) 表示名

例:
  土日午前の野球場を全自治体から:
    mound watch add --team T --facility '%野球場%' --weekdays sat,sun --time-to 12:00 --label 'weekend AM'
  kanagawa の軟式野球場 (夕方限定):
    mound watch add --team T --source kanagawa --facility '軟式野球場' --time-from 16:00 --label '夕方'

JSON 出力:
  GroundWatch { id, team_id, label, source, facility_pattern, weekdays,
                time_from, time_to, enabled, created_at, updated_at }
`,

  "watch list": `mound watch list — team の watch 一覧

使い方:
  mound watch list --team <TEAM_ID> [--json]

JSON 出力:
  GroundWatch[]
`,

  "watch remove": `mound watch remove — watch を 1 件削除

使い方:
  mound watch remove <ID> [--json]

JSON 出力:
  { "ok": boolean, "id": string }
`,

  "watch test": `mound watch test — 登録 watch と現在の ground_slots を照合

使い方:
  mound watch test --team <TEAM_ID> [--json]

挙動:
  team の enabled watch を使って、現在 mound に取り込まれている全 slot の
  うちマッチするものを返す。エージェント / 人間が watch の挙動を確認する
  デバッグ用。

JSON 出力:
  { "count": number, "slots": GroundSlot[] }
`,

  observe: `mound observe — チームの記憶 (Bronze): 会話で得た生の観測を追記

サブコマンド:
  observe add  --team <ID> --kind <KIND> --body <TEXT> [--member <ID>] [--subject S] [--source S] [--json]
  observe list --team <ID> [--kind <KIND>] [--member <ID>] [--json]

KIND:
  PREFERENCE_HINT | ROSTER_FACT | VENUE | RULE | OPPONENT | NOTE

狙い:
  「土曜の朝が動きやすい」「鈴木は隔週で来る」など、構造を決めずまず書き留める層。
  状態は mound (libSQL/SQLite) に永続化されるので、駆動エージェント (Hermes/Codex/Claude)
  を差し替えても同じチーム文脈から再開できる。型付きの決め事は knowledge set へ昇格。

JSON 出力:
  Observation { id, team_id, member_id, kind, subject, body, source, observed_at, created_at }

エラー:
  - TeamNotFoundError / MemberNotFoundError (exit 2)
`,

  knowledge: `mound knowledge — チームの記憶 (Gold): 確信度付きの「決め事」

サブコマンド:
  knowledge set    --team <ID> --key <K> --value <V> [--category C] [--member ID] \\
                   [--origin HUMAN|LEARNED] [--confidence 0..1] [--source S] [--json]
  knowledge list   --team <ID> [--category C] [--member ID] [--key K] [--json]
  knowledge get    --team <ID> --key <K> [--member ID] [--json]
  knowledge forget <ID> [--json]

category: PREFERENCE | RULE | ROSTER | VENUE | OPPONENT | NOTE (既定: NOTE)
origin:   HUMAN (人が明示, 既定) | LEARNED (実績から学習)

マージ規則 ((team, member, key) で upsert):
  - HUMAN は LEARNED に上書きされない (人の決め事をピン留め)
  - LEARNED 同士は confidence が高い方が値を握る
  - 観測のたび evidence_count を加算 (使うほど裏付けが厚くなる)

代表的な key (PREFERENCE):
  default_ground / default_weekday / default_time / default_min_players /
  reminder_lead_days / fee_per_person

JSON 出力:
  TeamKnowledge { id, team_id, member_id, category, key, value, origin,
                  confidence, evidence_count, source, last_observed_at,
                  created_at, updated_at }

エラー:
  - TeamNotFoundError / MemberNotFoundError (exit 2)
`,

  agenda: `mound agenda — いま注意すべき試合 (メニューバー向け)

使い方:
  mound agenda [--team <TEAM_ID>] [--horizon-days <N>] [--json]

フラグ:
  --team           (任意) チーム ID で絞り込み
  --horizon-days   (任意) 何日先までを「開催間近」とみなすか (0..365, 既定: 7)

JSON 出力:
  {
    "generated_at": ISO8601,
    "team_id": string | null,
    "horizon_days": number,
    "needs_publish":     Game[],                                   // DRAFT のまま
    "collecting":        { game, rsvp, ready_to_confirm, shortage }[],
    "upcoming":          { game, days_until }[],                   // CONFIRMED かつ ≤ horizon
    "needs_completion":  Game[],                                   // CONFIRMED かつ game_date 経過
    "needs_settlement":  Game[]                                    // COMPLETED
  }
`,
};

// positional から最も具体的な help を選ぶ。
// ["game", "create", ...] -> "game create" -> "game" -> null
export function findCommandHelp(positional: string[]): string | null {
  if (positional.length >= 2) {
    const k = `${positional[0]} ${positional[1]}`;
    const h = COMMAND_HELP[k];
    if (h) return h;
  }
  if (positional.length >= 1) {
    const k = positional[0] as string;
    const h = COMMAND_HELP[k];
    if (h) return h;
  }
  return null;
}
