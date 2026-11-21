# Instructions for AI agents

This repository sorts the comments on a person's social media posts into themes (audience questions, objections, complaints, praise, requests, buying intent and more), with counts and exact quotes. The analysis follows `skills/comment-mining/SKILL.md` (adapted from ScrapeCreators' comment-mining, MIT). Scripts read the comments, count the labels and check the quotes; you label the comments and write the report.

Everything the person's data needs stays in `data/` (ignored by git): keys in `data/.env`, the source list in `data/sources.json`, the comments in `data/comments.jsonl`, analyses in `data/runs/`.

## Rules

1. **Talk to the person one thing at a time**, in plain words. Ask choices as questions (with your app's question tool if it has one). Nothing is read, bought or changed without their OK.
2. **Never ask for a key, token or password in the chat.** For a key they make, give them the one-line command that saves it (`node scripts/save-secret.js scrapecreators | youtube | x`, or `node scripts/meta-token.js` for Meta) to run in their own terminal. Then run `node scripts/check-keys.js`, which shows whether each key works without showing it.
3. **Meta's sites** (Facebook, Instagram, Meta for Developers): the person does every click, in the browser they always use. Start every message about a Meta step with the risk: Meta may log them out, ask for ID or restrict the account when a program clicks there; if that happens they stop and tell you. Never open these pages with your tools.
4. **Money**: before any read that costs money (ScrapeCreators credits, X credit), run `node scripts/fetch.js --plan`, tell them what the full read costs, and wait for their OK. They buy credit themselves; never enter payment details.
5. **Numbers only from scripts.** Counts come from `tally.js` or `find.js`; never count or estimate comments yourself. Every quote in a report must pass `check-quotes.js`.
6. **Privacy**: commenters' shown names, handles and platform IDs are stored locally so the person can find and answer them. Leave names out of reports unless the person asks (for example, "list who asked about the price"). Pictures, gender and other profile data are never stored. Do not paste comments into other services.
7. **TikTok connector**: use only its reading tools (`account_user_get`, `account_user_post_list_get`, `account_user_comment_list_get`, `account_user_comment_reply_list_get`). Never reply, like, hide, delete or publish unless the person asks for that exact action in words.

## Setting up

### 1. What to read
Ask, one question at a time:
- Which platforms (all are optional): YouTube, Instagram, Facebook, TikTok, X, Reddit.
- Their own accounts on those platforms, and any other accounts or single post links they want read.
- How far back: posts from the last how many days (default 7).

### 2. How to read each one

| Platform | Their own account | Other accounts and post links |
|---|---|---|
| YouTube | Official API (free, key) | Official API |
| Instagram | Official API (free; needs their own Meta app; gives names) or ScrapeCreators | ScrapeCreators |
| Facebook Page | Official API (free; while the Meta app is in development mode it gives other people's comments **without who wrote them**) or ScrapeCreators (gives names) | ScrapeCreators |
| Facebook profile in professional mode | ScrapeCreators only (the official API reads Pages, not profiles) | ScrapeCreators |
| TikTok | The official TikTok Social connector (free; works with personal accounts) or ScrapeCreators | ScrapeCreators |
| X | Official API (paid credit) | Official API |
| Reddit | (no own comment section) | ScrapeCreators, by post link |
| Any | Paste comments or import a CSV (`scripts/import.js`) | same |

For Instagram, Facebook and TikTok, explain both routes for their own account (official: more setup, free; ScrapeCreators: one key, costs credits, also reads other accounts) and let them choose. For Facebook, first ask whether they post as a Page or as a personal profile in professional mode.

### 3. Keys and connections (only for the sources chosen)
- **ScrapeCreators**: they sign up at https://scrapecreators.com (100 free credits, no card; credits never expire; 1 credit per page of comments, about 10 to 20 comments), copy the API key from the dashboard, then `node scripts/save-secret.js scrapecreators`.
- **YouTube**: an API key from Google Cloud (Credentials; Create credentials, API key; restrict it to YouTube Data API v3), then `node scripts/save-secret.js youtube`. 10,000 free units a day; 1 unit reads up to 100 comments.
- **X**: at https://console.x.com they check their credit, create a **new** app and copy its Bearer Token, then `node scripts/save-secret.js x`. Never ask them to press Generate or Regenerate on an app they already have: it stops whatever uses the old token. No automatic top-ups. Search covers only the last 7 days.
- **Meta (Instagram and Facebook official)**: an Instagram professional account linked to a Facebook Page they manage, and their own Meta app in development mode (no App Review). They do every click (rule 3): at https://developers.facebook.com/apps create an app with the use case "Manage messaging & content on Instagram" (when asked about a business portfolio: "I don't want to connect a business portfolio yet"), and in Use cases, Customize, Permissions and features add `instagram_basic` and `instagram_manage_comments`. For Facebook, also add a use case for managing the Page with `pages_read_user_content`, and the feature "Business Asset User Profile Access". In Graph API Explorer they choose the app, add `instagram_basic, instagram_manage_comments, pages_show_list, pages_read_engagement, pages_read_user_content, business_management`, Generate Access Token, and choose their Page and Instagram account in the pop-up. Then `node scripts/meta-token.js` (app ID; app secret from App settings, Basic; the Explorer token). It saves a Page token that does not expire.
- **TikTok Social connector** (official, https://business-api.tiktok.com/open_mcp/tt-ads-mcp-organic-social): no developer account or app; the person signs in with TikTok and authorizes; the authorization lasts a year. Explain how to add a remote MCP server **in your own app, following its current documentation**. Tested in the Claude app: Settings, Connectors, Add custom connector, the URL above, Connect, then in the chat's + menu, Connectors, switch it on. TikTok lists ChatGPT, Claude, Claude Code, Codex, Cursor, Gemini CLI and others. If your app cannot add a remote MCP server, say so and offer ScrapeCreators for their TikTok.

### 4. The source list and the first read
Write `data/sources.json` from their answers (see `sources.example.json`; `"route"` is `official` or `scrapecreators` for Instagram and Facebook, `mcp` or `scrapecreators` for TikTok). Run `node scripts/check-keys.js`, then `node scripts/fetch.js --plan`, tell them the cost (rule 4), and with their OK run `node scripts/fetch.js`.

For TikTok through the connector: call `account_user_post_list_get` (fields `item_id`, `create_time`, `comments`) and, for each video in the window with comments, `account_user_comment_list_get` (`video_id`, `include_replies: true`, `max_count: 30`), passing `cursor` until `has_more` is false. Save each answer as it came to `data/tiktok/<video_id>-<page>.json` and run `node scripts/import.js --tiktok-mcp <file> --account <their handle>` for each file.

## Each analysis

1. `node scripts/prepare.js --run <name>` (options: `--days`, `--since`, `--platform`, `--account`, `--own` or `--others`). Use a new run name each time, such as the date.
2. Label every batch as `skills/comment-mining/SKILL.md` says, into `data/runs/<name>/labels.jsonl`.
3. `node scripts/tally.js --run <name>` until it reports no problems.
4. Write `data/runs/<name>/report.md` in the skill's format, with numbers from `summary.json` only and comment IDs after quotes.
5. `node scripts/check-quotes.js --run <name>`; fix every quote it does not find.
6. Tell them where the report and `labelled.csv` (every comment with its bucket and theme, to check or filter) are, and the main points in a few lines. Then give two or three examples of questions they can ask you, such as "How many people asked about the price this week?" or "Show me every complaint about shipping".

## The person's own questions

Answer from the database with `node scripts/find.js`: `--text "words"`, `--platform`, `--days`, `--own`/`--others`, `--run <name> --bucket <bucket>` or `--theme <words>`, `--count` for numbers only, `--names` only when they want to know who. Give the counts it prints and quote with the IDs it shows. To refresh the data first, run `fetch.js` again (and the TikTok steps); comments already stored are updated, not repeated.

## Known limits (tested 2026-11-21)

- YouTube: at most 5 replies come with each comment; the rest cost 1 more unit per 100 (read by default; `--no-replies` skips them). Videos with comments turned off are skipped with a note.
- Facebook official, development mode: other people's comments come without name or ID (the comment written as the Page itself has them). The official route reads Pages only.
- ScrapeCreators: Instagram succeeds about 9 times in 10 (ScrapeCreators' own figure); some Facebook Pages show as private from outside and must be read by post link; Instagram, TikTok and Facebook replies are not read (their count is kept); Reddit's comment count includes removed comments, so fewer come back.
- TikTok connector: beyond 500 comments on one video, TikTok returns the rest by likes and may repeat some; the database keeps one copy of each.
- X: only the last 7 days; about $0.005 per reply plus $0.010 per different replier.

## Removing it

Ask before deleting anything. To remove the data, delete the `data/` folder (keys, comments and analyses). Keys can also be removed at each provider: the ScrapeCreators dashboard, Google Cloud Credentials, the X Developer Console, and for Meta, Facebook Settings, Business integrations; the TikTok connector in the app's connector settings.
