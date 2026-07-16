import { Request, Response } from 'express';

import { Get, Controller, Res, Req, Param, Logger } from '@nestjs/common';

import {
    REQUEST_TEMPLATE_TYPE_VALUES,
    TRequestTemplateTypeKeys,
} from '@remnawave/backend-contract';
import { APP_CONFIG_ROUTE_WO_LEADING_PATH } from '@remnawave/subscription-page-types';

import { GetJWTPayload } from '@common/decorators/get-jwt-payload';
import { ClientIp } from '@common/decorators/get-ip';
import { IJwtPayload } from '@common/constants';

import { SubpageConfigService } from './subpage-config.service';
import { RootService } from './root.service';

@Controller()
export class RootController {
    private readonly logger = new Logger(RootController.name);

    constructor(
        private readonly rootService: RootService,
        private readonly subpageConfigService: SubpageConfigService,
    ) {}

    @Get('health')
    health() {
        return { status: 'ok' };
    }

    @Get(APP_CONFIG_ROUTE_WO_LEADING_PATH)
    async getSubscriptionPageConfig(
        @GetJWTPayload() user: IJwtPayload,
        @Req() request: Request,
        @Res() response: Response,
    ): Promise<void> {
        const { config, etag } = await this.subpageConfigService.getSubscriptionPageConfig(user.su);
        response.setHeader('ETag', etag);
        response.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
        response.setHeader('CDN-Cache-Control', 'no-store');
        response.setHeader('Surrogate-Control', 'no-store');
        response.setHeader('Vary', 'Cookie');

        const candidates = request.headers['if-none-match']
            ?.split(',')
            .map((value) => value.trim());
        if (candidates?.includes(etag) || candidates?.includes('*')) {
            response.status(304).end();
            return;
        }

        response.status(200).json(config);
    }

    @Get([':shortUuid', ':shortUuid/:clientType'])
    async root(
        @ClientIp() clientIp: string,
        @Req() request: Request,
        @Res() response: Response,
        @Param('shortUuid') shortUuid: string,
        @Param('clientType') clientType: string,
    ) {
        if (request.path.startsWith('/assets') || request.path.startsWith('/locales')) {
            response.socket?.destroy();
            return;
        }

        if (clientType === undefined) {
            return await this.rootService.serveSubscriptionPage(
                clientIp,
                request,
                response,
                shortUuid,
            );
        }

        if (!REQUEST_TEMPLATE_TYPE_VALUES.includes(clientType as TRequestTemplateTypeKeys)) {
            this.logger.error(`Invalid client type: ${clientType}`);

            response.socket?.destroy();
            return;
        } else {
            return await this.rootService.serveSubscriptionPage(
                clientIp,
                request,
                response,
                shortUuid,
                clientType as TRequestTemplateTypeKeys,
            );
        }
    }
}
