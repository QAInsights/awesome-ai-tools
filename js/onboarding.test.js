import { describe, expect, test } from 'bun:test';
import {
    buildViewModel,
    createOnboardingClient,
    createOnboardingController,
    initOnboarding,
    newlyCompletedSteps,
    normalizeState,
    resolveSurface,
    stepCompletion,
} from './onboarding.js';

function state(overrides = {}) {
    return {
        favoritesCount: 0,
        followsCount: 0,
        favoritesTarget: 3,
        followsTarget: 1,
        badgeCompleted: false,
        dismissed: false,
        completed: false,
        ...overrides,
    };
}

describe('normalizeState', () => {
    test('coerces a server payload and derives booleans from timestamps', () => {
        expect(normalizeState({
            favoritesCount: 2,
            followsCount: 1,
            badgeCompletedAt: 10,
            dismissedAt: null,
            completedAt: null,
        })).toEqual(state({
            favoritesCount: 2,
            followsCount: 1,
            badgeCompleted: true,
        }));
    });

    test('rejects junk input', () => {
        expect(normalizeState(null)).toBeNull();
        expect(normalizeState('yes')).toBeNull();
        expect(normalizeState({ favoritesCount: 'lots' })).toEqual(state());
    });
});

describe('stepCompletion', () => {
    test('marks steps complete against the targets', () => {
        expect(stepCompletion(state())).toEqual({ favorites: false, follows: false, badge: false });
        expect(stepCompletion(state({ favoritesCount: 3, followsCount: 1, badgeCompleted: true })))
            .toEqual({ favorites: true, follows: true, badge: true });
        expect(stepCompletion(null)).toEqual({ favorites: false, follows: false, badge: false });
    });
});

describe('newlyCompletedSteps', () => {
    test('returns only steps that flipped to complete', () => {
        expect(newlyCompletedSteps(null, state({ favoritesCount: 3 }))).toEqual([]);
        expect(newlyCompletedSteps(
            state({ favoritesCount: 2 }),
            state({ favoritesCount: 3, followsCount: 1 }),
        )).toEqual(['favorites', 'follows']);
        expect(newlyCompletedSteps(
            state({ followsCount: 1 }),
            state({ followsCount: 1, badgeCompleted: true }),
        )).toEqual(['badge']);
    });
});

describe('resolveSurface', () => {
    test('inline root wins everywhere', () => {
        expect(resolveSurface({ pathname: '/blog/post', hasInlineRoot: true })).toBe('inline');
        expect(resolveSurface({ pathname: '/favorites', hasInlineRoot: true })).toBe('inline');
    });

    test('float only on the directory and tool pages', () => {
        expect(resolveSurface({ pathname: '/' })).toBe('float');
        expect(resolveSurface({ pathname: '/tools/cursor/' })).toBe('float');
        expect(resolveSurface({ pathname: '/tools/cursor/alternatives' })).toBe('float');
        expect(resolveSurface({ pathname: '/blog' })).toBeNull();
        expect(resolveSurface({ pathname: '/badge' })).toBeNull();
        expect(resolveSurface({ pathname: '/compare/cursor-vs-zed' })).toBeNull();
    });
});

describe('buildViewModel', () => {
    test('builds a three-step view with clamped progress', () => {
        const view = buildViewModel(state({ favoritesCount: 7, followsCount: 0 }));

        expect(view.visible).toBe(true);
        expect(view.total).toBe(3);
        expect(view.doneCount).toBe(1);
        expect(view.steps).toHaveLength(3);
        expect(view.steps[0]).toMatchObject({ id: 'favorites', done: true, detail: '3/3' });
        expect(view.steps[1]).toMatchObject({ id: 'follows', done: false, detail: '0/1' });
        expect(view.steps[2]).toMatchObject({ id: 'badge', ctaHref: '/badge' });
        expect(view.percent).toBe(33);
    });

    test('hides dismissed and previously completed states', () => {
        expect(buildViewModel(state({ dismissed: true }))?.visible).toBe(false);
        expect(buildViewModel(state({ completed: true }))?.visible).toBe(false);
    });

    test('celebration overrides a completed state once', () => {
        const view = buildViewModel(
            state({ favoritesCount: 3, followsCount: 1, badgeCompleted: true, completed: true }),
            { celebrating: true },
        );
        expect(view.visible).toBe(true);
        expect(view.celebrating).toBe(true);
        expect(view.ctaHref).toBe('/badge');
    });

    test('null state has no view', () => {
        expect(buildViewModel(null)).toBeNull();
    });
});

describe('createOnboardingClient', () => {
    function clientHarness(responses) {
        const requests = [];
        const queue = [...responses];
        const request = async (url, init) => {
            requests.push({ url, init });
            const respond = queue.shift() ?? (() => new Response('{}', { status: 200 }));
            return typeof respond === 'function' ? respond() : respond;
        };
        return { client: createOnboardingClient({ request }), requests };
    }

    test('read returns null on 401 and state on success', async () => {
        const { client } = clientHarness([
            new Response('{"error":"unauthorized"}', { status: 401 }),
            new Response(JSON.stringify({ onboarding: { favoritesCount: 1 } }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        ]);

        expect(await client.read()).toBeNull();
        expect(await client.read()).toEqual(state({ favoritesCount: 1 }));
    });

    test('read surfaces failures', async () => {
        const { client } = clientHarness([new Response('nope', { status: 503 })]);
        await expect(client.read()).rejects.toThrow('503');
    });

    test('completeBadge posts the badge action', async () => {
        const { client, requests } = clientHarness([
            new Response(JSON.stringify({ onboarding: { badgeCompletedAt: 5 } }), { status: 200 }),
        ]);

        const result = await client.completeBadge();

        expect(result.badgeCompleted).toBe(true);
        expect(requests[0]?.init?.method).toBe('POST');
        expect(requests[0]?.init?.body).toBe('{"action":"badge_completed"}');
    });

    test('dismiss posts the dismiss action and maps 401 to null', async () => {
        const { client, requests } = clientHarness([new Response('{}', { status: 200 })]);
        await client.dismiss();
        expect(requests[0]?.init?.body).toBe('{"action":"dismiss"}');

        const rejected = clientHarness([new Response('{}', { status: 401 })]);
        expect(await rejected.client.dismiss()).toBeNull();
    });
});

describe('createOnboardingController', () => {
    function recordingTracker() {
        const events = [];
        const track = (event, fields = {}) => events.push({ event, subject: '', ...fields });
        return { events, track };
    }

    function controllerHarness(serverStates) {
        const tracker = recordingTracker();
        const views = [];
        const queue = [...serverStates];
        const client = {
            read: async () => queue.shift() ?? null,
            dismiss: async () => (queue.shift() ?? null),
            completeBadge: async () => (queue.shift() ?? null),
        };
        const controller = createOnboardingController({
            client,
            tracker,
            onUpdate: view => views.push(view),
        });
        controller.setSurface('inline');
        return { controller, tracker, views };
    }

    test('first load seeds done steps without firing step events', async () => {
        const { controller, tracker, views } = controllerHarness([state({ favoritesCount: 3 })]);

        await controller.refresh();

        expect(tracker.events).toEqual([{ event: 'onboarding_shown', trigger: 'inline', subject: '' }]);
        expect(views.at(-1)?.visible).toBe(true);
        expect(views.at(-1)?.steps[0]?.done).toBe(true);
    });

    test('live count transitions fire exactly one event per step', async () => {
        const { controller, tracker } = controllerHarness([state()]);

        await controller.refresh();
        tracker.events.splice(0);

        controller.setLiveCounts({ favorites: 1 });
        controller.setLiveCounts({ favorites: 3 });
        controller.setLiveCounts({ follows: 1 });
        controller.setLiveCounts({ follows: 2 });

        const stepEvents = tracker.events.filter(event => event.event === 'onboarding_step_completed');
        expect(stepEvents).toEqual([
            { event: 'onboarding_step_completed', trigger: 'inline', subject: 'favorites' },
            { event: 'onboarding_step_completed', trigger: 'inline', subject: 'follows' },
        ]);
    });

    test('ignores live updates while signed out', async () => {
        const { controller, views } = controllerHarness([null]);

        await controller.refresh();
        controller.setLiveCounts({ favorites: 3 });

        expect(controller.getState()).toBeNull();
        expect(views.every(view => view === null)).toBe(true);
    });

    test('celebrates once when all steps complete in-session', async () => {
        const { controller } = controllerHarness([
            state(),
            state({ badgeCompleted: true, favoritesCount: 3, followsCount: 1 }),
            state({ badgeCompleted: true, favoritesCount: 3, followsCount: 1 }),
        ]);

        await controller.refresh();
        controller.setLiveCounts({ favorites: 3, follows: 1 });
        expect(controller.isCelebrating()).toBe(false);

        await controller.completeBadge();
        expect(controller.isCelebrating()).toBe(true);

        // Later updates do not re-celebrate
        controller.setLiveCounts({ favorites: 4, follows: 2 });
        expect(controller.isCelebrating()).toBe(true);
    });

    test('completeBadge applies the server response', async () => {
        const { controller, tracker } = controllerHarness([
            state(),
            state({ badgeCompleted: true, favoritesCount: 3, followsCount: 1, completed: true }),
        ]);

        await controller.refresh();
        await controller.completeBadge();

        expect(controller.getState()?.badgeCompleted).toBe(true);
        expect(tracker.events).toContainEqual({
            event: 'onboarding_step_completed',
            trigger: 'inline',
            subject: 'badge',
        });
        expect(controller.isCelebrating()).toBe(true);
    });

    test('dismiss optimistically hides, tracks, and persists', async () => {
        const { controller, tracker, views } = controllerHarness([
            state(),
            state({ dismissed: true }),
        ]);

        await controller.refresh();
        tracker.events.splice(0);
        await controller.dismiss();

        expect(tracker.events).toEqual([{ event: 'onboarding_dismissed', trigger: 'inline', subject: '' }]);
        expect(views.at(-1)?.visible).toBe(false);
    });

    test('sign-out clears everything', async () => {
        const { controller, views } = controllerHarness([state({ favoritesCount: 3 })]);

        await controller.refresh();
        controller.handleSignedOut();

        expect(controller.getState()).toBeNull();
        expect(views.at(-1)).toBeNull();
    });

    test('failed reads leave the UI hidden without throwing', async () => {
        const tracker = recordingTracker();
        const controller = createOnboardingController({
            client: { read: async () => { throw new Error('boom'); } },
            tracker,
            onUpdate: () => {},
        });

        expect(await controller.refresh()).toBeNull();
        expect(tracker.events).toEqual([]);
    });
});

describe('initOnboarding DOM mounting', () => {
    function fakeElement(tag) {
        const classes = new Set();
        const children = [];
        const listeners = {};
        const attributes = {};
        const node = {
            tag,
            children,
            className: '',
            textContent: '',
            style: {},
            removed: false,
            classList: {
                add: token => classes.add(token),
                remove: token => classes.delete(token),
                contains: token => classes.has(token),
            },
            append: (...nodes) => children.push(...nodes),
            replaceChildren: () => children.splice(0),
            remove: () => { node.removed = true; },
            addEventListener: (event, handler) => { listeners[event] = handler; },
            setAttribute: (name, value) => { attributes[name] = value; },
            click: () => listeners.click?.(),
            get attributes() { return attributes; },
            get classes() { return classes; },
        };
        return node;
    }

    function queryAll(node, predicate, found = []) {
        if (predicate(node)) found.push(node);
        node.children?.forEach(child => queryAll(child, predicate, found));
        return found;
    }

    function textOf(node) {
        return [node.textContent, ...node.children?.map(textOf) ?? []].join(' ');
    }

    function harness({ pathname = '/favorites', withInlineRoot = true, readState = null } = {}) {
        const doc = (function makeDoc() {
            const body = fakeElement('body');
            const inlineRoot = withInlineRoot ? fakeElement('div') : null;
            // The Astro mount point ships class="hidden" in the HTML
            inlineRoot?.classList.add('hidden');
            return {
                body,
                inlineRoot,
                getElementById: id => (id === 'onboardingChecklist' ? inlineRoot : null),
                createElement: tag => fakeElement(tag),
            };
        })();
        const calls = [];
        const subscribers = [];
        const sessionSubscribers = [];
        let serverRead = readState;
        const mounted = initOnboarding({
            root: doc,
            location: { pathname },
            controllerFactory: onUpdate => createOnboardingController({
                client: {
                    read: async () => { calls.push('read'); return serverRead; },
                    dismiss: async () => { calls.push('dismiss'); return null; },
                    completeBadge: async () => { calls.push('badge'); return null; },
                },
                tracker: { track: () => {} },
                onUpdate,
            }),
            bindSession: async () => ({
                subscribe: listener => sessionSubscribers.push(listener),
            }),
            subscribeFav: listener => subscribers.push(['favorites', listener]),
            subscribeFollow: listener => subscribers.push(['follows', listener]),
        });
        return {
            doc,
            mounted,
            calls,
            subscribers,
            sessionSubscribers,
            setServerRead: next => { serverRead = next; },
        };
    }

    test('returns null on pages without a surface and never binds auth', () => {
        const doc = { body: fakeElement('body'), getElementById: () => null, createElement: tag => fakeElement(tag) };
        const mounted = initOnboarding({
            root: doc,
            location: { pathname: '/blog' },
            bindSession: async () => { throw new Error('should not bind'); },
        });

        expect(mounted).toBeNull();
        expect(doc.body.children).toHaveLength(0);
    });

    test('renders the inline card for signed-in users and hides it on dismiss', async () => {
        const { doc, calls, sessionSubscribers, setServerRead } = harness({ pathname: '/favorites' });

        expect(doc.inlineRoot?.classes.has('hidden')).toBe(true);
        // Let the async bindSession() resolve and register its subscriber
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(sessionSubscribers).toHaveLength(1);

        // Signed out: session callback without a user keeps the card hidden
        sessionSubscribers.forEach(listener => listener({ user: null }));
        expect(doc.inlineRoot?.classes.has('hidden')).toBe(true);

        // Signed in but /api/onboarding 401s (read → null): still hidden
        sessionSubscribers.forEach(listener => listener({ user: { id: 'github:1' } }));
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(doc.inlineRoot?.children).toHaveLength(0);

        // Server reports progress on the next refresh: card renders
        setServerRead(state({ favoritesCount: 1 }));
        sessionSubscribers.forEach(listener => listener({ user: { id: 'github:1' } }));
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(doc.inlineRoot?.classes.has('hidden')).toBe(false);

        const card = doc.inlineRoot?.children[0];
        expect(card).toBeTruthy();
        const texts = textOf(card);
        expect(texts).toContain('Favorite 3 tools');
        expect(texts).toContain('Follow 1 tool');
        expect(texts).toContain('Get your badge');
        expect(texts).toContain('1/3');
        expect(queryAll(card, node => node.tag === 'li')).toHaveLength(3);

        // Dismiss via the card's ✕ button hides the card and persists
        queryAll(card, node => node.tag === 'button')[0].click();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(calls).toContain('dismiss');
        expect(doc.inlineRoot?.classes.has('hidden')).toBe(true);
    });

    test('renders the float on allow-listed paths and removes it on dismiss', async () => {
        const { doc, sessionSubscribers } = harness({
            pathname: '/tools/cursor',
            withInlineRoot: false,
            readState: state({ favoritesCount: 3 }),
        });

        await new Promise(resolve => setTimeout(resolve, 0));
        sessionSubscribers.forEach(listener => listener({ user: { id: 'github:1' } }));
        await new Promise(resolve => setTimeout(resolve, 0));

        const float = doc.body.children.find(node => node.tag === 'aside');
        expect(float).toBeTruthy();
        expect(textOf(float)).toContain('Set up your account');
        expect(textOf(float)).toContain('Next: Follow 1 tool');

        queryAll(float, node => node.tag === 'button')[0].click();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(float.removed).toBe(true);
        expect(doc.body.children.some(node => node.tag === 'aside' && !node.removed)).toBe(false);
    });

    test('live store updates re-render the inline card progress', async () => {
        const { doc, subscribers, sessionSubscribers } = harness({
            pathname: '/favorites',
            readState: state({ favoritesCount: 1 }),
        });

        const [, favoriteListener] = subscribers.find(([kind]) => kind === 'favorites') ?? [];
        expect(typeof favoriteListener).toBe('function');

        // Sign in first so the controller holds server state
        await new Promise(resolve => setTimeout(resolve, 0));
        sessionSubscribers.forEach(listener => listener({ user: { id: 'github:1' } }));
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(doc.inlineRoot?.classes.has('hidden')).toBe(false);

        // Simulate the shared favorites store emitting a fresh snapshot
        favoriteListener([{ slug: 'cursor' }, { slug: 'zed' }, { slug: 'trae' }]);
        expect(doc.inlineRoot?.classes.has('hidden')).toBe(false);
        const text = textOf(doc.inlineRoot?.children[0]);
        expect(text).toContain('1 of 3 done');
        expect(text).toContain('0/1');
        // The completed favorites step flips to its done presentation
        expect(text).toContain('Favorite 3 tools Done');
    });
});
