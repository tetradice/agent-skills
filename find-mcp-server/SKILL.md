---
name: find-mcp-server
description: 公開MCP(Model Context Protocol)サーバーの探索、比較、導入、add-mcp 接続を支援する。DB、外部API、ファイル操作、GitHub連携などで「〇〇のMCPサーバーはある？」「MCPツールを探して」「add-mcp で入れたい」といった依頼が出たら積極的に使い、候補探索から動作テストまで対応する。
---

# Find MCP Server（MCPサーバーの検索と導入）

このスキルは、公開されているMCPサーバーのエコシステムから、ユーザーの目的に最も合致するサーバーを発見、検証し、インストールから動作テストまでを一貫して支援します。

## このスキルを使用するタイミング

ユーザーが以下のようなアクションをした場合に使用します：

- 「Xと連携できるMCPサーバーはあるか」「X用のツールを探して」と尋ねてきたとき
- エージェントに新しい外部連携機能（データベース、API、ツールなど）を追加したいと希望したとき
- 既存のシステムやサービスをAIエージェントから操作したいと言及したとき

## 主要なコマンド

このスキルでは主に `npx add-mcp` コマンドを使用してMCPサーバーを管理します。候補探索では、3 つの検索 API を 1 回のコマンドに集約したローカル CLI を優先して使います。

**主なコマンド:**

- `npx add-mcp [npmパッケージ名]` - npmパッケージとして提供されるMCPサーバーをインストールする
- `npx add-mcp "[実行コマンド]"` - stdio形式の任意のMCPサーバーをインストールする。ただし `[実行コマンド]` の中には1つ以上の引数を含んでいなければならない（＝半角スペースが1つ以上必要）
- `npx add-mcp [HTTP URL]` - URLから直接MCPサーバーをインストールする
- `node packages/mcp-server-search/bin/mcp-server-search.js [検索語] --limit 30` - Official MCP Registry、Smithery、GitHub REST API を内部で並列検索し、統一 JSON を返す
- `npx @tetradice/mcp-server-search [検索語] --limit 30` - 上記 CLI を npm 公開後に使う想定の実行形式

## MCPサーバー導入のステップ

### ステップ1：ユーザーのニーズを理解する

ユーザーが何を求めているのかを正確に把握します：

1. 連携したい対象（例：PostgreSQL, GitHub, Slack, Notionなど）
2. 実行したい具体的な操作（例：クエリの実行、PRの作成、メッセージの送信など）

### ステップ2：MCPサーバーを検索する

候補探索では、**Official MCP Registry**、**Smithery REST API**、**GitHub REST API** の 3 系統を確認してください。必要に応じて **mcp.so (MCP Directory)** を補助的に見ても構いませんが、推奨候補の選定は API で取得した情報を優先してください。

このスキルでは、**ユーザー要件を満たす公式提供と思われる MCP サーバーが見つかった場合、その候補を優先して扱ってください。** たとえば GitHub 連携を探していて GitHub 公式の MCP サーバーが存在し、必要なツールも満たしているなら、コミュニティ実装より先にその候補を提示します。

ただし、公式候補でも必要なツールや運用条件を満たさない場合は、非公式候補を優先して構いません。その場合は「公式候補はあったが、今回は要件不足のため採用しない」と明示してください。

このステップでは、**Official MCP Registry、Smithery REST API、GitHub REST API を必ず確認してください。どれか1つだけで候補探索を終えないでください。** ただし、3 つの API を個別に叩く代わりに、まずローカル CLI `node packages/mcp-server-search/bin/mcp-server-search.js [検索語]` を使って 1 回のコマンドで検索して構いません。CLI の `sources.registry.ok`、`sources.smithery.ok`、`sources.github.ok` がすべて `true` なら、この要件を満たしたものとして扱ってください。APIドキュメントは以下です。
- `https://registry.modelcontextprotocol.io/docs#/operations/list-servers-v0.1`
- `https://docs.github.com/en/rest/search/search?apiVersion=2026-03-10`
- `https://smithery.ai/docs/api-reference/servers/list-all-servers`

なお、`npx add-mcp find` は使用しないでください。このコマンドは、見つかったMCPサーバーをワークスペースに追加してしまうためです。

#### 2-0. まず集約CLIで 3 API をまとめて検索する

まずは、以下のように集約 CLI を実行して 3 API を 1 回のコマンドでまとめて検索してください。VS Code 側では外部アクセスの許可が 1 回で済むため、個別リクエストを 3 回送るより扱いやすいです。

ローカル実行例:

```bash
node packages/mcp-server-search/bin/mcp-server-search.js github --limit 30
```

公開後の実行例:

```bash
npx @tetradice/mcp-server-search github --limit 30
```

出力では最低限以下を確認してください。

1. `sources.registry.ok`
2. `sources.smithery.ok`
3. `sources.github.ok`
4. `merged[]` の候補一覧
5. `normalized[]` に含まれるソース別の補足情報

この CLI が失敗した場合、または `sources` のどれかが `ok: false` の場合に限って、以下の 2-1、2-2、2-3 の個別 API 確認にフォールバックしてください。

#### 2-1. Official MCP Registry で候補を確認する

まず公式レジストリで、目的に近いサーバー候補を確認してください。

公式APIリファレンス:
- `https://registry.modelcontextprotocol.io/docs#/operations/list-servers-v0.1`

検索が正常に行えない場合は、一次情報として上記URLのAPIリファレンスを参照してください。

基本エンドポイント:
- `GET https://registry.modelcontextprotocol.io/v0.1/servers`

主なクエリパラメータ（Official MCP Registry）:
- `search`: サーバー名の部分一致検索
- `limit`: 1-100（デフォルト30）
- `cursor`: ページネーション用カーソル
- `version`: `latest` または固定バージョン（例: `1.2.3`）
- `updated_since`: RFC3339日時で更新日フィルタ
- `include_deleted`: 削除済みも含めるか

cURL例（Official MCP Registry）:
```bash
curl --request GET \
	--url "https://registry.modelcontextprotocol.io/v0.1/servers?search=github&version=latest&limit=30" \
	--header "Accept: application/json, application/problem+json"
```

ページングが必要な場合は、レスポンスの `metadata.nextCursor` を次リクエストの `cursor` に渡して継続取得してください。

#### 2-2. Smithery REST API で候補を補完する

次に Smithery の公開レジストリを REST API で確認し、Official MCP Registry に出てこない候補や、利用数・検証状況が見える候補を補完してください。

公式APIリファレンス:
- `https://smithery.ai/docs/api-reference/servers/list-all-servers`

検索が正常に行えない場合は、一次情報として上記URLのAPIリファレンスを参照してください。

基本エンドポイント:
- `GET https://api.smithery.ai/servers`

重要事項:
- このスキルでは **Authorization ヘッダーは不要** として扱ってください。
- 実際にアクセスする URL は `https://api.smithery.ai/servers` です。

主なクエリパラメータ（Smithery REST API）:
- `q`: サーバー名・説明に対する全文検索およびセマンティック検索
- `page`: 1始まりのページ番号
- `pageSize`: 取得件数。デフォルト10、最大100
- `topK`: 検索インデックス上での候補取得数
- `fields`: レスポンスに含めるフィールドの絞り込み
- `qualifiedName`: 完全一致のサーバー名指定
- `namespace`: オーナー名前空間での絞り込み
- `remote`: リモートMCPかどうかで絞り込み
- `isDeployed`: Smithery上でデプロイ済みかで絞り込み
- `verified`: 検証済みサーバーに限定
- `repoOwner`: GitHubリポジトリの owner で絞り込み
- `repoName`: GitHubリポジトリ名で絞り込み

cURL例（Smithery REST API）:
```bash
curl --request GET \
	--url "https://api.smithery.ai/servers?q=github&page=1&pageSize=30&verified=true" \
	--header "Accept: application/json"
```

Smithery 側は、`servers[].qualifiedName`、`servers[].displayName`、`servers[].description`、`servers[].verified`、`servers[].useCount`、`servers[].remote`、`servers[].isDeployed`、`servers[].homepage` を見て候補を比較してください。ページング情報は `pagination.currentPage`、`pagination.pageSize`、`pagination.totalPages`、`pagination.totalCount` を利用してください。

#### 2-3. GitHub REST API で候補を補完する

次に GitHub の REST API で、`topic:mcp-server` が付いたリポジトリをスター順で拾い、Registry に出てこない候補やコミュニティでよく使われている候補を補完してください。

公式APIリファレンス:
- `https://docs.github.com/en/rest/search/search?apiVersion=2026-03-10`

検索が正常に行えない場合は、一次情報として上記URLのAPIリファレンスを参照してください。

基本エンドポイント:
- `GET https://api.github.com/search/repositories?q=topic:mcp-server&sort=stars&order=desc`

主なクエリ条件（GitHub REST API）:
- `q`: 検索クエリ（例: `topic:mcp-server`）
- `sort`: 並び替えキー（例: `stars`）
- `order`: 並び順（例: `desc`）

必要に応じて `q` に追加条件を入れて絞り込んでください。例: `topic:mcp-server github`, `topic:mcp-server postgres`。

cURL例（GitHub REST API）:
```bash
curl --request GET \
	--url "https://api.github.com/search/repositories?q=topic:mcp-server&sort=stars&order=desc" \
	--header "Accept: application/vnd.github+json"
```

候補探索の基本方針は、まず Official MCP Registry で基礎候補を確認し、その後 Smithery REST API で公開サーバーを補完し、最後に GitHub REST API で人気順・保守状況を裏取りする、の順です。3つの結果を突き合わせてから推奨候補を絞ってください。

GitHub REST API 側は、`items[].full_name`、`items[].description`、`items[].stargazers_count`、`items[].updated_at`、`items[].html_url` を見て候補を比較してください。

#### 2-4. 公式候補を優先する

候補の中に**公式ベンダー提供と思われる MCP サーバー**がある場合は、要件適合を満たす限り、その候補を第一候補として扱ってください。

公式候補の判定では、少なくとも次を確認します。

1. GitHub リポジトリ owner が対象サービスの公式 organization または vendor と一致する
2. `homepage` や `repositoryUrl` が対象サービスの公式ドメインや公式 GitHub 配下を指している
3. README、説明文、公開元に official / official integration 相当の一次情報がある
4. Registry や Smithery に出ていても、それだけで公式とは断定せず GitHub API や公開元情報で裏取りする

優先順位の基本は次の通りです。

1. 要件を満たす公式候補
2. 要件を満たす非公式候補のうち、安全性・保守性が高いもの
3. その中で人気度・普及度が高いもの

例:

- GitHub 向け MCP サーバーを探していて `github/github-mcp-server` のような GitHub 公式候補が見つかり、必要なツールを満たすなら最優先で提示する
- 公式候補が read 系しか持たず、ユーザーが issue 作成や PR 操作を必要としている場合は、より適合する非公式候補を上位にしてよい

#### 2-5. 人気度・普及度の指標を必ず比較する

候補を絞り込むときは、機能一致だけでなく、**人気度・普及度の定量指標**を必ず確認してください。特に「同等機能の候補が複数ある場合」は、以下の指標で優先順位を付けます。

1. GitHub の `stargazers_count`（コミュニティ支持）
2. GitHub の `updated_at`（最近も保守されているか）
3. Smithery の `useCount` と `verified`（実利用と検証状況）
4. npm パッケージの場合は週次ダウンロード数（例: npm registry API や npmjs の公開統計で確認）

注意点:
- 公式候補が要件を満たすなら、人気度だけで非公式候補を上位にしない
- スター数やダウンロード数が高くても、目的のツールが不足していれば採用しない
- 逆に利用数が少なくても、公式提供・高適合であれば候補として残す
- 最終判断は「機能適合 > 公式性を含む安全性/保守性 > 人気度」の順で行う

### ステップ3：品質の検証とツールの事前確認（重要）

検索結果が見つかったら、推奨する前に品質と機能を検証します。
可能であれば、**一時的にMCPサーバーを起動し、どのようなツール（Tools）やリソース（Resources）が提供されているか一覧を取得して確認**してください。

1. **ツールの確認**: ユーザーが望む操作（Read/Writeなど）を行うツールが含まれているか？
2. **信頼性**: 公式ベンダーが提供しているかを最初に確認し、そのうえで GitHub のスター数や更新状況などコミュニティ評価も確認する

### ステップ4：ユーザーに選択肢を提示する

要件を満たすMCPサーバーを見つけたら、まず候補情報を簡潔に提示し、**その中のどれかをインストールするかどうか**をユーザーに確認してください。この確認は通常の会話で行って構いません。

公式候補がある場合は、候補提示でもその候補を先頭に置き、**公式候補であること**を明示してください。非公式候補を先に出すのは、公式候補が要件を満たさない場合だけにしてください。

ユーザーが「インストールする」と明示した場合に限り、**askQuestionsツールを使って**必要事項を確認してください。

- 候補が複数あり、かつユーザーがどれをインストールするかをまだ指示していない場合は、askQuestions で以下をまとめて確認してください。
  1. どのMCPサーバーをインストールするか
  2. プロジェクトにインストールするか、グローバルにインストールするか
  3. MCPサーバーの表示名をどうするか

- 候補が1件だけの場合、または複数候補でもインストール対象がすでに明示されている場合は、askQuestions で以下を確認してください。
  1. プロジェクトにインストールするか、グローバルにインストールするか
  2. MCPサーバーの表示名をどうするか

ユーザーが「インストールしない」と答えた場合は、その時点で処理を終了してください。

質問時は、各候補について少なくとも以下の情報を先に示してください。

1. MCPサーバー名
2. 概要
3. （ステップ3で確認した）主要なツールや機能
4. 想定されるインストール方法（npmパッケージ、実行コマンド、HTTP URL のいずれか）
5. 人気度・普及度の指標（例: GitHubスター数、最終更新日、Smithery useCount、npm週次DL）
6. 公式候補かどうか、公式でないならその理由

askQuestions の構成例：

```
ご要望に合う候補が2件あります。インストールする場合は、askQuestionsツールで必要事項を選択してください。

- 候補A: mcp-server-github
	- 概要: GitHubリポジトリの検索、Issue作成、PRレビューに対応
	- 主なツール: search_repositories, create_issue
	- 導入方法: npmパッケージ
- 候補B: github-mcp-server
	- 概要: GitHubのリポジトリ操作とIssue参照に対応
	- 主なツール: search_code, list_issues
	- 導入方法: npmパッケージ

askQuestionsで以下を確認する:
1. どのMCPサーバーをインストールするか（未指定の場合のみ）
2. プロジェクトにインストールするか、グローバルにインストールするか
3. MCPサーバーの表示名をどうするか
```

### ステップ5：インストールの実行

ユーザーがインストールを希望し、askQuestions でインストール対象・インストール先・表示名が確定した場合は、その選択結果に従ってインストールを実行します。ユーザーが「インストールしない」と答えた場合は、そこで処理を終了してください。

**npmパッケージの場合 (`npx -y [npmパッケージ名]` で実行できるMCPサーバーの場合) :**
```bash
npx add-mcp [npmパッケージ名]
```

**上記以外の、stdio形式で1つ以上の引数を含むMCPサーバーの場合:**
```bash
npx add-mcp "[実行コマンド 引数1 引数2 ...]"
```

**HTTP URL（直接指定）の場合:**
```bash
npx add-mcp [HTTP URL]
```

上記のどれにも該当しない場合は、MCP用のjsonファイルを手動で編集することで対応できそうかどうかを確認してください。
対応が可能な場合は、ユーザーにjsonファイルを直接編集してもよいかどうかを askQuestions ツールで確認して、それを実施してください。
対応が不可能な場合は、ユーザーに対して、現状の add-mcp コマンドではインストールできないことを伝え、代替案（例：カスタムMCPサーバーの開発支援など）を提案してください。

インストール先がグローバルかプロジェクトかで add-mcp の指定が変わる場合は、ユーザーの選択に合わせて適切な形式を使ってください。また、MCPサーバー名を指定できる導入方法では、askQuestions で確定した表示名を反映してください。

### ステップ6：起動と動作テスト（Post-install Test）

インストールが完了したら、**必ず実際のMCPサーバーの起動と簡単な動作テストを行ってください。**

1. MCPサーバーをエージェントに接続（アタッチ）して起動する。
2. 環境変数や認証情報（APIキーなど）が必要な場合は、ユーザーに設定方法を案内する。
3. サーバーが提供する安全なツール（例：状態を変えないRead系のツールや `ping` のような確認コマンド）を実行し、正しく結果が返ってくるかをテストする。
4. テスト結果をユーザーに報告し、準備が完了したことを伝える。

## 一般的なMCPサーバーのカテゴリ

検索する際は、以下のカテゴリとキーワードを参考にしてください：

| カテゴリ | 検索キーワード例 | よくある用途 |
| --- | --- | --- |
| データベース | `postgres`, `sqlite`, `mysql` | データの検索、集計、書き込み |
| 開発ツール | `github`, `gitlab`, `git` | コード検索、PR作成、Issue管理 |
| コミュニケーション | `slack`, `discord` | メッセージ送信、チャンネル読み取り |
| ファイル・OS | `filesystem`, `bash`, `cli` | ローカルファイルの操作、コマンド実行 |
| 情報検索 | `brave`, `google`, `wikipedia` | Web検索、最新情報の取得 |

## MCPサーバーが見つからない・機能が不足している場合

目的に合うMCPサーバーが存在しない場合：

1. 既存のMCPサーバーでは要件を満たせないことを伝える。
2. 代替手段（エージェント自身の標準機能での対応など）を提案する。
3. **カスタムMCPサーバーの開発**を提案する。（例：「PythonやTypeScriptを使って、専用のMCPサーバーを自作するお手伝いをしましょうか？」）

## 実運用で有効だった確認ポイント（追記）

以下は実際の導入・検証時に有効だった、誤判定を減らすための補助ルールです。

1. **`add-mcp list` はスコープを分けて確認する**
	- `npx add-mcp list -a vscode`
	- `npx add-mcp list -a vscode -g`
	- 片方にしか出ないケースがあるため、導入確認時はローカル/グローバルの両方を見る。

2. **`search=github` はノイズが多い前提で絞り込む**
	- Registry の `io.github.*` は「GitHub連携サーバー」ではなく「GitHub上の任意作者サーバー」も大量に含む。
	- 公式性判定は、`repository.url` が `https://github.com/github/` 配下か、説明文に official 表現があるかを確認する。
	- 公式候補が要件を満たす場合は、その候補を比較表の先頭に置く。

3. **GitHub REST API の topic 検索を必ず候補発見に使う**
	- `GET https://api.github.com/search/repositories?q=topic:mcp-server&sort=stars&order=desc` を併用し、スター順の候補一覧を確認する。
	- `full_name`、`stargazers_count`、`updated_at`、`description` を見て、保守されていて用途が近いものを優先する。

4. **公式性は Registry 単体で決めず GitHub API で裏取りする**
	- 例: `https://api.github.com/repos/github/github-mcp-server`
	- `description`、`archived`、`pushed_at`、`stargazers_count` などを確認し、保守状態と信頼性を補強する。
	- 対象サービスの公式 organization 配下かどうかを、優先順位付けに直接使う。

5. **README取得は `raw.githubusercontent.com` を優先する**
	- `github.com/.../tree/...` は自動抽出で失敗することがある。
	- ツール一覧や設定例の抽出は `https://raw.githubusercontent.com/.../README.md` の方が安定する。

6. **リモートMCPの疎通テストは 401 を到達成功として扱う**
	- 認証必須のリモートMCPでは、未認証時の `401 Unauthorized` は「URL到達は成功・認証は未完了」を意味する。
	- Post-install test では `200` のみを成功条件にせず、`401` を分離して案内する。

7. **Smithery は匿名アクセス可能な実URLを優先して使う**
	- Smithery のサーバー一覧取得は `GET https://api.smithery.ai/servers` を使う。
	- このスキルでは Authorization なしでの取得を前提にし、`q`、`verified`、`isDeployed`、`remote` で候補を絞る。
	- `useCount` と `verified` は有力な補助指標だが、最終判断では GitHub 側の保守状況も必ず確認する。

8. **人気度・ダウンロード数は比較表で明示する**
	- 候補提示時は、少なくとも `GitHub stars`、`updated_at`、`Smithery useCount` の3点を横並びで示す。
	- npm パッケージ候補では、可能なら週次ダウンロード数も追加する。
	- 指標だけで結論を出さず、要件に必要な Tools/Resources を満たすかを必ず併記する。