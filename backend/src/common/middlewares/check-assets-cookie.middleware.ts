import { NextFunction, Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';

import { Logger } from '@nestjs/common';

import { INTERNAL_JWT_AUDIENCE, INTERNAL_JWT_ISSUER, IJwtPayload } from '@common/constants';

const logger = new Logger('CheckAssetsCookieMiddleware');

export function checkAssetsCookieMiddleware(req: Request, res: Response, next: NextFunction) {
    if (req.path.startsWith('/assets') || req.path.startsWith('/locales')) {
        const secret = process.env.INTERNAL_JWT_SECRET;

        if (!secret) {
            logger.error('INTERNAL_JWT_SECRET is not set');
            res.status(503).json({ statusCode: 503, message: 'Service unavailable' });
            return;
        }

        if (!req.cookies.session) {
            logger.debug('No session cookie found');
            res.status(401).json({ statusCode: 401, message: 'Unauthorized' });
            return;
        }

        try {
            const jwtPayload = jwt.verify(req.cookies.session, secret, {
                algorithms: ['HS256'],
                issuer: INTERNAL_JWT_ISSUER,
                audience: INTERNAL_JWT_AUDIENCE,
                clockTolerance: 5,
            });
            if (
                typeof jwtPayload !== 'object' ||
                typeof jwtPayload.sessionId !== 'string' ||
                typeof jwtPayload.su !== 'string' ||
                jwtPayload.sessionId.length < 16 ||
                jwtPayload.su.length < 16
            ) {
                throw new Error('Required JWT claims are missing');
            }

            (req as { user: IJwtPayload } & Request).user = {
                sessionId: jwtPayload.sessionId,
                su: jwtPayload.su,
            };
        } catch {
            logger.debug('Asset session verification failed.');
            res.status(401).json({ statusCode: 401, message: 'Unauthorized' });
            return;
        }
    }

    return next();
}
