'use strict';

const { parseArgs } = require('node:util');

// CLI の既定値と、検索対象となる外部 API のエンドポイント。
const DEFAULT_LIMIT = 20;
const REGISTRY_ENDPOINT = 'https://registry.modelcontextprotocol.io/v0.1/servers';
const SMITHERY_ENDPOINT = 'https://api.smithery.ai/servers';
const GITHUB_ENDPOINT = 'https://api.github.com/search/repositories';
const USER_AGENT = '@tetradice/mcp-server-search/0.1.0';

// 使い方を標準エラー出力に表示する。
function printUsage() {
  console.error(
    'Usage: node script/mcp-server-search.js [query] [--limit 20] [--compact]\n\nExamples:\n  node script/mcp-server-search.js github\n  node script/mcp-server-search.js postgres --limit 10\n  node script/mcp-server-search.js slack --compact'
  );
}

// 引数を解析し、検索を実行して JSON を出力する CLI の入口。
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      limit: {
        type: 'string',
        short: 'l',
        default: String(DEFAULT_LIMIT)
      },
      compact: {
        type: 'boolean',
        default: false
      },
      help: {
        type: 'boolean',
        short: 'h',
        default: false
      }
    }
  });

  if (values.help) {
    printUsage();
    process.exit(0);
  }

  const limit = Number.parseInt(values.limit, 10);

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    console.error('--limit must be an integer between 1 and 100.');
    printUsage();
    process.exit(1);
  }

  const query = positionals.join(' ').trim();
  const result = await searchMcpServers({ query, limit });
  const spacing = values.compact ? 0 : 2;
  process.stdout.write(`${JSON.stringify(result, null, spacing)}\n`);
}

// 各ソースを並列検索し、正規化済み候補と集計情報を返す。
async function searchMcpServers(options = {}) {
  const query = typeof options.query === 'string' ? options.query.trim() : '';
  const limit = normalizeLimit(options.limit);
  const requests = buildRequests({ query, limit });
  const settled = await Promise.allSettled(requests.map((request) => fetchJson(request)));
  const normalized = [];
  const sources = {};

  // ソースごとの成功・失敗を保ちながら結果を積み上げる。
  for (let index = 0; index < requests.length; index += 1) {
    const request = requests[index];
    const outcome = settled[index];

    if (outcome.status === 'fulfilled') {
      const records = request.normalize(outcome.value.payload);
      normalized.push(...records);
      sources[request.source] = {
        ok: true,
        requestUrl: request.url,
        count: records.length
      };
      continue;
    }

    sources[request.source] = {
      ok: false,
      requestUrl: request.url,
      count: 0,
      error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)
    };
  }

  const merged = mergeCandidates(normalized);
  const successfulSources = Object.entries(sources)
    .filter(([, source]) => source.ok)
    .map(([source]) => source);
  const failedSources = Object.entries(sources)
    .filter(([, source]) => !source.ok)
    .map(([source]) => source);

  return {
    query,
    limitPerSource: limit,
    requestedAt: new Date().toISOString(),
    summary: {
      totalNormalized: normalized.length,
      totalMerged: merged.length,
      successfulSources,
      failedSources
    },
    sources,
    normalized,
    merged
  };
}

// 正規化済み候補を統合キーごとにまとめ、重複を解消する。
function mergeCandidates(records) {
  const mergedByKey = new Map();

  for (const record of records) {
    const key = deriveCanonicalKey(record);
    const existing = mergedByKey.get(key);

    if (!existing) {
      mergedByKey.set(key, createMergedRecord(key, record));
      continue;
    }

    mergeRecord(existing, record);
  }

  return Array.from(mergedByKey.values()).sort(compareMergedRecords);
}

// Official MCP Registry のレスポンスを共通スキーマへ変換する。
function normalizeRegistryRecords(payload) {
  const servers = Array.isArray(payload && payload.servers) ? payload.servers : [];

  return servers.map((entry) => {
    const server = (entry && entry.server) || {};
    const registryMeta = (entry && entry._meta && entry._meta['io.modelcontextprotocol.registry/official']) || {};
    const install = resolveRegistryInstall(server);

    return {
      source: 'registry',
      id: server.name || null,
      name: server.name || null,
      displayName: getDisplayName(server.name),
      description: server.description || null,
      repositoryUrl: (server.repository && server.repository.url) || null,
      homepage: getRemoteUrl(server.remotes) || null,
      installKind: install.kind,
      installTarget: install.target,
      verified: null,
      remote: Array.isArray(server.remotes) ? server.remotes.length > 0 : null,
      isDeployed: null,
      useCount: null,
      stars: null,
      updatedAt: registryMeta.updatedAt || null,
      publishedAt: registryMeta.publishedAt || null,
      pushedAt: null,
      registryStatus: registryMeta.status || null
    };
  });
}

// Smithery のレスポンスを共通スキーマへ変換する。
function normalizeSmitheryRecords(payload) {
  const servers = Array.isArray(payload && payload.servers) ? payload.servers : [];

  return servers.map((server) => ({
    source: 'smithery',
    id: server.id || null,
    name: server.qualifiedName || null,
    displayName: server.displayName || server.qualifiedName || null,
    description: server.description || null,
    repositoryUrl: extractGitHubRepositoryUrl(server.homepage),
    homepage: server.homepage || null,
    installKind: server.remote ? 'http' : 'unknown',
    installTarget: null,
    verified: toNullableBoolean(server.verified),
    remote: toNullableBoolean(server.remote),
    isDeployed: toNullableBoolean(server.isDeployed),
    useCount: normalizeNumber(server.useCount),
    stars: null,
    updatedAt: null,
    publishedAt: server.createdAt || null,
    pushedAt: null,
    registryStatus: null
  }));
}

// GitHub リポジトリ検索結果を共通スキーマへ変換する。
function normalizeGithubRecords(payload) {
  const repositories = Array.isArray(payload && payload.items) ? payload.items : [];

  return repositories.map((repository) => ({
    source: 'github',
    id: repository.id || null,
    name: repository.full_name || repository.name || null,
    displayName: repository.name || repository.full_name || null,
    description: repository.description || null,
    repositoryUrl: repository.html_url || null,
    homepage: repository.homepage || null,
    installKind: 'unknown',
    installTarget: null,
    verified: null,
    remote: null,
    isDeployed: null,
    useCount: null,
    stars: normalizeNumber(repository.stargazers_count),
    updatedAt: repository.updated_at || null,
    publishedAt: repository.created_at || null,
    pushedAt: repository.pushed_at || null,
    registryStatus: null
  }));
}

// 各ソース向けのリクエスト定義をまとめて組み立てる。
function buildRequests({ query, limit }) {
  return [
    {
      source: 'registry',
      url: buildRegistryUrl(query, limit),
      headers: {
        Accept: 'application/json, application/problem+json',
        'User-Agent': USER_AGENT
      },
      normalize: normalizeRegistryRecords
    },
    {
      source: 'smithery',
      url: buildSmitheryUrl(query, limit),
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT
      },
      normalize: normalizeSmitheryRecords
    },
    {
      source: 'github',
      url: buildGithubUrl(query, limit),
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': USER_AGENT
      },
      normalize: normalizeGithubRecords
    }
  ];
}

// HTTP リクエストを実行し、JSON 解析エラーも文脈付きで扱う。
async function fetchJson(request) {
  const response = await fetch(request.url, { headers: request.headers });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`${request.source} request failed with HTTP ${response.status}: ${body.slice(0, 240)}`);
  }

  let payload;

  try {
    payload = JSON.parse(body);
  } catch (error) {
    throw new Error(`${request.source} returned non-JSON data: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { payload };
}

// Registry API 向けの検索 URL を生成する。
function buildRegistryUrl(query, limit) {
  const url = new URL(REGISTRY_ENDPOINT);

  if (query) {
    url.searchParams.set('search', query);
  }

  url.searchParams.set('version', 'latest');
  url.searchParams.set('limit', String(limit));
  return url.toString();
}

// Smithery API 向けの検索 URL を生成する。
function buildSmitheryUrl(query, limit) {
  const url = new URL(SMITHERY_ENDPOINT);

  if (query) {
    url.searchParams.set('q', query);
  }

  url.searchParams.set('page', '1');
  url.searchParams.set('pageSize', String(limit));
  return url.toString();
}

// GitHub Search API 向けの検索 URL を生成する。
function buildGithubUrl(query, limit) {
  const url = new URL(GITHUB_ENDPOINT);
  const githubQuery = query ? `topic:mcp-server ${query}` : 'topic:mcp-server';

  url.searchParams.set('q', githubQuery);
  url.searchParams.set('sort', 'stars');
  url.searchParams.set('order', 'desc');
  url.searchParams.set('per_page', String(limit));
  return url.toString();
}

// 統合候補の初期オブジェクトを 1 件ぶん作成する。
function createMergedRecord(key, record) {
  return {
    key,
    name: record.name,
    displayName: record.displayName,
    description: record.description,
    repositoryUrl: record.repositoryUrl,
    homepage: record.homepage,
    installKind: record.installKind,
    installTarget: record.installTarget,
    verified: record.verified,
    remote: record.remote,
    isDeployed: record.isDeployed,
    useCount: record.useCount,
    stars: record.stars,
    updatedAt: record.updatedAt,
    publishedAt: record.publishedAt,
    pushedAt: record.pushedAt,
    registryStatus: record.registryStatus,
    sources: [record.source],
    sourceRecords: [record]
  };
}

// 既存の統合候補に、別ソースから来た情報を上書き統合する。
function mergeRecord(existing, record) {
  if (!existing.sources.includes(record.source)) {
    existing.sources.push(record.source);
  }

  existing.sourceRecords.push(record);
  existing.displayName = preferString(existing.displayName, record.displayName);
  existing.name = preferString(existing.name, record.name);
  existing.description = preferLongerString(existing.description, record.description);
  existing.repositoryUrl = preferString(existing.repositoryUrl, record.repositoryUrl);
  existing.homepage = preferString(existing.homepage, record.homepage);
  existing.installKind = preferInstallKind(existing.installKind, record.installKind);
  existing.installTarget = preferString(existing.installTarget, record.installTarget);
  existing.verified = mergeBoolean(existing.verified, record.verified);
  existing.remote = mergeBoolean(existing.remote, record.remote);
  existing.isDeployed = mergeBoolean(existing.isDeployed, record.isDeployed);
  existing.useCount = maxNumber(existing.useCount, record.useCount);
  existing.stars = maxNumber(existing.stars, record.stars);
  existing.updatedAt = latestDate(existing.updatedAt, record.updatedAt);
  existing.publishedAt = latestDate(existing.publishedAt, record.publishedAt);
  existing.pushedAt = latestDate(existing.pushedAt, record.pushedAt);
  existing.registryStatus = preferString(existing.registryStatus, record.registryStatus);
}

// 人気度と利用度を優先して最終候補の並び順を決める。
function compareMergedRecords(left, right) {
  const leftStars = left.stars == null ? -1 : left.stars;
  const rightStars = right.stars == null ? -1 : right.stars;

  if (leftStars !== rightStars) {
    return rightStars - leftStars;
  }

  const leftUseCount = left.useCount == null ? -1 : left.useCount;
  const rightUseCount = right.useCount == null ? -1 : right.useCount;

  if (leftUseCount !== rightUseCount) {
    return rightUseCount - leftUseCount;
  }

  return String(left.displayName || left.name || '').localeCompare(String(right.displayName || right.name || ''));
}

// リポジトリ URL やホームページから、候補を一意に寄せるキーを決める。
function deriveCanonicalKey(record) {
  const repositoryUrl = normalizeUrl(record.repositoryUrl);

  if (repositoryUrl) {
    return repositoryUrl;
  }

  const homepageRepositoryUrl = normalizeUrl(extractGitHubRepositoryUrl(record.homepage));

  if (homepageRepositoryUrl) {
    return homepageRepositoryUrl;
  }

  const homepage = normalizeMeaningfulHomepage(record.homepage);

  if (homepage) {
    return homepage;
  }

  return String(record.name || record.displayName || record.id || 'unknown').trim().toLowerCase();
}

// Registry のメタデータからインストール方法を推定する。
function resolveRegistryInstall(server) {
  const remoteUrl = getRemoteUrl(server.remotes);

  if (remoteUrl) {
    return {
      kind: 'http',
      target: remoteUrl
    };
  }

  const packageName = extractPackageName(server.packages);

  if (packageName) {
    return {
      kind: 'npm',
      target: packageName
    };
  }

  return {
    kind: 'unknown',
    target: null
  };
}

// remote 定義の中から最初に使える URL を取り出す。
function getRemoteUrl(remotes) {
  if (!Array.isArray(remotes)) {
    return null;
  }

  const firstRemoteWithUrl = remotes.find((remote) => typeof (remote && remote.url) === 'string' && remote.url.trim());
  return firstRemoteWithUrl ? firstRemoteWithUrl.url : null;
}

// packages のネストを再帰的にたどって npm パッケージ名を探す。
function extractPackageName(packages) {
  if (!packages) {
    return null;
  }

  if (typeof packages === 'string' && packages.trim()) {
    return packages;
  }

  if (Array.isArray(packages)) {
    for (const entry of packages) {
      const value = extractPackageName(entry);

      if (value) {
        return value;
      }
    }

    return null;
  }

  if (typeof packages === 'object') {
    if (typeof packages.name === 'string' && packages.name.trim()) {
      return packages.name;
    }

    if (typeof packages.package === 'string' && packages.package.trim()) {
      return packages.package;
    }

    for (const value of Object.values(packages)) {
      const nestedValue = extractPackageName(value);

      if (nestedValue) {
        return nestedValue;
      }
    }
  }

  return null;
}

// owner/name 形式から表示用の末尾名を取り出す。
function getDisplayName(name) {
  if (typeof name !== 'string' || !name.trim()) {
    return null;
  }

  const parts = name.split('/');
  return parts[parts.length - 1] || name;
}

// 任意 URL から GitHub リポジトリ URL だけを抽出する。
function extractGitHubRepositoryUrl(url) {
  if (typeof url !== 'string' || !url.trim()) {
    return null;
  }

  try {
    const parsed = new URL(url);

    if (parsed.hostname !== 'github.com') {
      return null;
    }

    const segments = parsed.pathname.split('/').filter(Boolean);

    if (segments.length < 2) {
      return null;
    }

    return `https://github.com/${segments[0]}/${segments[1]}`;
  } catch {
    return null;
  }
}

// URL の末尾差分や .git をならして比較しやすくする。
function normalizeUrl(url) {
  if (typeof url !== 'string' || !url.trim()) {
    return null;
  }

  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.search = '';
    parsed.pathname = parsed.pathname.replace(/\.git$/i, '').replace(/\/+$/, '');
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return url.trim().replace(/\.git$/i, '').replace(/\/+$/, '').toLowerCase();
  }
}

// トップページだけの URL を除外し、意味のある homepage のみ使う。
function normalizeMeaningfulHomepage(url) {
  if (typeof url !== 'string' || !url.trim()) {
    return null;
  }

  try {
    const parsed = new URL(url);

    if (!parsed.pathname || parsed.pathname === '/') {
      return null;
    }

    return normalizeUrl(url);
  } catch {
    return null;
  }
}

// limit を安全な整数範囲へ丸め込む。
function normalizeLimit(limit) {
  const numericLimit = Number.parseInt(limit == null ? DEFAULT_LIMIT : limit, 10);

  if (!Number.isInteger(numericLimit) || numericLimit < 1 || numericLimit > 100) {
    return DEFAULT_LIMIT;
  }

  return numericLimit;
}

// 数値系フィールドは有限な number のみ受け入れる。
function normalizeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// 複数候補から、より具体的で有用な値を優先して採用する。
function preferInstallKind(currentValue, nextValue) {
  if (!currentValue || currentValue === 'unknown') {
    return nextValue || currentValue;
  }

  return currentValue;
}

function preferString(currentValue, nextValue) {
  if (typeof currentValue === 'string' && currentValue.trim()) {
    return currentValue;
  }

  return typeof nextValue === 'string' && nextValue.trim() ? nextValue : currentValue || null;
}

function preferLongerString(currentValue, nextValue) {
  const currentText = typeof currentValue === 'string' ? currentValue.trim() : '';
  const nextText = typeof nextValue === 'string' ? nextValue.trim() : '';

  if (!currentText) {
    return nextText || currentValue || null;
  }

  if (nextText.length > currentText.length) {
    return nextText;
  }

  return currentValue;
}

function maxNumber(currentValue, nextValue) {
  if (typeof currentValue !== 'number') {
    return typeof nextValue === 'number' ? nextValue : currentValue || null;
  }

  if (typeof nextValue !== 'number') {
    return currentValue;
  }

  return Math.max(currentValue, nextValue);
}

function latestDate(currentValue, nextValue) {
  if (!currentValue) {
    return nextValue || null;
  }

  if (!nextValue) {
    return currentValue;
  }

  return Date.parse(nextValue) > Date.parse(currentValue) ? nextValue : currentValue;
}

function mergeBoolean(currentValue, nextValue) {
  if (currentValue === true || nextValue === true) {
    return true;
  }

  if (currentValue === false || nextValue === false) {
    return false;
  }

  return null;
}

function toNullableBoolean(value) {
  if (typeof value !== 'boolean') {
    return null;
  }

  return value;
}

// 予期しない失敗時はメッセージを表示して非ゼロ終了する。
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});