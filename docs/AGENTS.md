# mound for Hermes Agent — 草野球チーム運用 OS

mound は 草野球チームの **代表者の負担をゼロにする** ためのオペレーション基盤です。Hermes Agent はユーザ (= チーム代表) の自然言語入力を受け取り、ここに書かれた `mound` CLI を組み合わせて実行することで、試合の立ち上げ・出欠の取りまとめ・グラウンド空きの監視・通知までを自動化します。

このドキュメントは Hermes が **ゼロ知識から 1 チーム分の運営を完遂するための最小十分なリファレンス** です。

---

## 0. 中心原則 — mound はチームの記憶。Hermes の私的メモリではない

Hermes はユーザとの会話で **チームの運営に関する知見** を継続的に得ます (「土曜の朝が動きやすい」「鈴木さんは隔週で来る」「いつもの会場は三ツ沢」など)。これらは **必ず mound に書き戻してください**。

- **❌ Hermes の memory にだけ書く** — セッションを跨いだら他のエージェント・他のオペレータ・人間自身がアクセスできない
- **✅ mound に書く** — チーム自身が所有する永続層 (~/.mound/mound.db、もしくは Turso 上の libSQL)。**他の Hermes インスタンス・Web UI・MoundMenuBar・将来のエージェント** が同じデータを読める

### 「mound に書く」の原則 (Hermes 内部チェックリスト)

会話の中で次のような情報が出てきたら、対応する `mound ...` コマンドで書き込みます。

| 学んだこと | 書き込み先 | コマンド |
| --- | --- | --- |
| チーム名・本拠地エリア | `Team` | `mound team create --name --area` (初回のみ) |
| 新しいメンバーが加入した | `Member` | `mound member add --team --name [--email --role]` |
| 試合が立つ (日時・会場が決まった / 仮立て) | `Game` | `mound game create --team --title --date --ground --note` (詳細未定でも note に記述してまず立てる) |
| メンバーが「出られる/出られない」と発言した | `Rsvp` | `mound rsvp set --game --member --response` |
| 試合の状態が変わった (公開 / 確定 / 中止 / 完了 / 精算) | `Game.status` | `mound game transition --to <STATUS>` |
| 通知したいチャネルを教わった (Discord/Slack/LINE) | `NotificationChannel` | `mound notify add --team --kind --webhook` |
| 「土日午前の野球場だけ通知して」「軟式野球場の夕方だけ」など監視条件 | `GroundWatch` | `mound watch add --team [--source --facility --weekdays --time-from --time-to --label]` |
| チームの**決め事** (いつもの会場/曜日/最低人数/会費/リマインド何日前) | `TeamKnowledge` (🥇 Gold) | `mound knowledge set --team --key <K> --value <V> [--category PREFERENCE]` |
| メンバー固有の知識 (背番号/ポジション/常連か/連絡時間帯) | `TeamKnowledge` (🥇 Gold) | `mound knowledge set --team --member <ID> --category ROSTER --key <K> --value <V>` |
| 会話で得た**生の知見** (「土曜の朝が動きやすい」「鈴木は隔週」「三ツ沢は取りやすい」) | `Observation` (🥉 Bronze) | `mound observe add --team --kind <KIND> --body <TEXT> [--member --source]` |
| 試合に関する自由メモ (例: 「対戦相手は連絡待ち」「会場 OK 取れたら note 更新」) | `Game.note` | `mound game create` の `--note` (新規時) — 既存 game への note 更新 API は未実装、後述 |
| グラウンド予約システムの空き状況 | `GroundSlot` | `mound ground sync --region all` で自動取り込み |

#### チーム記憶レイヤ — 「使うほど賢くなる」決め事ストア (Medallion)

`observe` / `knowledge` は **チームのコンテキストを学習して貯める層** です。状態は mound
(libSQL/SQLite) に永続化されるので、**駆動するエージェントを Hermes → Codex → Claude と
差し替えても、同じチーム文脈から再開できます** (これがチーム OS の肝)。エージェント固有の
memory には書かず、必ずここに書き戻してください。

- 🥉 **Bronze = `observe`**: 構造を決めず**まず書き留める**生の観測。`kind` は
  `PREFERENCE_HINT / ROSTER_FACT / VENUE / RULE / OPPONENT / NOTE`。
- 🥇 **Gold = `knowledge`**: `(team, member, key)` で一意な**確信度付きの決め事**。
  autopilot や Hermes が「いつもの会場・曜日・最低人数」を**人に聞かずに**埋めるために読む層。
  - `origin=HUMAN` (人が明示) は `origin=LEARNED` (実績から学習) に**上書きされない** = 人の決め事をピン留め
  - `LEARNED` 同士は `confidence` が高い方が値を握る
  - 観測のたび `evidence_count` が加算される (= 使うほど裏付けが厚くなる)

セッション開始時は `mound knowledge list --team T --json` と `mound observe list --team T --json`
を読めば、そのチームの決め事・知見をまるごと引き継げます。

#### 使うほど賢くなる: `mound learn`

`mound learn --team T` は過去の試合・出欠から **default_ground / default_weekday /
メンバー出席率** を確信度付きで再導出し、`--apply` で Gold に LEARNED として書き戻します
(`origin=HUMAN` の決め事はピン留めされ触られません)。定期的に回すほどチームの「いつもの」が
育ちます。Hermes は試合が一区切りした (`SETTLED`/`COMPLETED`) タイミングや日次で実行すると良いです。

#### 自律運用: `mound auto` + cron

`mound auto run --team T --apply` は現在状態 (agenda) から打つべき手を算出し、**安全な手は自動実行・
チームを拘束する手は提案**に分けます。

- SAFE (自動): `PUBLISH` (DRAFT→COLLECTING) / `COMPLETE` (試合日経過→COMPLETED) / 出欠・精算リマインド通知
- NEEDS_APPROVAL (提案のみ): `CONFIRM` (人数充足→CONFIRMED。チームを拘束するので人が決める)

cron/launchd で定期実行すれば**人手ゼロで回り続けます**。Hermes が運用ループを担う場合は
`mound auto plan --json` を読み、SAFE は自動で `auto run --apply`、`proposed` の NEEDS_APPROVAL は
ユーザに確認してから個別に `mound game transition` を叩く、という分担が綺麗です。

```bash
# 例: 30 分おきに球場同期 + 自律運用 (SAFE のみ自動)
*/30 * * * * mound ground sync --region all --notify --team "$TEAM" --json >/dev/null
0    8 * * * mound auto run --team "$TEAM" --apply --json >>~/.mound/auto.log
0    9 * * 1 mound learn --team "$TEAM" --apply --json >>~/.mound/learn.log
```

**会話で発見した情報は、書ける所があるなら必ず書く。書けない情報があれば §9 の「現在書けないこと」に該当するので、Hermes はそれを **未解決 task として TODO 化** してユーザに告知してください**。

### ステップ 0: 新しいチームに初めて触れたとき

ユーザ: 「うちのチームに mound 使いたい」

Hermes が最初にやるべきは **チーム運営プロファイルの起こし** です。次の順で質問し、答えを `mound team create` / `mound member add` / `mound watch add` / `mound notify add` に翻訳して書き込みます。

1. **チーム名 / 本拠地エリア** → `mound team create --name "..." --area "..."`
2. **メンバー名・連絡先 (任意)** → `mound member add ...` を人数分
3. **通知したい媒体** (Discord webhook URL? Slack webhook URL? LINE Messaging API のトークン?) → `mound notify add ...`
4. **使うグラウンドの候補・曜日・時間帯** → `mound watch add ...` を条件分
5. **直近に予定がある試合 / 募集中の試合** → `mound game create ...`
6. **直近の出欠** → `mound rsvp set ...`

ここまで書き込んでから、初めて「`mound agenda --team T --json` を読んで促す」フェーズに入ります。

```bash
# 例: 起こした直後のサマリ
mound team list --json
mound member list --team "$TEAM" --json
mound watch list --team "$TEAM" --json
mound notify list --team "$TEAM" --json
mound agenda --team "$TEAM" --json
```

このサマリ JSON を Hermes が読み返せれば、**他のセッション・他のエージェントでも同じ運営状態から再開できる**。これがチーム OS の意義です。

---

## 1. Hermes Agent から見た構成

```
┌─────────────────────────────────────────────────────────┐
│  ユーザ (草野球チーム代表)                              │
│  「土曜の練習試合立てて」「球場空いた?」               │
└──────────────────┬──────────────────────────────────────┘
                   │ 自然言語
                   ▼
┌─────────────────────────────────────────────────────────┐
│  Hermes Agent (このドキュメントの読者)                   │
│  - 意図を解釈                                            │
│  - mound CLI を組み立てて spawn                           │
│  - --json 出力を JSON.parse                              │
│  - 結果を人間に返す / 確認を取る                          │
│  - 学んだ知見を mound に書き戻す ←★ 重要                 │
└──────────────────┬──────────────────────────────────────┘
                   │ subprocess
                   ▼
┌─────────────────────────────────────────────────────────┐
│  mound (CLI, このリポジトリ)                              │
│  - team / member / game / rsvp / audit / agenda          │
│  - ground (import / list / diff / sync / match)           │
│  - notify (Discord / Slack / LINE)                       │
│  - watch (チームごとのグラウンド条件フィルタ)             │
│  - 状態は ~/.mound/mound.db (libSQL/SQLite) に永続化      │
└──────────────────┬──────────────────────────────────────┘
                   │ spawn (mound ground sync が呼ぶ)
                   ▼
┌─────────────────────────────────────────────────────────┐
│  ground-monitoring (susumutomita/ground-reservation)      │
│  - 神奈川県 7 地域のグラウンド予約システムをスクレイプ      │
│  - --json で構造化出力                                    │
└─────────────────────────────────────────────────────────┘
```

**人間がやるのは「立てて」「承諾」だけ。** 間の交渉・確認・状態管理・記憶は Hermes Agent と mound で完結させるのが理想形です。

---

## 2. インストール

ユーザのマシンに mound と ground-monitoring を入れます。

```bash
git clone https://github.com/susumutomita/mound.git
cd mound
make install        # Bun deps
make install-local  # mound + ground-monitoring を ~/.local/{bin,share} に配置
mound --version
ground-monitoring --help
```

`make install-local` 一発で両方入ります。失敗時 (ネットワーク不能等) でも mound 本体のインストールは続行され、ground-monitoring だけ落ちる挙動です。詳細は [README.md](../README.md#インストール) を参照。

---

## 3. 共通 I/O 規約

Hermes は以下を **必ず守ること**:

### 3.1 `--json` を常に付ける

人間向けテキスト出力は安定しません。エージェントは必ず `--json` を渡し、stdout を `JSON.parse` してください。

### 3.2 exit code

| code | 意味 | Hermes の対応 |
| --- | --- | --- |
| 0 | 成功 | stdout の JSON を使う |
| 1 | システムエラー (libSQL 接続失敗 / spawn 失敗 / 想定外例外) | stderr を読んでユーザに伝える。リトライしない |
| 2 | Usage / バリデーション / ドメイン拒否 (TransitionDeniedError 等) | stderr の JSON を読んで原因を理解し、入力を直して再試行 |

### 3.3 エラー JSON のスキーマ (stderr 側)

`--json` モードで失敗したとき、stderr に 1 行 JSON が出ます:

```json
{
  "ok": false,
  "error": "状態遷移が不正です: DRAFT → SETTLED",
  "from": "DRAFT",
  "to": "SETTLED",
  "available_transitions": ["COLLECTING", "CONFIRMED", "CANCELLED"]
}
```

- `ok`, `error` は必ずある
- `TransitionDeniedError` のときは追加で `from / to / available_transitions / rsvp_summary? / min_players?` が乗る。**これを読めば自動リトライ計画が立てられる**
- 不明な error はそのまま人間に伝えてよい

### 3.4 1 コマンド 1 アクション

`mound` は 1 回の呼び出しで 1 つのドメイン操作しかしません。複数操作を 1 つの transaction にすることはできません。状態の確認 → 行動 → 確認、と素直に並べてください。

### 3.5 ID は常に保存する

`mound team create` / `mound member add` / `mound game create` / `mound notify add` / `mound watch add` はそれぞれ `id` を返します。Hermes はこれを次の呼び出しまで保持してください。再取得は `mound <X> list ... --json` で可能ですが、名前ベースで lookup する API は無いので、**作成直後に返ってきた id をその場でメモする** のが正しい使い方です。

---

## 4. コマンド早見表

| コマンド | 主な flag | 主な戻り値 |
| --- | --- | --- |
| `init` | — | `{ok:true}` (DB を作るだけ) |
| `team create` | `--name --area` | `Team` |
| `team list` | — | `Team[]` |
| `team show` | `<id>` | `{team, members, knowledge}` (profile 引き継ぎ用) |
| `team update` | `<id> --name? --area?` | `Team` |
| `team remove` | `<id>` | `{ok, id}` (members/games/決め事も CASCADE) |
| `member add` | `--team --name --email? --role?` | `Member` (name は表示名/ハンドル, 本名不要) |
| `member list` | `--team` | `Member[]` |
| `member update` | `--member --name? --email? --role?` | `Member` |
| `member remove` | `<id>` | `{ok, id}` |
| `game create` | `--team --title --date? --ground? --min-players? --note?` | `Game (status=DRAFT)` |
| `game list` | `--team? --status?` | `Game[]` |
| `game show` | `<id>` | `GameDetail` |
| `game update` | `<id> --title? --date? --ground? --min-players? --note?` | `Game` |
| `game transition` | `<id> --to <STATUS>` | `Game (更新後)` |
| `export` | `--out?` | JSONL (全データ書き出し) |
| `import` | `--file` | `{imported}` |
| `config set` | `--db-url? --db-token?` | 接続先を ~/.mound/config.json に保存 |
| `rsvp set` | `--game --member --response AVAILABLE\|UNAVAILABLE\|MAYBE\|NO_RESPONSE` | `Rsvp` |
| `rsvp list` | `--game` | `MemberRsvp[]` |
| `rsvp summary` | `--game --team?` | `RsvpSummary` |
| `audit` | `--target --type?` | `AuditLog[]` |
| `agenda` | `--team? --horizon-days?` | `Agenda` |
| `ground import` | `--file? --stdin?` | `ImportResult` |
| `ground list` | `--source? --date?` | `GroundSlot[]` |
| `ground diff` | `--since? --minutes? --source? --game-date?` | `{since, count, slots}` |
| `ground sync` | `--region? --bin? --timeout-ms? --notify? --team?` | `SyncResult` |
| `ground match` | `--game` | `{game, count, matching_slots}` |
| `notify add` | `--team --kind --webhook --secret? --target? --label?` | `NotificationChannel` |
| `notify list` | `--team` | `NotificationChannel[]` |
| `notify remove` | `<id>` | `{ok, id}` |
| `notify test` | `<id> --message?` | `DeliveryResult` |
| `watch add` | `--team --source? --facility? --weekdays? --time-from? --time-to? --label?` | `GroundWatch` |
| `watch list` | `--team` | `GroundWatch[]` |
| `watch remove` | `<id>` | `{ok, id}` |
| `watch test` | `--team` | `{count, slots}` |
| `observe add` | `--team --kind --body [--member --subject --source]` | `Observation` |
| `observe list` | `--team [--kind --member]` | `Observation[]` |
| `knowledge set` | `--team --key --value [--category --member --origin --confidence --source]` | `TeamKnowledge` |
| `knowledge list` | `--team [--category --member --key]` | `TeamKnowledge[]` |
| `knowledge get` | `--team --key [--member]` | `TeamKnowledge \| {found:false}` |
| `knowledge forget` | `<id>` | `{ok, id}` |
| `learn` | `--team [--apply]` | `LearnResult` (履歴から決め事を学習) |
| `auto plan` | `--team [--horizon-days]` | `AutoPlan` (打つべき手, read-only) |
| `auto run` | `--team [--apply --horizon-days]` | `AutoRunResult` (SAFE は自動・要承認は提案) |
| `settle open` | `--game --amount [--link --label --note --members]` | `SettlementView` (PayPay 割り勘を作成) |
| `settle show` | `--game` | `SettlementView \| {found:false}` |
| `settle pay` | `--game --member [--unpaid]` | `SettlementView` (全額で自動 SETTLED) |
| `settle remind` | `--game` | `{message, deliveries}` (PayPay 催促を通知) |

サブコマンドの詳細は `mound <command> [sub] --help` で取れます (実装は `packages/cli/src/adapters/cli/help.ts`)。

---

## 5. game の状態機械

これは Hermes が **必ず暗記しておく** べきモデルです。

```
DRAFT
  ├─→ COLLECTING (公開して出欠を集める)
  ├─→ CONFIRMED  (直接確定)
  └─→ CANCELLED

COLLECTING
  ├─→ CONFIRMED  ← 要: AVAILABLE 数 ≥ min_players
  └─→ CANCELLED

CONFIRMED
  ├─→ COMPLETED  ← 要: game_date が現在日以前
  └─→ CANCELLED

COMPLETED
  └─→ SETTLED (精算済)

SETTLED, CANCELLED は終端
```

**ガード条件**:
- `COLLECTING → CONFIRMED` は `rsvp_summary.available >= game.min_players` でないと弾かれる
- `CONFIRMED → COMPLETED` は `game.game_date` が今日以前でないと弾かれる
- それ以外の遷移はガードなし

遷移失敗時の JSON エラーには `from / to / available_transitions / rsvp_summary? / min_players?` が乗るので、Hermes は次に取れる手をプログラム的に判断できます (例: 「あと X 人足りない」とユーザに伝える)。

`mound game show <ID> --json` は現状から取れる遷移を `available_transitions` で常に返します。

---

## 6. 典型ワークフロー (実コード例)

### 6.1 チーム初期化 (= プロファイルの起こし)

ユーザ: 「横浜BB ってチームを作って、メンバーを 10 人入れて」

```bash
mound init --json >/dev/null   # 初回のみ

TEAM=$(mound team create --name "横浜BB" --area "横浜" --json | jq -r .id)
echo "team=$TEAM"

for name in 山田 鈴木 田中 佐藤 高橋 渡辺 伊藤 中村 小林 加藤; do
  mound member add --team "$TEAM" --name "$name" --json >/dev/null
done
mound member list --team "$TEAM" --json | jq 'length'   # → 10
```

### 6.2 試合を立てて出欠を集める

ユーザ: 「来週土曜 6/6 9 時から 公園グラウンドで練習試合」

```bash
GAME=$(mound game create \
  --team "$TEAM" \
  --title "練習試合" \
  --date 2026-06-06 \
  --ground "公園グラウンド" \
  --min-players 9 \
  --note "対戦相手は連絡待ち" \
  --json | jq -r .id)

# 公開して出欠回収開始
mound game transition "$GAME" --to COLLECTING --json

# メンバーごとに rsvp を upsert
mound rsvp set --game "$GAME" --member "$MEMBER_1" --response AVAILABLE --json
mound rsvp set --game "$GAME" --member "$MEMBER_2" --response UNAVAILABLE --json
# ...

# 集計確認
mound rsvp summary --game "$GAME" --json
# → {"available":9, "unavailable":1, "maybe":0, "no_response":0}

# 人数足りていれば確定
mound game transition "$GAME" --to CONFIRMED --json
# 人数不足なら exit 2 で
#   {"ok":false,"error":"参加可 (5) が最低人数 (9) に満たないため確定できません",
#    "from":"COLLECTING","to":"CONFIRMED","available_transitions":["CONFIRMED","CANCELLED"],
#    "rsvp_summary":{"available":5,...},"min_players":9}
# が stderr に出るので、Hermes は「あと 4 人」と人に伝える
```

### 6.3 通知チャネルを設定する

ユーザ: 「試合決まったら Discord 通知して」

```bash
mound notify add \
  --team "$TEAM" \
  --kind DISCORD \
  --webhook "https://discord.com/api/webhooks/xxx" \
  --label "main" \
  --json

# テスト送信
mound notify test "$CHANNEL_ID" --message "通知テストです" --json
```

これ以降、`game transition` 成功時に自動でチームの enabled channel に通知が飛びます (fire-and-forget、HTTP 失敗してもドメイン操作は成功扱い)。

### 6.4 グラウンド連携 (sync + match + notify)

ユーザ: 「うちのチームの 6/6 の試合の会場、空いてないか定期的に見ておいて」

```bash
# 1) watch を登録 (土曜午前の野球場すべて)
mound watch add --team "$TEAM" \
  --facility '%野球場%' --weekdays sat,sun --time-to 12:00 \
  --label "週末午前" --json

# 2) cron で 30 分おきに sync (launchd / systemd の例は README 参照)
mound ground sync --region all --notify --team "$TEAM" --json
# → 新規空き (first_seen_at がこの sync 以降) のうち watch にマッチしたものだけ
#    Discord 等に push される。watch 0 件のチームは全件通知 (後方互換)

# 3) Hermes が能動的に「あなたの試合の会場、空いてる?」を確認するなら
mound ground match --game "$GAME" --json
# → { "game": Game, "count": N, "matching_slots": [...] }
```

### 6.5 アジェンダ (今やるべきこと) を取る

ユーザ: 「いま何やればいい?」

```bash
mound agenda --team "$TEAM" --horizon-days 14 --json
```

戻り値:

```json
{
  "generated_at": "2026-05-23T10:00:00.000Z",
  "team_id": "...",
  "horizon_days": 14,
  "needs_publish":     [Game...],
  "collecting":        [ {game, rsvp, ready_to_confirm, shortage} ... ],
  "upcoming":          [ {game, days_until} ... ],
  "needs_completion":  [Game...],
  "needs_settlement":  [Game...]
}
```

「`needs_publish` が 1 件以上ある」「`collecting` の `ready_to_confirm: true` がある」など、Hermes はここから能動的に促せます。

### 6.6 状態の引き継ぎ (他セッションへ)

別 Hermes インスタンス、もしくはユーザ自身がコマンドで確認するときの第一歩:

```bash
mound team list --json
# → 1 件目を取り、その id を $TEAM に
mound member list --team "$TEAM" --json
mound game list --team "$TEAM" --json
mound watch list --team "$TEAM" --json
mound notify list --team "$TEAM" --json
mound agenda --team "$TEAM" --json
```

ここまでで「いま誰がいて」「直近の試合はどうなっていて」「監視条件は何で」「通知先は何か」が全部 mound から取れます。**Hermes の私的 memory は要らない**。

---

## 7. JSON 出力スキーマ (主要型)

実装は `packages/cli/src/domain/types.ts`。フィールドが増えても後方互換で増やす方針なので、Hermes は **知らないフィールドは無視** すること。

### Team

```ts
{ id, name, home_area: string | null, created_at, updated_at }
```

### Member

```ts
{ id, team_id, name, email: string | null,
  role: "ADMIN" | "MEMBER",
  created_at, updated_at }
```

### Game

```ts
{ id, team_id, title,
  status: "DRAFT" | "COLLECTING" | "CONFIRMED" | "COMPLETED" | "SETTLED" | "CANCELLED",
  game_date: "YYYY-MM-DD" | null,
  ground_name: string | null,
  min_players: number,
  note: string | null,
  created_at, updated_at }
```

### GameDetail (`game show` の戻り)

```ts
{
  game: Game,
  rsvp_summary: { available, unavailable, maybe, no_response },
  rsvp_breakdown: { available: MemberRsvp[], unavailable: ..., maybe: ..., no_response: ... },
  available_transitions: GameStatus[],
  matching_ground_slots: GroundSlot[]
}
```

### Rsvp

```ts
{ id, game_id, member_id,
  response: "AVAILABLE" | "UNAVAILABLE" | "MAYBE" | "NO_RESPONSE",
  responded_at, created_at, updated_at }
```

### GroundSlot

```ts
{ id, slot_key,
  source, facility_name,
  date_iso: "YYYY-MM-DD" | null,
  date_raw: string,
  time_range: "HH:MM-HH:MM" | null,
  status: "空き" | "抽選" | ... | null,
  raw: string,
  scraped_at, first_seen_at, ingested_at }
```

### GroundWatch

```ts
{ id, team_id, label: string | null,
  source: string | null,            // null=任意
  facility_pattern: string | null,  // SQL LIKE (%野球場%)
  weekdays: string | null,          // CSV (sat,sun)
  time_from: "HH:MM" | null,
  time_to: "HH:MM" | null,
  enabled: boolean,
  created_at, updated_at }
```

watch の評価ルール:
- 同じ watch 内の各条件は **AND**
- 同じ team の複数 watch は **OR**
- team に watch 0 件 → 全 slot を通す (後方互換)

### NotificationChannel

```ts
{ id, team_id,
  kind: "DISCORD" | "SLACK" | "LINE",
  webhook_url: string,
  secret: string | null,    // LINE のみ Bearer token
  target: string | null,    // LINE のみ userId/groupId
  label: string | null,
  enabled: boolean,
  created_at, updated_at }
```

### Agenda

§6.5 を参照。

---

## 8. 環境変数

| 変数 | 既定 | 用途 |
| --- | --- | --- |
| `MOUND_DB_URL` | `file:~/.mound/mound.db` | libSQL の URL。`libsql://...turso.io` で Turso へ切替可 |
| `MOUND_DB_AUTH_TOKEN` | (なし) | Turso 認証トークン |
| `MOUND_NOTIFY_MODE` | (実 HTTP) | `log-only` で stderr に出すだけ (dev/test) / `disabled` で no-op |

Hermes Agent が複数チームの DB を扱うときは、チームごとに `MOUND_DB_URL` を切り替える形が想定です (例: `MOUND_DB_URL=file:~/.mound/team-${slug}.db`)。

---

## 9. 現在書けないこと — Hermes は **TODO 化してユーザに告知**

mound に永続化したいのに「書く場所が無い」情報は、Hermes は会話メモリに保存するしかありません。これらは将来 mound 側に格納先が追加されるべき項目です。**Hermes は自分の memory に書くだけで満足せず、ユーザに「これは現状 mound に書けません。Issue として残しますか?」と聞いてください**。

| 書けないこと | 暫定の置き場 | 追跡 Issue |
| --- | --- | --- |
| ~~チーム単位の自由メモ (チーム規約 / 連絡網 / 来季の方針 等)~~ | **解消済** → `mound knowledge set --category RULE/NOTE` / `mound observe add` | — |
| ~~メンバー単位の自由メモ (背番号 / ポジション / 連絡時間帯 / 助っ人かレギュラーか 等)~~ | **解消済** → `mound knowledge set --member <ID> --category ROSTER` | — |
| ~~既存 game の `note` を後から更新する API~~ | **解消済** → `mound game update <ID> --note ...`(title/date/ground/min-players も編集可) | — |
| 対戦相手チームの情報 (連絡先 / 過去戦績 / 信頼度) | (なし) | Phase 2 想定 |
| ~~試合の精算 / 会計~~ | **解消済** → `mound settle`(PayPay 割り勘: 割り勘計算・未払い把握・催促・自動 SETTLED)。PayPay 個人割り勘に公開 API は無いためリンクは人が貼り入金は人が消し込む | — |
| 自然言語入力の直接受付 (`mound parse "土曜 9 時から練習試合"`) | (なし — Hermes の責務) | 未起票 |

これらが必要になった場合、Hermes は次のいずれかをすべきです:

1. ユーザに合意を取ったうえで GitHub に Issue を立てる (`gh issue create --repo susumutomita/mound ...`)
2. すでに同等の Issue が無いか先に `gh issue list` で確認
3. その Issue ID を会話内に書き残し、後で mound にちゃんとした格納先が出来たら埋め直す

---

## 10. 既知の制約 (= Hermes が「できません」と返すべきこと)

- 大会方式の管理 (リーグ・トーナメント) は **未対応**
- メンバー間の権限管理 (役割は `ADMIN` / `MEMBER` の 2 段階のみ)
- 通知は片方向 push のみ。Discord 等からの返信に応じて mound を更新する仕組みは **未対応**
- ground-monitoring が対応するのは **神奈川県 7 地域** (yokohama / hiratsuka / kanagawa / kamakura / fujisawa / ayase / samukawa) のみ
- `mound ground sync` は **同期実行** (タイムアウト既定 60 秒)。長時間ジョブとしては設計されていない
- 状態遷移は前進のみ (`DRAFT` への巻き戻しは存在しない)
- mound が自然言語をパースする機能はない。**自然言語 → コマンドへの翻訳は Hermes の責務**

---

## 11. リンク

- README.md (人間向け): https://github.com/susumutomita/mound/blob/main/README.md
- CLAUDE.md (codebase を編集する Claude / 開発者向け): https://github.com/susumutomita/mound/blob/main/CLAUDE.md
- SPEC.md (Phase 1 仕様): https://github.com/susumutomita/mound/blob/main/SPEC.md
- 連携先 ground-monitoring: https://github.com/susumutomita/ground-reservation
- 主要 PR
  - `mound ground import` https://github.com/susumutomita/mound/pull/167
  - `mound ground diff` https://github.com/susumutomita/mound/pull/170
  - `mound notify` https://github.com/susumutomita/mound/pull/171
  - `mound ground sync` https://github.com/susumutomita/mound/pull/173
  - `mound watch` https://github.com/susumutomita/mound/pull/177
  - `mound ground match` https://github.com/susumutomita/mound/pull/179
