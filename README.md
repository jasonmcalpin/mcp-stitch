# mcp-stitch

MCP server for Google Stitch. It lets agents generate and retrieve Stitch screens, then export them into local, versioned implementation bundles with HTML, screenshots, linked assets, prompts, source metadata, and build guidance.

## Contents

- [Links](#links)
- [Status](#status)
- [Requirements](#requirements)
- [Install](#install)
- [Environment](#environment)
- [Agent Prompts](#agent-prompts)
- [VS Code Setup](#vs-code-setup)
- [Cursor Setup](#cursor-setup)
- [Continue Setup](#continue-setup)
- [Claude Desktop Setup](#claude-desktop-setup)
- [Claude Code CLI Setup](#claude-code-cli-setup)
- [Gemini CLI Setup](#gemini-cli-setup)
- [Codex Setup](#codex-setup)
- [Tools](#tools)
- [Safety](#safety)
- [Development](#development)
- [Release Script](#release-script)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)
- [Publishing Checklist](#publishing-checklist)

## Links

- npm: https://www.npmjs.com/package/mcp-stitch
- GitHub: https://github.com/jasonmcalpin/mcp-stitch
- Google Stitch: https://stitch.withgoogle.com/
- Model Context Protocol: https://modelcontextprotocol.io/

## Status

Early public release. The server is usable, but the Stitch API surface may evolve.

## Requirements

- Node.js 20 or newer
- A Google API key with access to Stitch

## Install

Most MCP clients can run this package with `npx`:

```bash
npx -y mcp-stitch
```

You normally do not run that command directly in a terminal. Add it to your MCP client configuration as shown below.

After the server starts, ask your agent to call `stitch_info` to confirm the installed package version, or `stitch_status` to check required environment variables.

## Environment

Required:

- `GOOGLE_API_KEY`

Recommended:

- `PROJECT_ROOT`: workspace/project directory where exported Stitch artifacts should be written

Optional:

- `STITCH_API_BASE_URL`: defaults to `https://stitch.googleapis.com/mcp`
- `STITCH_OUTPUT_DIR`: fallback output root when `PROJECT_ROOT` is not set
- `STITCH_TIMEOUT_MS`: defaults to `180000`
- `STITCH_MAX_RETRIES`: defaults to `2`

## Agent Prompts

Use prompts like these after your MCP client is configured.

Create a new Stitch screen and export a local build bundle:

```text
Use mcp-stitch to create a desktop Stitch screen for a guest comments page.
After it finishes, export the screen into a local artifact bundle with HTML, screenshot, linked assets, and rewritten local asset URLs.
Use artifactPath ".artifacts/stitch/guest-comments" and versioned true.
```

Export assets from an existing Stitch screen:

```text
Use mcp-stitch to export screen {screenId} from project {projectId}.
Save it to ".artifacts/stitch/{screen-name}" with versioned true.
Include the HTML, screenshot, linked assets, and rewrite the HTML asset URLs to local files.
```

Find an existing screen first, then export it:

```text
Use mcp-stitch to list screens in project {projectId}.
Find the screen whose title includes "{title or keyword}".
Then export that screen as a local build bundle with includeLinkedAssets true, rewriteHtmlAssetUrls true, and versioned true.
```

Direct tool arguments for the export step:

```json
{
  "projectId": "projects-or-bare-project-id",
  "screenId": "screen-id-or-title-fragment",
  "artifactPath": ".artifacts/stitch/guest-comments",
  "versioned": true,
  "includeHtml": true,
  "includeScreenshot": true,
  "includeLinkedAssets": true,
  "rewriteHtmlAssetUrls": true
}
```

## VS Code Setup

VS Code can load MCP servers from a workspace `.vscode/mcp.json` file or from your user MCP configuration.

For a published npm package, use:

```json
{
  "servers": {
    "stitch": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-stitch"],
      "env": {
        "GOOGLE_API_KEY": "${input:stitchApiKey}",
        "PROJECT_ROOT": "${workspaceFolder}"
      }
    }
  },
  "inputs": [
    {
      "id": "stitchApiKey",
      "type": "promptString",
      "description": "Google API key for Stitch",
      "password": true
    }
  ]
}
```

For local development before publishing, build this repo and point VS Code at the compiled entrypoint:

```json
{
  "servers": {
    "stitch": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/mcp-stitch/dist/index.js"],
      "env": {
        "GOOGLE_API_KEY": "${input:stitchApiKey}",
        "PROJECT_ROOT": "${workspaceFolder}"
      }
    }
  },
  "inputs": [
    {
      "id": "stitchApiKey",
      "type": "promptString",
      "description": "Google API key for Stitch",
      "password": true
    }
  ]
}
```

Open the VS Code Command Palette with `Cmd+Shift+P` on macOS or `Ctrl+Shift+P` on Windows/Linux, then run `MCP: List Servers` to start or restart the server.

After VS Code starts the server, ask your agent to call `stitch_status` to confirm the setup.

## Cursor Setup

In Cursor, open `Cursor Settings > MCP` and add a new server:

- Name: `stitch`
- Type / Transport: `stdio`
- Command: `npx`
- Arguments:
  - `-y`
  - `mcp-stitch`

Environment variables:

- `GOOGLE_API_KEY`: your Google API key
- `PROJECT_ROOT`: absolute path to the project where artifacts should be exported

Cursor may not expand VS Code variables like `${workspaceFolder}`, so use a real absolute path for `PROJECT_ROOT`, for example:

```text
/Users/you/Workspace/my-project
```

You can also use Cursor's MCP JSON config:

```json
{
  "mcpServers": {
    "stitch": {
      "command": "npx",
      "args": ["-y", "mcp-stitch"],
      "env": {
        "GOOGLE_API_KEY": "your-key-here",
        "PROJECT_ROOT": "/absolute/path/to/your/project"
      }
    }
  }
}
```

After adding it, ask Cursor Agent to call `stitch_status`.

## Continue Setup

Continue supports MCP servers in Agent mode. One local setup option is to create a file like:

```text
.continue/mcpServers/stitch.yaml
```

Example:

```yaml
name: Stitch MCP
version: 0.1.0
schema: v1

mcpServers:
  - name: Stitch
    type: stdio
    command: npx
    args:
      - "-y"
      - "mcp-stitch"
    env:
      GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
      PROJECT_ROOT: /absolute/path/to/your/project
```

Use Continue's secrets or your local environment for `GOOGLE_API_KEY`; do not commit a literal key.

## Claude Desktop Setup

Claude Desktop loads MCP servers from its desktop configuration file. On macOS, create or edit:

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

Add `mcp-stitch` under `mcpServers`:

```json
{
  "mcpServers": {
    "stitch": {
      "command": "npx",
      "args": ["-y", "mcp-stitch"],
      "env": {
        "GOOGLE_API_KEY": "your-key-here",
        "PROJECT_ROOT": "/absolute/path/to/your/project"
      }
    }
  }
}
```

If Claude Desktop cannot find `npx`, use the absolute path from `which npx` instead, for example:

```json
{
  "mcpServers": {
    "stitch": {
      "command": "/opt/homebrew/bin/npx",
      "args": ["-y", "mcp-stitch"],
      "env": {
        "GOOGLE_API_KEY": "your-key-here",
        "PROJECT_ROOT": "/absolute/path/to/your/project"
      }
    }
  }
}
```

After saving the config, fully quit and reopen Claude Desktop. Then ask Claude to call `stitch_status` to confirm the setup.

## Claude Code CLI Setup

Claude Code can add stdio MCP servers from the terminal:

```bash
claude mcp add \
  -e GOOGLE_API_KEY=your-key-here \
  -e PROJECT_ROOT=/absolute/path/to/your/project \
  stitch -- npx -y mcp-stitch
```

Then run:

```bash
claude mcp list
```

Start or restart Claude Code in your project and ask it to call `stitch_status`.

## Gemini CLI Setup

Gemini CLI can load MCP servers from user or workspace settings.

For all Gemini CLI projects, create or edit:

```text
~/.gemini/settings.json
```

For just one workspace, create or edit:

```text
.gemini/settings.json
```

Add `mcp-stitch` under `mcpServers`:

```json
{
  "mcpServers": {
    "stitch": {
      "command": "npx",
      "args": ["-y", "mcp-stitch"],
      "env": {
        "GOOGLE_API_KEY": "your-key-here",
        "PROJECT_ROOT": "/absolute/path/to/your/project"
      }
    }
  }
}
```

If Gemini CLI cannot find `npx`, use the absolute path from `which npx` instead:

```json
{
  "mcpServers": {
    "stitch": {
      "command": "/opt/homebrew/bin/npx",
      "args": ["-y", "mcp-stitch"],
      "env": {
        "GOOGLE_API_KEY": "your-key-here",
        "PROJECT_ROOT": "/absolute/path/to/your/project"
      }
    }
  }
}
```

Restart Gemini CLI after saving the settings. Inside Gemini CLI, run `/mcp` to list configured MCP servers and tools, then ask it to call `stitch_status`.

## Codex Setup

In the Codex app, add a new MCP server with the `+` button:

- Name: `stitch`
- Transport: `STDIO`
- Command to launch: `npx`
- Arguments:
  - `-y`
  - `mcp-stitch`

Environment variables:

- `GOOGLE_API_KEY`: your Google API key
- `PROJECT_ROOT`: absolute path to the project where artifacts should be exported

Codex may not expand VS Code variables like `${workspaceFolder}`, so use a real absolute path for `PROJECT_ROOT`, for example:

```text
/Users/you/Workspace/my-project
```

After adding the server, restart or reconnect it and ask Codex to call `stitch_status`.

For Codex CLI, add the server from the terminal:

```bash
codex mcp add stitch \
  --env GOOGLE_API_KEY=your-key-here \
  --env PROJECT_ROOT=/absolute/path/to/your/project \
  -- npx -y mcp-stitch
```

Then run:

```bash
codex mcp list
```

Start or restart Codex in your project and ask it to call `stitch_status`.

For manual Codex CLI setup, add a stdio MCP server to your Codex config, usually:

```text
~/.codex/config.toml
```

Example:

```toml
[mcp_servers.stitch]
command = "npx"
args = ["-y", "mcp-stitch"]

[mcp_servers.stitch.env]
GOOGLE_API_KEY = "your-key-here"
PROJECT_ROOT = "/absolute/path/to/your/project"
```

Keep this in your local Codex config if it contains a real API key.

## Tools

- `stitch_status`
- `stitch_info`
- `stitch_list_projects`
- `stitch_get_project`
- `stitch_create_project`
- `stitch_list_screens`
- `stitch_get_screen`
- `stitch_generate_screen_from_text`
- `stitch_edit_screens`
- `stitch_generate_variants`
- `stitch_upload_design_md`
- `stitch_create_design_system`
- `stitch_create_design_system_from_design_md`
- `stitch_update_design_system`
- `stitch_list_design_systems`
- `stitch_apply_design_system`
- `stitch_export_screen_artifact`

Mutating tools require `confirm: true`.

`stitch_export_screen_artifact` can also download build handoff assets into the artifact bundle. By default it saves `screen.html` and `screenshot.*` when Stitch provides those URLs. Set `includeLinkedAssets: true` to download safe HTTPS assets referenced by the HTML into `assets/`, and `rewriteHtmlAssetUrls: true` to point the saved HTML at those local files.

Set `versioned: true` to keep repeated exports or variations in nested folders such as `.artifacts/stitch/comment-section/v001`, then `v002`, while keeping each screen's assets together.

## Safety

- Secrets are read from environment variables and are not printed by `stitch_status`.
- `STITCH_API_BASE_URL` defaults to Google's Stitch MCP endpoint.
- Artifact export paths are constrained to `PROJECT_ROOT` or `STITCH_OUTPUT_DIR`.
- Linked asset export skips non-HTTPS and private/local hosts, and enforces count/size limits.
- Mutating Stitch tools require `confirm: true`.

Do not commit `.env`, generated artifact bundles, or Stitch output directories. This repo's `.gitignore` excludes the common local output paths.

## Development

```bash
npm install
npm run build
npm run dev
```

## Release Script

Maintainers can publish a release and push the matching Git commit/tag with:

```bash
npm run release
```

The script defaults to a patch release. You can pass another npm version bump:

```bash
npm run release -- minor
```

It runs `npm version`, builds, previews the npm package, asks for confirmation before publishing, then commits, tags, and pushes the release.

## Contributing

Issues and pull requests are welcome. Please keep changes focused on the Stitch MCP server surface, avoid committing generated Stitch artifacts, and run:

```bash
npm run build
npm pack --dry-run
```

before opening a pull request.

## Security

Please do not open public issues containing API keys, private project IDs, exported Stitch payloads, or other sensitive data. If a report requires private details, open a minimal issue first and note that you need a private disclosure path.

## License

ISC. See [LICENSE](LICENSE).

## Publishing Checklist

```bash
npm run release
```

See [docs/stitch-tools.md](docs/stitch-tools.md) for detailed tool inputs and Stitch contract notes.
