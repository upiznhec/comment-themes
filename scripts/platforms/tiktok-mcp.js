// The person's own TikTok comments through the official TikTok Social connector (an MCP server the agent
// calls; scripts cannot). The agent saves each tool answer of account_user_comment_list_get (and
// account_user_comment_reply_list_get) as it came and imports it with:
//   node scripts/import.js --tiktok-mcp <file.json> --account <handle>
// Accepts the whole answer ({ data: { comments } }), the data object, or the comments array.
const { toIso } = require('./common');

function fromMcp(json, account) {
  const comments = Array.isArray(json) ? json : (json?.data?.comments || json?.comments || []);
  const handle = String(account || '').replace(/^@/, '');
  const records = [];
  for (const c of comments) {
    const all = [c, ...(Array.isArray(c.reply_list) ? c.reply_list : [])];
    for (const item of all) {
      if (!item?.comment_id) continue;
      records.push({
        platform: 'tiktok', route: 'mcp', own: true, account: handle ? `@${handle}` : null,
        post_id: item.video_id || c.video_id || null,
        post_url: handle && (item.video_id || c.video_id) ? `https://www.tiktok.com/@${handle}/video/${item.video_id || c.video_id}` : null,
        post_time: null, comment_id: String(item.comment_id),
        parent_id: item.parent_comment_id ? String(item.parent_comment_id) : (item === c ? null : String(c.comment_id)),
        time: toIso(item.create_time), likes: item.likes ?? null, replies: item.replies ?? null,
        hidden: item.status ? item.status !== 'PUBLIC' : null, text: item.text || '',
        author_name: item.display_name || null, author_handle: item.username ? `@${item.username}` : null, author_id: item.user_id || null
      });
    }
  }
  return records;
}

module.exports = { fromMcp };
