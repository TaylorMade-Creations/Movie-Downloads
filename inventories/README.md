# Movie Room Preservation Inventories

This folder documents the inventory policy for the Movie Room master repository.

Generated machine-local reports belong under `inventories/local/`. That folder
is intentionally ignored because reports can include local paths, artifact
filenames, media sizes, timestamps, and other machine-specific recovery data.

The inventory tool is read-only for repository and media-library inputs. It may
write only the requested JSON report, using a temporary file followed by an
atomic rename.

Repository inventories may include relative paths, byte sizes, modified times,
and SHA-256 hashes for source and approved release artifacts. Secret-like files,
local configuration, runtime output, and temporary build data are excluded or
redacted.

Media-library inventories may include relative media paths, byte sizes, and
modified times. They do not hash or read video contents.
