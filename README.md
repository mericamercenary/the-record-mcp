# the-record-mcp

A **read-only** [Model Context Protocol](https://modelcontextprotocol.io) server for **THE RECORD**: published U.S. government decisions (Congress votes and actions), who represents each state and congressional district, U.S. cities and towns, and the text of the U.S. Constitution.

> Read-only record from THE RECORD; cite sources; no verdicts.

- **Tools:** `search_decisions`, `get_decision`, `find_representatives`, `get_place`, `get_city`, `get_constitution_text`. All marked `readOnlyHint`.
- **Reads only** the public feed (`https://raw.githubusercontent.com/mericamercenary/the-record-data/main/feed`) with plain GET requests, plus the Constitution text bundled in `data/` (National Archives transcription, public domain).
- **No write tools, no sign-in, no user data, no logging or storage of queries.** Missing data comes back as `UNKNOWN`.
- No dependencies. Node 20.10 or later.

## Run it on your computer (stdio)

```sh
npx -y github:mericamercenary/the-record-mcp
```

(Not on the npm registry yet. Once published: `npx -y the-record-mcp`.)

### Claude Desktop

Settings → Developer → Edit Config, then add to `claude_desktop_config.json` and restart Claude:

```json
{
  "mcpServers": {
    "the-record": { "command": "npx", "args": ["-y", "github:mericamercenary/the-record-mcp"] }
  }
}
```

### Cursor, VS Code, Codex CLI, ChatGPT desktop (via Codex config), other stdio clients

Use the same command: `npx -y github:mericamercenary/the-record-mcp`. For Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.the-record]
command = "npx"
args = ["-y", "github:mericamercenary/the-record-mcp"]
```

## Remote option (HTTP)

Stateless Streamable HTTP at `POST /mcp` (JSON responses, CORS open, no sessions).

- **Local:** `PORT=8787 npx -y -p github:mericamercenary/the-record-mcp the-record-mcp-http` → `http://localhost:8787/mcp`
- **Cloudflare Workers (free plan, recommended):** needs a free Cloudflare account. `npx wrangler login`, then `npx wrangler deploy` in this folder. URL: `https://the-record-mcp.<your-subdomain>.workers.dev/mcp`. The free plan allows 100,000 requests a day. Turn off Workers Logs/observability in the dashboard so requests are not kept.
- Any Node host works too (`npm run http`).

Web chat apps call remote servers from their own cloud, so the URL must be public HTTPS (not localhost). For a quick test, a Cloudflare quick tunnel works with no account: `cloudflared tunnel --url http://localhost:8787` (the URL changes each restart).

### Grok (grok.com)
grok.com/connectors → **New Connector** → **Custom** → paste `https://…/mcp`, no authentication. ([xAI docs](https://docs.x.ai/grok/connectors))

### Claude (claude.ai, web and desktop)
**Customize → Connectors → Add custom connector** → name it, paste the URL, choose **No sign in**. Free plans allow one custom connector. ([Claude Help Center](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp))

### ChatGPT
chatgpt.com/plugins → **Add** → **Create custom MCP server** (older label: Create MCP App) → paste the URL, no authentication. Availability depends on plan; OpenAI documents read/fetch MCP for Pro and full MCP for Business/Enterprise/Edu. ([OpenAI Help Center](https://help.openai.com/en/articles/12584461))

## Using the answers

Results carry official source links and the note above. Ask your AI to cite them, say UNKNOWN when unsure, avoid party framing, and not judge constitutionality. Answers an AI writes with these tools are **not** part of THE RECORD and are not official.

Optional: set `RECORD_CONTEXT_PAGES=1` to add links to THE RECORD's public context pages once they are live.

## Tests

```sh
npm test
```

Mocked feed only (no network): read-only enforcement (six tools, only GETs, unknown or write-like tools refused, no logging, storage, or auth in the source), protocol, HTTP transport, and every tool.

## License

MIT for the code. Constitution text: public domain (U.S. National Archives transcription). Feed data: see the-record-data.
