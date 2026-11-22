<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## FLO Golf releases

Base new work on `staging`. Deploy and test there first. Obtain Andrew's explicit approval of the tested staging revision before merging its pull request into `main`, the production branch. If the code changes, test the new revision and get fresh approval. Keep database migrations scoped to the intended project and review production SQL as part of the release. See [the release guide](docs/staging.md).
