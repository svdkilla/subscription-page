process.title = 'rw-subpage';

import { utilities as nestWinstonModuleUtilities, WinstonModule } from 'nest-winston';
import { json, NextFunction, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { createLogger } from 'winston';
import compression from 'compression';
import * as winston from 'winston';
import path from 'node:path';
import helmet from 'helmet';
import morgan from 'morgan';
import * as ejs from 'ejs';

import { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';

import { APP_CONFIG_ROUTE_WO_LEADING_PATH } from '@remnawave/subscription-page-types';

import {
    createHostGuardMiddleware,
    noRobotsMiddleware,
    proxyCheckMiddleware,
    publicRequestGuardMiddleware,
} from '@common/middlewares';
import { checkAssetsCookieMiddleware } from '@common/middlewares/check-assets-cookie.middleware';
import { NotFoundExceptionFilter } from '@common/exception/not-found-exception.filter';
import { isDevelopment, isDevOrDebugLogsEnabled } from '@common/utils/startup-app';
import { getStartMessage } from '@common/utils/startup-app/get-start-message';
import { customLogFilter } from '@common/utils/filter-logs/filter-logs';
import { TypedConfigService } from '@common/config/app-config';
import { getRealIp } from '@common/middlewares/get-real-ip';

import { AppModule } from './app.module';

// const levels = {
//     error: 0,
//     warn: 1,
//     info: 2,
//     http: 3,
//     verbose: 4,
//     debug: 5,
//     silly: 6,
// };

const instanceId = process.env.INSTANCE_ID || '0';

const logger = createLogger({
    transports: [new winston.transports.Console()],
    format: winston.format.combine(
        customLogFilter(),
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss.SSS',
        }),
        winston.format.ms(),
        nestWinstonModuleUtilities.format.nestLike(`#${instanceId}`, {
            colors: true,
            prettyPrint: true,
            processId: false,
            appName: true,
        }),
    ),
    level: isDevOrDebugLogsEnabled() ? 'debug' : 'http',
});

const assetsPath = isDevelopment()
    ? path.resolve(__dirname, '..', '..', 'dev_frontend')
    : '/opt/app/frontend';

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        logger: WinstonModule.createLogger({
            instance: logger,
        }),
    });

    const config = app.get(TypedConfigService);

    app.disable('x-powered-by');

    app.set('trust proxy', config.getOrThrow('TRUST_PROXY'));

    app.use(cookieParser());

    app.use(
        rateLimit({
            windowMs: 60_000,
            limit: 240,
            standardHeaders: 'draft-8',
            legacyHeaders: false,
            message: { statusCode: 429, message: 'Too many requests' },
        }),
    );
    app.use(
        `/${APP_CONFIG_ROUTE_WO_LEADING_PATH}`,
        rateLimit({
            windowMs: 60_000,
            limit: 90,
            standardHeaders: 'draft-8',
            legacyHeaders: false,
            message: { statusCode: 429, message: 'Too many config requests' },
        }),
    );

    app.use(
        publicRequestGuardMiddleware,
        createHostGuardMiddleware(config.get('ALLOWED_HOSTS')),
        noRobotsMiddleware,
        proxyCheckMiddleware,
        checkAssetsCookieMiddleware,
        getRealIp,
    );
    app.use((_req: Request, res: Response, next: NextFunction) => {
        res.setHeader(
            'Permissions-Policy',
            'accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()',
        );
        next();
    });

    app.useGlobalFilters(new NotFoundExceptionFilter());

    app.useStaticAssets(assetsPath, {
        index: false,
        dotfiles: 'deny',
        redirect: false,
        fallthrough: true,
        setHeaders: (response) => {
            response.setHeader('Cache-Control', 'private, max-age=3600');
            response.setHeader('X-Content-Type-Options', 'nosniff');
        },
    });

    app.setBaseViewsDir(assetsPath);

    app.engine('html', ejs.renderFile);
    app.setViewEngine('html');

    app.use(json({ limit: '16kb', strict: true }));

    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    baseUri: ["'none'"],
                    objectSrc: ["'none'"],
                    frameAncestors: ["'none'"],
                    frameSrc: ["'none'"],
                    formAction: ["'none'"],
                    scriptSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    connectSrc: ["'self'"],
                    imgSrc: ["'self'", 'data:', 'https:'],
                    fontSrc: ["'self'", 'data:'],
                    manifestSrc: ["'self'"],
                },
            },
            crossOriginEmbedderPolicy: false,
            crossOriginOpenerPolicy: { policy: 'same-origin' },
            crossOriginResourcePolicy: { policy: 'same-origin' },
            hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
            referrerPolicy: { policy: 'no-referrer' },
        }),
    );

    app.use(compression());

    morgan.token('safe-url', (request) => {
        const pathname = request.url?.split('?')[0] ?? '/';
        if (pathname.startsWith('/assets/')) return '/assets/:asset';
        if (pathname.startsWith('/locales/')) return '/locales/:locale';
        return '/:subscription';
    });
    app.use(
        morgan(
            ':remote-addr - ":method :safe-url HTTP/:http-version" :status :res[content-length] ":user-agent"',
            {
                skip: (req) => req?.url?.startsWith('/assets') ?? false,
            },
        ),
    );

    const customSubPrefix = config.get('CUSTOM_SUB_PREFIX');

    app.setGlobalPrefix(customSubPrefix ?? '', {
        exclude: [APP_CONFIG_ROUTE_WO_LEADING_PATH, 'health'],
    });

    if (customSubPrefix) {
        logger.info('[CONFIG] CUSTOM_SUB_PREFIX: ' + customSubPrefix);
    } else {
        logger.info('[CONFIG] CUSTOM_SUB_PREFIX: not set');
    }

    app.enableShutdownHooks();

    await app.listen(Number(config.getOrThrow('APP_PORT')));

    logger.info('\n' + (await getStartMessage()) + '\n');
}
void bootstrap();
