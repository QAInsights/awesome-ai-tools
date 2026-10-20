/**
 * Pure data for the AI Coding Stack Matcher (/tools/stack-matcher).
 *
 * No imports and no side effects — the Astro page imports this module at
 * build time, so it must stay environment-agnostic.
 */

export const QUIZ_DIMENSIONS = [
  {
    id: 'editor', step: '01', label: 'Primary Environment', options: [
      { id: 'vscode', label: 'GUI Editor', hint: 'VS Code, Cursor, Devin, Zed' },
      { id: 'terminal', label: 'Terminal / CLI-First', hint: 'Neovim, tmux, CLI agents' },
      { id: 'jetbrains', label: 'JetBrains IDEs', hint: 'IntelliJ, PyCharm, WebStorm' },
      { id: 'browser', label: 'Browser / Prompt-to-App', hint: 'v0, Lovable, Bolt, Replit' },
    ],
  },
  {
    id: 'budget', step: '02', label: 'Monthly Budget', options: [
      { id: 'free', label: '$0 Free / Open Source', hint: 'Free tiers, OSS, BYOK only' },
      { id: 'indie', label: '$10–$25 Pro Seat', hint: 'One paid seat per tool' },
      { id: 'power', label: '$50–$200 Agentic', hint: 'Max tiers + metered API' },
      { id: 'enterprise', label: 'Team / Enterprise', hint: 'SSO, governance, admin' },
    ],
  },
  {
    id: 'privacy', step: '03', label: 'Privacy & Models', options: [
      { id: 'cloud', label: 'Cloud Frontier Models', hint: 'Vendor-hosted Claude, GPT, Gemini' },
      { id: 'byok', label: 'Bring Your Own Key', hint: 'Direct API keys, usage-metered' },
      { id: 'local', label: 'Strict Local / Air-Gapped', hint: 'Ollama, on-device, self-hosted' },
    ],
  },
  {
    id: 'workflow', step: '04', label: 'Primary Workflow', options: [
      { id: 'fullstack', label: 'Daily Feature Work', hint: 'Multi-file edits, refactors' },
      { id: 'agentic', label: 'Autonomous Repo Tasks', hint: 'Long-running agents, subagents' },
      { id: 'review', label: 'Review, Security & Testing', hint: 'PR review depth, scanning' },
      { id: 'greenfield', label: '0-to-1 Prototyping & UI', hint: 'Scaffold apps and UIs fast' },
    ],
  },
];

export const DEFAULT_ANSWERS = { editor: 'vscode', budget: 'indie', privacy: 'cloud', workflow: 'fullstack' };

export const SLOT_DEFS = [
  { id: 'primary', step: '01', label: 'Primary Environment', blurb: 'Where you write code every day' },
  { id: 'companion', step: '02', label: 'Companion Agent', blurb: 'Autonomous loops, context & MCP' },
  { id: 'quality', step: '03', label: 'Review & QA', blurb: 'PR review, security, testing' },
];

export const PERSONA_PRESETS = [
  { id: 'agentic-pro', label: 'Agentic Power User', blurb: 'GUI editor + terminal agent + deep PR review', answers: { editor: 'vscode', budget: 'power', privacy: 'cloud', workflow: 'agentic' } },
  { id: 'indie-shipper', label: 'Solo Indie Shipper', blurb: 'One paid seat, BYOK companion, free review', answers: { editor: 'vscode', budget: 'indie', privacy: 'byok', workflow: 'fullstack' } },
  { id: 'local-private', label: '100% Local / Air-Gapped', blurb: 'Open-source, runs on your hardware', answers: { editor: 'vscode', budget: 'free', privacy: 'local', workflow: 'fullstack' } },
  { id: 'terminal-native', label: 'Terminal Native', blurb: 'CLI agents end to end, bring your own keys', answers: { editor: 'terminal', budget: 'power', privacy: 'byok', workflow: 'agentic' } },
];

export const ANY_ENV = ['vscode', 'terminal', 'jetbrains', 'browser'];

export const CURATED_PROFILES = [
  // ── Primary-capable: GUI editors & VS Code forks ─────────────────────────
  { slug: 'cursor', slots: ['primary'], env: ['vscode'], privacy: ['cloud', 'byok'], workflows: ['fullstack', 'agentic', 'greenfield'], base: 9, rules: 'cursor-mdc', why: 'Composer agent, Tab autocomplete, and a mature .mdc rules system in a VS Code fork.' },
  { slug: 'devin', slots: ['primary'], env: ['vscode'], privacy: ['cloud'], workflows: ['fullstack', 'agentic'], base: 7, rules: 'windsurfrules', why: 'Devin (formerly Windsurf) Cascade pairs agentic flows with a familiar VS Code editor.' },
  { slug: 'zed', slots: ['primary'], env: ['vscode'], privacy: ['cloud', 'byok', 'local'], workflows: ['fullstack', 'greenfield'], base: 7, rules: 'agents-md', why: 'Fast open-source editor with an agent panel plus BYOK or local model support.' },
  { slug: 'trae', slots: ['primary'], env: ['vscode'], privacy: ['cloud', 'byok'], workflows: ['fullstack', 'greenfield'], base: 5, rules: 'agents-md', why: 'Low-cost AI IDE with a Builder agent mode and a usable free tier.' },
  { slug: 'antigravity', slots: ['primary'], env: ['vscode'], privacy: ['cloud'], workflows: ['agentic', 'fullstack'], base: 6, rules: 'agents-md', why: 'Google\u2019s agent-first IDE with a manager surface for parallel autonomous agents.' },
  { slug: 'github-copilot', slots: ['primary'], env: ['vscode', 'jetbrains'], privacy: ['cloud'], workflows: ['fullstack', 'review'], base: 8, rules: 'copilot', why: 'Autocomplete plus agent mode in VS Code and JetBrains with enterprise policy controls.' },
  { slug: 'junie', slots: ['primary', 'companion'], env: ['jetbrains'], privacy: ['cloud'], workflows: ['agentic', 'fullstack'], base: 7, rules: null, why: 'JetBrains\u2019 autonomous agent for multi-step tasks inside IntelliJ-family IDEs.' },
  { slug: 'jetbrains-ides', slots: ['primary'], env: ['jetbrains'], privacy: ['cloud'], workflows: ['fullstack'], base: 7, rules: null, why: 'JetBrains AI Assistant built into IntelliJ, PyCharm, and WebStorm.' },

  { slug: 'augment-code', slots: ['primary'], env: ['vscode', 'jetbrains'], privacy: ['cloud'], workflows: ['fullstack', 'agentic'], base: 7, rules: null, why: 'Agent and autocomplete tuned for large, complex codebases.' },
  { slug: 'cline', slots: ['primary', 'companion'], env: ['vscode', 'jetbrains'], privacy: ['byok', 'local', 'cloud'], workflows: ['agentic', 'fullstack'], base: 8, nativeTo: ['byok'], rules: 'clinerules', why: 'Open-source BYOK agent with explicit approval for every edit and command.' },
  { slug: 'roo-code', slots: ['primary', 'companion'], env: ['vscode'], privacy: ['byok', 'local'], workflows: ['agentic', 'fullstack'], base: 7, nativeTo: ['byok'], rules: 'clinerules', why: 'Cline fork with modes, deeper configuration, and BYOK model choice.' },
  { slug: 'kilo-code', slots: ['primary', 'companion'], env: ['vscode', 'jetbrains'], privacy: ['byok', 'local', 'cloud'], workflows: ['agentic'], base: 6, nativeTo: ['byok'], rules: null, why: 'Open-source agentic extension merging Cline and Roo features with BYOK.' },
  { slug: 'supermaven', slots: ['primary'], env: ['vscode', 'jetbrains'], privacy: ['cloud'], workflows: ['fullstack'], base: 5, rules: null, why: 'Low-latency autocomplete with a large context window at a flat $10 seat.' },
  { slug: 'tabnine', slots: ['primary'], env: ['vscode', 'jetbrains'], privacy: ['cloud', 'local'], workflows: ['fullstack'], base: 6, rules: null, why: 'Privacy-focused autocomplete with self-hosted and air-gapped deployment options.' },
  { slug: 'amazon-q-developer', slots: ['primary'], env: ['vscode', 'jetbrains'], privacy: ['cloud'], workflows: ['fullstack', 'review'], base: 5, rules: null, why: 'AWS-integrated assistant with chat, agents, and security scanning.' },
  { slug: 'void', slots: ['primary'], env: ['vscode'], privacy: ['local', 'byok'], workflows: ['fullstack'], base: 4, nativeTo: ['local'], rules: null, why: 'Open-source Cursor alternative that keeps data local or on your own keys.' },
  { slug: 'v0', slots: ['primary'], env: ['browser'], privacy: ['cloud'], workflows: ['greenfield'], base: 8, rules: null, why: 'Prompt-to-UI generation for React and Next.js with deploy hooks to Vercel.' },
  { slug: 'lovable', slots: ['primary'], env: ['browser'], privacy: ['cloud'], workflows: ['greenfield', 'fullstack'], base: 8, rules: null, why: 'Prompt-to-app builder that scaffolds full-stack apps with Supabase backends.' },
  { slug: 'boltnew', slots: ['primary'], env: ['browser'], privacy: ['cloud'], workflows: ['greenfield'], base: 7, rules: null, why: 'Browser prompt-to-app environment with in-browser installs and deploys.' },
  { slug: 'replit', slots: ['primary'], env: ['browser'], privacy: ['cloud'], workflows: ['greenfield', 'fullstack'], base: 7, rules: null, why: 'Browser IDE plus Agent that builds and hosts apps end to end.' },
  { slug: 'dyad', slots: ['primary'], env: ['browser'], privacy: ['local', 'byok'], workflows: ['greenfield'], base: 5, nativeTo: ['local', 'byok'], rules: null, why: 'Local, open-source app builder that runs on your keys or on-device models.' },
  // ── Primary-capable: terminal agents ─────────────────────────────────────
  { slug: 'claude-code', slots: ['primary', 'companion'], env: ['terminal'], privacy: ['cloud', 'byok'], workflows: ['agentic', 'fullstack'], base: 9, rules: 'claude-md', why: 'Anthropic\u2019s terminal agent for long-running, multi-file repo tasks.' },
  { slug: 'codex-cli', slots: ['primary', 'companion'], env: ['terminal'], privacy: ['cloud', 'byok'], workflows: ['agentic'], base: 8, rules: 'agents-md', why: 'OpenAI\u2019s open-source terminal agent bundled with ChatGPT plans.' },
  { slug: 'opencode', slots: ['primary', 'companion'], env: ['terminal'], privacy: ['byok', 'local', 'cloud'], workflows: ['agentic', 'fullstack'], base: 8, nativeTo: ['byok', 'local'], rules: 'agents-md', why: 'Open-source terminal agent that works with any provider, including local models.' },
  { slug: 'aider', slots: ['primary', 'companion'], env: ['terminal'], privacy: ['byok', 'local'], workflows: ['fullstack', 'agentic'], base: 8, nativeTo: ['byok', 'local'], rules: 'agents-md', why: 'Mature open-source pair programmer with git-native commits and BYOK pricing.' },
  { slug: 'gemini-cli', slots: ['primary', 'companion'], env: ['terminal'], privacy: ['cloud', 'byok'], workflows: ['agentic'], base: 7, rules: null, why: 'Google\u2019s open-source terminal agent with a generous free tier.' },
  { slug: 'goose', slots: ['companion', 'primary'], env: ['terminal'], privacy: ['byok', 'local'], workflows: ['agentic'], base: 6, nativeTo: ['byok', 'local'], rules: null, why: 'Block\u2019s open-source local agent framework with MCP extensions.' },
  { slug: 'amp', slots: ['primary', 'companion'], env: ['terminal', 'vscode'], privacy: ['cloud'], workflows: ['agentic'], base: 7, rules: 'agents-md', why: 'Sourcegraph\u2019s unconstrained agent in CLI and VS Code forms.' },
  { slug: 'factory-ai', slots: ['primary', 'companion'], env: ['terminal', 'vscode'], privacy: ['cloud'], workflows: ['agentic'], base: 6, rules: null, why: 'Droids platform for autonomous software tasks across CLI and IDE.' },
  { slug: 'warp', slots: ['primary'], env: ['terminal'], privacy: ['cloud', 'byok'], workflows: ['agentic', 'fullstack'], base: 6, rules: null, why: 'Agentic terminal with built-in AI blocks and team sharing.' },
  // ── Companion-only ───────────────────────────────────────────────────────
  { slug: 'kiro-cli', slots: ['companion'], env: ['terminal'], privacy: ['cloud'], workflows: ['agentic'], base: 5, rules: null, why: 'Kiro\u2019s spec-driven agent as a CLI companion alongside your editor.' },
  { slug: 'jules', slots: ['companion'], env: ANY_ENV, privacy: ['cloud'], workflows: ['agentic'], base: 6, rules: null, why: 'Google\u2019s async coding agent that runs repo tasks in the background.' },
  { slug: 'openhands', slots: ['companion'], env: ANY_ENV, privacy: ['byok', 'local', 'cloud'], workflows: ['agentic'], base: 6, nativeTo: ['byok', 'local'], rules: null, why: 'Open-source autonomous agent you can self-host with your own keys.' },
  { slug: 'sweep', slots: ['companion'], env: ['jetbrains'], privacy: ['cloud'], workflows: ['fullstack', 'agentic'], base: 5, rules: null, why: 'Async agent that turns issues into pull requests from JetBrains IDEs.' },
  { slug: 'codebase-memory-mcp', slots: ['companion'], env: ANY_ENV, privacy: ['local', 'byok'], workflows: ['agentic', 'fullstack'], base: 5, nativeTo: ['local'], rules: null, why: 'Local MCP server that gives agents persistent codebase memory.' },
  { slug: 'codegraph', slots: ['companion'], env: ANY_ENV, privacy: ['local', 'byok'], workflows: ['agentic', 'fullstack'], base: 5, nativeTo: ['local'], rules: null, why: 'Local code graph MCP that gives agents structural repo context.' },
  { slug: 'gortex', slots: ['companion'], env: ANY_ENV, privacy: ['local', 'byok'], workflows: ['agentic'], base: 4, nativeTo: ['local'], rules: null, why: 'Local MCP server that adds repo context and memory to any agent.' },
  { slug: 'magnitude', slots: ['companion'], env: ANY_ENV, privacy: ['local'], workflows: ['fullstack'], base: 4, nativeTo: ['local'], rules: null, why: 'Local codebase indexing that keeps repo context fully on-device.' },
  // ── Quality: review, security & testing ──────────────────────────────────
  { slug: 'coderabbit', slots: ['quality'], env: ANY_ENV, privacy: ['cloud'], workflows: ['review', 'agentic', 'greenfield'], base: 9, rules: null, why: 'Deep PR review with line-by-line summaries and incremental learning.' },
  { slug: 'qodo-qodo', slots: ['quality'], env: ANY_ENV, privacy: ['cloud', 'byok'], workflows: ['review', 'fullstack'], base: 8, rules: null, why: 'PR review plus test generation across the IDE and git provider.' },
  { slug: 'greptile', slots: ['quality', 'companion'], env: ANY_ENV, privacy: ['cloud'], workflows: ['review', 'agentic'], base: 6, rules: null, why: 'Full-context codebase review bot that learns repo structure.' },
  { slug: 'snyk-code-snyk', slots: ['quality'], env: ANY_ENV, privacy: ['cloud'], workflows: ['review'], base: 7, rules: null, why: 'SAST scanning with fix suggestions inside PRs and the IDE.' },
  { slug: 'graphite', slots: ['quality'], env: ANY_ENV, privacy: ['cloud'], workflows: ['review'], base: 6, rules: null, why: 'Stacked-PR workflow with AI review comments on every change.' },
  { slug: 'bito', slots: ['quality'], env: ANY_ENV, privacy: ['cloud', 'byok'], workflows: ['review'], base: 5, rules: null, why: 'AI code review and inline explanations with BYOK options.' },
  { slug: 'cubic', slots: ['quality'], env: ANY_ENV, privacy: ['cloud'], workflows: ['review', 'greenfield'], base: 5, rules: null, why: 'Lightweight AI PR review tuned for fast-moving teams.' },
  { slug: 'codex-security', slots: ['quality'], env: ANY_ENV, privacy: ['cloud', 'byok'], workflows: ['review', 'agentic'], base: 7, rules: null, why: 'Codex-driven security review that flags risky diffs in PRs.' },
  { slug: 'kodus', slots: ['quality'], env: ANY_ENV, privacy: ['cloud', 'byok', 'local'], workflows: ['review', 'fullstack'], base: 6, nativeTo: ['local'], rules: null, why: 'Open-source review agent you can self-host or run on your keys.' },
  { slug: 'gito', slots: ['quality'], env: ANY_ENV, privacy: ['local', 'byok'], workflows: ['review', 'fullstack'], base: 4, nativeTo: ['local'], rules: null, why: 'Local-first review CLI that scores diffs on your own models.' },
  { slug: 'bubo', slots: ['quality'], env: ANY_ENV, privacy: ['local', 'byok'], workflows: ['review'], base: 4, nativeTo: ['local'], rules: null, why: 'Local code review checks that run entirely on your hardware.' },
  { slug: 'code-review-graph', slots: ['quality'], env: ANY_ENV, privacy: ['local', 'byok'], workflows: ['review', 'agentic'], base: 4, nativeTo: ['local'], rules: null, why: 'Local review graphs that surface blast radius for each diff.' },
  { slug: 'agent-qa', slots: ['quality'], env: ANY_ENV, privacy: ['local', 'byok'], workflows: ['fullstack', 'review'], base: 5, nativeTo: ['local'], rules: null, why: 'Local agent that runs QA passes against changes on your keys.' },
  { slug: 'e2e', slots: ['quality'], env: ANY_ENV, privacy: ['local', 'byok'], workflows: ['greenfield', 'review'], base: 4, nativeTo: ['local'], rules: null, why: 'Local end-to-end test generation and execution for new apps.' },
  { slug: 'gitauto', slots: ['quality'], env: ANY_ENV, privacy: ['cloud'], workflows: ['review', 'fullstack'], base: 4, rules: null, why: 'GitHub agent that turns issues and failing tests into PRs.' },
  { slug: 'agentdiff', slots: ['quality'], env: ANY_ENV, privacy: ['cloud', 'byok'], workflows: ['review', 'agentic'], base: 4, rules: null, why: 'Open-source diff review for agent-generated changes.' },
  { slug: 'ellipsis', slots: ['quality'], env: ANY_ENV, privacy: ['cloud'], workflows: ['review', 'agentic'], base: 5, rules: null, why: 'AI review bot that also implements small fixes from comments.' },
];

export const CURATED_SLUGS = CURATED_PROFILES.map(p => p.slug);

/**
 * Default matching traits inferred for non-curated catalog tools, keyed by
 * the `categoryShort` values produced in src/lib/tools.ts CATEGORY_MAPPING.
 * Tools in unmapped categories only become candidates when curated.
 */
export const CATEGORY_SLOT_DEFAULTS = {
  'AI IDEs':        { slots: ['primary'], env: ['vscode'], workflows: ['fullstack'] },
  'IDE Plugins':    { slots: ['primary'], env: ['vscode'], workflows: ['fullstack'] },
  'Native Editors': { slots: ['primary'], env: ['vscode'], workflows: ['fullstack'] },
  'CLI Agents':     { slots: ['primary', 'companion'], env: ['terminal'], workflows: ['agentic'] },
  'AI Terminals':   { slots: ['primary'], env: ['terminal'], workflows: ['agentic', 'fullstack'] },
  'Async Agents':   { slots: ['companion'], env: ANY_ENV, workflows: ['agentic'] },
  'Web Builders':   { slots: ['primary'], env: ['browser'], workflows: ['greenfield'] },
  'Code Review':    { slots: ['quality'], env: ANY_ENV, workflows: ['review'] },
  'QA & Testing':   { slots: ['quality'], env: ANY_ENV, workflows: ['review'] },
  'Codebase AI':    { slots: ['companion'], env: ANY_ENV, workflows: ['agentic', 'fullstack'] },
};
