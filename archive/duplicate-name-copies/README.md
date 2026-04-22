# Duplicate “` 2`” filename copies (archived)

Files in this tree were moved out of the active app directories because they matched the macOS-style duplicate pattern (`name 2.ext`). They are **not referenced** by `server.js`, `vite.config.js`, `package.json` scripts, or other canonical paths.

**Purpose:** keep the working tree free of accidental duplicates so edits land on the real files.

**Recovery:** If you need a diff against the canonical file, compare with the same path without the ` 2` suffix in the repo root (e.g. `server/feedbackRoutes.js`).

**Deletion:** Safe to delete this folder once you have confirmed you do not need any archived content. Nothing in the build or runtime depends on these paths.
