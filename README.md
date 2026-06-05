# Lifecycle Highlighter for OpenShift

A Chrome extension that color-codes the Life Cycle Dates table on the
[Red Hat OpenShift Container Platform life cycle page](https://access.redhat.com/support/policy/updates/openshift)
so you can see at a glance which versions are approaching end of support.

日本語版は [README.jp.md](README.jp.md) を参照してください。

> **Disclaimer**: This is an unofficial tool and is not affiliated with or
> endorsed by Red Hat, Inc. OpenShift and Red Hat are trademarks or registered
> trademarks of Red Hat, Inc. in the United States and other countries.

## What it does

Open the OpenShift life cycle page, the
[all-products life cycle page](https://access.redhat.com/product-life-cycles)
(with any products you add to it), or any other per-product life cycle page
under `access.redhat.com/support/policy/updates/` — every date cell is
highlighted by how close the deadline is:

| Color | Meaning (default) |
|---|---|
| 🟥 Red | Ends within 90 days |
| 🟧 Orange | Ends within 180 days |
| 🟩 Green | More than 180 days left |
| ⬜ Gray + strikethrough | Already ended |

- Each date gets a badge showing the remaining days ("45d left") or how long
  ago it ended ("Ended 33d ago")
- A legend is inserted above the table so you always know what the colors mean
- The GA (General availability) column is not highlighted — it is a start date,
  not a deadline
- Date-range cells ("May 20, 2025 to May 31, 2030") are judged by their end
  date; ranges ending in "Ongoing" are left unhighlighted
- Works with both the English and Japanese display of the pages

## Installation

- **Chrome Web Store**: coming soon
- **Manual**: download the zip from [Releases](../../releases), unzip it, open
  `chrome://extensions`, enable Developer mode, click "Load unpacked", and
  select the unzipped folder

## Settings

Click the extension's "Options" (or right-click the icon → Options) to:

- Adjust the day thresholds for red and orange with sliders
- Toggle the remaining-days badge, the legend, and the strikethrough
- Optionally show a gray "Released 1095d ago" badge in the GA column
  (off by default; the GA column is never colored)
- Check the result in a live preview before saving

Settings sync across your Chrome profiles via `chrome.storage.sync`.
The extension UI follows your browser's language (English / Japanese).

## Privacy

The extension reads nothing but the life cycle page itself, makes no network
requests, and collects no data. The only permission it uses is `storage`,
for saving your settings.

## For developers

Architecture, build commands, CI/CD, and release procedure are documented in
[SPEC.md](SPEC.md) (Japanese).

## License

[MIT](LICENSE)
