# mcp-stitch

MCP server for Google Stitch. It exposes Stitch project, screen, design-system, generation, edit, variant, and artifact export tools over stdio for VS Code and other MCP-compatible agents.

## Requirements

- Node.js 20 or newer
- A Google API key with access to Stitch

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

After VS Code starts the server, ask your agent to call `stitch_status` to confirm the setup.

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

## Development

```bash
npm install
npm run build
npm run dev
```

## Publishing Checklist

```bash
npm run build
npm pack --dry-run
npm publish
```

See [docs/stitch-tools.md](docs/stitch-tools.md) for detailed tool inputs and Stitch contract notes.
