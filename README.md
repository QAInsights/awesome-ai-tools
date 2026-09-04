# AI IDEs & Coding Assistants

> 🌐 **Browse the interactive directory: [ai.dosa.dev](https://ai.dosa.dev)** — search, filter, compare, and read per-tool reviews (pricing, features, verdicts).

> Manually curated, enhanced w/ Claude

> A curated, categorized reference of AI-powered coding tools as of **August 2026**.
> Covers full IDEs, editor extensions, terminal agents, autonomous agents, browser-based builders, and code review platforms.  

> **100+ tools** across 12 categories.

<a href="https://buymecoffee.com/qainsights" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="40"></a>

> **Important:** Do **not** open a pull request to submit a new tool. Use the [Tool Submission form](https://github.com/QAInsights/awesome-ai-tools/issues/new?template=submit-tool.yml) instead, it runs the automated pipeline that updates all data files.

## Cloudflare deployment

The site is deployed as a Cloudflare Worker with static assets through Cloudflare Workers Builds. Pushes to `main` trigger a build and deployment from the connected repository. A nightly `02:00 UTC` workflow and manual workflow runs trigger the Workers Builds deploy hook so freshly enriched data is rebuilt without storing a Cloudflare API token in GitHub.

One-time migration steps:

1. Create the `awesome-ai-tools` Worker and connect the repository under **Settings → Builds**. Set the Workers Builds build command to `bun run build`, and configure these build variables there:
   - `ENABLE_VOTING` (default: `true`)
   - `CF_SITEKEY` (default: `1x00000000000000000000AA`)
   - `API_BASE_URL` (default: `http://localhost:8080`)
   - `GITHUB_CLIENT_ID` (default: empty)
2. Create a Workers Builds Deploy Hook for the `main` branch under **Settings → Builds → Deploy Hooks**, then save its generated URL as the GitHub repository secret `CLOUDFLARE_DEPLOY_HOOK_URL`.
3. Set the OAuth Worker secrets from the repository root:
   ```bash
   bunx wrangler secret put GOOGLE_CLIENT_ID
   bunx wrangler secret put GITHUB_CLIENT_ID
   bunx wrangler secret put GITHUB_CLIENT_SECRET
   ```
   Set the same secrets for the staging environment with `--env staging`. The Worker serves `GOOGLE_CLIENT_ID` to the browser from `/api/auth/config` and uses that exact value as the verified Google token audience.
4. Bind the `ai.dosa.dev` custom domain to the Worker.
5. Add Cloudflare Redirect Rules for `dosa.dev/*` and `www.dosa.dev/*` to permanently redirect to `https://ai.dosa.dev/<path>`. These host-based redirects are not represented in `public/_redirects`.
6. Remove or disable the Vercel project and its cron job after verifying the Worker deployment.

The GitHub OAuth callback URL remains `https://ai.dosa.dev/api/auth/github`.

## 📋 Table of Contents

- [🖥️ AI-Native IDEs & Editors](#ai-native-ides--editors)
- [🔌 IDE Extensions & Plugins](#ide-extensions--plugins)
- [💻 Terminal & CLI Agents](#terminal--cli-agents)
- [🤖 Autonomous & Async Agents](#autonomous--async-agents)
- [🌐 Browser-Based & App Builders](#browser-based--app-builders)
- [🛡️ AI Code Review & Security](#ai-code-review--security)
- [🧰 General-Purpose AI Assistants](#general-purpose-ai-assistants-with-strong-coding-capability)
- [🛠️ Developer Productivity & Workflow](#developer-productivity--workflow)
- [🖊️ Editor Platforms with Native AI Features](#editor-platforms-with-native-ai-features)


---

## 🖥️ AI-Native IDEs & Editors
Full standalone editors built from the ground up with AI at the core.

| Tool | Company | Notes |
|------|---------|-------|
| **[Cursor](https://cursor.com)** | Anysphere | VS Code fork; agent mode for multi-file edits; most popular AI-native IDE |
| **[Devin](https://windsurf.com/refer?referral_code=37a59a01d5)** | Cognition | Formerly Windsurf; AI-first IDE with "Flows" agentic engine. |
| **[Trae](https://trae.ai)** | ByteDance | Free AI IDE (VS Code-based); Builder Mode; GPT-4o + Claude access at no cost |
| **[Zed](https://zed.dev)** | Zed Industries | High-performance multiplayer editor with built-in AI; by creators of Atom |
| **[PearAI](https://trypear.ai)** | PearAI | Open-source AI code editor; VS Code fork |
| **[Antigravity](https://antigravity.google/)** | Google | Dual-mode IDE: Editor View + Manager Surface for orchestrating autonomous agents |
| **[Void](https://voideditor.com)** | Void | Work on Void is currently paused |
| **[Verdent](https://www.verdent.ai)** | Verdent | An agentic coding tool focused on parallel agents and isolated workspaces |
| **[Pochi](https://app.getpochi.com/home)** | Pochi | Pochi is a VS Code–native AI coding agent built by TabbyML that stands out primarily through its parallel agent execution, local model support, and more. |
| **[Qoder](https://qoder.com/en)** | Qoder | Agentic Coding Platform for Real Software. |
| **[Z Code](https://zcode.z.ai/)** | Z | Z Code combines the best AI agents with your existing tools so you can plan, code, review, and deploy without friction. |
| **[toad](https://www.batrachian.ai/)** | Batrachian AI | A unified interface for AI in your terminal.; [GitHub](https://github.com/batrachianai/toad) |
| **[Nimbalyst](https://nimbalyst.com)** | Nimbalyst | Open-source visual workspace for building with Codex, Claude Code, and more. Manage agents, sessions, tasks, files. Visually edit markdown, mockups, diagrams, diffs, and code.; [GitHub](https://github.com/Nimbalyst/nimbalyst) |
| **[Superset](https://superset.sh/)** | Superset | Code Editor for the AI Agents Era - Run an army of Claude Code, Codex, etc. on your machine |
| **[archestra](https://github.com/archestra-ai/archestra)** | Archestra Inc. | Enterprise AI Platform with guardrails, MCP registry, gateway & orchestrator |
| **[codex-profiles](https://github.com/Ducksss/codex-profiles)** | Chai Pin Zheng | Switch Codex CLI and Desktop accounts with isolated CODEX_HOME profiles |
| **[Reasonix](https://github.com/esengine/DeepSeek-Reasonix)** | ESEngine | A DeepSeek-native coding agent, for your terminal. |
| **[MiniMax Code](https://agent.minimax.io/download)** | MiniMax | Remembers your habits, builds Agent teams, automates the repetitive work.; [GitHub](_No response_) |
| **[Meta Muse](https://developer.meta.com/ai/products/muse-code/)** | Meta | An agent for your most complex coding workstreams. Build, debug and ship with Muse Code.; [GitHub](_No response_) |
| **[DeepCode](https://github.com/HKUDS/DeepCode)** | HKUDS | DeepCode: Open Agentic Coding (Paper2Code & Text2Web & Text2Backend); [GitHub](_No response_) |
| **[Fletch](https://fletch.sh)** | FWDAI | Open source multi-agent runner for your coding agents that runs then in parallel and in real isolation (Docker or Seatbelt). Allows chaining them into deterministic workflows that plan, build, review and test. You ship AI-written code you can actually trust, not just more of it.; [GitHub](https://github.com/fwdai/fletch) |
| **[Factory AI](https://factory.ai/)** | Factory | Complete software development agents for individuals.; [GitHub](_No response_) |
| **[ante](https://github.com/AntigmaLabs/ante)** | AntigmaLabs | Ghost in your shell. Ante is a self-contained agent harness with a highly optimized core. It works like Claude Code or Codex, with none of their dependencies or model constraints.; [GitHub](https://github.com/AntigmaLabs/ante) |
| **[unsloth](https://github.com/unslothai/unsloth)** | unsloth | Unsloth lets you run, train, and deploy AI models locally, with support for all types of models.; [GitHub](https://github.com/unslothai/unsloth) |
| **[bb](https://github.com/get-bb/bb)** | bb | bb is an agentic IDE that can control itself. You can seamlessly orchestrate all of your favorite coding agents together and have them programmatically use bb too.; [GitHub](https://github.com/get-bb/bb) |
| **[OpenChamber](https://openchamber.dev/)** | OpenChamber | OpenChamber is an open-source workspace for running, supervising, and reviewing AI coding work across desktop, browser, editor, and mobile.; [GitHub](https://github.com/openchamber/openchamber) |
| **[Waku](https://github.com/egoist/waku)** | EGOIST | Waku is a fast, native desktop app for working with local coding agents. It is built in Rust with [GPUI](https://github.com/zed-industries/zed/tree/main/crates/gpui) and keeps projects, sessions, transcripts on your machine.; [GitHub](https://github.com/egoist/waku) |
| **[jcode](https://github.com/1jehuang/jcode)** | Jeremy Huang | jcode is built to be as performant and resource efficient as possible. Every metric is optimized to the bone, which is important for scaling multi-session workflows. Here we sample a few metrics to show the difference: RAM usage and boot up.; [GitHub](https://github.com/1jehuang/jcode) |
| **[Grok Bot](https://x.ai/bot)** | X | AI teammates you can give real work to. Bots can sign in to your tools, use them just like you do, and come back with finished work.; [GitHub](_No response_) |
| **[Ori](https://openrouter.ai/ori/harness)** | OpenRouter | Your favorite harness with every model.; [GitHub](_No response_) |
| **[AgentOne](https://github.com/The-Best-Codes/agent-one)** | BestCodes | A free AI agent and deep-researcher.; [GitHub](https://github.com/The-Best-Codes/agent-one) |
| **[OneCLI](https://github.com/onecli/onecli)** | OneCLI | Open-source sandboxed agent harness for teams. Giving every employee a secured personal agent.; [GitHub](https://github.com/onecli/onecli) |
| **[Termy](https://termy.sh/)** | Lasse | The terminal, at full speed ⚡; [GitHub](https://github.com/lassejlv/termy) |
| **[Paseo](https://github.com/getpaseo/paseo)** | getpaseo | Orchestrate multiple coding agents from desktop and mobile.; [GitHub](https://github.com/getpaseo/paseo) |
| **[OpenWorker](https://github.com/andrewyng/openworker)** | Andrew Ng | OpenWorker is an open-source AI coworker that lives on your desktop and delivers finished work, not just chat: a polished document, a Slack reply with the numbers, an updated calendar, a triaged inbox.; [GitHub](_No response_) |


---

## 🔌 IDE Extensions & Plugins
Plug-in assistants that enhance your existing editor (VS Code, JetBrains, Neovim, etc.).

| Tool | Company | Notes |
|------|---------|-------|
| **[GitHub Copilot](https://github.com/features/copilot)** | GitHub | Industry standard; inline autocomplete + agent mode; 15M+ devs |
| **[Junie](https://www.jetbrains.com/ai/)** | JetBrains | The JetBrains AI agent; deep integration with IntelliJ, PyCharm, WebStorm |
| **[Gemini Code Assist](https://cloud.google.com/gemini/docs/codeassist/overview)** | Google | Gemini-powered; free for individuals; VS Code + Google Cloud integration |
| **[Amazon Q Developer](https://aws.amazon.com/q/developer/)** | AWS | Evolution of CodeWhisperer; multi-file agents; deep AWS integration |
| **[Tabnine](https://www.tabnine.com)** | Tabnine | Privacy-first; on-premise options; all major IDEs; ethically sourced training |
| **[Cline](https://github.com/cline/cline)** | Cline | Autonomous VS Code agent; Plan + Act modes; BYOM (zero markup) |
| **[Kilo Code](https://kilocode.ai)** | Kilo Code | Open-source; 500+ models via OpenRouter; 4 structured modes (Architect/Code/Debug/Orchestrator) |
| **[Roo Code](https://roocode.com)** | Roo Code | VS Code extension; strong on large multi-file changes; fork of Cline |
| **[Continue](https://continue.dev/allgreen?ref=naveenkumar)** | Continue | Open-source; VS Code + JetBrains; custom AI assistants; 20K+ GitHub stars |
| **[Augment Code](https://augmentcode.com)** | Augment | World-class context engine; enterprise-grade; strong SWE-bench scores |
| **[Cody](https://sourcegraph.com/cody)** | Sourcegraph | Deep codebase indexing; cross-repository context; best for large codebases |
| **[Supermaven](https://supermaven.com)** | Supermaven | Ultra-fast AI completion; large context windows |
| **[Blackbox](https://blackboxai.com)** | Blackbox | AI code completion + chat; multi-language support |
| **[Snyk Code](https://snyk.io/product/snyk-code/)** | Snyk | AI-driven security scanning; real-time vulnerability detection in-IDE |
| **[Qodo](https://qodo.ai)** | Qodo | AI-generated unit tests; code quality + PR review focus |
| **[MarsCode](https://marscode.com)** | ByteDance | AI coding assistant and online IDE; companion to Trae |
| **[Replit AI](https://replit.com)** | Replit | AI suite inside Replit's cloud IDE; beginner-friendly; includes Ghostwriter |
| **[CodeBuddy](https://www.codebuddy.ai/)** | Tencent | MCP-compatible coding assistant extension; ⚠️ not available in the USA |
| **[Cortex Code](https://www.snowflake.com/en/product/features/cortex-code/)** | Snowflake | MCP-compatible AI code assistant extension |
| **[Kode](https://github.com/shareAI-lab/Kode-Agent)** | ShareAI | AI developer assistant and workspace integration |
| **[Apertis](https://apertis.ai/)** | Stima | One API key works across all major coding agents |
| **[Corust](https://corust.ai/)** | Corust | Your seasoned Rust co-pilot: production-grade code generation, zero hallucinations on Rust idioms, and tools built for real Rustaceans. |
| **[Toprank](https://github.com/nowork-studio/toprank)** | nowork-studio | Open-source Claude Code plugin for SEO, Google Ads, content writing, and CMS optimization workflows |
| **[WozCode](https://www.wozcode.com/)** | WozCode | A Claude Code plugin that supercharges performance, cost, and speed |
| **[Claude Code Skills 中文精选集](https://claude-skills.bt199.com/)** | 老实人实验室 | Chinese curated directory of Claude Code Skills, Agents, Plugins, and workflows with 140+ resources |
| **[Oh My codeX](https://github.com/Yeachan-Heo/oh-my-codex)** | Yeachan-Heo | OmX: Your codex is not alone. Add hooks, agent teams, HUDs, and so much more |
| **[Bob](https://bob.ibm.com/)** | IBM | Your AI-Powered Development Partner |
| **[Firebender](https://firebender.com/)** | Firebender | The first Android-native coding agent that writes features, tests them in the emulator, and fixes issues automatically |
| **[Feather Wand](https://jmeter.ai)** | NaveenKumar Namachivayam | Supercharge your performance testing workflow with AI-driven capabilities built natively into JMeter.; [GitHub](https://github.com/QAInsights/jmeter-ai) |
| **[SF Pi](https://github.com/salesforce/sf-pi)** | Salesforce | Opinionated Salesforce extensions for the [Pi coding agent](https://pi.dev/): focused lifecycle tools, Salesforce-aware status and safety surfaces, Agent Script authoring, and one Manager for package settings and extension enablement.; [GitHub](https://github.com/salesforce/sf-pi) |
| **[Blume](https://blume.codes/invite/coral-buttercup-awakening-gracefully)** | Blume | Blume helps you build an agentic-native codebase with consistent and correct context. Fewer mistakes, fewer headaches.; [GitHub](_No response_) |
| **[Codex++](https://github.com/b-nnett/codex-plusplus)** | bennett | Codex++ tweak system for the Codex desktop app; [GitHub](https://github.com/b-nnett/codex-plusplus) |
| **[AICode](https://ai-code.ai/)** | AI Sovereign Labs | AICOde is an AI coding assistant, as a VS Code extension: Spec-driven ; human validation gate before code generation ; MCP/skills support ; BYOK Azure/OpenAI ; 5D local index ; built-in QA harness. Specialized in quality code generation using a 5 step workflow: Ideate → Specify → Refine → Code → Verify.; [GitHub](_No response_) |

---

## 💻 Terminal & CLI Agents
AI coding agents that live in your terminal or command line.

| Tool | Company | Notes |
|------|---------|-------|
| **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** | Anthropic | Terminal-native agentic coding; top-rated for complex reasoning & large refactors |
| **[Codex CLI](https://github.com/openai/codex)** | OpenAI | Re-emerged as agent-first tool; runs against real repos from the CLI |
| **[Aider](https://aider.chat)** | Aider | Git-native terminal pair programmer; 39K GitHub stars; auto-commits changes |
| **[Gemini CLI](https://github.com/google-gemini/gemini-cli)** | Google | Terminal agent for local repo tasks; lightweight; no UI overhead |
| **[Goose](https://block.github.io/goose/)** | Block | Open-source AI agent framework; fully local; write/execute/debug from CLI |
| **[Amazon Q CLI](https://aws.amazon.com/q/developer/)** | AWS | CLI agent component of Amazon Q; AWS-integrated terminal tasks |
| **[Letta Code](https://github.com/letta-ai/letta-code)** | Letta | Memory-first terminal coding agent; stateful across sessions; [Docs](https://docs.letta.com/letta-code) |
| **[Qwen CLI](https://qwen.ai/qwencode)** | Alibaba | High-performance CLI tool for Qwen models; specialized in code generation |
| **[Codebuff](https://www.codebuff.com/)** | Codebuff | Terminal-native AI coding agent with deep codebase awareness; [GitHub](https://github.com/CodebuffAI/codebuff) |
| **[OpenClaw](https://openclaw.ai/)** | OpenClaw | CLI-based autonomous agent with MCP skill support |
| **[Command Code](https://commandcode.ai/)** | Command Code | Stop fixing sloppy AI code. Command Code continuously learns your coding taste. Powered by taste-1 applied meta neuro-symbolic AI. |
| **[Crush](https://github.com/charmbracelet/crush)** | Charmbracelet | CLI tool for MCP-based coding workflows |
| **[iFlow CLI](https://github.com/iflow-ai/iflow-cli)** | iFlow | Terminal AI agent for workflow automation |
| **[Kiro CLI](https://kiro.dev/cli/)** | AWS | Command-line agent interface with MCP capabilities |
| **[lucinate](https://github.com/lucinate-ai/lucinate)** | lucinate-ai | Terminal-native TUI chat client for AI agents; connects to OpenClaw, Hermes, and any OpenAI-compatible endpoint; Homebrew tap available |
| **[MCPJam](https://www.mcpjam.com)** | MCPJam | CLI agent optimized for Model Context Protocol integration |
| **[Mistral Vibe](https://github.com/mistralai/mistral-vibe)** | Mistral | Terminal agent leveraging Mistral models |
| **[Mux](https://coder.com/products/mux)** | Coder | Advanced terminal AI assistant and multiplexer |
| **[Zencoder](https://zencoder.ai/)** | Zencoder | Specialized terminal-based AI coding assistant |
| **[Neovate](https://github.com/neovateai/neovate-code)** | Neovate | Next-gen terminal and Neovim integrated agent |
| **[AdaL](https://sylph.ai/)** | Sylph | Autonomous developer agent for the CLI |
| **[Cline Kanban](https://cline.bot/kanban)** | Cline | Cline Kanban works with the agents you're already using: Claude Code, Codex, and Cline-compatible agents, with more to come. |
| **[Parallel Code](https://parallelcode.app/)** | Parallel Code | Parallel Code is a desktop app that gives every AI coding agent its own git branch and worktree — automatically.|
| **[Pi](https://pi.dev/)** | badlogic | Pi is a minimal terminal coding harness. Adapt pi to your workflows, not the other way around. |
| **[Autohand ACP](https://github.com/autohandai/autohand-acp)** | Autohand | ACP-based terminal coding agent with autonomous capabilities |
| **[Crow CLI](https://github.com/crow-cli/crow-cli)** | Crow | Two-layer system: ACP agent (crow-cli) that does the thinking, and MCP toolserver (crow-mcp) that does the doing |
| **[Fast Agent](https://github.com/evalstate/fast-agent)** | EvalState | Code, Build and Evaluate agents — excellent Model and Skills/MCP/ACP Support |
| **[Minion Code](https://github.com/femto/minion-code)** | Femto | Minion's implementation of Claude Code |
| **[Compass Nova CLI](https://github.com/Compass-Agentic-Platform/nova)** | Compass | Compass Nova CLI |
| **[Pi ACP](https://github.com/svkozak/pi-acp)** | svkozak | ACP adapter for pi coding agent |
| **[Stakpak Agent](https://github.com/stakpak/agent)** | Stakpak | Ship your code, on autopilot. Open source agent that lives on your machines 24/7 and keeps your apps running |
| **[OpenCode](https://opencode.ai/)** | Anomaly | OpenCode is an open source agent that helps you write and run code with any AI model. It's available as a terminal-based interface, desktop app, or IDE extension. Free models included or connect any model from any provider, including Claude, GPT, Gemini and more.|
| **[Antigravity CLI](https://antigravity.google/product/antigravity-cli)** | Google | The terminal-first surface to interact with Antigravity agents. Stay in your flow without context switching. |
| **[Nanocoder](https://github.com/Nano-Collective/nanocoder)** | Nano Collective | Local-first, open-source terminal coding agent built by a community collective. Bring your own model (Ollama, OpenRouter, or any OpenAI-compatible API) and keep your code on your machine, with native tool calling, an XML fallback, MCP server support, and file-based custom commands and tools.; [GitHub](https://github.com/Nano-Collective/nanocoder) |
| **[AI Prompt Architect](https://aipromptarchitect.co.uk)** | AI Prompt Architect | Production-grade prompt engineering platform. Includes a 33-command CLI & MCP Server integration that offers a 50% API credit discount for AI agents, plus the STCO framework and multi-model evaluation.; [GitHub](_No response_) |
| **[AI Badger](https://pvrlabs.xyz/aibadger)** | PVR Labs | AI Badger is a local-first CLI that maps your codebase and extracts focused file context for AI chats and coding agents. It works with ChatGPT, Claude, Codex, Gemini, and other assistants without cloud indexing, API keys, or vendor lock-in.; [GitHub](https://github.com/PVRLabs/aibadger) |
| **[AgentBox](https://agent-box.sh)** | Marco D'Alia | Run multiple coding agents (Claude Code, Codex, OpenCode) in parallel, each teleported into its own sandboxed VM — local Docker, self-hosted, or cloud (Hetzner/Daytona/E2B). Sub-second checkpoints, per-box browser/VS Code/persistent shells, native macOS menu-bar app, git credentials kept on the host. MIT.; [GitHub](https://github.com/madarco/agentbox) |
| **[Oh My Pi](https://github.com/can1357/oh-my-pi)** | Can Bölük | ⌥ AI Coding agent for the terminal — hash-anchored edits, optimized tool harness, LSP, Python, browser, subagents, and more.; [GitHub](_No response_) |
| **[Grok Build](https://x.ai/build)** | X | A powerful coding agent for complex work.; [GitHub](_No response_) |
| **[BitFun](https://github.com/GCWing/BitFun)** | GCWing | Open-source coding agent with an interactive terminal UI and desktop app. It can plan, edit, test, and commit inside real Git repositories, with protected tool calls requiring approval by default.; [GitHub](https://github.com/GCWing/BitFun) |
| **[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)** | DeepSeek | DeepSeek Harness (dsh) is an open-source agent harness developed by DeepSeek AI.; [GitHub](https://github.com/deepseek-ai/deepseek-harness) |
| **[Atomic Agent](https://atomicagent.io)** | AtomicBot | Local-first CLI and TUI coding agent that runs open-weight models entirely on your machine through a llama.cpp fork, so no account or API key is required. Ships 56 built-in tools (browser, filesystem, git, memory, vision), MCP support, and a five-layer local memory system.; [GitHub](https://github.com/AtomicBot-ai/atomic-agent) |
| **[Kane CLI](https://www.testmuai.com/support/docs/kane-cli-introduction/)** | TestMU AI | End-to-end flows on your local browser, powered by natural language. Instant validation, deep bug discovery, and production-ready automation that elevates release confidence.; [GitHub](_No response_) |
| **[Caveman Code](https://github.com/JuliusBrussee/caveman)** | Julius Brussee | Same model. Same task. ~2× fewer tokens than Codex. 20+ providers · plan mode · autopilot loop · MIT.; [GitHub](https://github.com/JuliusBrussee/caveman) |
| **[Sillage](https://marlburrow.github.io/sillage)** | MarlBurroW (open source) | Self-hosted, MIT-licensed, mobile-first web UI that drives the native Claude Code and Codex CLIs on your own machine (the official agent harnesses, without a terminal). Sessions that outlive the client, full-text search over every conversation, an IDE panel (file explorer, editor, diffs, terminal), and an installable PWA. Single Docker container.; [GitHub](https://github.com/MarlBurroW/sillage) |
| **[MathCode](https://github.com/math-ai-org/mathcode)** | Math-AI | MathCode: A Frontier Mathematical Coding Agent; [GitHub](https://github.com/math-ai-org/mathcode) |
| **[fx.sh](https://fx.sh/)** | Vercel | fx is a coding agent harness and CLI written in Zig, optimized for research and embeddability as part of larger systems.; [GitHub](https://github.com/vercel-labs/fx) |
| **[Zero](https://github.com/gitlawb/zero)** | Gitlawb | Zero is an AI coding agent for your local terminal. It can inspect a repository, edit files, run commands, use browser/terminal helpers, and keep durable local sessions while you choose the model and the permission level.; [GitHub](https://github.com/gitlawb/zero) |
| **[Headlong](https://github.com/laude-institute/headlong)** | Laude Institute | An open source agent microharness featuring persistent agency and recursive LLMs. Of bash, by bash, for bash; it's shells all the way down.; [GitHub](https://github.com/laude-institute/headlong) |
| **[OB-1](https://github.com/Overbrilliant/ob-1)** | Overbrilliant | Terminal coding agent whose default path needs no account, no API key and no card: `npm i -g @overbrilliant/ob1`, run `ob1`, and an embedded router inside the CLI process answers the first message through keyless free providers using a signed bundled free-model catalog, with failover to your own keys (OpenRouter, OpenAI, Gemini, Groq) or local runtimes (Ollama, LM Studio, llama.cpp, vLLM, any OpenAI-compatible endpoint). It also ships persistent SQLite project memory with an inspectable fact/relationship graph, a repo map, MCP support, and OS-level sandboxing (Seatbelt on macOS, bubblewrap on Linux). To be straight about the trade-off: the keyless tier is a bootstrap path with variable model quality and shared limits, not a frontier-model tier. Apache-2.0; also installable via `brew install overbrilliant/tap/ob1`.; [GitHub](https://github.com/Overbrilliant/ob-1) |
| **[XIRP](https://xirp.spotify.com/)** | Spotify | Xirp connects to your services, ownership, docs, and architectural decisions — so every AI coding session starts with real context, not guesswork.; [GitHub](_No response_) |

---

## 💻 AI-Native Terminals
Full terminal emulators built from the ground up with AI capabilities integrated.

| Tool | Company | Notes |
|------|---------|-------|
| **[Warp](https://app.warp.dev/referral/VNKYYE)** | Warp | The wildly popular rust-based terminal with "Warp AI" built directly into the command line interface |
| **[Wave](https://www.waveterm.dev/)** | Wave | An open-source, modern AI-native terminal alternative |

---

## 🤖 Autonomous & Async Agents
Agents that operate independently on tasks, often outside your local editor.

| Tool | Company | Notes |
|------|---------|-------|
| **[Jules](https://jules.google)** | Google | Async GitHub-integrated agent; clones repo into GCP VM; works while you code; powered by Gemini 2.5 Pro |
| **[OpenHands](https://github.com/All-Hands-AI/OpenHands)** | All Hands | Open-source autonomous coding agent; 95K+ GitHub stars |
| **[SWE-agent](https://swe-agent.com)** | Princeton NLP | Open-source agent for autonomously solving GitHub issues |
| **[Sweep](https://sweep.dev/)** | Sweep | Acts as an autonomous junior developer. Branches, writes code, and opens PRs from issues |
| **[Ellipsis](https://www.ellipsis.dev/)** | Ellipsis | AI agent that reviews pull requests and converts comments directly into runnable code commits |
| **[Genie](https://cosine.sh/)** | Cosine | One of the highest performing autonomous models strictly evaluated against the SWE-bench benchmarks |
| **[Open-yak](https://open-yak.com/)** | Open-yak | Open-source desktop AI agent with 130+ skills, 46 MCP connectors, and IM gateway |
| **[DeepAgents JS](https://github.com/langchain-ai/deepagentsjs)** | LangChain | TypeScript package for creating Deep Agents — implements deep agent capabilities in a general-purpose way |
| **[Orkas](https://orkas.ai/?source=gh_qainsights)** | Orkas-AI | Open-source, local-first desktop workspace where a Commander decomposes goals and coordinates specialist AI agents in parallel or sequence.; [GitHub](https://github.com/Orkas-AI/Orkas) |
| **[Kody](https://github.com/kentcdodds/kody)** | Kent C. Dodds | Your assistant's home — the memory, keys, code, and automations your AI agent keeps, portable across every MCP host. Built on Cloudflare Workers.; [GitHub](https://github.com/kentcdodds/kody) |
| **[Omnigent](https://github.com/omnigent-ai/omnigent)** | Omnigent | Omnigent is an open-source AI agent framework and meta-harness: orchestrate Claude Code, Codex, Cursor, Pi, and custom agents — swap harnesses without rewriting, enforce policies and sandboxing, and collaborate in real time from any device.; [GitHub](https://github.com/omnigent-ai/omnigent) |
| **[Manus](https://manus.im/invitation/KK5RLBDPBSGLZD?utm_source=invitation&utm_medium=social&utm_campaign=copy_link)** | Monica | Manus is an autonomous AI agent that can plan, code, and execute complex tasks end-to-end in the browser. |
| **[LoopTroop](https://www.looptroop.ovh/)** | LoopTroop AI | Local, open-source GUI for running multi-step AI coding tickets across projects. Uses an LLM council for planning, atomic Beads in isolated git worktrees, and time-boxed retry loops for execution.; [GitHub](https://github.com/looptroop-ai/LoopTroop) |

---

## 🌐 Browser-Based & App Builders
AI tools that generate full apps or UIs from natural language, no local setup required.

| Tool | Company | Notes |
|------|---------|-------|
| **[Bolt.new](https://bolt.new)** | StackBlitz | Prompt → full-stack app in browser; React/Vue/Node; viral vibe-coding tool |
| **[v0](https://v0.dev)** | Vercel | Natural language → React + Tailwind UI components; Vercel ecosystem |
| **[Lovable](https://lovable.dev)** | Lovable | AI web app builder; production-ready full-stack from prompts |
| **[Replit](https://replit.com)** | Replit | Cloud IDE + AI builder; deploy from browser; great for beginners |
| **[PlayCode](https://playcode.io)** | PlayCode | 15+ AI models in-browser; builds complete websites without coding |
| **[Emergent.sh](https://app.emergent.sh/register?ref=catc151141)** | Emergent | Agentic vibe-coding platform for building and deploying full-stack apps from natural language |
| **[Bitrig](https://bitrig.com/)** | Bitrig | Describe what you want to build, and Bitrig turns it into real Swift code you can ship to the App Store. |
| **[Floot](https://floot.com/)** | Floot | Floot turns Claude or ChatGPT into a full app builder - backend, database, and hosting included. No git, no terminal, no build credits.; [GitHub](_No response_) |

---

## 🛡️ AI Code Review & Security
Tools focused on reviewing, securing, and validating code — not generating it.

| Tool | Company | Notes |
|------|---------|-------|
| **[CodeRabbit](https://coderabbit.ai)** | CodeRabbit | AI-powered PR reviews; line-by-line feedback; integrates with GitHub/GitLab |
| **[Qodo](https://qodo.ai)** | Qodo | PR validation, test generation, merge readiness checks |
| **[Snyk Code](https://snyk.io/product/snyk-code/)** | Snyk | SAST security scanning; real-time vulnerability detection; DevSecOps integration |
| **[cubic](https://www.cubic.dev/)** | Cubic | AI code reviews for complex codebases |
| **[Kodus](https://kodus.io/)** | Kodus | Open source AI code review tool that helps engineering teams review pull requests with repository context, custom rules, and BYOK support. It integrates with GitHub, GitLab, Bitbucket, and Azure DevOps.; [GitHub](https://github.com/kodustech/kodus-ai) |
| **[Gito](https://github.com/Nayjest/Gito)** | Vitalii Stepanenko | Open-source AI code reviewer that runs in GitHub Actions or locally. Model-agnostic (works with any LLM) and reports findings to GitHub, Jira, or Linear.; [GitHub](https://github.com/Nayjest/Gito) |
| **[Bubo](https://github.com/mountainowl/bubo)** | MountainOwl | I maintain Bubo, a self-hosted AI reviewer for GitHub PRs and GitLab MRs. I built it to run CLI-driven models, post evidence-backed inline findings or LGTM, and learn from maintainer feedback to reduce repository-specific noise.; [GitHub](https://github.com/mountainowl/bubo) |
| **[heygrc](https://heygrc.com)** | ISMS Copilot / Better ISMS | GitHub App that reviews every pull request against compliance frameworks (ISO 27001, SOC 2, GDPR, EU AI Act, and more), cites the control clause, and says what to fix. Public repositories always free. Install: https://github.com/apps/heygrc; [GitHub](_No response_) |
| **[Mydentify AI Crawler Access Checker](https://mydentify.com/tools/ai-crawler-access-checker)** | Mydentify / Timothy Allard | A free browser-based checker that tests whether AI crawlers can access a site by inspecting robots.txt, page-level directives, response headers, and user-agent behavior. It reports observable access signals and their limits; it does not claim to measure crawler indexing or guarantee AI visibility.; [GitHub](https://github.com/mitdralla/mydentify-ai-crawler-access-checker) |

---

## 🧪 AI Testing & Quality Assurance
Tools designed to autonomously generate, execute, and fix tests.

| Tool | Company | Notes |
|------|---------|-------|
| **[GitAuto](https://gitauto.ai/)** | GitAuto | Automatically writes, runs, and fixes your unit tests, so you can keep shipping confidently |
| **[AgentDiff](https://agentstatus.dev/)** | AgentStatus | Catch the regression CI couldn't, before merge. |
| **[Agent QA](https://github.com/vostride/agent-qa)** | Vostride | The self-improving QA agent for software teams. It creates and runs natural-language web and mobile tests, retains test memory, and adapts flows when interfaces change. |

---

## 🧰 General-Purpose AI Assistants (with Strong Coding Capability)
Not IDEs, but widely used for coding tasks via chat.

| Tool | Company | Notes |
|------|---------|-------|
| **[Claude](https://claude.ai)** | Anthropic | Top-rated for complex debugging, architecture, and large codebase reasoning |
| **[ChatGPT](https://chatgpt.com)** | OpenAI | Versatile everyday coding; GPT-5 in 2026; broad language support |
| **[Gemini](https://gemini.google.com)** | Google | 1M token context; multimodal; strong for Google ecosystem teams |
| **[DeepSeek](https://www.deepseek.com/)** | DeepSeek | Competitive open-weights models (V3/R1); excellent coding benchmarks |
| **[Perplexity](https://www.perplexity.ai/)** | Perplexity | AI search engine; excellent for technical research and API discovery |

---

## 🔍 AI Codebase Knowledge & Generation
Tools for understanding large repositories or generating SDKs/APIs.

| Tool | Company | Notes |
|------|---------|-------|
| **[Greptile](https://www.greptile.com/)** | Greptile | AI that ingests massive codebases and answers deep architectural questions via chat or API |
| **[Fern](https://buildwithfern.com/)** | Fern | Generates SDKs and developer documentation natively from your API definitions |
| **[Remio](https://remio.ai/)** | Remio | Local-first AI memory and personal knowledge base desktop app. Remio parses files, webpages, recordings, emails, messages, images, and notes into local indexes and vectors so coding agents can retrieve focused personal context through the Remio CLI/skill instead of repeatedly scanning folders or loading whole documents into prompts. The CLI/skill require the Remio desktop client. |

---

## 🛠️ Developer Productivity & Workflow
AI-powered tools for managing context, snippets, and developer documentation.

| Tool | Company | Notes |
|------|---------|-------|
| **[Pieces for Developers](https://pieces.app/)** | Pieces | AI-powered context management; "Artificial Memory" for your workflow; snippet management |
| **[agenttrace](https://github.com/luoyuctl/agenttrace)** | luoyuctl | Open-source observability and audit trail for AI coding agent sessions |
| **[Vibe Kanban](https://vibekanban.com/)** | Vibe | Project management and productivity platform integrated with AI |
| **[AI Product Adoption Deck](https://aiproduct.cards)** | aiproduct.cards | The AI Product Adoption Deck is a 124-page playbook of 104 cards that helps product teams diagnose and fix the specific moments where AI products lose users — empty prompts, trust gaps, broken correction loops, agents nobody trusts. It's built for PMs, designers, founders, and AI engineers shipping copilots, agents, and embedded AI features who need concrete patterns, not generic UX advice. Each card maps a symptom to a diagnosis, an action, and a workshop you can run with your team this week.; [GitHub](https://github.com/AIProductCards/ai-product-adoption-deck-skill) |
| **[CoderPlan](https://coderplan.ai)** | CoderPlan | LLM API Gateway with OpenAI-compatible interface. Pay-per-use access to Claude, GPT, Gemini, DeepSeek, Grok, and 100+ models. One-line config for Claude Code, Codex CLI, and Gemini CLI — switch providers without changing tools.; [GitHub](N/A — closed-source service) |
| **[AIFlowLearn](https://www.aiflowlearn.net)** | AIFlowLearn / 木子霖 | AIFlowLearn is an AI learning-and-practice platform for AI engineering learners and builders. It turns AI frameworks, PDFs, articles, course materials, and open-source projects into structured learning collections, memory cards, and hands-on practice tasks so developers can move from reading to reviewable, repeatable engineering practice. |
| **[Faryo](https://github.com/Snailflyer/faryo)** | Snailflyer | Faryo is a lightweight phone/desktop workbench for the same `tmux`-backed Codex CLI, Claude Code, or shell session. It keeps the terminal process as the source of truth while the phone/browser handles compact output, short input, approve/interrupt, and handoff.  Same-session proof for the current release: https://github.com/Snailflyer/faryo/releases/tag/v1.0.7; [GitHub](https://github.com/Snailflyer/faryo) |
| **[Tree Ring Memory](https://terminallylazy.github.io/Tree-Ring-Memory/)** | TerminallyLazy | Open-source local-first memory lifecycle layer for AI coding agents. The Rust CLI/TUI stores project memories in SQLite/FTS and supports recall, forgetting, audit, consolidation, evidence capture, and DOX/Revolve adapters so agents retain decisions and lessons without transcript dumps.; [GitHub](https://github.com/TerminallyLazy/Tree-Ring-Memory) |
| **[OpenAgentRelay](https://github.com/ShakespeareLabs/open-agent-relay)** | ShakespeareLabs | Open-source CLI for sharing a restricted local coding-agent command with teammates or other agents over a trusted LAN, with keyed access, target verification, structured JSON output, and scriptable exit codes. Source code, prompts, dependencies, and credentials stay on the publisher machine.; [GitHub](https://github.com/ShakespeareLabs/open-agent-relay) |
| **[Better Agent](https://github.com/ofekron/better-agent)** | Ofek Ron | Local web workspace for launching and supervising native Claude, Codex, and Gemini coding-agent sessions with parallel delegation, persistent state, approval gates, file access, and restart recovery. It is source-available and free for non-commercial use; commercial use requires separate permission.  Disclosure: I maintain Better Agent. “Freemium” is the form’s closest available pricing option.  AI-assistance disclosure: this submission was drafted by Codex under the maintainer’s authorization and reviewed in Better Agent.; [GitHub](_No response_) |
| **[Tura](https://turaai.net/)** | Tura-AI | Tura is a local, open-source execution layer for coding agents that groups repository inspection, edits, builds, tests, linting, and media inspection into fewer model turns. It publishes reproducible DeepSWE and full-repository rewrite benchmarks comparing its macro execution modes with Codex CLI Medium and High. Disclosure: I maintain Tura.; [GitHub](https://github.com/Tura-AI/tura) |
| **[fractal](https://docs.plasma.ai/fractal/)** | Plasma AI | Open-source hierarchical coding-agent orchestrator for Claude Code, Codex, Grok Build, OpenCode, and Oh My Pi, with recursive delegation, per-node Git worktrees, configurable limits, and a live terminal UI for monitoring and steering.; [GitHub](https://github.com/plasma-ai/fractal) |
| **[WolfMarkDown](https://github.com/WolfMarkTools/WolfMarkDown)** | WolfMark | WolfMarkDown is an AI agent skill for turning messy, AI-generated research, conversation or Markdown into clean, production-ready documents using semantic judgement plus deterministic verification. It repairs structure, preserves technical details, and validates the final file with Prettier, markdownlint, GFM parsing, integrity checks, and idempotence.; [GitHub](https://github.com/WolfMarkTools/WolfMarkDown) |
| **[Codex Quota Overlay](https://cpys.github.io/codex-quota-overlay/)** | cpys (maintainer; independent community project) | An independent Windows and macOS overlay that shows remaining Codex quota, next reset time, and available reset credits beside the active Codex conversation. It reads the documented local rate-limits method, stays out of the way, and does not capture screenshots, conversations, or browser cookies.; [GitHub](https://github.com/cpys/codex-quota-overlay) |
| **[DeskCue](https://deskcue.io)** | Alexander Kornev | DeskCue is an open-source, local-first workspace for reviewing and steering coding-agent work. It keeps sessions, git diff, files, live preview, notifications, and the next prompt accessible from another browser or phone while the agents and workspace stay on your machine.; [GitHub](https://github.com/AleksandrKornev/DeskCue) |
| **[SandBase CLI](https://sandbase.ai)** | SandBase | Open-source CLI and MCP server that gives developers and AI coding agents one interface to discover and call 2,000+ AI models and APIs. It supports structured JSON output, 25 AI clients, local/remote MCP transports, and six MCP tools.; [GitHub](https://github.com/sandbaseai/cli) |
| **[AIPM](https://www.aipm-registry.com/)** | Abhishek Srivastava | Open-source registry and CLI for publishing, versioning, discovering, and installing reusable AI skills across Codex, Claude Code, and Cursor.; [GitHub](https://github.com/abhisri2090/aipm) |
| **[Superagent](https://superagent.computer)** | pungme | Open-source (MIT) macOS desktop app that gives Claude Code and Codex a real browser to drive, an iOS Simulator to install and screenshot apps in, and a phone companion app for remote monitoring.; [GitHub](https://github.com/pungme/superagent-desktop) |

---

## 🖊️ Editor Platforms with Native AI Features
Established editors that have shipped first-party AI capabilities.

| Tool | Company | Notes |
|------|---------|-------|
| **[Visual Studio Code](https://code.visualstudio.com)** | Microsoft | Copilot built-in + massive extension ecosystem for third-party AI tools |
| **[Xcode](https://developer.apple.com/xcode/)** | Apple | Predictive code completion + Swift Assist for Apple platform development |
| **[JetBrains IDEs](https://www.jetbrains.com/ai/)** | JetBrains | IntelliJ, PyCharm, WebStorm etc. with JetBrains AI (Junie agent) built in |
| **[Visual Studio](https://visualstudio.microsoft.com)** | Microsoft | GitHub Copilot deeply integrated; .NET and C++ focused |

*Last updated: July 2026*

---

> [!WARNING]
> **Disclaimer:** This directory is manually curated and may contain outdated information regarding pricing, features, or availability. Please verify details directly on the vendor's website for accuracy.

> [!NOTE]
> Some links in this guide are referral links (e.g., Emergent.sh). Using them helps support the ongoing maintenance of this curated list at no additional cost to you.
