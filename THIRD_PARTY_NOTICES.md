# Third-party notices

## comment-mining skill, by ScrapeCreators

- **Used in:** `skills/comment-mining/SKILL.md`
- **Source:** `skills/comment-mining/SKILL.md` (version 1.0.0) in https://github.com/ScrapeCreators/social-media-research-skills, as of commit 64ba7b4 (2026-08-26)
- **Copyright:** Copyright (c) 2026 ScrapeCreators
- **License:** MIT. The full license text, unchanged, is in `skills/comment-mining/LICENSE`.
- **What we kept:** the overview, when to use it, the nine buckets, the workflow steps, the report format, the quality guardrails and the common pitfalls, largely word for word.
- **What we changed:** the comments come from this repository's database (official APIs, the TikTok Social connector, ScrapeCreators' API or an import) instead of ScrapeCreators' API calls only; more than 1,000 comments are analysed on the 1,000 most-liked; a `not_useful` bucket stands for the original's cleaning step; scripts count the labels (`scripts/tally.js`) and check every quote (`scripts/check-quotes.js`); a sentence on leaving commenters' names out of reports.

This project is not affiliated with, sponsored by or endorsed by ScrapeCreators. "ScrapeCreators" is used only to name the source and the service the scripts can call; using that service is subject to ScrapeCreators' own terms.

## Code reused from the Workflow 2 repository

`scripts/lib/prompt.js` and `scripts/lib/env-file.js` were written for this capstone in the Workflow 2 repository, https://github.com/upiznhec/Sibyl-System-Hotspot-Monitor (commits 08906f6 and 696420e, 2026-11-15), by the same author as this repository. They contain no code from the original Sibyl System Hotspot Monitor by Misaka Studio.

## Platforms

YouTube, Instagram, Facebook, TikTok, X and Reddit are trademarks of their owners. The scripts use these platforms' official APIs where they exist; using them is subject to each platform's terms.
