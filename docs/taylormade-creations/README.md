# TaylorMade Creations automation module

This folder documents the TaylorMade East Kids Shows / Kiddo Learn / CMCSS video automation that is now source-controlled inside the Movie Room repository.

Movie Room remains the public web/PWA/API deployment. TaylorMade Creations automation remains a local Windows worker workflow that can prepare scripts, assemble review MP4s, stage metadata, and upload approved videos through a locally authorized YouTube OAuth client.

## What belongs in Git

- Reusable scripts in `scripts/taylormade/`
- YouTube OAuth source code in `scripts/taylormade/youtube/`
- Empty placeholders for private OAuth folders
- Documentation and templates
- Repo-safe examples

## What must stay local

- YouTube `client_secret.json`
- YouTube refresh/access token JSON
- Browser cookies, profiles, MFA state, and Gemini tabs
- Generated MP4s, screenshots, thumbnails, and frame-review images
- Upload queues, lifecycle logs, completed indexes, and timing memory
- Any raw API keys or passwords

The local worker root is provided at runtime with:

```powershell
$env:TAYLORMADE_EAST_KIDS_ROOT = "C:\path\to\East Kids Shows Automation"
```

The repo intentionally does not commit Kyle's local absolute automation root. Scripts accept `-Root` as an override.

## Local agent folder overrides

If a local rendered-shorts job uses account-specific folder names, configure them outside Git:

```powershell
$env:TAYLORMADE_AGENT1_FOLDER = "agent-1"
$env:TAYLORMADE_AGENT2_FOLDER = "agent-2"
$env:TAYLORMADE_AGENT3_FOLDER = "agent-3"
```

This keeps email/account identifiers out of source control.

## Deployment boundary

Vercel deploys the Movie Room app and includes source files for operational handoff, but Vercel does not run desktop Chrome/Gemini automation and does not store YouTube tokens. The Windows machine remains the trusted local runner for video creation and upload.

Before committing or deploying:

```powershell
npm test
git diff --check
git status --short
```

Before using YouTube upload code locally, put private files here on the local machine only:

```text
scripts/taylormade/youtube/private/client_secret.json
scripts/taylormade/youtube/tokens/youtube-token.json
```

Those folders are ignored except for `.gitkeep`.
