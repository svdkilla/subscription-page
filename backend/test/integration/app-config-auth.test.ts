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
});
