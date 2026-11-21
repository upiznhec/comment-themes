# Comment Themes

Sort the comments on your social media posts into themes with an AI agent: what people ask, complain about, want and praise, with how many said it and their exact words. Part of the Social Media AI Workflow Library (DSM 596 capstone, USC), Workflow 1.

- **Platforms** (each optional): YouTube, Instagram, Facebook, TikTok, X and Reddit, plus comments you paste or import from a CSV.
- **Your own accounts or others'**: your own through official channels where they exist (free), or through ScrapeCreators (paid credits, also reads other public accounts).
- **Checked numbers**: the agent labels each comment; scripts count the labels and check that every quote in the report is a real comment.
- **Your data stays on your computer**, in the `data/` folder.

## How to start

Copy the request in [SETUP-PROMPT.md](SETUP-PROMPT.md) into your AI agent (Codex, Claude Code or DeepSeek Harness), in an empty folder. The agent downloads this repository, asks you what to read, and walks you through the keys you need. Agents follow [AGENTS.md](AGENTS.md).

Needs Node.js 20 or newer. Tests: `npm test`.

## Credits

The analysis method is adapted from [comment-mining](https://github.com/ScrapeCreators/social-media-research-skills) by ScrapeCreators (MIT); its license is in [skills/comment-mining/LICENSE](skills/comment-mining/LICENSE), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) says what was kept and what was changed. This project is not affiliated with or endorsed by ScrapeCreators. Everything else is under the [MIT License](LICENSE).
