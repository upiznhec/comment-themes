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

## 2026-11-21, change: large posts and large analyses

The user agreed two defaults for large requests: a post with more comments than the page limit is read top comments first (YouTube "relevance", X "relevancy"), and an analysis of more than 1,000 comments labels a sample of the 500 most-liked and 500 others at random (the same run name draws the same sample), recorded in `sample.json` and `summary.json` so the report can say how many of how many were labelled. The person's own questions (`find.js`) still count over every comment read.

Checks:
- `npm test`: 33 tests pass (the sample, and the order used for large posts on YouTube and X).
- One MrBeast video (68,540 comments), one page each way: the top-comments page had a median of 242 likes per comment (25th percentile 58); the newest-first page read earlier had a median of 0. 2 free YouTube units.
- `prepare.js --run dev-sample --max 200` over the 1,234 stored comments: 100 most-liked and 100 at random, written to `sample.json`.

## 2026-11-21, change: accounts removed again

The user checked the research for any wish to look at a whole account. In the seven interviews only one participant looks at accounts (competitors' content, how it performs, what they say); nobody described analysing an account's comments. In the survey (n=102), 66 track competitor or peer accounts, but the option names their content and performance, not comments. With no evidence for the need, the user removed accounts and time ranges: a request lists post links only, as in comment-mining. The account code (listing a channel's or profile's posts in a time range) was taken out; the changes for large posts and large analyses stay.

Checks: `npm test`, 26 tests pass; a request that still lists accounts is held back with the message to list posts instead.

## 2026-11-21, change: the 1,000 most-liked comments

The user chose the sampling rule: when a request's comments add up to more than 1,000, only the 1,000 most-liked are labelled, the same limit as ScrapeCreators' YouTube comments endpoint (at most about 1,000 top comments). This replaces the earlier mix of 500 most-liked and 500 at random. The report says it covers the 1,000 most-liked of the comments read; its counts lean towards the most popular comments. `find.js` still counts over every comment read.

Checks: `npm test`, 26 tests pass; `prepare.js --run dev-top200 --max 200` over the 1,234 stored comments kept the 200 most-liked, and no comment left out had more likes than the lowest one kept.

## 2026-11-21, change: the limit is per post

The user asked whether the 1,000 limit counted all links together or each platform, and chose each post: a post with more than 1,000 comments is analysed on its own 1,000 most-liked, which is how ScrapeCreators' YouTube endpoint limits a video. A limit over all links together let the platform with the largest like counts (YouTube) take every place, since likes are not comparable across platforms. `prepare.js` prints which posts were cut and asks the agent to tell the person how many comments it will label.

Checks: `npm test`, 26 tests pass; `prepare.js --run dev-perpost --max 100` over the 1,234 stored comments cut the posts with more than 100 comments to their 100 most-liked and kept every comment of the smaller posts.

## 2026-11-21, change: X posts of any age

The user remembered reading far more posts in the X Developer Console and asked why X was limited to 7 days. The limit came from the endpoint the script used, not from X: replies are found by searching a post's conversation, and recent search covers only the last 7 days. X's documentation says full-archive search (`/2/tweets/search/all`, back to March 2006) is available to pay-per-use and Enterprise accounts. `x.js` now uses recent search for posts from the last 7 days and full-archive search, starting at the post's time, for older ones, with up to 500 replies a page and 1.1 seconds between requests (X allows 1 a second and 300 in 15 minutes). If X refuses full-archive search (HTTP 403), the post is skipped with X's reason.

Checks: `npm test`, 27 tests pass. With the development key, a full-archive search that could match nothing returned HTTP 200 and no posts (no charge). A live read of two CeraVe posts from 8 and 9 days ago returned 11 and 3 replies for about US$0.16 (16 posts and 8 users counted). The first post showed 6 replies on X, but its thread held 11, so the plan's "at most" figure for X was lower than the real cost. Each reply's `referenced_tweets` shows why: 6 replies answer the post and 5 answer other replies, and every post's `reply_count` counts only the replies made directly to it (the post 6; five of its replies 1 each; 6 + 5 = 11). Of the 11, 6 were written by the brand itself. The first read stored no parent for two of the 5 nested replies; three later reads with the same code gave both parents, and the database did not update a stored parent on a later read.

The user chose to fix both. The plan now prices an X post by the replies X shows and says that replies to replies are read too at the same price, so it can cost more; a post with more replies than the page limit gets a ceiling instead. A later read now fills in a parent that an earlier read left empty, and never empties one. Checks: `npm test`, 29 tests pass; reading the two posts again on the same UTC day filled in the two missing parents (6 replies answer the post, 5 answer replies).

## 2026-11-21, change: the agent does the clicks up to the key

In the Claude Code test, the agent gave the person every YouTube step: open the API library and enable the API, create and restrict the key, then save it. The user asked for Workflow 2's split, for every platform: the person only signs in, then makes and copies the key (and saves it with the command); the agent does the other clicks in the person's signed-in browser. AGENTS.md rule 3 ("Who does what") and section 4 now say so for ScrapeCreators, YouTube and X, with where the line is on each site; CLAUDE.md points to it. Meta stays the person's (in Workflow 2's tests, Meta logged the user out after an agent clicked on its developer pages), and the TikTok connector is added in the person's own AI app. If the agent cannot use the person's browser, it gives the steps one at a time as before.

## 2026-11-21, Claude Code test 1: the user's own posts

The user sent one request from the task page to a new Claude Code session (Opus 5.5) in an empty folder: five of their own posts (YouTube, Instagram, Facebook, TikTok, X), with Instagram and Facebook through the official API and TikTok through the connector. The agent set the repository up (29 tests pass). In the user's Chrome it made a Google Cloud project and enabled the YouTube API, and it opened X's console; the user made and saved both keys. It guided the Meta app, permissions and token, with every click by the user. It read YouTube 3 comments (the video shows 4; one has no text), TikTok 4, X 2 (about US$0.035 with the lookup), Instagram 8 and Facebook 2, labelled the 19 comments and wrote the report; every quote passed `check-quotes.js`.

Found, and what changed:
- The TikTok connector was already in the user's Claude account from earlier tests, so the agent only switched it on. Most people will not have it. AGENTS.md now does not assume anything is set up (rule 8): before relying on a key, the connector, a Meta app and its permissions or a Page, the agent checks that it is there, and it gives the way to add the connector from the start; in Claude it is in the connector directory as "Tiktok Social", and CLAUDE.md says to offer it with the connector suggestion tool. Once it works, the agent checks that its account is the one in the links.
- When the agent opened Google Cloud, Chrome went to a university's sign-in page. Rule 3 now says to tell the person which account to use before each sign-in, and section 4 says which on each site (for YouTube, a personal Google account such as the channel's; the key reads any public video).
- The Meta steps had been written from an app that already had some permissions (made for Workflow 2). With a new app, `pages_read_engagement` was missing from Graph API Explorer until the user added it on the "Manage everything on your Page" card. Section 4 now lists every permission and feature by card, has the person check that all six are in the Explorer's list, and gives direct links: the user could not find App settings, and asked which of two Customize buttons was meant.
- The Facebook link was on the user's personal profile in professional mode (a "Digital creator" label and a Dashboard button), not on a Page. The user ran it this way on purpose, to see how the agent guides someone who does not know what a business account is. The agent found the problem only after the whole Meta setup, when the token covered a different Page (one made for Workflow 2), and before that it offered that Page's only post as a match. Facebook's official route reads only Pages (business accounts) that the person's profile manages; a profile cannot be read this way, also in professional mode. AGENTS.md now checks what the post is on before any Meta step (the person's list of Pages at facebook.com/pages/?category=your_pages), offers ScrapeCreators for a post on a profile, and explains making a Page for later posts if they want the official route. fetch.js's message for a link it cannot match now says not to offer another Page's posts in its place. For this run, the user chose the post on the test Page.
- Task page: in "My own posts" mode, a Facebook link gets a note that the Official API needs the post to be on a business account (a Facebook Page they manage); in "How each post is read", Facebook's chips say "for business accounts" and "for non-business accounts", and Instagram's "for professional accounts" and "for personal accounts"; step 3 says to log in with the account the posts belong to.
- Two smaller ones the user chose to fix as well. The YouTube video showed 4 comments, but the database took 3, and the agent wrote its own script to find out why: one comment had no text, and comments without text are not stored. fetch.js and import.js now say how many comments had no text. And the report put the Page's name in double quotes, which `check-quotes.js` took for a quote from the comments; AGENTS.md now says to put only words from the comments in quotes.

Checks: `npm test`, 30 tests pass (one new: the line after reading a post counts the comments without text).

The user then corrected the first wording of rule 8, "Assume nothing is set up yet". Their rule is not to assume that anything is set up, which is not the same as assuming that nothing is: the agent checks what is there instead of taking either for granted. Rule 8 now reads "Do not assume anything is set up", and the sentences that point to it were changed to match.

Still to do: the remaining Claude Code test requests, then the same tests in Codex and DeepSeek Harness.
