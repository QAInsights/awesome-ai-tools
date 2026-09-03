import server from '@astrojs/cloudflare/entrypoints/server';
import { runScheduledDigest, runScheduledNews } from './lib/server/digest-runner';

export default {
    fetch: server.fetch,
    async scheduled(controller, env, ctx) {
        ctx.waitUntil(Promise.all([
            runScheduledDigest(controller.cron),
            runScheduledNews(controller.cron),
        ]));
    },
} satisfies ExportedHandler<Env>;
