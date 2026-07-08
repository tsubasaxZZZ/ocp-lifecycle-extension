# AGENTS.md

General project guidance lives in `CLAUDE.md` (rules) and `SPEC.md` (developer
spec, architecture, commands). Read those first.

## Cursor Cloud specific instructions

This is a Manifest V3 Chrome extension — there is no backend service or dev
server to run. "Running the app" means loading the unpacked extension in Chrome.

Standard commands are in `package.json` / `SPEC.md`:

- `npm test` — unit + DOM tests (`node --test`, jsdom). No browser needed.
- `npm run build` — zips the extension into `dist/`.
- `npm run check:structure` — Playwright validation against the **live** Red Hat
  lifecycle pages.

Non-obvious notes:

- There is **no lint command** in this repo; do not look for one.
- The startup update script only runs `npm ci`. `npm run check:structure`
  additionally requires Playwright's Chromium, which is **not** installed by the
  update script — run `npx playwright install --with-deps chromium` first.
- `npm run check:structure` needs network egress to `access.redhat.com`; this
  works in the Cloud environment.
- To manually test the extension: open `chrome://extensions`, enable Developer
  mode, click "Load unpacked", and select the repository root (`/workspace`).
  Then visit `https://access.redhat.com/support/policy/updates/openshift` and
  scroll to the "Life Cycle Dates" table — cells should be color-highlighted
  with remaining-days badges and a legend above the table.
- The lifecycle table renders dynamically inside the `<plcc-table>` Lit
  component's Shadow DOM; after loading the extension, refresh the page and wait
  a few seconds for highlighting to appear.
