import { afterEach, describe, expect, it } from 'vitest';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import express from 'express';

import { INTERNAL_JWT_AUDIENCE, INTERNAL_JWT_ISSUER } from '@common/constants';
import { checkAssetsCookieMiddleware } from '@common/middlewares';

const secret = 's'.repeat(64);

const createApp = () => {
    const app = express();
    app.use(cookieParser());
    app.use(checkAssetsCookieMiddleware);
    app.get('/assets/.app-config-v2.json', (_request, response) => response.status(204).end());
    return app;
};

describe('app-config session protection', () => {
    afterEach(() => delete process.env.INTERNAL_JWT_SECRET);

    it('rejects an unauthenticated app-config request', async () => {
        process.env.INTERNAL_JWT_SECRET = secret;
        expect((await request(createApp()).get('/assets/.app-config-v2.json')).status).toBe(401);
    });

    it('accepts only a signed token with required claims, issuer and audience', async () => {
        process.env.INTERNAL_JWT_SECRET = secret;
        const token = jwt.sign(
            { sessionId: 'session-id-with-sufficient-length', su: 'encrypted-config-uuid-value' },
            secret,
            {
                algorithm: 'HS256',
                issuer: INTERNAL_JWT_ISSUER,
                audience: INTERNAL_JWT_AUDIENCE,
                expiresIn: '5m',
            },
        );
        const response = await request(createApp())
            .get('/assets/.app-config-v2.json')
            .set('Cookie', `session=${token}`);
        expect(response.status).toBe(204);
    });

    it.each([
        ['wrong issuer', { issuer: 'wrong-issuer', audience: INTERNAL_JWT_AUDIENCE }],
        ['wrong audience', { issuer: INTERNAL_JWT_ISSUER, audience: 'wrong-audience' }],
    ])('rejects a token with %s', async (_label, claims) => {
        process.env.INTERNAL_JWT_SECRET = secret;
        const token = jwt.sign(
            { sessionId: 'session-id-with-sufficient-length', su: 'encrypted-config-uuid-value' },
            secret,
            { algorithm: 'HS256', ...claims, expiresIn: '5m' },
        );
        expect(
            (
                await request(createApp())
                    .get('/assets/.app-config-v2.json')
                    .set('Cookie', `session=${token}`)
            ).status,
        ).toBe(401);
    });

    it('rejects expired, tampered, unsigned and incomplete tokens', async () => {
        process.env.INTERNAL_JWT_SECRET = secret;
        const common = {
            algorithm: 'HS256' as const,
            issuer: INTERNAL_JWT_ISSUER,
            audience: INTERNAL_JWT_AUDIENCE,
        };
        const expired = jwt.sign(
            { sessionId: 'session-id-with-sufficient-length', su: 'encrypted-config-uuid-value' },
            secret,
            { ...common, expiresIn: -60 },
        );
        const incomplete = jwt.sign({ sessionId: 'session-id-with-sufficient-length' }, secret, {
            ...common,
            expiresIn: '5m',
        });
        const valid = jwt.sign(
            { sessionId: 'session-id-with-sufficient-length', su: 'encrypted-config-uuid-value' },
            secret,
            { ...common, expiresIn: '5m' },
        );
        const tampered = `${valid.slice(0, -1)}${valid.endsWith('a') ? 'b' : 'a'}`;

        for (const token of [expired, incomplete, tampered, 'not-a-jwt']) {
            const response = await request(createApp())
                .get('/assets/.app-config-v2.json')
                .set('Cookie', `session=${token}`);
            expect(response.status).toBe(401);
        }
    });
});
