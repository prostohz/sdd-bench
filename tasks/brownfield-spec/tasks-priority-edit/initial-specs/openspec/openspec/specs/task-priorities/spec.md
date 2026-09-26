# task-priorities Specification

## Purpose

Позволяет отмечать срочность задач и быстро выводить наиболее важные записи
списка, не меняя их исходное место в файле.

## Requirements

### Requirement: Task priorities are stored with a safe default
The system SHALL associate every task with exactly one priority: `high`,
`normal`, or `low`. A task created without an explicit priority and a stored
task whose priority field is absent SHALL have priority `normal`. The system
SHALL reject an explicit priority outside these three values without modifying
the task list.

#### Scenario: Adding a task without a priority
- **WHEN** the user adds a task without `--priority`
- **THEN** the saved task has priority `normal`

#### Scenario: Reading a pre-priority task file
- **WHEN** `tasks.json` contains a valid task record with no priority field
- **THEN** the task is listed and handled with priority `normal`

#### Scenario: Rejecting an unsupported priority
- **WHEN** the user supplies `--priority urgent` while adding or listing tasks
- **THEN** the command fails and does not silently treat `urgent` as a priority

### Requirement: Users can set a priority while adding a task
The `tasks add` command SHALL accept `--priority <priority>` in addition to its
existing options and SHALL persist the selected valid priority with the new
task. Existing `add` behaviour and options SHALL remain available.

#### Scenario: Adding a high-priority task
- **WHEN** the user runs `tasks add prepare-report --priority high`
- **THEN** the new task is saved with priority `high`

#### Scenario: Combining a tag and priority
- **WHEN** the user adds a task with both `--tag` and `--priority`
- **THEN** the new task retains both the tag and selected priority

### Requirement: List output shows and orders priorities
The `tasks list` command SHALL display each listed task's priority. It SHALL
order selected tasks from `high` to `normal` to `low`; tasks of the same
priority SHALL retain their order in `tasks.json`, and their displayed numbers
SHALL continue to identify their positions in that file. Existing done-state
and tag rendering SHALL remain visible. The priority label SHALL appear
immediately after the completion mark and before the text.

#### Scenario: Ordering a mixed-priority list
- **WHEN** the selected tasks occur in file order as low, high, normal, high
- **THEN** list output shows the high tasks in their original relative order,
  followed by the normal task and then the low task

#### Scenario: Showing a legacy task in the list
- **WHEN** a task without a stored priority is included in `tasks list`
- **THEN** its line displays priority `normal` and it sorts with normal tasks

### Requirement: Users can filter list output by priority
The `tasks list` command SHALL accept `--priority <priority>` alongside its
existing filters and SHALL show only tasks with the selected valid priority.
The priority filter SHALL combine with `--done`, `--open`, and `--tag` using
their existing intersection semantics.

#### Scenario: Filtering high-priority open tasks
- **WHEN** the user runs `tasks list --open --priority high`
- **THEN** output contains only open tasks whose priority is `high`

#### Scenario: Filtering by priority and tag
- **WHEN** the user runs `tasks list --tag work --priority low`
- **THEN** output contains only low-priority tasks tagged `work`

### Requirement: Existing task data and commands remain compatible
The system SHALL store version 2 `tasks.json` records with `text`, `done`,
`tags`, and `priority`. It SHALL read older files without `version` or
`priority` and preserve their tasks. The existing `done <number>` command
SHALL resolve the stored one-based position; `tags` SHALL continue counting
tasks by tag. Empty lists SHALL succeed without output, and errors SHALL use
stderr with a nonzero status. The CLI SHALL need no network installation.

#### Scenario: Completing a task after priority sorting
- **WHEN** the user runs `done <number>` after viewing a sorted list
- **THEN** the task at that stored position is completed

### Requirement: Priority editing is outside the current capability
The system SHALL allow priority selection when adding a task and SHALL NOT
offer a command to change the priority of an existing task.

#### Scenario: Existing task needs a different priority
- **WHEN** the priority of a saved task needs to change
- **THEN** the current CLI offers no edit command
