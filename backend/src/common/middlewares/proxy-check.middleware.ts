import { NextFunction, Request, Response } from 'express';

import { Logger } from '@nestjs/common';

import { isDevelopment } from '@common/utils/startup-app';

const logger = new Logger('ProxyCheckMiddleware');

export function proxyCheckMiddleware(req: Request, res: Response, next: NextFunction) {
    if (isDevelopment()) {
        return next();
    }

    const forwardedFor = req.headers['x-forwarded-for'];
    const isProxy = typeof forwardedFor === 'string' && forwardedFor.length > 0;
    const isHttps = req.secure && req.headers['x-forwarded-proto'] === 'https';

    if (!isHttps || !isProxy) {
        res.socket?.destroy();
        logger.error('Reverse proxy and HTTPS are required.');
        return;
    }

    return next();
}
