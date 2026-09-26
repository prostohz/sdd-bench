# Feature Specification: Task Priorities

**Feature Branch**: `001-task-priorities`

**Created**: 2026-09-24

**Status**: Current

**Input**: User description: "Add high, normal, and low priorities to the daily task list while preserving existing tasks and all unrelated behavior."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See Work in Priority Order (Priority: P1)

As a daily task-list user, I can view my tasks with high-priority work first, then normal, then
low, so I can decide what to tackle without manually scanning about thirty entries.

**Why this priority**: The list becomes immediately actionable only when its order expresses
urgency.

**Independent Test**: Create tasks at all three priorities and view the list; it delivers value if
the high tasks are first, normal tasks next, and low tasks last while equal-priority tasks retain
their original order.

**Acceptance Scenarios**:

1. **Given** tasks recorded in mixed priority order, **When** the user views all tasks, **Then**
   high-priority tasks appear before normal-priority tasks and normal-priority tasks appear before
   low-priority tasks.
2. **Given** two tasks at the same priority, **When** the user views the list, **Then** their
   relative order is the same as their order in the saved list.
3. **Given** a task in the list, **When** the user views it, **Then** its priority is visibly
   identified alongside the existing task information.

---

### User Story 2 - Set a Priority While Adding Work (Priority: P2)

As a user adding a task, I can choose high, normal, or low priority at creation time, so the task
is placed in the appropriate part of my next list view.

**Why this priority**: Choosing urgency when entering work prevents later triage and supports the
main ordering behavior.

**Independent Test**: Add one task for each allowed priority and view the list; each saved task
shows the selected priority and is ordered accordingly.

**Acceptance Scenarios**:

1. **Given** the user adds a task without naming a priority, **When** it is saved, **Then** it has
   normal priority.
2. **Given** the user supplies one of the three allowed priority values while adding a task,
   **When** it is saved, **Then** the selected value is retained and displayed.
3. **Given** the user supplies a value outside the three allowed priorities, **When** they try to
   add the task, **Then** the task is not added and the established invalid-input behavior is used.

---

### User Story 3 - Focus on One Urgency Level (Priority: P3)

As a user planning my work, I can restrict the list to one selected priority, so I can focus on
only the high, normal, or low tasks relevant to that moment.

**Why this priority**: Filtering complements ordering but users still gain core value without it.

**Independent Test**: Add tasks across the three priorities, request each single-priority view,
and verify every result has the requested priority and keeps its saved order.

**Acceptance Scenarios**:

1. **Given** tasks at all priority levels, **When** the user requests a single priority, **Then**
   only tasks at that priority are shown.
2. **Given** a priority-specific view with no matching tasks, **When** the user requests it,
   **Then** the view is empty and completes successfully as an ordinary empty list.
3. **Given** the user combines a priority selection with an existing list selection, **When** they
   view tasks, **Then** only tasks satisfying both selections are shown and normal validation rules
   continue to apply.

### Edge Cases

- Legacy task records without a priority are treated as normal priority when viewed, filtered, or
  saved; no existing task is dropped or made unreadable.
- An invalid or missing priority value is rejected using the command's existing input-error style,
  without changing the saved task list.
- A priority filter is additive with existing status and tag selections; incompatible existing
  selections keep their current behavior.
- Task numbers continue to identify their saved positions even if priority ordering changes list
  display order.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST represent exactly three task priorities: high, normal, and low.
- **FR-002**: The system MUST assign normal priority when a task is created without an explicit
  priority.
- **FR-003**: The system MUST allow a user to select one of the three priorities while adding a
  task and MUST reject any other selected value without creating that task.
- **FR-004**: The system MUST visibly show every listed task's priority while preserving the
  established information shown for that task.
- **FR-005**: The system MUST order a full or selected task list by priority (high, normal, low)
  and MUST retain saved order among tasks of the same priority.
- **FR-006**: The system MUST allow a user to request a list containing only one selected priority.
- **FR-007**: The system MUST apply a priority selection in conjunction with existing list
  selections, so each resulting task satisfies every selection.
- **FR-008**: The system MUST read all existing saved tasks that have no priority as normal
  priority and preserve their text, completion state, tags, positions, and accessibility.
- **FR-009**: The system MUST preserve all existing commands, unrelated output, return codes, and
  error behavior when priority functionality is not invoked.
- **FR-010**: The system MUST not add due dates, projects, colors, task editing, or other
  non-priority capabilities.
- **FR-011**: The saved file uses version 2, and each stored task includes `text`, `done`, `tags`, and `priority`; old files without a version or priority remain readable.
- **FR-012**: A list line shows `[high]`, `[normal]`, or `[low]` immediately after the completion mark and before the text.

### Key Entities *(include if feature involves data)*

- **Task**: A saved item with text, completion state, tags, and one priority level; it remains at a
  stable saved position used by task-number operations.
- **Priority**: One of high, normal, or low; it determines display grouping and can constrain a
  list view.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a list containing at least one task at each priority, 100% of high-priority tasks
  appear before every normal-priority task, and 100% of normal-priority tasks appear before every
  low-priority task.
- **SC-002**: For every priority group in a list of 30 tasks, 100% of its tasks retain their
  relative saved order.
- **SC-003**: A user can add and identify a task at each of the three priorities in one attempt,
  and a task added without a selection is identifiable as normal.
- **SC-004**: 100% of pre-existing task records without priority remain viewable, completable, and
  tag-filterable after the feature is introduced.
- **SC-005**: For each priority level, a focused view contains 0 tasks outside that level when
  checked against a mixed list.

## Assumptions

- Priority is selected only when a task is created; changing an existing task's priority is outside
  this feature.
- The command interface uses the established option style; the concrete option is `--priority`
  with the canonical values `high`, `normal`, and `low`.
- Existing task numbers remain tied to saved positions, even though displayed list order changes.
- Legacy records missing priority are semantically normal and are rewritten with that value only
  when a later operation saves the complete list.
- Empty selected views retain the current empty-list behavior rather than producing a new message
  or error.
