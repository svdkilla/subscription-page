import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';

import { createHostGuardMiddleware, publicRequestGuardMiddleware } from '@common/middlewares';

const createApp = () => {
    const app = express();
    app.use(publicRequestGuardMiddleware);
    app.use((_request, response) => response.status(204).end());
    return app;
};

describe('public request guard', () => {
    it.each([
        '/.env',
        '/package.json',
        '/package-lock.json',
        '/node_modules/example/index.js',
        '/proc/self/environ',
        '/assets/source.js.map',
        '/assets/%2e%2e/package.json',
        '/assets/%2E%2E%2fpackage.json',
        '/assets/..%2fpackage.json',
        '/assets/%252e%252e%252fpackage.json',
        '/assets/..\\package.json',
        '/assets/%2e%2e%5cpackage.json',
        '/assets/logo.svg%00.png',
        '/C:%5cWindows%5cwin.ini',
        '/C:/Windows/win.ini',
        '/etc/passwd',
        '/assets/file.exe',
    ])('returns 404 for protected path %s', async (path) => {
        const response = await request(createApp()).get(path);
        expect(response.status).toBe(404);
    });

    it('allows a normal subscription route', async () => {
        expect((await request(createApp()).get('/example-short-uuid')).status).toBe(204);
    });

    it('limits methods to GET and HEAD', async () => {
        const response = await request(createApp()).post('/example-short-uuid');
        expect(response.status).toBe(405);
        expect(response.headers.allow).toBe('GET, HEAD');
    });

    it('checks the raw Host header and ignores a forged forwarded host', async () => {
        const app = express();
        app.set('trust proxy', 1);
        app.use(createHostGuardMiddleware('panel.test'));
        app.use((_request, response) => response.status(204).end());

        const allowed = await request(app)
            .get('/health')
            .set('Host', 'panel.test')
            .set('X-Forwarded-Host', 'attacker.invalid');
        expect(allowed.status).toBe(204);

        const rejected = await request(app).get('/health').set('Host', 'attacker.invalid');
        expect(rejected.status).toBe(400);
    });
});
