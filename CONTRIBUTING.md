# Contributing

External contributors do **not** have push access to this repository. All work
arrives as a pull request from a fork. This is deliberate: GitHub Free does not
offer branch protection or rulesets on private repositories, so read-only access
plus forks is the only way to actually prevent direct pushes to `main` rather
than merely asking people not to make them.

Only `Altus-corp` (the repository owner) merges.

## One-time setup

1. Accept the collaborator invitation emailed to you. It grants **read** access
   — enough to clone, fork and open pull requests, and nothing more.
2. Fork the repository to your own account: **Fork** on
   <https://github.com/Altus-corp/Altus-OS>.
3. Clone your fork and add the original as `upstream`:

   ```bash
   git clone https://github.com/<your-username>/Altus-OS.git
   cd Altus-OS
   git remote add upstream https://github.com/Altus-corp/Altus-OS.git
   ```

Your fork of a private repository is private too, and stays that way.

## Bringing existing work across

If your changes currently live in a different repository, add this fork as a
remote there and push your branches to it — no need to re-create the work:

```bash
git remote add altus https://github.com/<your-username>/Altus-OS.git
git push altus <your-branch>
```

Branches whose history is unrelated to this repository will not merge cleanly.
In that case, rebase onto `upstream/main` before opening the pull request, or
say so in the description so it can be handled deliberately rather than with
`--allow-unrelated-histories`.

## Each change

```bash
git fetch upstream
git checkout -b feat/<short-name> upstream/dev-integration
# ... work ...
git push origin feat/<short-name>
```

Then open a pull request:

- **base:** `Altus-corp/Altus-OS` → **`dev-integration`** (not `main`)
- **compare:** your fork → your branch

`dev-integration` is the staging branch. Work is reviewed there, then merged to
`main` in one deliberate step by the owner. Pull requests opened directly
against `main` will be re-pointed.

## Before a pull request is considered complete

- Append an entry to the changelog in [`HANDOFF.md`](./HANDOFF.md). A pull
  request without one is incomplete — see *How to update this file* in that
  document.
- `pnpm lint` and `pnpm typecheck` pass locally.
- No secrets, `.env` files, or database dumps in the diff. Check `git diff
  --stat` before pushing.

## Deployments

Pushing to `main` deploys to production at <https://os.altuscorp.in>. Only the
owner can trigger that. Vercel builds only commits authored by the account that
owns the project, so deployment is not something a fork can set off.
