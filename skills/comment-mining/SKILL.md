---
name: comment-mining
description: Use when the person wants to sort comments on their own (or other public) social posts into themes: audience questions, objections, complaints, praise, confusion, requests, buying intent, debate and culture signals, with exact quotes. Works on the comment database of this repository.
license: MIT
---

<!-- Adapted from comment-mining (version 1.0.0) in https://github.com/ScrapeCreators/social-media-research-skills,
Copyright (c) 2026 ScrapeCreators, MIT License (full text in LICENSE in this folder; details in THIRD_PARTY_NOTICES.md).
Not affiliated with or endorsed by ScrapeCreators. Changes: comments come from this repository's database
(official APIs, the TikTok Social connector, ScrapeCreators or an import) instead of ScrapeCreators calls only;
a not_useful bucket stands for the cleaning step; scripts do the counting and check the quotes. The buckets, the
themes, the report format, the guardrails and the pitfalls are the original's. -->

# Comment Mining

## Overview

Mine comments for what people actually ask, complain about, want, misunderstand, or repeat. The output should help with product research, content ideas, copywriting, objection handling, and audience understanding.

## When to Use

Use this skill when the person asks to:

- analyze the comments on their posts and videos (or on other public posts they list)
- find audience questions, objections, complaints, or buying intent
- extract voice-of-customer language
- find content ideas from comments
- understand sentiment around a post, creator, product, or topic

## Where the comments come from

From `data/comments.jsonl`, filled for each request (the post links and accounts in `data/runs/<name>/request.json`) by `scripts/fetch.js` (YouTube, Instagram, Facebook, X, Reddit, TikTok through ScrapeCreators) and `scripts/import.js` (TikTok through the TikTok Social connector, pasted comments, CSV files). AGENTS.md says how each source is set up. Do not read comments any other way.

## Workflow

1. **Choose the comments**: `node scripts/prepare.js --run <name>`. For a request it takes the comments of the request's posts; without one, the whole database and the person's filters. It writes batches of short IDs, text and likes, without names.

2. **Clean lightly** (while labelling)
   - Label obvious spam, emoji-only comments, tagged friends and off-topic comments `not_useful`.
   - Keep slang, misspellings, and emotional wording if it is useful customer language.
   - Do not over-normalize exact quotes.

3. **Classify each useful comment** into one bucket:
   - questions
   - objections
   - complaints (complaints/pain points)
   - praise
   - confusion
   - requests (requests/feature ideas)
   - buying_intent
   - debate (controversy/debate)
   - culture (jokes/memes/culture signals)

   Give each one a theme: a few words naming what it is about, reused word for word for the same topic. Write one line per comment to `data/runs/<name>/labels.jsonl`: `{"id":"C0001","bucket":"questions","theme":"price of the travel size"}`. Label every comment of every batch.

4. **Cluster themes**
   - Run `node scripts/tally.js --run <name>`. It refuses missing, doubled or unknown labels; fix them and run it again.
   - Use only its numbers: comments, different people and likes per theme (intensity). Never count or estimate yourself.
   - Merge themes that mean the same by relabelling, then tally again.
   - Take exact quotes from the examples in `summary.json` or from `scripts/find.js`.

5. **Turn insights into actions**
   Depending on the person's goal, produce:
   - content ideas
   - FAQ ideas
   - landing page copy angles
   - product ideas
   - objection-handling bullets
   - sales/support notes

6. **Check the quotes**: save the report as `data/runs/<name>/report.md` and run `node scripts/check-quotes.js --run <name>`. Fix every quote it does not find before showing the report.

## Output Format

```markdown
# Comment Mining Report

## Summary
- Source(s): {platforms, accounts and post links}
- Comments analyzed: {count}
- Confidence: High/Medium/Low

## Top Themes
| Theme | Type | Frequency | Intensity | Representative quote |
|---|---|---:|---|---|

## Audience Questions
- "..."

## Objections and Concerns
- **Objection:** ...
  - Evidence: "..."
  - Response angle: ...

## Buying Intent / Demand Signals
- "..."

## Exact Language to Reuse
- "..."
- "..."

## Content Ideas From Comments
1. ...
2. ...
```

Frequency is the number of comments (and of different people) from `summary.json`; intensity is the likes. Add the comment IDs after each quote, for example `"Is this new or used?" (C0007)`.

## Quality Guardrails

- Label sample size and confidence (`tally.js` suggests one from the number of useful comments).
- Separate one loud comment from a repeated pattern (`summary.json` marks themes with one comment).
- Preserve exact quotes for useful language.
- Avoid claiming broad market sentiment from one post's comments.
- Call out moderation/platform bias when relevant (hidden comments are marked; Facebook comments read through the official route may lack names).

## Common Pitfalls

- Do not flatten comments into generic sentiment. The value is in questions, objections, and exact wording.
- Do not include personally identifying details unless they are already public and necessary. Leave commenters' names out of reports unless the person asks for them (for example, a list of buyers to answer).
- Do not treat bot/spam comments as audience signal.
- Do not skip Reddit post context. For Reddit, read both the original post and comments.
