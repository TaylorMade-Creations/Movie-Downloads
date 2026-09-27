# TaylorMade Movies library setup

The canonical Windows library is currently:

`C:\Users\kylet\OneDrive\Desktop\Movie downloads`

Keep these folders inside it:

```text
Movie downloads\
  Movies\
  TV Shows\
  Applications\
  _Recovery\
  .incomplete\
```

`Movies` and `TV Shows` are the only folders the Movie Room library should scan for active video. `Applications` holds the APKs and release bundle. `_Recovery` holds old or conflicting copies without deleting them.

## qBittorrent

Set qBittorrent's completed/default save path to:

`C:\Users\kylet\OneDrive\Desktop\Movie downloads\Movies`

Set its incomplete or \`.part\` path to:

`C:\Users\kylet\OneDrive\Desktop\Movie downloads\.incomplete`

For the completed path, turn off any option that creates an additional torrent-named subfolder. A completed video should land directly in `Movies` so the normalizer can safely place it in its title folder. Do not point qBittorrent at `Applications`, `_Recovery`, or the Mac copy.

## Automatic organization

The normalizer only considers video extensions and waits for a file size to stop changing. It cleans release names, places movies at `Movies\\<Title>\\<Title>.<ext>`, and places `SxxEyy` episodes at `TV Shows\\<Series>\\<Series> Season NN\\...`. It never deletes source media; conflicts are reported and applied moves are logged at `_Recovery\\movie-library-normalize.log`.

Preview a run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\normalize-movie-library.ps1 -StabilitySeconds 2 -FolderizeMovies -OrganizeSeries
```

Apply a run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\normalize-movie-library.ps1 -Apply -FolderizeMovies -OrganizeSeries
```

Install the per-user 15-minute watcher:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-movie-library-watcher.ps1
```

This local organizer does not upload or duplicate the media. OneDrive synchronizes the organized folders, and the Movie Room/Jellyfin metadata bridge reads the same canonical paths.
