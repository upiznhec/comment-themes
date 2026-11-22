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

## 2026-11-21, Claude Code test 2: other people's posts

In the same Claude Code session, the user first updated the workflow twice (both pulls kept every file in `data/`, which the agent checked with checksums) and asked two questions about test 1, which `find.js` answered. Then they sent a request from the task page with eight public McDonald's posts, none read through ScrapeCreators before: one Instagram post, one Facebook post, one X post, four TikTok videos and one Reddit thread. They chose the brand with the research in mind: people want to find what is commercially useful in large numbers of comments. They were satisfied with the result and asked what to change.

What happened:
- ScrapeCreators: the agent opened the dashboard in the user's Chrome (already signed in), and the user copied and saved the key. The first save stored the save command itself (85 characters, with spaces), because the clipboard still held the command. check-keys.js showed HTTP 401; the agent found the cause by comparing lengths without showing the value. The second save worked.
- The agent asked how many pages to read per post, and the user chose 100. The seven ScrapeCreators posts were read in the background in about 11 minutes for 156 credits: Instagram 1,392 comments (169 without text), Facebook 694 (7 without text), Reddit 25, TikTok 226, 126, 199 and 322. The user had to ask whether it was progressing.
- X: the plan priced the post's 951 replies at about US$14.26. The user chose the 300 most relevant, at most US$4.50: 301 were read for about US$4.12, plus US$0.005 for the lookup. The agent read X only after the ScrapeCreators read had finished, so that two reads did not write the database at once.
- Analysis: 3,072 comments were read; the Instagram post was cut to its 1,000 most-liked, which left 2,849 to label in 19 batches (about 19 minutes). The agent kept its own list of themes in its scratchpad and renamed five themes across batches. `tally.js` counted 1,948 useful and 901 not useful comments in 50 themes, and all 58 quotes passed `check-quotes.js`. The report could say what the posts were about only "judging from the comments", because the posts' own text was not saved.

The user chose all four changes:
- save-secret.js and meta-token.js refuse a pasted command and save nothing. Rule 2 asks the person to run the command first and copy the key while it waits. The task page has its first "If it goes wrong" entry for this.
- fetch.js prints a line as each post starts and every 10 pages. Section 3 says a ScrapeCreators page takes about 4 seconds and asks the agent to say how long a read of more than about 50 pages will take.
- With more than one batch, the agent keeps the themes in `data/runs/<name>/themes.md` and reuses them; prepare.js says so.
- fetch.js keeps what each post says itself in `data/runs/<name>/posts.json`: the YouTube title and description, the X text, the Instagram caption and Facebook message through Meta, and the caption or description through ScrapeCreators. ScrapeCreators' comment endpoints do not give it (checked on four of these posts), so its post endpoints are read first, for 1 more credit on Instagram, TikTok and Facebook; Reddit's title and text come with the comments. The post endpoints also give the post's comment count, so the line after reading now says how many the post shows. prepare.js prints the posts' text before labelling.
- prepare.js no longer says the request's comments were "chosen in all" when only some of them are labelled.

Checks: `npm test`, 34 tests pass. Live run `dev-postinfo` (one TikTok video and the Reddit thread at one page each, and one YouTube video): the three posts' text was saved and printed by prepare.js, for 3 ScrapeCreators credits. Checking the endpoints first used 7 more credits.

## 2026-11-21, DeepSeek Harness test: the user's own posts

The user sent the same five own posts as in Claude Code test 1 (YouTube, Instagram, Facebook, TikTok, X) to DeepSeek Harness (DeepSeek-V4.1-Flash, its workspace-write sandbox), in an empty folder, from 20:36 to 21:32. The agent set the workflow up (34 tests, then 35 after an update during the test), guided the Meta app, permissions and token, the YouTube key and the X token, and read all five posts: 19 comments, labelled and reported, every quote checked. Cost: X about US$0.045 (a lookup of a mistyped link, then the read); everything else free. The user collected the problems during the test and had them fixed together afterwards, except the first.

Found, and what changed:
- The agent asked for the Meta app ID in the chat, as AGENTS.md said, to give direct links; the user did not want to give it there. Fixed during the test: nothing about the app is asked in the chat; Use cases is opened from the app's left menu; meta-token.js asks for the app ID and shows the link to the app secret. Before the command, the agent now also says where both values are (the person asked).
- DeepSeek Harness cannot click in the person's own browser, so every Google step was left to them, five at once, without a reason. When the user asked, the agent opened each page with `open`, which the sandbox allowed. Rule 3 now says to say why the clicks are the person's and to open each page with the system's open command, one button at a time.
- The Instagram check took two needless rounds (a web page that does not show the account type, then phone-app steps for someone on a computer); the Page's Linked accounts settled it. Meta step 1 now checks only Linked accounts (a connected account is always professional) and asks about the device before giving app steps.
- A question box hid the list of which permission goes on which card, and the person asked twice. Rule 1 now keeps steps in a message of their own, with no question at the same time. Meta step 3 now names the two screens met on the way: a "Unified login" business-portfolio banner to leave alone, and an "affects other use cases" box where the person clicks Add.
- TikTok: DeepSeek Harness's MCP client takes only a link and fixed headers, with no sign-in step, so the TikTok Social connector could not be added. On the user's request the agent built its own bridge with mcp-remote 0.16.4 (MIT, npm), which does TikTok's sign-in in the browser; the sandbox blocks writes to the home folder, so the sign-in went to /tmp. It read the video's 4 comments. The user chose to ship such a bridge: `scripts/tiktok-bridge.js` runs the connector through mcp-remote pinned to 0.16.4, calls only the four reading tools, keeps the sign-in in `data/tiktok-auth/`, reads every comment and reply of the request's own TikTok videos, imports them and keeps each video's caption.
- The agent wrote the X link into request.json with its last digit changed, and X answered "not found" (US$0.005 lost). Section 1 now asks to copy links exactly and compare, and x.js's message names a wrong digit as a possible cause.
- The agent could not say what the TikTok video was about until the person asked it to look up the caption. import.js now keeps the caption from a post-list answer (with `--run`), and the bridge does it itself.
- `fetch.js --platform instagram --platform facebook` read only Instagram; `--platform` can now be given more than once or as a list.
- Smaller: the agent's warning about school or work accounts was said about Facebook (it is meant for Google); for X it said to copy the token before starting the save command. Both are now spelled out.

Checks: `npm test`, 37 tests pass. The bridge, run live with the sign-in from the test: signed in as the video's account, 4 of the 4 comments read and imported, the caption kept; free. The full list with times is in the test's findings file kept with its screenshots.

Still to do: the remaining Claude Code test requests, and the Codex test.

## 2026-11-21, Codex: the TikTok connector, before the Codex test

The user wants to record the Codex test, so they first tried the TikTok Social connector in Codex on its own (the Codex app inside the ChatGPT desktop app, Codex 0.171). They worked out the steps with ChatGPT, in two chats outside Codex, then did them in the app. Codex's records and logs give this order: Settings, MCP servers, Add server; Name `tiktok-social`, type Streamable HTTP, the connector's URL; Save (23:03); Authenticate, and the sign-in on TikTok's page (23:07); Codex restarted twice (23:08 and 23:11). In a new chat (23:11), Codex called `account_user_get` (the account in the video link) and `account_user_comment_list_get` on one video, and showed its 4 comments, with the reading tools only. The menu names were checked against the labels in the app itself.

Change: AGENTS.md section 4 gives these steps for the Codex app, and asks the agent to give the person, before they restart, one short message to paste into a new chat to carry on. A chat that was open before the sign-in may keep answering that authorization is required: a known Codex issue (openai/codex#29279); in this test the new chat worked at once.

## 2026-11-22, Codex test: other people's posts and the user's own posts

The user ran the test in the Codex app (inside the ChatGPT desktop app) and recorded it, in a new folder, with no screenshots; this log is from Codex's own records. First a request with eight public McDonald's posts (one Instagram, one Facebook, one X, four TikTok videos, one Reddit thread), then a question about the report, then "Remove the workflow"; then, in a second chat in the same folder, the user's own four posts (YouTube, Instagram, Facebook, TikTok, all through their official routes), and a third chat after a restart for the TikTok video.

What happened:
- Both set-ups from an empty folder worked (all tests passed). ScrapeCreators: the agent opened the site, gave the save command, checked the key and asked before using up to 216 credits; the read reported its progress. X: after the fix below, the app and its token were made without trouble; the person approved US$15 at most for the 951 replies, and 906 were read for about US$12.63. The report covered 2,681 comments, and its 18 quotes passed `check-quotes.js`; the follow-up question was answered with 8 checked quotes.
- "Remove the workflow": the agent listed what it would delete, waited, deleted it, checked that the folder was empty and named the keys to revoke at ScrapeCreators and X.
- Own posts: in Chrome the agent saw a school and a personal Google account and asked which to use. After the fixes below, the five Meta steps took about 12 minutes; when the Facebook link did not match the Page, it asked who had posted it, found the post and asked the person to confirm it. The agent added the TikTok connector itself with `codex mcp add tiktok-social --url …` (with the person's approval); the sign-in worked, but the tools appeared only after a restart, in a new chat, as AGENTS.md says. The new chat read the video's 4 comments; the report covered 17 comments on the four posts.

Fixed during the test, at the user's request:
- X: the agent opened a guessed address (`console.x.com/apps`, which showed the Dashboard) and put five actions in one message without the form's fields. AGENTS.md now opens console.x.com itself and gives the token steps in the console's words (5e24bd7, then 745ff63).
- Meta: before each step the agent asked the person to describe the screen ("Tell me what the first screen asks for"), two extra rounds. Rule 3, "When the clicks are theirs", now gives a whole step in one message, as a numbered list, one action per line, and asks what they see only when something does not match (5bab91d, then 745ff63 after the user found one message per screen still too slow). The Meta risk warning stays in every message (the user's choice).
- The agent reported on three of the four own posts while the TikTok video waited for the restart. Section 7 now starts only when every post is read or the person leaves one out (929f757). The same commit asked for a new run name for each request (the own posts were saved under the earlier name `2026-11-22-mcdonalds`); the user withdrew that change, and it is undone here.

Fixed after the test (the user chose 6 to 9 of the findings):
- After the ScrapeCreators read had finished, the person's "yes" to the X step ("reply ready") was taken as the OK for the read, and the seven posts were read again: about 100 credits more, which the agent then called "unexplained". fetch.js now keeps the posts a request has read (`data/runs/<name>/reads.json`) and does not read them again unless `--again` is given, also in the plan; rule 4 says that a paid read starts only after an OK to its own question.
- The 2,681 comments were labelled by a keyword script the agent wrote, then about 100 were fixed by hand. AGENTS.md section 7 and the skill now say to read each comment and never to label with keyword or pattern rules.
- In Chrome the agent made a second Google Cloud project called Comment themes before noticing the first, and left it unused; it also gave the save command twice for one key. The YouTube step now says to look for the project first and to make only one; rule 2 says to give the save command once.
- The person asked for a link to find the Meta app ID. Meta step 5 and meta-token.js's first question now give https://developers.facebook.com/apps.

Not changed: the X question offered only a US$15 ceiling, where in Claude test 2 the agent had also offered the 300 most relevant replies for at most US$4.50 (left as it is). Checked, not changed: the run logged 93 ScrapeCreators credits while the balance fell by 108. Every ScrapeCreators call, the post lookups included, goes through one function that adds the credits each answer reports, and the plan makes no paid call; so some answers charged credits without reporting them. Measuring the balance before and after a read would give the exact figure.

Checks: `npm test`, 38 tests pass (a new one for posts read already). The full list with times is in the test's findings file.

All three agents (Claude Code, DeepSeek Harness and Codex) have now been tested.
