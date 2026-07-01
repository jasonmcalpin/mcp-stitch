# mcp-stitch

MCP server for Google Stitch. It exposes Stitch project, screen, design-system, generation, edit, variant, and artifact export tools over stdio for VS Code and other MCP-compatible agents.

## Contents

- [Links](#links)
- [Status](#status)
- [Requirements](#requirements)
- [Install](#install)
- [Environment](#environment)
- [VS Code Setup](#vs-code-setup)
- [Cursor Setup](#cursor-setup)
- [Continue Setup](#continue-setup)
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

## Environment

Required:

- `GOOGLE_API_KEY`

Recommended:

- `PROJECT_ROOT`: workspace/project directory where exported Stitch artifacts should be written

Optional:

- `STITCH_API_BASE_URL`: defaults to `https://stitch.googleapis.com/mcp`
- `STITCH_OUTPUT_DIR`: fallback output root when `PROJECT_ROOT` is not set
- `STITCH_TIMEOUT_MS`: defaults to `30000`
- `STITCH_MAX_RETRIES`: defaults to `2`

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

For Codex CLI or manual setup, add a stdio MCP server to your Codex config, usually:

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

## Safety

- Secrets are read from environment variables and are not printed by `stitch_status`.
- `STITCH_API_BASE_URL` defaults to Google's Stitch MCP endpoint.
- Artifact export paths are constrained to `PROJECT_ROOT` or `STITCH_OUTPUT_DIR`.
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
