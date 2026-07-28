# Starter artwork intake and rights

The Photographer starter uses twelve public-domain works from The Metropolitan
Museum of Art Open Access collection. The Illustrator/Designer starter remains
partner-led and stays `awaiting-permission`, with no chooser card, until both
the signed permission record and every ordered media slot below are complete.

## Partner permission record

For contributed partner artwork, the signed agreement must identify the artist,
the represented works, the credit line, and a contact for notices. It must
grant Hangwork permission for:

- product and editor previews;
- public marketing and example pages;
- delivery of the sample files into browser-based drafts;
- worldwide display and caching;
- the agreed credit placement;
- an explicit prohibition on users publishing the samples as their own work;
- a 90-day wind-down after revocation.

Record the agreement or rights-page URL, signature date, credit line, and
revocation contact beside the final media manifest. A verbal approval or an
unlinked file delivery does not satisfy this gate.

## Photographer Open Access pack

The ready pack contains exactly four photographs in each series:

- Yosemite Valley;
- Falls & Stone;
- Western Horizons.

Every record is marked public domain by the Met Collection API and points to
the [Met Open Access policy](https://www.metmuseum.org/policies/image-resources).
Local 1600px optimized copies, object URLs, accession numbers, original image
URLs, dimensions, download dates, and SHA-256 checksums live in the product
catalog. Public-domain status permits product use, but explicit sample identity
still prevents users from publishing the works as their own.

## Illustrator/designer pack

Provide three complete case studies. Covers and project thumbnails are derived
from these files.

| Ordered slot | Minimum delivered dimensions | Shape |
| --- | ---: | --- |
| Case study 1–3 / 1 | 2400 × 1600 px | 3:2 landscape |
| Case study 1–3 / 2 | 2000 × 2000 px | square |
| Case study 1–3 / 3 | 1600 × 2400 px | 2:3 portrait |
| Case study 1–3 / 4 | 2400 × 1600 px | 3:2 landscape |

Total: 12 images, exactly 4 ordered images per case study.

## File manifest

Each file needs:

- immutable catalog ID;
- local optimized product path;
- original width, height, and aspect ratio;
- title, concise alt text, creator, and exact credit;
- source/object URL and permission or rights-proof URL;
- accession or partner inventory ID;
- source-image URL, download date, and SHA-256 checksum;
- lifecycle status and, when applicable, retirement date and replacement ID.

Replacement artwork must stay within 3% of its slot’s aspect ratio. A cleared
pack is first entered as non-ready, validated, previewed with every compatible
theme on desktop and phone, and only then changed to `ready`. The chooser derives
availability from that status, so incomplete starters cannot leak into new
drafts.

## Revocation runbook

1. Change affected artwork to `retiring` immediately and set the withdrawal
   date to the end of the contractual 90-day wind-down.
2. Change the starter from `ready` to a non-ready status before deploying. This
   removes it from marketing, the chooser, and new drafts.
3. Continue serving existing-draft bytes through the withdrawal date and keep
   the date visible beside the affected samples.
4. At expiration, remove the bytes but retain the catalog tombstone, dimensions,
   aspect ratio, credit history, and optional replacement ID.
5. Never substitute a successor automatically. Existing drafts show the
   same-size withdrawn card and offer the catalog successor as an explicit
   action when one exists.
