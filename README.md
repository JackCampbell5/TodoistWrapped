# My Done List

A local, private year-in-review for your Todoist data, built from Todoist's personal data export. No network calls required.

> Work in progress. Full setup docs coming soon.

## Privacy first

Your export goes in `data/raw/`. That folder, generated stats, local config, and `.env` are all gitignored.

### Enable the pre-commit safety hook (run once per clone)

```sh
git config core.hooksPath .githooks
```

The hook blocks commits that stage personal data paths, files that look like a Todoist export (outside `fixtures/`), or anything resembling an API token.
