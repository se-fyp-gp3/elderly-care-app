---
name: appwrite-types-debug
description: "Debug Appwrite CLI type generation failures (especially relationship/relatedCollection issues in appwrite.config.json). Use when appwrite types fails, tables are pulled, or type files are incomplete."
argument-hint: "What appwrite types error are you seeing?"
---

# Appwrite Types Debug

## What This Skill Produces

- A diagnosed root cause for `appwrite types` failures.
- A minimal fix in `appwrite.config.json`.
- A verified successful type generation run.

## When To Use

- `appwrite types ./types/` fails.
- Error mentions `Related collection with ID 'undefined' not found`.
- Generated type output is missing tables/columns.

## Workflow

1. Reproduce and capture error

- Run `appwrite types ./types/`.
- If error is unclear, rerun with `--verbose`.
- Record exact error text before editing files.

2. Inspect schema structure first

- Open `appwrite.config.json` and confirm whether table fields are under `columns` or `attributes`.
- Do not assume structure from memory; verify actual keys used in the file.

3. Locate problematic relationships

- Find all entries with `"type": "relationship"`.
- For each relationship, verify `relatedCollection` exists and references a real table `$id`.
- Build a mapping table: source table + relationship key -> expected related table `$id`.

4. Apply minimal config fixes

- Add only missing/incorrect `relatedCollection` fields.
- Keep existing relation metadata unchanged: `relationType`, `twoWay`, `twoWayKey`, `onDelete`, `side`.
- Avoid unrelated formatting changes.

5. Optional guarded auto-fix

- Only run if all three conditions are true:
  - relationship keys are unambiguous,
  - target table `$id` exists,
  - proposed mapping is reviewed before write.
- Auto-fix boundaries:
  - allowed: add/fix `relatedCollection` only,
  - forbidden: changing relation semantics (`relationType`, `twoWay*`, `onDelete`, `side`).
- After auto-fix, rerun validation immediately.

6. Regenerate and validate

- Rerun `appwrite types ./types/`.
- Success criteria:
  - CLI exits with code `0`.
  - Output includes `Generated types for all the listed tables`.
  - Type file updated (commonly `types/appwrite.d.ts`).

7. Cleanup and summarize

- Remove temporary debug scripts if created.
- Summarize:
  - root cause,
  - fields changed,
  - verification output.

## Decision Points

- If no relationship fields exist: investigate other schema/type template issues before editing.
- If `relatedCollection` exists but still fails: verify IDs match actual table `$id` values exactly.
- If multiple tables share similar key names: map by table `$id`, not display name.

## Completion Checklist

- Error reproduced and captured.
- Every relationship column has valid `relatedCollection`.
- `appwrite types ./types/` succeeds.
- No temporary artifacts left behind.
