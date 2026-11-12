# AGENTS.md

These instructions apply to the entire repository.

## Data and code separation

- Keep substantial independently editable data out of implementation source. Configuration, catalogs, templates, prompts, protocol definitions, schemas, mappings, fixtures, lookup tables, authored content, and similar data belong in an appropriate data/config/resource file, database, object store, or other persistence boundary used by the system.
- Code should own behavior, validation, loading, and finite interpretation of that data; it should not own large data bodies through arrays, objects, switch branches, or string constants merely because the runtime consumes them.
- Small literals intrinsic to an algorithm are fine. If information can reasonably be edited, versioned, generated, migrated, or reviewed independently of implementation logic, give it a separate data boundary.
- Do not replace one hard-coded blob with a hard-coded registry of blobs. Prefer declarative data with explicit schemas and finite interpreter primitives.
