export interface WorkflowGuide {
    slug: string;
    title: string;
    description: string;
    intro: string;
    steps: string[];
    tools: {
        slug: string;
        bestFor: string;
        tradeoff: string;
        tryIt: string;
    }[];
}

export const workflowGuides: WorkflowGuide[] = [
    {
        slug: 'triage-ci-failures',
        title: 'How to triage CI failures with AI',
        description: 'Compare AI tools for reading failed GitHub Actions runs, reproducing errors locally and diagnosing flaky CI tests.',
        intro: 'When a pipeline goes red, start by finding the first actionable error. A broken dependency install, a flaky test and an actual regression can all end with the same exit code, but they call for different fixes.',
        steps: [
            'Capture the failing job and step, commit SHA, runner image and first useful error. Remove secrets before sharing logs with any model.',
            'Compare with the last green run. Check for changes in dependencies, runner images and environment before blaming the code diff.',
            'Reproduce with the same command and versions where possible. Verify the smallest fix on the same CI job rather than treating a successful retry as proof.',
        ],
        tools: [
            {
                slug: 'github-mcp-server',
                bestFor: 'Bringing GitHub Actions run history and build failures into an MCP-capable assistant.',
                tradeoff: 'Requires an MCP client and GitHub credentials. It can fetch run evidence but does not mirror the runner locally.',
                tryIt: 'Give your client read-only access and have it compare the failed job with the last passing run. Ask it to cite the workflow, run and step behind each finding.',
            },
            {
                slug: 'claude-code',
                bestFor: 'Reproducing a shell command or failing test in a local checkout.',
                tradeoff: 'Your shell is not the hosted runner. Differences in OS, permissions or service containers can hide the failure.',
                tryIt: 'Supply the sanitized error and exact failing command. Ask for a reproduction before allowing code edits.',
            },
            {
                slug: 'github-copilot',
                bestFor: 'Investigating a test or workflow change without leaving your editor.',
                tradeoff: 'Editor context alone may miss matrix configuration, run logs and external service failures.',
                tryIt: 'Open the workflow and changed source files together. Share the failing matrix entry and ask which local check would separate a CI setup issue from a regression.',
            },
        ],
    },
    {
        slug: 'review-pull-requests',
        title: 'How to review pull requests with AI',
        description: 'Compare CodeRabbit, Bito and PR-Agent for AI pull request review, from inline feedback to self-managed setup.',
        intro: 'Use an AI first pass to surface risky changes, then have a human reviewer decide which findings matter. A useful comment identifies a changed line, explains who or what is affected, and suggests a check that could prove the concern.',
        steps: [
            'Start with one small PR with known issues and tell the reviewer what to prioritize: behavior changes, missing tests or compatibility.',
            'Verify each finding against the diff and surrounding code. Track which comments uncover real problems and which just add noise.',
            'Keep merge approval with maintainers. Expand to more repositories only if the first pass catches issues your team would otherwise miss.',
        ],
        tools: [
            {
                slug: 'coderabbit',
                bestFor: 'A managed first pass with inline comments on GitHub or GitLab.',
                tradeoff: 'Requires a hosted integration; broad review settings can generate more comments than a small team wants.',
                tryIt: 'Run it on a representative PR and tune review instructions around one recurring defect class before turning on broader feedback.',
            },
            {
                slug: 'bito',
                bestFor: 'Reviews that need to consider changes across repositories or run on Bitbucket.',
                tradeoff: 'Does not support Azure DevOps, and large diffs can run into line limits.',
                tryIt: 'Pick a PR that changes a shared interface and verify any cited downstream consumers before sending feedback to the author.',
            },
            {
                slug: 'pr-agent',
                bestFor: 'On-demand reviews with a self-managed runner and a model provider you choose.',
                tradeoff: 'Your team owns configuration, credentials and maintenance instead of getting a turnkey hosted service.',
                tryIt: 'Try an on-demand review on one repository. Compare the output to the maintainer’s review before enabling automatic comments.',
            },
        ],
    },
    {
        slug: 'write-unit-tests',
        title: 'How to write unit tests with AI',
        description: 'Compare Qodo, GitAuto and GitHub Copilot for generating focused unit tests that catch regressions.',
        intro: 'AI can draft the repetitive parts of a test, but it cannot decide what your code should do. Give it the public contract, a nearby test to follow and a concrete input that should fail today.',
        steps: [
            'Write down one behavior and its expected result. Add a boundary case or error path before asking the tool for fixtures and assertions.',
            'Run the test against the buggy code or deliberately break the behavior to make sure the assertion fails for the right reason.',
            'Review mocks and edge cases, then run the whole suite. Prefer a few meaningful assertions over a coverage boost with no new protection.',
        ],
        tools: [
            {
                slug: 'qodo',
                bestFor: 'Drafting unit tests from an existing function and surfacing scenarios you might miss.',
                tradeoff: 'Suggestions can encode current behavior, including bugs, unless you state the contract explicitly.',
                tryIt: 'Give it a function with a boundary condition and ask for cases where output or error behavior differs, not more variations of the happy path.',
            },
            {
                slug: 'gitauto',
                bestFor: 'Adding tests to a GitHub repository through an automated PR workflow.',
                tradeoff: 'GitHub-only; the team still needs to review the new tests and decide if the added coverage is meaningful.',
                tryIt: 'Start with one low-coverage module. Review the generated PR for useful assertions, unnecessary mocks and unrelated edits.',
            },
            {
                slug: 'github-copilot',
                bestFor: 'Drafting a small regression test alongside the source in your editor.',
                tradeoff: 'May infer fixture or assertion conventions incorrectly when it has too few examples.',
                tryIt: 'Open the closest test file and describe the expected failure; let Copilot draft a case, then run it before changing implementation.',
            },
        ],
    },
    {
        slug: 'test-browser-workflows',
        title: 'How to test browser workflows with AI',
        description: 'Compare Momentic, e2e and Agent QA for testing real browser journeys and catching UI regressions.',
        intro: 'Test a browser journey when its value depends on several steps working together: a user can submit a form, see the resulting state and return to it later. Use AI to navigate changing interfaces, but make pass or fail depend on an outcome you can observe.',
        steps: [
            'Pick one critical journey and use a disposable test account with seeded data. Keep real customer data out of model context.',
            'Use stable selectors for predictable steps and put a concrete assertion after any exploratory AI step.',
            'Run the scenario on an unchanged build, then break the expected behavior to check that the test detects it. Measure runtime and flaky reruns before broadening coverage.',
        ],
        tools: [
            {
                slug: 'momentic',
                bestFor: 'Teams that want hosted browsers and natural-language testing of deploy previews.',
                tradeoff: 'Credit-based usage can grow with test volume and is not a bring-your-own-model setup.',
                tryIt: 'Use a preview deployment for a single form flow. Compare the hosted run and evidence with your existing smoke test.',
            },
            {
                slug: 'e2e',
                bestFor: 'Keeping TypeScript browser tests in the repository while mixing Playwright-backed steps with agent actions.',
                tradeoff: 'You configure the runtime and model yourself, and the framework is still pre-1.0.',
                tryIt: 'Keep login and submission deterministic, and use an agent only for the tricky interaction before an explicit confirmation assertion.',
            },
            {
                slug: 'agent-qa',
                bestFor: 'Natural-language browser scenarios that need to survive routine UI changes.',
                tradeoff: 'Not a turnkey hosted execution service; adaptive navigation still needs assertions to catch semantic changes.',
                tryIt: 'Rename a nonessential control and verify the journey still works. Then remove the final confirmation and verify the same test fails.',
            },
        ],
    },
    {
        slug: 'refactor-legacy-code',
        title: 'How to refactor legacy code with AI',
        description: 'Compare Claude Code, Cursor and Aider for small, test-backed legacy code refactors.',
        intro: 'Refactor to make the next change easier without changing what the system does today. Start with one boundary you can test rather than asking an agent to “clean up” a whole subsystem.',
        steps: [
            'Identify callers and record current behavior with characterization tests, including surprising cases clients may rely on.',
            'Choose one change, such as extracting a parser or moving a dependency behind an interface. Defer API changes and formatting churn.',
            'Review the diff against the intended scope and rerun the tests after each step. Keep commits small enough to revert independently.',
        ],
        tools: [
            {
                slug: 'claude-code',
                bestFor: 'A terminal-led refactor that needs to trace several callers and run targeted tests.',
                tradeoff: 'Broad instructions can produce large edits and costly sessions; keep the allowed scope narrow.',
                tryIt: 'Inspect callers first with no edits. Approve one extraction only after the agent identifies the contract and how to verify it.',
            },
            {
                slug: 'cursor',
                bestFor: 'Interactive multi-file edits when you want to inspect and adjust the diff in an editor.',
                tradeoff: 'Requires adopting a separate editor and deciding which repository context the agent may see.',
                tryIt: 'Open the old implementation and its tests side by side. Accept only the edits that preserve the public interface.',
            },
            {
                slug: 'aider',
                bestFor: 'Git-centric terminal pairing on small changes you want to review as separate commits.',
                tradeoff: 'The workflow is CLI-first, and its default auto-commits may not match your team’s review cadence.',
                tryIt: 'Work on a branch, narrow the editable files and inspect the diff before building on the first commit.',
            },
        ],
    },
];
