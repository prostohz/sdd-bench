# Priority behavior

## Values and defaults

| Priority | CLI value | Relative order | Default |
| --- | --- | --- | --- |
| High | `high` | 1 | No |
| Normal | `normal` | 2 | Yes |
| Low | `low` | 3 | No |

## Command behavior

| Command | Required behavior |
| --- | --- |
| `tasks add <text> [--tag <tag>] [--priority <priority>]` | Stores the selected priority; omission stores normal. Existing tag behavior is unchanged. |
| `tasks list [--done\|--open] [--tag <tag>] [--priority <priority>]` | Filters by the selected priority when supplied. Priority filtering combines with one status filter and a tag filter. Results are ordered high, normal, low, preserving stored order inside each group. |
| `tasks done <number>` | Continues to resolve the number as the task’s stored-file position, not its sorted-list position. |
| `tasks tags` | Is unchanged. |

## Compatibility and validation

- Records that lack `priority` load as normal priority.
- The saved file uses version 2; tasks retain `text`, `done`, `tags`, and `priority`. Files without a version or priority remain readable.
- A stored priority must be one of the three supported values; malformed priority data is rejected using the application’s existing corrupted-store error path.
- Unsupported priority option values are rejected as command usage errors.
- Every line produced by `tasks list` shows the task’s priority as `[high]`, `[normal]`, or `[low]` after its completion mark and before its text. Its number, completion mark, text, and optional tags otherwise retain their current presentation.
