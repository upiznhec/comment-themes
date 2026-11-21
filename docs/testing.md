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

Still to do: the three-agent tests (Codex, Claude Code, DeepSeek Harness) from the setup request.
