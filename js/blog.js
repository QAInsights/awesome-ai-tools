import { getBlogTheme } from '../src/lib/blogGradients.ts';

document.addEventListener('DOMContentLoaded', () => {
    const copyLinkBtn = document.getElementById('copy-link-btn');
    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', async () => {
            const textToCopy = copyLinkBtn.getAttribute('data-copy');
            if (!textToCopy) return;

            const label = copyLinkBtn.querySelector('[data-label]');
            const originalText = label ? label.textContent : 'Copy link';

            try {
                await navigator.clipboard.writeText(textToCopy);
                if (label) label.textContent = 'Copied!';
                copyLinkBtn.classList.add('border-[#22d3ee]', 'text-[#22d3ee]');

                setTimeout(() => {
                    if (label) label.textContent = originalText;
                    copyLinkBtn.classList.remove('border-[#22d3ee]', 'text-[#22d3ee]');
                }, 2000);
            } catch (err) {
                console.error('Failed to copy link:', err);
            }
        });
    }

    // "Discuss with AI" deep-links: also copy the discussion prompt to the
    // clipboard so the user can paste it manually if the AI chat target
    // strips pre-filled query parameters.
    const aiCopyBtns = document.querySelectorAll('.ai-copy-btn');
    aiCopyBtns.forEach((btn) => {
        btn.addEventListener('click', async () => {
            const textToCopy = btn.getAttribute('data-copy');
            if (!textToCopy) return;

            const label = btn.querySelector('[data-label]');
            const originalText = label ? label.textContent : '';
            const copiedLabel = btn.getAttribute('data-copied-label') || 'Copied!';

            try {
                await navigator.clipboard.writeText(textToCopy);
                if (label) label.textContent = copiedLabel;
                btn.classList.add('border-[#22d3ee]', 'text-[#22d3ee]');

                setTimeout(() => {
                    if (label) label.textContent = originalText;
                    btn.classList.remove('border-[#22d3ee]', 'text-[#22d3ee]');
                }, 2500);
            } catch (err) {
                // Clicking an <a> still navigates to the chatbot even if clipboard copy fails
                console.warn('Failed to copy AI discussion prompt to clipboard:', err);
            }
        });
    });

    // "Copy for LLM" action: copies the entire article formatted as clean markdown
    const copyLlmBtn = document.getElementById('copy-llm-btn');
    const articleMarkdownEl = document.getElementById('article-markdown');
    if (copyLlmBtn && articleMarkdownEl) {
        copyLlmBtn.addEventListener('click', async () => {
            let markdown = '';
            try {
                const parsed = JSON.parse(articleMarkdownEl.textContent || '{}');
                markdown = parsed.markdown || '';
            } catch (err) {
                console.error('Failed to parse article markdown:', err);
                return;
            }

            if (!markdown) return;

            const label = copyLlmBtn.querySelector('[data-label]');
            const originalText = label ? label.textContent : 'Copy for LLM';

            try {
                await navigator.clipboard.writeText(markdown);
                if (label) label.textContent = 'Copied full article!';
                copyLlmBtn.classList.add('border-[#a78bfa]', 'text-[#a78bfa]');

                setTimeout(() => {
                    if (label) label.textContent = originalText;
                    copyLlmBtn.classList.remove('border-[#a78bfa]', 'text-[#a78bfa]');
                }, 2500);
            } catch (err) {
                console.error('Failed to copy markdown to clipboard:', err);
            }
        });
    }

    // Scroll spy for Table of Contents (desktop sidebar)
    const tocLinks = document.querySelectorAll('.toc-link');
    if (tocLinks.length > 0) {
        const headingElements = Array.from(tocLinks)
            .map((link) => {
                const id = link.getAttribute('data-toc-link');
                return id ? document.getElementById(id) : null;
            })
            .filter((el) => el !== null);

        if (headingElements.length > 0) {
            const observerOptions = {
                root: null,
                // Top offset accounts for sticky headers; bottom margin triggers early
                rootMargin: '-80px 0px -60% 0px',
                threshold: 0,
            };

            const observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const activeId = entry.target.getAttribute('id');
                        tocLinks.forEach((link) => {
                            if (link.getAttribute('data-toc-link') === activeId) {
                                link.classList.add('text-white', 'border-[#22d3ee]', 'font-medium');
                                link.classList.remove('text-[#737373]', 'border-transparent');
                            } else {
                                link.classList.remove('text-white', 'border-[#22d3ee]', 'font-medium');
                                link.classList.add('text-[#737373]', 'border-transparent');
                            }
                        });
                    }
                });
            }, observerOptions);

            headingElements.forEach((el) => observer.observe(el));
        }
    }

    // Client-side search and tag filter on /blog
    const input = document.getElementById('blog-search-input');
    const searchBtn = document.getElementById('blog-search-btn');
    const dataEl = document.getElementById('blog-posts-data');
    const resultsWrap = document.getElementById('search-results');
    const resultsList = document.getElementById('search-results-list');
    const summaryEl = document.getElementById('search-results-summary');
    const clearBtn = document.getElementById('search-clear');
    const defaultView = document.getElementById('blog-default-view');
    if (!input || !dataEl || !resultsWrap || !resultsList || !defaultView) return;

    let posts = [];
    try {
        posts = JSON.parse(dataEl.textContent || '[]');
    } catch {
        return;
    }

    const el = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };

    const renderCard = (post) => {
        const card = el('article', 'bg-white/[0.02] border border-[#222] rounded-lg overflow-hidden hover:border-[#444] transition-all group');
        const link = el('a', 'flex flex-col md:flex-row h-full');
        link.href = post.url;

        // Pure CSS Mesh Gradient Glassmorphic Thumbnail
        const slug = post.url.replace(/^\/blog\//, '');
        const theme = getBlogTheme(slug, post.tags);

        const imgWrap = el('div', 'w-full md:w-[200px] h-[160px] md:h-auto shrink-0 relative overflow-hidden bg-[#06080d] flex items-center justify-center p-4 select-none');
        imgWrap.style.backgroundImage = theme.gradient;

        const glassCard = el('div', 'relative z-10 backdrop-blur-md bg-white/[0.04] border border-white/20 rounded-xl p-3.5 flex flex-col items-center justify-center text-center max-w-[88%] transition-transform duration-500 group-hover:scale-105 group-hover:border-white/40 shadow-xl overflow-hidden');
        const iconBox = el('div', 'w-9 h-9 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center mb-2 text-white font-mono text-base font-bold shadow-inner', theme.icon);
        iconBox.style.color = theme.accent;

        const tagBadge = el('span', 'text-[11px] font-mono uppercase tracking-wider text-white/90 font-medium line-clamp-1', post.tags[0] || 'AI Tools');

        glassCard.appendChild(iconBox);
        glassCard.appendChild(tagBadge);
        imgWrap.appendChild(glassCard);
        link.appendChild(imgWrap);

        const content = el('div', 'flex-1 p-6 flex flex-col justify-between');
        const top = el('div');
        const meta = el('div', 'flex items-center space-x-2 text-xs text-[#737373] mb-3 font-mono');
        if (post.featured) {
            meta.appendChild(el('span', 'text-[#f0d08f]', 'Featured'));
            meta.appendChild(el('span', '', '•'));
        }
        meta.appendChild(el('span', '', post.date));
        meta.appendChild(el('span', '', '•'));
        meta.appendChild(el('span', '', post.author));
        top.appendChild(meta);
        top.appendChild(el('h3', 'text-xl font-semibold text-white group-hover:text-[#22d3ee] transition-colors mb-2', post.title));
        top.appendChild(el('p', 'text-[#a3a3a3] text-[15px] leading-relaxed mb-4 line-clamp-2', post.description));
        content.appendChild(top);

        if (post.tags.length) {
            const tagRow = el('div', 'flex flex-wrap gap-2');
            post.tags.forEach((tag) => {
                tagRow.appendChild(el('span', 'inline-flex items-center px-2 py-0.5 rounded border border-[#333] text-xs font-mono bg-white/[0.03] text-[#a3a3a3]', tag));
            });
            content.appendChild(tagRow);
        }

        link.appendChild(content);
        card.appendChild(link);
        return card;
    };

    let activeTag = null;

    const performSearch = () => {
        const query = (input.value || '').trim().toLowerCase();
        if (!query && !activeTag) {
            resultsWrap.classList.add('hidden');
            defaultView.classList.remove('hidden');
            return;
        }

        const matches = posts.filter((post) => {
            const matchesQuery =
                !query ||
                post.title.toLowerCase().includes(query) ||
                post.description.toLowerCase().includes(query) ||
                post.tags.some((t) => t.toLowerCase().includes(query));

            const matchesTag = !activeTag || post.tags.includes(activeTag);

            return matchesQuery && matchesTag;
        });

        resultsList.replaceChildren();
        if (matches.length === 0) {
            const empty = el('p', 'text-sm text-[#737373] font-mono py-8 text-center', 'No articles match your search query.');
            resultsList.appendChild(empty);
        } else {
            matches.forEach((post) => resultsList.appendChild(renderCard(post)));
        }

        const parts = [];
        if (query) parts.push(`"${query}"`);
        if (activeTag) parts.push(`tag: ${activeTag}`);
        summaryEl.textContent = `Found ${matches.length} article${matches.length === 1 ? '' : 's'} ${parts.length ? `for ${parts.join(', ')}` : ''}`;

        defaultView.classList.add('hidden');
        resultsWrap.classList.remove('hidden');
    };

    input.addEventListener('input', performSearch);
    if (searchBtn) searchBtn.addEventListener('click', performSearch);

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            input.value = '';
            activeTag = null;
            document.querySelectorAll('.tag-filter').forEach((btn) => {
                btn.classList.remove('border-[#22d3ee]', 'text-[#22d3ee]', 'bg-[#22d3ee]/10');
            });
            performSearch();
        });
    }

    // Tag filter chips
    document.querySelectorAll('.tag-filter').forEach((btn) => {
        btn.addEventListener('click', () => {
            const tag = btn.getAttribute('data-tag');
            if (activeTag === tag) {
                activeTag = null;
                btn.classList.remove('border-[#22d3ee]', 'text-[#22d3ee]', 'bg-[#22d3ee]/10');
            } else {
                document.querySelectorAll('.tag-filter').forEach((b) => b.classList.remove('border-[#22d3ee]', 'text-[#22d3ee]', 'bg-[#22d3ee]/10'));
                activeTag = tag;
                btn.classList.add('border-[#22d3ee]', 'text-[#22d3ee]', 'bg-[#22d3ee]/10');
            }
            performSearch();
        });
    });
});
