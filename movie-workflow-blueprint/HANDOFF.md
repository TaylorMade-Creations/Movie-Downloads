# Movie Room workflow control

This folder is the project-owned control point for the Movie Room workflow. The canonical machine-readable manifest is `manifest.json`; `control.mjs` exposes the same source-of-truth, deployment, path, command, and verification data to project tooling.

All work on this application must reference the repository and branch named in the manifest. Do not create a parallel copy of the app, move the authoritative Movie downloads root, or copy vendor-managed Codex/GPT/plugin/skill directories into this checkout.

The local source of truth for media is `C:\Users\kylet\OneDrive\Desktop\Movie downloads`. Jellyfin supplies metadata and organization, OneDrive supplies cloud-resident video playback and sidecars/artwork, and Movie Room is the viewer-facing application. Secrets stay in private environment configuration and never belong in this folder.

Use the manifest commands for normalization, metadata/artwork synchronization, OneDrive export, the six-hour watcher, tests, and production deployment. A deployment is not considered verified until the full test suite and repeated authenticated production catalog checks pass together.
