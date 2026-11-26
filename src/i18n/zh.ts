/**
 * Simplified Chinese (zh-Hans) UI strings for the /zh/ page tree.
 *
 * Phase 1 scope: home, tool detail, and category pages. Product names,
 * "AI", "GitHub", "IDE" and similar terms stay in English, matching the
 * convention on mainstream Chinese developer sites (infoq.cn, juejin.cn).
 *
 * t() returns the zh string for locale 'zh' and the en fallback otherwise,
 * so every call site keeps the English literal inline as the source of truth.
 */

export type Locale = 'en' | 'zh';

const zh: Record<string, string> = {
    // ── Shared chrome ────────────────────────────────────────────────────
    'home': '首页',
    'directory': '目录',
    'backToDirectory': '← 返回目录',
    'updated': '更新于',
    'aiContentNote': '本页内容由 AI 生成，请以工具官网信息为准。',
    'makerNote': '你是该工具的开发者？',
    'getBadge': '领取精选徽章',

    // ── SiteHeader chrome ────────────────────────────────────────────────
    'hd.langSwitch': '查看本页英文版',
    'hd.advertise': '赞助',
    'hd.submit': '提交',
    'hd.signIn': '免费登录',
    'hd.favorites': '收藏',
    'hd.myStacks': '我的工具栈',
    'hd.zap': 'Zap 面板',
    'hd.settings': '设置',
    'hd.signOut': '退出登录',

    // ── NavIsland browse menu ────────────────────────────────────────────
    'nav.directory': '目录',
    'nav.directory.desc': '全部精选 AI 编程工具',
    'nav.favorites': '收藏',
    'nav.favorites.desc': '你收藏的工具',
    'nav.news': '今日 AI',
    'nav.news.desc': '每日模型与工具简报',
    'nav.new': '新鲜上架',
    'nav.new.desc': '按天查看新收录的工具',
    'nav.trending': '本周热门',
    'nav.trending.desc': '当前最受关注的工具',
    'nav.best': '最佳 AI 工具',
    'nav.best.desc': '按场景精选的榜单',
    'nav.compare': '对比',
    'nav.compare.desc': '逐项横向对比',
    'nav.guides': '工作流指南',
    'nav.guides.desc': '按开发任务挑选工具',
    'nav.switch': '迁移指南',
    'nav.switch.desc': '手把手的换工具教程',
    'nav.blog': '博客',
    'nav.blog.desc': '指南与深度分析',
    'nav.stack-matcher': '工具栈匹配',
    'nav.stack-matcher.desc': '4 步问答选出你的 AI 工具栈',
    'nav.cost-calculator': '成本计算器',
    'nav.cost-calculator.desc': '席位与 LLM token 花费估算',
    'nav.rules-converter': '规则转换器',
    'nav.rules-converter.desc': '转换 CLAUDE.md、Cursor .mdc 等规则文件',
    'nav.token-counter': 'Token 计数器',
    'nav.token-counter.desc': '统计各大模型的 token 用量',
    'nav.hallucination-scorer': '幻觉检测',
    'nav.hallucination-scorer.desc': '评估回答中的虚构内容',
    'nav.help': '帮助与支持',
    'nav.badge': '精选徽章',
    'nav.advertise': '赞助',
    'nav.submit': '提交工具',
    'nav.support': '支持本项目',
    'nav.github': 'GitHub',
    'nav.menu': '菜单',
    'nav.browse': '浏览',
    'nav.utilities': 'AI 小工具',
    'nav.more': '更多',
    'nav.featured': '精选',
    'nav.featuredCta': '向开发者推广你的 AI 工具',
    'nav.searchPlaceholder': '搜索工具、智能体和工作流',
    'nav.searchLabel': '搜索工具',
    'nav.clearSearch': '清除搜索',
    'nav.openMenu': '打开站点菜单，当前栏目：{label}',
    'nav.closeMenu': '关闭站点菜单',

    // ── Tool detail page ─────────────────────────────────────────────────
    'td.discontinued': '已停服',
    'td.windingDown': '即将停止服务',
    'td.windingDownNotice': '服务即将停止。',
    'td.readMigration': '查看迁移指南 →',
    'td.noLongerMaintained': '不再维护。',
    'td.discontinuedFold': '{name} 已停服{fold}。',
    'td.foldedInto': '，并入 {name}',
    'td.seeTool': '查看 {name} →',
    'td.pricing': '定价',
    'td.from': '起价',
    'td.freeTier': '有免费档',
    'td.visitSite': '访问官网',
    'td.visitSiteAria': '访问 {name} 官网',
    'td.favorite': '收藏',
    'td.favoriteAria': '收藏 {name}',
    'td.addToStack': '加入工具栈',
    'td.addToStackAria': '将 {name} 加入工具栈',
    'td.follow': '关注',
    'td.followAria': '登录以关注 {name}',
    'td.followTitle': '接收 {name} 的邮件更新',
    'td.followNote': '关注 {name}，当其收录信息（如价格、功能）变化时收到邮件提醒。每天最多一封摘要，可随时退订。',
    'td.factCompany': '公司',
    'td.factPricing': '定价模式',
    'td.factPaidPlans': '付费方案',
    'td.noneListed': '暂无',
    'td.factPeers': '同类工具',
    'td.pending': '该工具的详细资料正在整理中，我们仍在收集其定价、核心功能和评测信息。在此之前，可访问官网了解更多。',
    'td.secOverview': '概览',
    'td.secFeatures': '核心功能',
    'td.secPricing': '定价',
    'td.secFit': '适用人群',
    'td.bestFor': '适合',
    'td.notIdealFor': '不太适合',
    'td.secVerdict': '评测结论',
    'td.editorial': 'ai.dosa.dev 编辑部',
    'td.secLatest': '近期更新',
    'td.asOf': '截至',
    'td.secFaq': '定价与常见问题',
    'td.secMore': '更多 {cat} 工具',
    'td.seeAllAlts': '查看 {name} 的全部替代工具 →',
    'td.seePricing': '查看 {name} 定价详情 →',
    'td.secCompare': '对比',
    'td.compareAll': '将 {name} 与全部替代工具对比 →',
    'td.secReading': '相关阅读',
    'td.secTags': '标签',
    'td.try': '试用 {name}',
    'td.metaTitle': '{name}：{cat} 工具评测、定价与替代方案 | ai.dosa.dev',
    'td.metaDesc': '{name} 是 {company} 推出的 {cat} 工具。查看核心功能、定价、评测结论与替代工具对比。',
    'td.metaDescNoCo': '{name} 是一款 {cat} 工具。查看核心功能、定价、评测结论与替代工具对比。',

    // ── Category page ────────────────────────────────────────────────────
    'cat.tools': '{n} 个工具',
    'cat.withReviews': '{n} 个有完整评测',
    'cat.freeOss': '{n} 个免费或开源',
    'cat.faqBest': '最好的 {cat} 工具有哪些？',
    'cat.faqBestA': 'ai.dosa.dev 收录的最完整的 {cat} 工具包括 {names}。每个工具都有详情页，包含定价、核心功能和评测结论，完整 {n} 个工具见下方列表。',
    'cat.faqFree': '{cat} 工具免费吗？',
    'cat.faqFreeAYes': '这里收录的 {n} 个 {cat} 工具中，{free} 个免费或开源，其余提供免费档或付费方案，具体价格请查看各工具详情页。',
    'cat.faqFreeANo': '这里收录的 {n} 个 {cat} 工具定价各异，多数提供免费档或试用，具体价格请查看各工具详情页。',
    'cat.faqCurated': '这份清单是如何策划的？',
    'cat.faqCuratedA': 'ai.dosa.dev 由人工从社区投稿和编辑评审中精选收录，并为条目补充定价、功能和评测笔记，目录持续更新。',
    'cat.faqLabel': '常见问题',
    'cat.altGuides': '替代工具指南',
    'cat.alternatives': '{name} 替代方案',
    'cat.browseOther': '浏览其他分类',
    'cat.metaTitle': '{n} 款最佳 {cat} 工具（2026）横向对比 | ai.dosa.dev',
    'cat.metaDesc': '{n} 款精选 {cat} 工具，附定价、核心功能和评测结论。对比 {names} 等工具。',

    // ── Home page ────────────────────────────────────────────────────────
    'home.heroStats': '{tools} 个工具 · {cats} 个分类 · 人工精选',
    'home.heroUpdated': '更新于 {date}',
    'home.heroTitle1': '找到你的 ',
    'home.heroTitleGold': 'AI 编程工具栈',
    'home.trending': '本周热门 →',
    'home.newTools': '{date} 新增 {n} 个工具 →',
    'home.scope': '筛选',
    'home.browseByCategory': '按分类浏览',
    'home.thName': '名称',
    'home.thCompany': '公司',
    'home.thDesc': '简介',
    'home.thCategory': '分类',
    'home.compare': '对比',
    'home.selectTools': '选择工具进行对比',
    'home.compareHint': '最多可选 3 个工具，选择至少 2 个即可开始对比。',
    'home.compareFootnote': '小份量精选',
    'home.clear': '清空',
    'home.metaTitle': 'AI 编程工具目录：{n}+ 款精选 AI IDE、智能体与助手 | ai.dosa.dev',
    'home.metaDesc': '人工精选 {n}+ 款 AI 编程工具，覆盖 {cats} 个分类：AI IDE、命令行智能体、自主智能体、代码评审等。对比功能、定价与评测。',
    'home.keywords': 'AI 工具, AI 编程工具, AI IDE, AI 编程助手, 终端 AI 智能体, 自主编程智能体, AI 代码评审, dosa.dev',
};

/**
 * zh display names + short descriptions per category (keyed by the
 * English `categoryClean` name). Technical loanwords stay in English.
 */
export const ZH_CATEGORIES: Record<string, { name: string; desc: string }> = {
    'AI-Native IDEs & Editors': { name: 'AI 原生 IDE 与编辑器', desc: '为 AI 编程从头设计的 IDE 和编辑器。' },
    'IDE Extensions & Plugins': { name: 'IDE 插件与扩展', desc: '为现有 IDE 增加 AI 编程能力的插件和扩展。' },
    'Terminal & CLI Agents': { name: '终端与命令行智能体', desc: '在终端中运行的 AI 编程智能体与 CLI 工具。' },
    'AI-Native Terminals': { name: 'AI 原生终端', desc: '内置 AI 能力的终端模拟器。' },
    'Autonomous & Async Agents': { name: '自主与异步智能体', desc: '可独立、异步完成编程任务的 AI 智能体。' },
    'Browser-Based & App Builders': { name: '浏览器与应用构建工具', desc: '在浏览器中生成和构建应用的 AI 工具。' },
    'AI Code Review & Security': { name: 'AI 代码评审与安全', desc: '自动化代码评审、漏洞扫描与安全检查工具。' },
    'AI Testing & Quality Assurance': { name: 'AI 测试与质量保障', desc: 'AI 驱动的测试生成、执行与质量保障工具。' },
    'General-Purpose AI Assistants (with Strong Coding Capability)': { name: '通用 AI 助手', desc: '通用 AI 助手，编程能力同样出色。' },
    'Personal AI Agents': { name: '个人 AI 智能体', desc: '面向个人日常任务的 AI 智能体。' },
    'AI Codebase Knowledge & Generation': { name: 'AI 代码库理解与生成', desc: '理解代码库并生成文档、代码的 AI 工具。' },
    'Developer Productivity & Workflow': { name: '开发者生产力与工作流', desc: '提升开发效率与工作流的 AI 工具。' },
    'Editor Platforms with Native AI Features': { name: '内置 AI 的编辑平台', desc: '原生集成 AI 功能的编辑器平台。' },
    'Hardware & Edge AI': { name: '硬件与边缘 AI', desc: '面向硬件设备和边缘计算的 AI 工具。' },
};

/** zh name for a category's English clean name; falls back to the English name. */
export function zhCategoryName(englishName: string): string {
    return ZH_CATEGORIES[englishName]?.name ?? englishName;
}

/** zh description for a category's English clean name; falls back to ''. */
export function zhCategoryDesc(englishName: string): string {
    return ZH_CATEGORIES[englishName]?.desc ?? '';
}

function interpolate(template: string, vars: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/**
 * Translate one UI string.
 * @param key dictionary key under `zh`
 * @param en  the English literal (returned for locale 'en' and as fallback)
 * @param vars placeholders like `{name}` / `{n}` in both strings
 */
export function t(lang: string, key: string, en: string, vars: Record<string, string | number> = {}): string {
    const template = lang === 'zh' ? (zh[key] ?? en) : en;
    return interpolate(template, vars);
}

/** Path prefix for in-locale links: '' for en, '/zh' for zh. */
export function localePrefix(lang: string): string {
    return lang === 'zh' ? '/zh' : '';
}
