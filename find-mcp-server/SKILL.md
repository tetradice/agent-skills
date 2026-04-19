---
name: find-mcp-server
description: Helps discover, compare, install, and connect public MCP (Model Context Protocol) servers through add-mcp. Use it proactively when the user asks for MCP servers for databases, external APIs, file operations, GitHub integrations, or similar needs.
license: CC0
metadata:
  author: Dice <tetradice@gmail.com>
  version: "1.0.0"
---

# Find MCP Server (Search and Installation)

This skill helps the user discover the public MCP server that best matches their goal, validate it, install it, and run a basic post-install test.

## When to use this skill

Use this skill when the user does any of the following:

- Asks whether there is an MCP server that can integrate with a target such as X, or asks you to find an MCP tool for X
- Wants to add a new external integration to the agent, such as a database, API, or tool
- Mentions controlling an existing system or service from an AI agent

## Primary commands

This skill mainly uses the `npx add-mcp` command to manage MCP servers. For candidate discovery, prefer the published npm CLI that aggregates three search APIs into a single command.

**Primary commands:**

- `npx add-mcp [npm-package-name]` - Install an MCP server that is distributed as an npm package
- `npx add-mcp "[execution-command]"` - Install any stdio-based MCP server. The quoted command must include at least one argument, which means it must contain at least one ASCII space.
- `npx add-mcp [HTTP URL]` - Install an MCP server directly from a URL
- `npx @tetradice/mcp-server-search [query] --limit 30` - Search Official MCP Registry, Smithery, and the GitHub REST API in parallel and return normalized JSON

## Steps for introducing an MCP server

### Step 1: Understand the user's need

Identify exactly what the user wants:

1. The target they want to integrate with, such as PostgreSQL, GitHub, Slack, or Notion
2. The concrete actions they want to perform, such as running queries, creating pull requests, or sending messages

### Step 2: Search for MCP servers

For candidate discovery, use the published npm CLI `npx @tetradice/mcp-server-search [query]`. Internally, this CLI collects data from **Official MCP Registry**, **Smithery REST API**, and **GitHub REST API**, then normalizes the results into a common JSON format. You may consult **mcp.so (MCP Directory)** as a secondary source when useful, but prioritize the data returned by the CLI when selecting recommended candidates.

If you find an MCP server that appears to be officially provided and it satisfies the user's requirements, treat that candidate as the preferred option. For example, if the user wants a GitHub integration and there is an official GitHub MCP server that provides the needed tools, present it before community implementations.

However, if the official candidate does not satisfy the required tools or operational conditions, you may prioritize a non-official candidate instead. In that case, explicitly say that there was an official candidate but it was not selected because it did not meet the current requirements.

Base your judgment in this step on the results of `npx @tetradice/mcp-server-search [query]`. If the CLI reports `sources.registry.ok`, `sources.smithery.ok`, and `sources.github.ok` all as `true`, treat that run as confirmation that Official MCP Registry, Smithery REST API, and GitHub REST API were all checked.

Do not use `npx add-mcp find`. That command adds the discovered MCP server directly into the workspace.

#### 2-0. Search with the aggregated CLI first

Start by running the aggregated CLI like this. In VS Code, this usually means you only need to approve external access once, and this npm package form is also the standard command expected where the skill is published.

Example:

```bash
npx @tetradice/mcp-server-search github --limit 30
```

At minimum, confirm the following in the output.

1. `sources.registry.ok`
2. `sources.smithery.ok`
3. `sources.github.ok`
4. The candidates in `merged[]`
5. Source-specific details in `normalized[]`

You must confirm that `sources.registry.ok`, `sources.smithery.ok`, and `sources.github.ok` are all `true` directly from the JSON output of that specific CLI run. Do not combine README text, GitHub searches, or separate API calls and then claim that all three sources were checked. If any of them is `false` or still unverified, say so explicitly and continue only as supplemental investigation.

If the query is too broad and produces too much noise, you may narrow it while preserving the three-source check. For example, if `github` is too noisy, narrow it to `github-mcp-server`, `topic:mcp-server github`, or a query that includes the vendor name. When you do this, leave a short note in the user-facing explanation describing the final query and why you narrowed it.

Also, if the user is looking for a service name that likely has an official organization or official docs, such as Slack, GitHub, Supabase, or Vercel, but no official-looking candidate appears in `merged[]` or standard follow-up search, perform an additional direct vendor check even after all three sources succeed. Verify primary sources such as the official organization, official docs, or the vendor's official blog as needed. This is not a replacement for the three-source check. It is an additional verification step to avoid missing official candidates.

When presenting candidates to the user, only use real data that has already been retrieved at that point for names, star counts, update dates, tool lists, and installation methods. Do not populate a comparison table with hypothetical candidates or invented metrics before doing the actual search. Mark missing items as unverified.

If the required search commands or verification steps cannot be executed in the environment, do not fabricate tentative candidates or a speculative comparison table. Report exactly what was not run and what remains unverified, then stop there.

#### 2-4. Prioritize official candidates

If one of the candidates appears to be an MCP server provided by the official vendor, treat it as the top candidate as long as it satisfies the user's requirements.

`search=github` is noisy, and registry entries under `io.github.*` can include arbitrary servers hosted on GitHub rather than GitHub integration servers. Do not treat a candidate as official based only on the name or registry listing. Always verify the publisher.

To judge whether a candidate is official, confirm at least the following.

1. The GitHub repository owner matches the target service's official organization or vendor
2. `homepage` or `repositoryUrl` points to the target service's official domain or official GitHub namespace
3. The README, description, or publisher information contains primary-source evidence equivalent to official or official integration
4. Even if it appears in Registry or Smithery, do not conclude that it is official without verifying the publisher information
5. Even if Registry exposes metadata such as `official`, `featured`, or listing status, do not use that as proof of vendor official status

If the vendor documents a hosted MCP endpoint in official docs or an official plugin/config repository, you may still treat it as an official candidate even if the server implementation source code is not public. In that case, describe it as a hosted MCP endpoint referenced by official docs or an official repository, and do not present it as equivalent to a local OSS implementation repository.

As needed, reinforce the maintenance assessment by checking the repository description, archived status, last update time, star count, and similar signals.

Even if a Smithery listing has a plausible-looking `displayName` or `homepage`, do not treat it as official based on Smithery alone unless you can confirm `repoOwner`, `repoName`, `repositoryUrl`, or a detailed URL under the official vendor domain. In that case, keep it in the comparison table as a promising candidate with insufficient publisher verification, and prioritize fully verified candidates in the final recommendation.

If a listing does not expose `repoOwner`, `repoName`, or `repositoryUrl`, treat it only as a supplemental candidate or reference entry even when you include it in the comparison table. Do not rank it above candidates whose publisher has been verified.

Also, when the user is searching for a generic technology name such as `postgres`, `filesystem`, or `git`, treat service-specific candidates such as Neon, Supabase, or PlanetScale as separate or conditional candidates. Unless the user explicitly named that service, do not rank a service-specific candidate above a generic one.

The basic priority order is as follows.

1. Official candidates that satisfy the requirements
2. Non-official candidates that satisfy the requirements and have stronger safety and maintenance signals
3. Among those, candidates with stronger popularity and adoption

Examples:

- If you are looking for a GitHub MCP server and find an official GitHub candidate such as `github/github-mcp-server` that provides the required tools, present it first
- If the official candidate only supports read-oriented tools while the user needs issue creation or pull request operations, it is acceptable to rank a better-fitting non-official candidate above it

#### 2-5. Always compare popularity and adoption metrics

When narrowing candidates, verify not only functional fit but also quantitative popularity and adoption indicators. This is especially important when multiple candidates provide similar functionality.

1. GitHub `stargazers_count` for community support
2. GitHub `updated_at` for recent maintenance activity
3. Smithery `useCount` and `verified` for actual usage and verification status
4. Weekly download counts for npm packages, for example via the npm registry API or public npmjs statistics

Notes:
- If an official candidate satisfies the requirements, do not rank a non-official candidate higher based only on popularity
- Do not adopt a candidate just because star count or download count is high if the necessary tools are missing
- Conversely, even if usage numbers are low, keep a candidate if it is official and highly relevant
- The final judgment order is functional fit, then safety and maintenance including official status, then popularity

### Step 3: Validate quality and pre-check tools (important)

After finding search results, validate the quality and functionality before recommending them.
If possible, temporarily start the MCP server and inspect the list of provided tools and resources.

If you are checking tool lists or configuration examples from a README, prefer `https://raw.githubusercontent.com/.../README.md` over `github.com/.../tree/...`.

1. **Tool check**: Does the server include the tools the user needs for the desired operations, such as read or write?
2. **Reliability**: First confirm whether the official vendor provides it, then also check community signals such as GitHub stars and update status

However, if the current request is only to compare candidates, not to install yet, or to evaluate in read-only mode, do not force installation or startup only for validation. In that case, compare candidates based on public information such as README files, Registry, Smithery, and the GitHub API, and explicitly state that live verification of the tool list has not been completed.

### Step 4: Present options to the user

Once you find MCP servers that satisfy the requirements, first present the candidate information briefly and confirm whether the user wants to install one of them. This confirmation may happen in normal conversation.

If there is an official candidate, place it first in the presented options and clearly state that it is official. Do not list a non-official candidate first unless the official candidate does not satisfy the requirements.

Only when the user explicitly says they want to install should you use the `askQuestions` tool to confirm the necessary details.

At that point, if there is already at least one valid candidate, move directly into `askQuestions` in the first reply that presents the candidates. Do not ask for a freeform yes or no first and only switch to `askQuestions` in the next turn.

- If there are multiple candidates and the user has not yet specified which one to install, use `askQuestions` to confirm all of the following.
  1. Which MCP server to install
  2. Whether to install it for the project or globally
  3. What display name to use for the MCP server

- If there is only one candidate, or the install target is already clear even with multiple candidates, use `askQuestions` to confirm the following.
  1. Whether to install it for the project or globally
  2. What display name to use for the MCP server

If the user says they do not want to install, stop the process at that point.

Before asking, show at least the following for each candidate.

1. MCP server name
2. Summary
3. Main tools or capabilities confirmed in Step 3
4. Expected installation method, whether npm package, execution command, or HTTP URL
5. Popularity and adoption indicators such as GitHub stars, last update date, Smithery `useCount`, or weekly npm downloads
6. Whether it is an official candidate, and if not, why not

In the initial candidate presentation, you do not need to enumerate the full tool list. It is enough to show three to five representative tools, resources, or capability categories that are sufficient for the user's decision. Authentication methods and transport details can be confirmed after the candidate is chosen and you move into installation.

If the same candidate appears from multiple sources such as Registry, Smithery, and GitHub, merge them into a single row only when you have verified that they refer to the same candidate through matching `repositoryUrl`, repo owner/name, install target, official endpoint, or equivalent evidence. If not, keep them separate and explicitly say that they may be the same candidate but it is not confirmed.

As a rule, the first `askQuestions` set should stay limited to the required items defined in this step. Authentication method, transport, Docker availability, and additional environment variables should be deferred if they only become meaningful after the candidate is fixed. However, if there is only one candidate and extra information is required immediately to finalize the install command, you may include it in the same `askQuestions` call.

Example `askQuestions` structure:

```
There are two candidates that fit your request. If you want to install one, use the askQuestions tool to choose the required details.

- Candidate A: mcp-server-github
	- Summary: Supports GitHub repository search, issue creation, and pull request review
	- Main tools: search_repositories, create_issue
	- Installation method: npm package
- Candidate B: github-mcp-server
	- Summary: Supports GitHub repository operations and issue lookup
	- Main tools: search_code, list_issues
	- Installation method: npm package

Use askQuestions to confirm:
1. Which MCP server to install, if not already specified
2. Whether to install it for the project or globally
3. What display name to use for the MCP server
```

### Step 5: Run the installation

If the user wants installation and `askQuestions` has fixed the install target, scope, and display name, execute the installation according to those choices. If the user says not to install, stop there.

**For npm package-based servers, meaning servers that can be run with `npx -y [npm-package-name]`:**
```bash
npx add-mcp [npm-package-name]
```

**For other stdio-based MCP servers whose execution command includes at least one argument:**
```bash
npx add-mcp "[execution-command arg1 arg2 ...]"
```

**For direct HTTP URL installation:**
```bash
npx add-mcp [HTTP URL]
```

If none of those forms applies, check whether the installation can be handled by manually editing the MCP JSON file.
If that is possible, use the `askQuestions` tool to confirm whether the user is okay with directly editing the JSON file, then do so.
If that is not possible, tell the user that the current `add-mcp` command cannot install it and propose an alternative, such as helping them build a custom MCP server.

If `add-mcp` uses different options for global versus project installation, select the appropriate form based on the user's choice. If the display name needs to be reflected, use the `-n` or `--name` option with the value confirmed through `askQuestions`.

Example:

```bash
# Add it for VS Code at the project level
npx add-mcp -a vscode -n my-github github-mcp-server

# Add it for VS Code globally
npx add-mcp -a vscode -g -n my-github github-mcp-server
```

### Step 6: Start it and run a post-install test

After installation, always start the actual MCP server and run a basic functionality check.

1. Attach the MCP server to the agent and start it
2. If environment variables or credentials such as API keys are required, explain to the user how to set them
3. Run a safe tool exposed by the server, such as a read-only tool or a `ping`-style check, and confirm that it returns a valid result. If an authentication-required remote MCP responds with `401 Unauthorized`, treat that as successful endpoint reachability with incomplete authentication.
4. Verify the installation with `add-mcp list` in both local and global scopes
	- `npx add-mcp list -a vscode`
	- `npx add-mcp list -a vscode -g`
5. Report the test result to the user and state that the setup is ready

## Common MCP server categories

Use the following categories and query examples as search hints:

| Category | Example search keywords | Common use cases |
| --- | --- | --- |
| Database | `postgres`, `sqlite`, `mysql` | Data search, aggregation, writes |
| Development tools | `github`, `gitlab`, `git` | Code search, PR creation, issue management |
| Communication | `slack`, `discord` | Sending messages, reading channels |
| Files and OS | `filesystem`, `bash`, `cli` | Local file operations, command execution |
| Information lookup | `brave`, `google`, `wikipedia` | Web search, current information retrieval |

## If no MCP server is found or the functionality is insufficient

If no MCP server satisfies the user's goal:

1. Tell the user that existing MCP servers do not satisfy the requirement
2. Propose alternative approaches, such as using the agent's built-in capabilities
3. Propose **developing a custom MCP server**, for example by offering to help build a dedicated MCP server in Python or TypeScript