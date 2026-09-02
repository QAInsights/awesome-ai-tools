import server from '@astrojs/cloudflare/entrypoints/server';
import { runScheduledDigest } from './lib/server/digest-runner';

export default {
    fetch: server.fetch,
    async scheduled(controller, env, ctx) {
        ctx.waitUntil(runScheduledDigest(controller.cron));
    },
} satisfies ExportedHandler<Env>;
