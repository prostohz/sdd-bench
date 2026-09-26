---
id: SPEC-task-priorities
companions:
  - priority-behavior.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate.

# Task priorities

## Why

Daily task lists of roughly thirty items cannot be acted on effectively when tags describe origin rather than urgency. Users need to declare and see urgency so they can start with the most important work without losing their accumulated task data or familiar command-line workflow.

## Capabilities

- **CAP-1**
  - **intent:** A user can assign a high, normal, or low priority when adding a task, and an unspecified priority is normal.
  - **success:** Newly added tasks retain their selected priority; a task added without a priority behaves as normal priority.
- **CAP-2**
  - **intent:** A user can see task priority in a list and receive tasks ordered from high through normal to low.
  - **success:** Every listed task visibly identifies its priority; tasks of equal priority retain their stored relative order.
- **CAP-3**
  - **intent:** A user can restrict a task list to one chosen priority.
  - **success:** A priority-filtered list contains only tasks of that priority and continues to honor any existing compatible list filters.

## Constraints

- Existing `tasks.json` files, including task records without a priority, must remain readable; their tasks and existing fields remain available through the current commands, with a missing priority treated as normal.
- Apart from priority visibility and the new priority options, existing command names, output, return codes, and error messages retain their current behavior.
- Priority ordering applies only to list presentation; task numbers remain their positions in the stored file so existing `done` references remain valid.

## Non-goals

- Due dates, projects, coloured output, and editing the priority or other contents of an existing task.
- Changing tag behavior or adding a general-purpose task sorting command.

## Success signal

An existing task file can be opened unchanged, then new high-, normal-, and low-priority tasks can be added and listed with high-priority work first. A user can narrow that list to one priority while the current commands continue to work as before.

## Assumptions

- The command-line priority values are `high`, `normal`, and `low`, matching the application’s existing English option vocabulary; user-facing labels may remain consistent with the Russian CLI.
