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

グローバルフラグ:
  --json       JSON 出力 (エージェント連携向け)
  --help       このヘルプ
  --version    バージョン

環境変数:
  MOUND_DB_URL          libSQL URL (例: file:./mound.db, libsql://...turso.io)
  MOUND_DB_AUTH_TOKEN   Turso 認証トークン
`;

export const VERSION = "0.1.0";
