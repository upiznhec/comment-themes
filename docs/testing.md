# Test record

## 2026-11-21, development (Claude Code, Opus 5.5, on the author's Mac)

Endpoint checks before the scripts were written:
- ScrapeCreators (public CeraVe and creator posts): Instagram 12 and 10 comments a page, TikTok 15 and 17, Facebook 10, Reddit 15 then 4; failed requests cost nothing; some brand Pages (CeraVe, Ulta) show as private from outside while Sephora and Nike work.
- YouTube Data API: 144 comments = 84 threads + 60 replies in one page; 267 = 100 + 79 threads + replies; brand channels can be quiet (CeraVe's 15 latest uploads had 0 to 16 comments).
- X API (app Bearer Token): 5 CeraVe posts in 7 days, all 9 replies of one read with names; about US$0.15.
- Meta (development-mode app, Page token): Instagram 5 comments with usernames and IDs; Facebook Page comments come with text but without the commenter's name or ID unless the comment was written as the Page; a personal profile in professional mode cannot be read with the Page token.
- TikTok Social connector (Claude app, custom connector, personal account): 14 videos listed; 4 comments of one video with display name, username and ID.

Scripts, live run on the author's accounts plus one public YouTube video and one Reddit post (window 30 days):
- `fetch.js --plan`: Instagram 2 posts (7 and 0 comments), Facebook 1 post (2), YouTube and Reddit links listed.
- `fetch.js`: 211 comments (Instagram 7, Facebook 2 of which 1 without a name, YouTube 144 incl. 60 replies, Reddit 58 incl. 20 replies of the post's 95); cost 3 ScrapeCreators credits and 3 YouTube units.
- `import.js --tiktok-mcp`: 4 comments; importing again added none.
- Run `test-own` (13 own comments): labelled by hand, `tally.js` counted 11 useful and 2 not useful; `check-quotes.js` found 4 real quotes (including a curly apostrophe) and caught 1 made-up quote; `find.js --run test-own --bucket questions` listed 3.
- `npm test`: 19 tests pass.

## 2026-11-21, change: post links, one request at a time

Why: the first design asked everything at setup (platforms, own and other accounts, a time window, a route for each own platform, every key), so the setup request and the test had to cover every combination. Comment sorting is done when the person wants it, not on a schedule, and ScrapeCreators' comment-mining takes post links in each request ("Use the post/video URL whenever possible"). Now setup only installs the repository; each request lists post links in `data/runs/<name>/request.json`, and a choice or key is asked for the first time a request needs it. Choices are remembered in `data/choices.json`. There are no accounts and no time window.

Checks:
- `npm test`: 24 tests pass (request rules, post-link readers for every route, choosing a request's comments).
- Live run `dev-links` (8 links), `fetch.js --plan --max-pages 1`: Instagram official 7 comments, Facebook Page post 2, YouTube 144, ScrapeCreators posts shown with a ceiling of 1 credit each; the TikTok link without "own" was held back with the question to ask; a made-up Page share link (pfbid) stopped with the Page's latest posts listed.
- `fetch.js --max-pages 1`: Instagram 7 of 7, Facebook Page 2 of 2 (1 without a name), Facebook profile post through ScrapeCreators 4, YouTube 144 of 144, Reddit 25 (one page); 2 ScrapeCreators credits, 4 YouTube units.
- TikTok connector: `account_user_comment_list_get` on the own video gave 4 comments; `import.js --tiktok-mcp --post <link>` stored them under the link and removed the profile picture links from the saved answer.
- `prepare.js --run dev-links` took the request's comments and named the two links with none; `find.js --post <video ID>` found the 4 TikTok comments.
- Found: Meta's API gives Page posts numeric links (`/posts/<number>`), while a link copied in the browser can be a share link (`pfbid...`), which cannot be matched; the agent then asks which of the listed latest posts it is.

## 2026-11-21, change: accounts with a time range

The user kept accounts as a second kind of input: "analyse MrBeast's videos of the past month" means every post the account published in that range, with all its comments. A request now holds `accounts` and `time` (`{ "days": 30 }` or `{ "from": "2026-10-18", "to": "2026-11-04" }`) besides post links. The plan finds the posts and keeps them in `posts.json`, so the read covers what the plan showed; `prepare.js` takes the comments of both.

Checks:
- `npm test`: 31 tests pass (time ranges, accounts in requests, listing for YouTube, ScrapeCreators Instagram, X and the Facebook Page).
- Live run `dev-accounts`, past 30 days: YouTube @MrBeast 7 videos with 4,891 to 68,544 comments each (207,152 in all; the plan cost 3 free units); own Instagram 2 posts (7 and 0 comments); own Facebook Page 1 post (2). Reading the own accounts used the posts found by the plan; MrBeast was read one page per video without replies (729 comments stored, 7 units). `prepare.js` took 738 comments for the request.
- Found: a large account is far beyond what can be labelled in one analysis (207,152 comments would be about 3 million tokens of text before any labels); a default sample for large requests is to be decided.

Still to do: the three-agent tests (Codex, Claude Code, DeepSeek Harness) with the new setup request and a series of ordinary requests.
