# Reactive Resume parity — remaining work

Branch: `feature/reactive-resume-parity` (off `main`). Items 1–16 of the 18-item parity list are done and committed (see `git log main..feature/reactive-resume-parity`). Two remain.

## 17. Standalone ATS checker

**Goal:** check any PDF resume (not only one of ours) against a pasted job posting, without opening a job.

- A new page, reachable from Resumes (and the command palette once it exists): drop or choose a PDF, optionally paste a posting, run the check.
- Reuse what the job page's ATS check already uses: Reactive Resume's PDF engine for the analysis and the shared report view for the results (score, categories, blockers, warnings, tips, keyword coverage).
- Runs entirely on this computer; nothing is uploaded. Say so on the page.
- Keep the last result for the visit only (no database change). Offer "Check one of my resumes instead" as a shortcut that renders the chosen resume to PDF first.
- Handle the engine's own errors in plain words: password-protected PDF, file too large, no text layer.
- Tests: the source selection and error wording as plain logic; the engine itself is already covered by the vendored tests.

## 18. Command palette (Ctrl+K)

**Goal:** jump anywhere and run common actions from the keyboard.

- Opens with Ctrl+K anywhere in the app (not while a dialog is already open); Esc closes it.
- Searches, best matches first: pages (Pipeline, Discover, Resumes, Offers, Interviews, Insights, Settings), jobs (by company and position), resumes and letters (by name).
- Actions: new application, new resume, new letter, import resume, import jobs from CSV, export pipeline CSV, open the ATS checker.
- Keyboard: arrows to move, Enter to run, results grouped by kind, recent picks first when the box is empty.
- In Job Track's look (the existing glass dialog style), not Reactive Resume's.
- Tests: the search and ranking as plain logic, and that the shortcut doesn't fire while typing in a text box that uses Ctrl+K itself.

## Finishing

- Run `bash tools/verify.sh` after each item; commit each item on its own.
- Update `frontend/src/vendor/reactive-resume/UPSTREAM.md` if any further upstream files are vendored, and regenerate licenses if packages are added.
- Then a whole-branch review, fast-forward `main`, and delete the branch.
- Clean-up for the user: the throwaway "ZZ Check test" resume made during early browser checks is still in their library; they can move it to Trash.

Out of scope, as agreed: login/accounts, homepage, public share links, the AI assistant (the coming LLM phase), theme/language settings, next-step hints (Job Track has its own).
