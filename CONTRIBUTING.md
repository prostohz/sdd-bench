# Contributing

Read the [methodology](METHODOLOGY.md) before changing tasks, participants, or scoring. In a pull request, describe the behavior changed and how you checked it.

~~~sh
npm ci
npm test
npm run validate
~~~

For pipeline changes, also run the [dry-run example](RUNNING.md). A new task needs `task.json`, `intent.md`, `requirements.md`, and any required seed files or tests. A new participant needs `participant.json` and stage prompts. `npm run validate` checks the catalog.

Requirement checklists and task tests are public so the method can be inspected. Do not pass them to the participant agent during a run; material isolation is part of the protocol.
