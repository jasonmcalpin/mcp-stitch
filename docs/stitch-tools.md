# Stitch MCP Tools

This server exposes Stitch project, screen, design-system, DESIGN.md import, generation, and safe artifact export helpers.

## Required environment variables

- GOOGLE_API_KEY

## Recommended environment variables

- PROJECT_ROOT (workspace/project directory where Stitch artifacts should be exported)

## Optional environment variables

- STITCH_API_BASE_URL (default: https://stitch.googleapis.com/mcp)
- STITCH_TIMEOUT_MS (default: 30000)
- STITCH_MAX_RETRIES (default: 2)
- STITCH_OUTPUT_DIR (default: PROJECT_ROOT/stitch-output or cwd/stitch-output)

## Tools

Mutating tools are marked `MUTATING` and require `confirm: true`. Without confirmation they return a safe refusal describing the operation that would run.

1. stitch_status
- Checks Stitch MCP setup and reports missing required, recommended, and optional environment variables without exposing secret values.
- Input: none

2. stitch_list_projects
- Lists Stitch projects.
- Input:
  - filter (optional)
  - rawInput (optional override for exact Stitch request shape)

3. stitch_get_project
- Gets one project.
- Input:
  - projectId (optional if rawInput used; bare id or projects/{id}, normalized to full resource name)
  - rawInput (optional)

4. stitch_list_screens
- Lists screens in a project.
- Input:
  - projectId (optional if rawInput used; bare id or projects/{id}, normalized to bare id)
  - rawInput (optional)

5. stitch_get_screen
- Gets one screen.
- Input:
  - screenId (optional if rawInput used; full projects/{id}/screens/{screen} path, or bare screen id when projectId is also provided)
  - projectId (optional; bare id or projects/{id}, used with bare screenId or partial title/name lookup)
  - rawInput (optional)

6. stitch_generate_screen_from_text
- Generates a screen from text.
- Input:
  - prompt (required unless rawInput used)
  - projectId (required unless rawInput used; bare id preferred; projects/{id} is normalized by the adapter)
  - rawInput (optional)

7. stitch_export_screen_artifact
- Exports a screen artifact bundle under PROJECT_ROOT, with STITCH_OUTPUT_DIR as fallback when PROJECT_ROOT is unset.
- Input:
  - screenData (optional direct payload to export)
  - screenId (optional: fetches from Stitch first; full screen resource name, bare screen id with projectId, or partial title/name with projectId)
  - projectId (optional; used with bare screenId or partial title/name lookup)
  - rawGetScreenInput (optional)
  - artifactPath (optional workspace-relative bundle directory, for example `.artifacts/features/settings/design`)
  - artifactName (optional backward-compatible fallback)
  - relativePath (optional legacy bundle directory, treated like artifactPath)

8. stitch_create_project
- MUTATING: creates a new Stitch project.
- Input:
  - title (optional)
  - confirm (required true to execute)
  - rawInput (optional)

9. stitch_edit_screens
- MUTATING: edits existing screens with a text prompt.
- Input:
  - projectId (required unless rawInput used; bare id or projects/{id}, normalized to bare id)
  - selectedScreenIds (required unless rawInput used; bare screen ids or full screen resource names, normalized to bare ids)
  - prompt (required unless rawInput used)
  - deviceType (optional: DEVICE_TYPE_UNSPECIFIED, MOBILE, DESKTOP, TABLET, AGNOSTIC)
  - modelId (optional: MODEL_ID_UNSPECIFIED, GEMINI_3_PRO, GEMINI_3_FLASH, GEMINI_3_1_PRO)
  - confirm (required true to execute)
  - rawInput (optional)

10. stitch_generate_variants
- MUTATING: generates variants of existing screens.
- Input:
  - projectId (required unless rawInput used; normalized to bare id)
  - selectedScreenIds (required unless rawInput used; normalized to bare ids)
  - prompt (required unless rawInput used)
  - variantOptions (required unless rawInput used)
    - aspects (optional array: VARIANT_ASPECT_UNSPECIFIED, LAYOUT, COLOR_SCHEME, IMAGES, TEXT_FONT, TEXT_CONTENT)
    - creativeRange (optional: CREATIVE_RANGE_UNSPECIFIED, REFINE, EXPLORE, REIMAGINE)
    - variantCount (optional integer 1-5)
  - deviceType (optional)
  - modelId (optional)
  - confirm (required true to execute)
  - rawInput (optional)

11. stitch_upload_design_md
- MUTATING: uploads base64-encoded DESIGN.md content to a project.
- Input:
  - projectId (required unless rawInput used; normalized to bare id)
  - designMdBase64 (required unless rawInput used)
  - confirm (required true to execute)
  - rawInput (optional)

12. stitch_create_design_system
- MUTATING: creates a design system, optionally scoped to a project.
- Input:
  - projectId (optional; normalized to bare id)
  - designSystem (required unless rawInput used)
    - displayName (required)
    - theme (required)
      - colorMode (required)
      - headlineFont (required)
      - bodyFont (required)
      - roundness (required)
      - customColor (required)
      - colorVariant, designMd, labelFont, override*Color, spacing, typography (optional)
  - confirm (required true to execute)
  - rawInput (optional)

13. stitch_create_design_system_from_design_md
- MUTATING: creates a design system from an uploaded DESIGN.md screen instance.
- Input:
  - projectId (required unless rawInput used; normalized to bare id)
  - selectedScreenInstance (required unless rawInput used)
    - id (required; screen instance id, not source screen id)
    - sourceScreen (required; full projects/{project}/screens/{screen}, or normalized from bare screen id when possible)
  - deviceType (optional)
  - confirm (required true to execute)
  - rawInput (optional)

14. stitch_update_design_system
- MUTATING: updates an existing design system.
- Input:
  - name (required unless rawInput used; assets/{asset_id} or bare asset id, normalized to full asset resource name)
  - projectId (required unless rawInput used; normalized to bare id)
  - designSystem (required unless rawInput used; same shape as create_design_system)
  - confirm (required true to execute)
  - rawInput (optional)

15. stitch_list_design_systems
- Lists design systems. If projectId is omitted, Stitch lists global design systems.
- Input:
  - projectId (optional; normalized to bare id)
  - rawInput (optional)

16. stitch_apply_design_system
- MUTATING: applies a design system to selected screen instances.
- Input:
  - projectId (required unless rawInput used; normalized to bare id)
  - assetId (required unless rawInput used; assets/{asset_id} or bare asset id, normalized to bare id)
  - selectedScreenInstances (required unless rawInput used)
    - id (required; screen instance id from get_project)
    - sourceScreen (required; full projects/{project}/screens/{screen}, or normalized from bare screen id when possible)
  - confirm (required true to execute)
  - rawInput (optional)

## Basic usage examples

- List projects:
  - call stitch_list_projects with {}

- Get a project:
  - call stitch_get_project with { "projectId": "projects/abc" }

- List screens:
  - call stitch_list_screens with { "projectId": "projects/abc" }

- Get a screen:
  - call stitch_get_screen with { "screenId": "projects/abc/screens/home" }
  - call stitch_get_screen with { "projectId": "projects/abc", "screenId": "home" }
  - call stitch_get_screen with { "projectId": "projects/abc", "screenId": "do for you" }

- Generate a screen:
  - call stitch_generate_screen_from_text with {
      "projectId": "abc",
      "prompt": "Create a dashboard with KPI cards and a recent activity list"
    }

- Export a fetched screen:
  - call stitch_export_screen_artifact with {
      "screenId": "projects/abc/screens/home",
      "artifactName": "home-screen"
    }
  - call stitch_export_screen_artifact with {
      "projectId": "projects/abc",
      "screenId": "do for you",
      "artifactPath": ".artifacts/features/settings/design",
      "artifactName": "matched-screen"
    }

- Export direct payload:
  - call stitch_export_screen_artifact with {
      "screenData": { "name": "manual-screen", "nodes": [] },
      "artifactPath": ".artifacts/stitch/manual-screen"
    }

- Safely preview a mutating call without executing it:
  - call stitch_edit_screens with {
      "projectId": "projects/example-project",
      "selectedScreenIds": ["abc123"],
      "prompt": "Make the primary call to action clearer"
    }
  - The wrapper refuses until the same call includes `"confirm": true`.

- List design systems:
  - call stitch_list_design_systems with { "projectId": "projects/example-project" }

- Create a design system:
  - call stitch_create_design_system with {
      "projectId": "projects/example-project",
      "confirm": true,
      "designSystem": {
        "displayName": "Product Theme",
        "theme": {
          "colorMode": "LIGHT",
          "headlineFont": "INTER",
          "bodyFont": "INTER",
          "roundness": "ROUND_EIGHT",
          "customColor": "#2563eb"
        }
      }
    }

- Apply a design system:
  - call stitch_apply_design_system with {
      "projectId": "projects/example-project",
      "assetId": "15996705518239280238",
      "selectedScreenInstances": [
        {
          "id": "screen-instance-id-from-get-project",
          "sourceScreen": "projects/example-project/screens/source-screen-id"
        }
      ],
      "confirm": true
    }

## Stitch API Transport

The Stitch client uses `https://stitch.googleapis.com/mcp` by default. `STITCH_API_BASE_URL` is available as an optional override for testing or future endpoint changes.

The transport uses JSON-RPC over HTTP:

- method: `tools/call`
- params.name: the Stitch tool name
- params.arguments: input object
- auth header: `x-goog-api-key`

## Live Contract Notes (Verified 2026-07-01)

The following behaviors were validated against a live endpoint:

- Endpoint shape:
  - host/path observed: stitch.googleapis.com/mcp
  - method: POST
  - content type: application/json

- Auth header:
  - x-goog-api-key

- RPC envelope:
  - list tools: { jsonrpc, id, method: "tools/list", params: {} }
  - call tool: { jsonrpc, id, method: "tools/call", params: { name, arguments } }

- Tool names:
  - list_projects
  - get_project
  - list_screens
  - get_screen
  - generate_screen_from_text
  - create_project
  - edit_screens
  - generate_variants
  - upload_design_md
  - create_design_system
  - create_design_system_from_design_md
  - update_design_system
  - list_design_systems
  - apply_design_system

- Input field names observed from live tools/list schema:
  - list_projects: filter (optional)
  - get_project: name (required, full resource name `projects/{project}`)
  - list_screens: projectId (required, bare project id without `projects/`)
  - get_screen: name, projectId, screenId (schema marks all required; name is full `projects/{project}/screens/{screen}`, projectId and screenId are bare ids)
  - generate_screen_from_text: projectId, prompt (required; projectId is bare id without `projects/`)
    - projectId must be the bare project id, without the `projects/` prefix.
    - Verified failure mode: passing `projects/example-project` returned result.isError = true with "Requested entity was not found."
    - Verified success mode: passing `example-project` generated a screen successfully.
  - create_project: title (optional)
  - edit_screens: projectId, selectedScreenIds, prompt (required); deviceType, modelId (optional)
  - generate_variants: projectId, selectedScreenIds, prompt, variantOptions (required); deviceType, modelId (optional)
  - upload_design_md: projectId, designMdBase64 (required)
  - create_design_system: designSystem (required), projectId (optional)
  - create_design_system_from_design_md: projectId, selectedScreenInstance (required), deviceType (optional)
  - update_design_system: name, projectId, designSystem (required)
  - list_design_systems: projectId (optional; omitted means global design systems)
  - apply_design_system: projectId, selectedScreenInstances, assetId (required)

- Shared live nested shapes:
  - `variantOptions`: optional `aspects`, optional `creativeRange`, optional integer `variantCount`.
  - `selectedScreenInstance`: required `id` and `sourceScreen`. `id` is a screen instance id from project info, not a source screen id. `sourceScreen` is `projects/{project}/screens/{screen}`.
  - `designSystem`: required `displayName` and `theme`.
  - `designSystem.theme`: required `colorMode`, `headlineFont`, `bodyFont`, `roundness`, `customColor`; optional `colorVariant`, `designMd`, `labelFont`, override colors, `spacing`, and `typography`.

## Project ID Normalization

Wrapper tools accept either `example-project` or `projects/example-project` for project-oriented inputs, then normalize at the Stitch contract boundary:

- `get_project` sends `name: "projects/{project}"`.
- `list_screens` sends `projectId: "{project}"`.
- `get_screen` sends `name: "projects/{project}/screens/{screen}"`, `projectId: "{project}"`, and `screenId: "{screen}"`.
- `generate_screen_from_text` sends `projectId: "{project}"`.
- `edit_screens`, `generate_variants`, `upload_design_md`, design-system project fields, and `apply_design_system` send `projectId: "{project}"`.
- `update_design_system` sends `name: "assets/{asset_id}"`.
- `apply_design_system` sends `assetId: "{asset_id}"`.
- Screen selections for edit/variant operations send bare screen ids. Screen instance `sourceScreen` values send full `projects/{project}/screens/{screen}` resource names.

`rawInput` and `rawGetScreenInput` remain exact pass-through escape hatches and are not normalized.

## Screen Lookup Convenience

`stitch_get_screen` and `stitch_export_screen_artifact` can resolve a screen without an exact full resource name:

- Full resource name: `screenId: "projects/{project}/screens/{screen}"`.
- Bare screen id: `projectId: "projects/{project}"`, `screenId: "{screen}"`.
- Partial title/name: `projectId: "projects/{project}"`, `screenId: "do for you"`.

Partial lookup calls `list_screens` for the project, normalizes case and whitespace, and supports substring matches against screen title, full resource name, and screen id. It only proceeds when exactly one screen matches. Multiple matches return an ambiguity error listing matching screen resource names and ids. No matches return a not-found error.

## Export Artifact Bundle

`stitch_export_screen_artifact` writes a coding-agent-friendly bundle:

- `raw.json`: full original Stitch response payload.
- `screen-summary.md`: title, ids, purpose, screen metadata, and notable sections/suggestions when available.
- `implementation-context.md`: build notes for coding agents, including layout, component/content hints, interaction notes, linked assets, and design tokens when present.
- `implementation-plan.md`: inferred page/component structure, suggested build order, assumptions, accessibility notes, and responsive notes.
- `component-map.json`: structured map of extracted text/interactions plus inferred sections/components with provenance labels.
- `copy.md`: text split into confident visible UI text, possible user-facing metadata, and generation/context text that should not be treated as UI copy without confirmation.
- `style-notes.md`: extracted layout values, tokens, colors, typography, spacing, and clear notes when values are absent.
- `build-prompt.md`: ready-to-paste Codex prompt for implementing the screen from the artifact bundle.
- `acceptance-criteria.md`: checklist of implementation requirements and constraints.
- `test-plan.md`: suggested unit, component, responsive, accessibility, and e2e test coverage.
- `questions.md`: open questions and missing design/product details to resolve.
- `manifest.json`: source ids, generated timestamp, artifact paths, caller input, fetch input, and resolver metadata.

The MCP response intentionally does not include raw JSON. It returns the bundle directory, artifact paths, and a short screen summary.
Handoff files mark inferred items as inferred and avoid inventing precise design values when the Stitch payload does not include them.

Output location rules:

- If `artifactPath` is provided, the bundle is written directly into that workspace-relative folder. No `artifactName` nesting is added.
- `relativePath` remains as a legacy alias for a caller-provided bundle directory, for example `exports/manual-screen`.
- If no path is provided but `artifactName` is provided, the legacy fallback is `exports/{artifactName}`.
- If neither `artifactPath` nor `artifactName` is provided, the default is `.artifacts/stitch/{normalized-screen-title-or-screen-id}`.
- The base root is `PROJECT_ROOT` when set. If `PROJECT_ROOT` is not set, `STITCH_OUTPUT_DIR` remains the fallback/testing base.
- Empty `PROJECT_ROOT` is treated as missing. A non-empty `PROJECT_ROOT` must already exist and be a directory; invalid roots are rejected instead of being created.
- Absolute paths, `..`, suspicious path segments, symlink escapes, and paths outside the base root are rejected.

`manifest.json` includes `artifactPath`, `resolvedOutputDir`, `baseRoot`, `baseRootSource`, and whether `artifactPath`, `artifactName`, or default fallback was used.

Example workflow:

1. Call `stitch_list_projects` with `{}`.
2. Pick a returned project, for example `projects/example-project`.
3. Call `stitch_list_screens` with `{ "projectId": "projects/example-project" }`.
4. Optionally inspect a screen by partial title:
   - `stitch_get_screen` with `{ "projectId": "projects/example-project", "screenId": "settings" }`.
5. Export a bundle by partial title:
   - `stitch_export_screen_artifact` with {
       "projectId": "projects/example-project",
       "screenId": "settings",
       "artifactPath": ".artifacts/features/settings/design"
     }

- Response shape notes:
  - JSON-RPC success envelope is often returned even when the tool fails logically.
  - Logical tool failures are signaled by result.isError = true and text in result.content[].text.

- Rate limit / quota headers:
  - no x-ratelimit-* or retry-after headers were observed in tested calls.
