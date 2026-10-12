# Working in this repo

## Tests: targeted while working, full suite once per branch

The full suite (`bash tools/verify.sh`) takes 2–3 minutes. Don't run it after every change or commit.

While working, run only what covers the change:

- Go: `go test ./internal/<pkg> -run <TestName>`
- Frontend: `cd frontend && npx vitest run <path/to/file.test.ts>`
- Type-check after editing TS: `cd frontend && npx tsc --noEmit` (no need to chain it after every edit; run it when a batch of edits is done)
- `wails generate module` only after changing a Go method signature or type the frontend binds to

Run `bash tools/verify.sh` once, before fast-forwarding main. Also run it when a change touches shared types or generated bindings and could break unrelated areas. Let it print its own result; don't pipe it through `tail`/`grep` or chain a commit after it, so "verify: all green" stays visible.

## Sessions: one phase per session

Context grows with every turn, and every turn re-sends all of it. Sessions that ran a whole multi-phase feature reached 500k–960k tokens and slowed to a crawl.

- Do one phase or task of a plan per session. Commit, then say the phase is done so the user can `/clear` or start a new chat.
- Plans live in `docs/superpowers/plans/` and specs in `docs/superpowers/specs/`. A new session picks up from the plan file and `git log`, not from memory of an earlier chat.
- Read only the lines you need (`Read` with offset/limit, or `grep -n` first). Don't `cat` or `sed -n` whole files.
- For small changes use `Edit`. Save Python scripts for genuine bulk edits; write with `newline='\n'` and raw strings (`r"""..."""`).
- No browser checks (no Claude-in-Chrome, no Playwright). Verify from code and automated tests.
