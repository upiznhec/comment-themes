# Instructions for AI agents

This repository sorts the comments on social media posts into themes (audience questions, objections, complaints, praise, requests, buying intent and more), with counts and exact quotes. The person sends post links; you read every comment of those posts, label the comments and write the report. The analysis follows `skills/comment-mining/SKILL.md` (adapted from ScrapeCreators' comment-mining, MIT). Scripts read the comments, count the labels and check the quotes.

Everything the person's data needs stays in `data/` (ignored by git): keys in `data/.env`, the person's remembered choices in `data/choices.json`, the comments in `data/comments.jsonl`, and one folder per request in `data/runs/`.

## Rules

1. **Talk to the person one thing at a time**, in plain words. Ask choices as questions (with your app's question tool if it has one). Ask only for what the current request needs, at the moment it is needed. Nothing is read, bought or changed without their OK.
2. **Never ask for a key, token or password in the chat.** For a key they make, give them the one-line command that saves it (`node scripts/save-secret.js scrapecreators | youtube | x`, or `node scripts/meta-token.js` for Meta) to run in their own terminal. Then run `node scripts/check-keys.js`, which shows whether each key works without showing it.
3. **Meta's sites** (Facebook, Instagram, Meta for Developers): the person does every click, in the browser they always use. Start every message about a Meta step with the risk: Meta may log them out, ask for ID or restrict the account when a program clicks there; if that happens they stop and tell you. Never open these pages with your tools.
4. **Money**: before any read that costs money (ScrapeCreators credits, X credit), run `node scripts/fetch.js --run <name> --plan`, tell them what the full read costs, and wait for their OK. They buy credit themselves; never enter payment details.
5. **Numbers only from scripts.** Counts come from `tally.js` or `find.js`; never count or estimate comments yourself. Every quote in a report must pass `check-quotes.js`.
6. **Privacy**: commenters' shown names, handles and platform IDs are stored locally so the person can find and answer them. Leave names out of reports unless the person asks (for example, "list who asked about the price"). Pictures, gender and other profile data are never stored. Do not paste comments into other services.
7. **TikTok connector**: use only its reading tools (`account_user_get`, `account_user_post_list_get`, `account_user_comment_list_get`, `account_user_comment_reply_list_get`). Never reply, like, hide, delete or publish unless the person asks for that exact action in words.

## Setting up

When the person asks you to set this up, download the repository (with git, or as a ZIP if git is not available) and run `npm test` to check that Node.js 20 or newer works. Then tell them in two or three sentences how to use it: send the links of the posts whose comments they want sorted (YouTube, Instagram, Facebook, TikTok, X or Reddit), and say which posts are their own. Ask nothing else now: routes and keys are settled the first time a request needs them.

## Each request

### 1. Write the request
Give the request a name (letters, digits, dots and dashes, such as `2026-11-21-launch`) and write its links to `data/runs/<name>/request.json`:

```json
{
  "posts": [
    { "url": "https://www.instagram.com/p/POST_CODE/", "own": true },
    { "url": "https://www.tiktok.com/@anotherbrand/video/VIDEO_ID", "own": false },
    { "url": "https://www.youtube.com/watch?v=VIDEO_ID" }
  ]
}
```

- `"own"` says whether the post is the person's own. It is required for Instagram, Facebook and TikTok links, because it decides how the post is read; if the person did not say, ask. Posts from accounts listed under `own_accounts` in `data/choices.json` are theirs.
- Every comment of each post is read; there is no time window. If the person wants an account's latest posts, ask them for the links.
- A post may carry `"route"` to override the remembered choice, for example `"scrapecreators"` for a post on their personal Facebook profile when their choice for Facebook is the official route, which reads Pages only.

### 2. How each post is read

| Platform | The person's own post | Someone else's post |
|---|---|---|
| YouTube | Official API (free, key) | Official API |
| Instagram | Official API (free; needs their own Meta app; gives names) or ScrapeCreators | ScrapeCreators |
| Facebook Page | Official API (free; while the Meta app is in development mode it gives other people's comments **without who wrote them**) or ScrapeCreators (gives names) | ScrapeCreators |
| Facebook profile in professional mode | ScrapeCreators only (the official API reads Pages, not profiles) | ScrapeCreators |
| TikTok | The official TikTok Social connector (free; works with personal accounts) or ScrapeCreators | ScrapeCreators |
| X | Official API (paid credit; posts from the last 7 days only) | Official API |
| Reddit | ScrapeCreators | ScrapeCreators |
| Any | Paste comments or import a CSV (`scripts/import.js`) | same |

The first time the person sends their own Instagram, Facebook or TikTok post, explain the two routes for that platform (official: more setup, free, their own posts only; ScrapeCreators: one key, costs credits, also reads other people's posts) and let them choose. For Facebook, first ask whether they post as a Page or as a personal profile in professional mode. Save the choice, and any account they say is theirs, in `data/choices.json`, and do not ask again:

```json
{
  "own_routes": { "instagram": "official", "facebook": "scrapecreators", "tiktok": "mcp" },
  "own_accounts": ["Instagram @yourbrand", "TikTok @yourbrand"]
}
```

### 3. Check what is missing, then agree the cost
Run `node scripts/fetch.js --run <name> --plan`. It lists each post with its number of comments, where the platform gives one, and what reading it costs (the plan itself is free, except about $0.005 for looking up each X post). It also names what is still missing:
- "ask whether this ... post is the person's own" or "ask how to read the person's own ... posts": ask, update `request.json` or `choices.json`, and run the plan again.
- "key not saved yet": set up that key only (section 4), run `node scripts/check-keys.js`, and run the plan again.

Then tell them the cost (rule 4) and, with their OK, run `node scripts/fetch.js --run <name>`.

### 4. Keys and connections, only the ones a request needs
- **ScrapeCreators**: they sign up at https://scrapecreators.com (100 free credits, no card; credits never expire; 1 credit per page of comments, about 10 to 20 comments), copy the API key from the dashboard, then `node scripts/save-secret.js scrapecreators`.
- **YouTube**: an API key from Google Cloud (Credentials; Create credentials, API key; restrict it to YouTube Data API v3), then `node scripts/save-secret.js youtube`. 10,000 free units a day; 1 unit reads up to 100 comments.
- **X**: at https://console.x.com they check their credit, create a **new** app and copy its Bearer Token, then `node scripts/save-secret.js x`. Never ask them to press Generate or Regenerate on an app they already have: it stops whatever uses the old token. No automatic top-ups. Only posts from the last 7 days can be read.
- **Meta (Instagram and Facebook official)**: an Instagram professional account linked to a Facebook Page they manage, and their own Meta app in development mode (no App Review). They do every click (rule 3): at https://developers.facebook.com/apps create an app with the use case "Manage messaging & content on Instagram" (when asked about a business portfolio: "I don't want to connect a business portfolio yet"), and in Use cases, Customize, Permissions and features add `instagram_basic` and `instagram_manage_comments`. For Facebook, also add a use case for managing the Page with `pages_read_user_content`, and the feature "Business Asset User Profile Access". In Graph API Explorer they choose the app, add `instagram_basic, instagram_manage_comments, pages_show_list, pages_read_engagement, pages_read_user_content, business_management`, Generate Access Token, and choose their Page and Instagram account in the pop-up. Then `node scripts/meta-token.js` (app ID; app secret from App settings, Basic; the Explorer token). It saves a Page token that does not expire.
- **TikTok Social connector** (official, https://business-api.tiktok.com/open_mcp/tt-ads-mcp-organic-social): no developer account or app; the person signs in with TikTok and authorizes; the authorization lasts a year. Explain how to add a remote MCP server **in your own app, following its current documentation**. Tested in the Claude app: Settings, Connectors, Add custom connector, the URL above, Connect, then in the chat's + menu, Connectors, switch it on. TikTok lists ChatGPT, Claude, Claude Code, Codex, Cursor, Gemini CLI and others. If your app cannot add a remote MCP server, say so and offer ScrapeCreators for their TikTok.

### 5. Their own TikTok videos through the connector
fetch.js only lists them. For each video, take the video ID from the link (the digits after `/video/`), call `account_user_comment_list_get` (`video_id`, `include_replies: true`, `max_count: 30`) and pass `cursor` until `has_more` is false. Each comment comes with at most three replies; for a comment whose `replies` number is higher, call `account_user_comment_reply_list_get` (`video_id`, `comment_id`, `max_count: 30`) the same way. Save each answer as it came to `data/runs/<name>/tiktok-<video_id>-<page>.json` (replies: `tiktok-<video_id>-<comment_id>-<page>.json`) and run `node scripts/import.js --tiktok-mcp <file> --post <the link as written in request.json>` for each file. The import removes the profile picture links from the file.

### 6. Facebook links the official route cannot match
A share link to a post of their Page (`pfbid...` or `/share/...`) is looked for among the Page's posts. If it is not found, fetch.js lists the Page's latest posts with their dates and first words: ask which one it is, and put that post's link in `request.json` instead.

### 7. The analysis
1. `node scripts/prepare.js --run <name>`. It takes the comments of the request's posts and names any post with no comments stored (not read yet, nothing to read, or skipped).
2. Label every batch as `skills/comment-mining/SKILL.md` says, into `data/runs/<name>/labels.jsonl`.
3. `node scripts/tally.js --run <name>` until it reports no problems.
4. Write `data/runs/<name>/report.md` in the skill's format, with numbers from `summary.json` only and comment IDs after quotes.
5. `node scripts/check-quotes.js --run <name>`; fix every quote it does not find.
6. Tell them where the report and `labelled.csv` (every comment with its bucket and theme, to check or filter) are, and the main points in a few lines. Then give two or three examples of questions they can ask you, such as "How many people asked about the price?" or "Show me every complaint about shipping".

To analyse everything read so far, or a part of it, use a new run name without a `request.json`: `prepare.js --run <name>` then takes the whole database, narrowed by `--days`, `--since`, `--platform`, `--post <part of a link>` or `--own`/`--others`.

## The person's own questions

Answer from the database with `node scripts/find.js`: `--text "words"`, `--platform`, `--post <part of a link>`, `--days`, `--own`/`--others`, `--run <name> --bucket <bucket>` or `--theme <words>`, `--count` for numbers only, `--names` only when they want to know who. Give the counts it prints and quote with the IDs it shows. To refresh a request's comments first, run `fetch.js --run <name>` again (and the TikTok steps); comments already stored are updated, not repeated.

## Known limits (tested 2026-11-21)

- YouTube: at most 5 replies come with each comment; the rest cost 1 more unit per 100 (read by default; `--no-replies` skips them). Videos with comments turned off are skipped with a note.
- Instagram official: reads only posts of the Instagram account linked to the person's Page.
- Facebook official, development mode: other people's comments come without name or ID (the comment written as the Page itself has them). The official route reads Pages only.
- ScrapeCreators: the number of comments is not known before reading, so the plan gives a ceiling (at most `--max-pages`, default 30, credits per post). Instagram succeeds about 9 times in 10 (ScrapeCreators' own figure); Instagram, TikTok and Facebook replies are not read (their count is kept); Reddit's comment count includes removed comments, so fewer come back.
- TikTok connector: beyond 500 comments on one video, TikTok returns the rest by likes and may repeat some; the database keeps one copy of each.
- X: posts older than 7 days are skipped; looking a post up costs about $0.005, each reply $0.005 and each different replier $0.010.

## Removing it

Ask before deleting anything. To remove the data, delete the `data/` folder (keys, choices, comments and analyses). Keys can also be removed at each provider: the ScrapeCreators dashboard, Google Cloud Credentials, the X Developer Console, and for Meta, Facebook Settings, Business integrations; the TikTok connector in the app's connector settings.
