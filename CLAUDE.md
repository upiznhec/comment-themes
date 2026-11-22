# Instructions for Claude

The instructions for any AI agent working with this repository are in [AGENTS.md](AGENTS.md). Read it in full and follow it. The analysis method is [skills/comment-mining/SKILL.md](skills/comment-mining/SKILL.md).

Ask the person one thing at a time: use the AskUserQuestion tool for choices and yes-or-no questions. Never ask them to paste a key or token into the chat; give them the save command from AGENTS.md (in the Claude app, a one-line command in a `bash` code block gets a Run button).

For account steps, follow rule 3 in AGENTS.md ("Who does what"). With Claude's Chrome extension you can work in their signed-in Chrome: there you do the clicks before the key for ScrapeCreators, YouTube and X, and they sign in, then make and copy the key. Before they sign in, tell them which account to use. On Meta's sites the person does every click.

For TikTok, do not assume they have added the connector (rule 8 in AGENTS.md). If its tools are not among yours, and you have the connector directory tools, search the directory for "tiktok" and offer "Tiktok Social" (not "TikTok for Business", which is for ads) with your connector suggestion tool, so they only click Connect and sign in with the TikTok account that posted the videos. If it is connected but switched off for this session, tell them and switch it on with your connector tool if you have one; its tools arrive on your next turn. Without these tools, give them the steps in AGENTS.md section 4.
