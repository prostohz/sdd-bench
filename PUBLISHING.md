# Publishing results

~~~sh
npm ci
npm run site -- --result <id>
~~~

The command builds the static site in `public/` from a local `results/<id>/` and renders the methodology page from `METHODOLOGY.md`. Only runs for participants currently in `participants/` are published; older runs remain in the local result. Every published run must be fully judged. Only aggregate scores and run summaries enter `public/`; logs, verdict details, and run repositories stay local.

Review the generated pages, commit `public/`, and push to `main`. GitHub Actions deploys the site through GitHub Pages. The repository's Pages source is **GitHub Actions**.

Running `npm run site` without `--result` generates an empty-state page.

Preview edits locally with `npm run site:dev` or `npm run site:dev -- --result <id>`. The Vite server opens at `http://127.0.0.1:5173/` and updates React components and styles as you edit. Pass `--port <number>` to use another port. This preview reads local result data but does not write to `public/`.
