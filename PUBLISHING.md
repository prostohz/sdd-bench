# Publishing results

~~~sh
npm ci
npm run site -- --result <id>
~~~

The command builds the static site in `public/` from a local `results/<id>/` and renders the methodology page from `METHODOLOGY.md`. Only runs for participants currently in `participants/` are published; archived runs remain in the local result. Every published run must be fully judged. Only aggregate scores and run summaries enter `public/`; logs, verdict details, and run repositories stay local.

Review the generated pages, commit `public/`, and push to `main`. GitHub Actions deploys the site through GitHub Pages. The repository's Pages source is **GitHub Actions**.

Running `npm run site` without `--result` generates an empty-state page.
