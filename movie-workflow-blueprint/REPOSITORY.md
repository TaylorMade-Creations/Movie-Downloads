# TaylorMade Movies repository

This module is the project-owned control point for the Movie Room repository. The canonical machine-readable manifest is [`manifest.json`](manifest.json), and [`control.mjs`](control.mjs) exposes the repository, deployment, path, command, and verification data to project tooling.

The authoritative source is the `main` branch of `https://github.com/taylormade02471/Movie-Downloads`. The repository contains the Movie Room web front end, the Fire TV/Android application source, and the automation that synchronizes metadata and artwork beside the cloud-backed media. Do not create parallel application copies or move the user's authoritative Movie downloads root.

Jellyfin supplies title matching, metadata, seasons, posters, backdrops, and descriptions. OneDrive supplies cloud-resident playback plus synchronized sidecars and artwork. Movie Room is the viewer-facing application. Secrets remain in private environment configuration and never belong in this repository.

Use the commands in `manifest.json` for normalization, metadata/artwork synchronization, the watcher, tests, and deployment. A deployment is verified only after the full test suite and repeated authenticated production catalog checks pass together.
