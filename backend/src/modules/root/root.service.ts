import { createHash, timingSafeEqual } from 'node:crypto';
import { Request, Response } from 'express';
import { nanoid } from 'nanoid';

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';

import { TRequestTemplateTypeKeys } from '@remnawave/backend-contract';

import {
    INTERNAL_JWT_AUDIENCE,
    INTERNAL_JWT_ISSUER,
    SUBSCRIPTION_RESPONSE_HEADERS_ALLOWLIST,
} from '@common/constants';
import { TypedConfigService } from '@common/config/app-config';
import { AxiosService } from '@common/axios/axios.service';
import { sanitizeUsername } from '@common/utils';

import { SubpageConfigService } from './subpage-config.service';

@Injectable()
export class RootService {
    private readonly logger = new Logger(RootService.name);

    private readonly isMarzbanLegacyLinkEnabled: boolean;
    private readonly marzbanSecretKeys: string[];
    private readonly mlDropRevokedSubscriptions: boolean;
    constructor(
        private readonly configService: TypedConfigService,
        private readonly jwtService: JwtService,
        private readonly axiosService: AxiosService,
        private readonly subpageConfigService: SubpageConfigService,
    ) {
        this.isMarzbanLegacyLinkEnabled = this.configService.getOrThrow(
            'MARZBAN_LEGACY_LINK_ENABLED',
        );
        this.mlDropRevokedSubscriptions = this.configService.getOrThrow(
            'MARZBAN_LEGACY_DROP_REVOKED_SUBSCRIPTIONS',
        );

        const marzbanSecretKeys = this.configService.get('MARZBAN_LEGACY_SECRET_KEY');

        if (marzbanSecretKeys && marzbanSecretKeys.length > 0) {
            this.marzbanSecretKeys = marzbanSecretKeys.split(',').map((key) => key.trim());
        } else {
            this.marzbanSecretKeys = [];
        }
    }

    public async serveSubscriptionPage(
        clientIp: string,
        req: Request,
        res: Response,
        shortUuid: string,
        clientType?: TRequestTemplateTypeKeys,
    ): Promise<void> {
        try {
            const userAgent = req.headers['user-agent'];

            let shortUuidLocal = shortUuid;

            if (this.isGenericPath(req.path)) {
                res.socket?.destroy();
                return;
            }

            if (this.isMarzbanLegacyLinkEnabled) {
                const username = await this.tryDecodeMarzbanLink(shortUuid);

                if (username) {
                    const sanitizedUsername = sanitizeUsername(username.username);

                    this.logger.log('Decoded a legacy subscription token.');

                    const userInfo = await this.axiosService.getUserByUsername(
                        clientIp,
                        sanitizedUsername,
                    );
                    if (!userInfo.isOk || !userInfo.response) {
                        this.logger.error('Decoded legacy subscription was not found.');

                        res.socket?.destroy();
                        return;
                    } else if (
                        this.mlDropRevokedSubscriptions &&
                        userInfo.response.response.subRevokedAt !== null
                    ) {
                        res.socket?.destroy();
                        return;
                    }

                    shortUuidLocal = userInfo.response.response.shortUuid;
                }
            }

            if (userAgent && this.isBrowser(userAgent)) {
                return this.returnWebpage(clientIp, req, res, shortUuidLocal);
            }

            const subscriptionDataResponse = await this.axiosService.getSubscription(
                clientIp,
                shortUuidLocal,
                req.headers,
                !!clientType,
                clientType,
            );

            if (!subscriptionDataResponse) {
                res.socket?.destroy();
                return;
            }

            if (subscriptionDataResponse.headers) {
                Object.entries(subscriptionDataResponse.headers)
                    .filter(([key]) =>
                        SUBSCRIPTION_RESPONSE_HEADERS_ALLOWLIST.has(key.toLowerCase()),
                    )
                    .forEach(([key, value]) => {
                        res.setHeader(key, value);
                    });
            }

            res.status(200).send(subscriptionDataResponse.response);
            return;
        } catch {
            this.logger.error('Subscription request failed.');

            res.socket?.destroy();
            return;
        }
    }

    private generateJwtForCookie(uuid: string | null): string {
        return this.jwtService.sign(
            {
                sessionId: nanoid(32),
                su: this.subpageConfigService.getEncryptedSubpageConfigUuid(uuid),
            },
            {
                expiresIn: '33m',
                algorithm: 'HS256',
                issuer: INTERNAL_JWT_ISSUER,
                audience: INTERNAL_JWT_AUDIENCE,
            },
        );
    }

    private isBrowser(userAgent: string): boolean {
        const browserKeywords = [
            'Mozilla',
            'Chrome',
            'Safari',
            'Firefox',
            'Opera',
            'Edge',
            'TelegramBot',
            'WhatsApp',
        ];

        return browserKeywords.some((keyword) => userAgent.includes(keyword));
    }

    private isGenericPath(path: string): boolean {
        const genericPaths = [
            'favicon.ico',
            'robots.txt',
            '.png',
            '.jpg',
            '.jpeg',
            '.gif',
            '.svg',
            '.webp',
            '.ico',
        ];

        return genericPaths.some((genericPath) => path.includes(genericPath));
    }

    private async returnWebpage(
        clientIp: string,
        req: Request,
        res: Response,
        shortUuid: string,
    ): Promise<void> {
        try {
            const subscriptionDataResponse = await this.axiosService.getSubscriptionInfo(
                clientIp,
                shortUuid,
            );

            if (!subscriptionDataResponse.isOk || !subscriptionDataResponse.response) {
                res.socket?.destroy();
                return;
            }

            const subpageConfigResponse = await this.axiosService.getSubpageConfig(
                shortUuid,
                req.headers,
            );

            if (!subpageConfigResponse.isOk || !subpageConfigResponse.response) {
                res.socket?.destroy();
                return;
            }

            const subpageConfig = subpageConfigResponse.response;

            if (subpageConfig.webpageAllowed === false) {
                this.logger.log(`Webpage access is not allowed by Remnawave's SRR.`);
                res.socket?.destroy();
                return;
            }

            const baseSettings = await this.subpageConfigService.getBaseSettings(
                subpageConfig.subpageConfigUuid,
            );

            const subscriptionData = subscriptionDataResponse.response;

            if (!baseSettings.showConnectionKeys) {
                subscriptionData.response.links = [];
                subscriptionData.response.ssConfLinks = {};
            }

            res.cookie('session', this.generateJwtForCookie(subpageConfig.subpageConfigUuid), {
                httpOnly: true,
                secure: true,
                sameSite: 'strict',
                path: '/',
                maxAge: 1_800_000, // 30 minutes
            });

            res.render('index', {
                metaTitle: baseSettings.metaTitle,
                metaDescription: baseSettings.metaDescription,
                panelData: Buffer.from(JSON.stringify(subscriptionData)).toString('base64'),
            });
        } catch {
            this.logger.error('Subscription webpage request failed.');

            res.socket?.destroy();
            return;
        }
    }

    private async tryDecodeMarzbanLink(shortUuid: string): Promise<{
        username: string;
        createdAt: Date;
    } | null> {
        if (!this.marzbanSecretKeys.length) return null;

        const token = shortUuid;
        this.logger.debug('Verifying a legacy subscription token.');

        if (!token || token.length < 10) {
            this.logger.debug('Legacy subscription token is too short.');
            return null;
        }

        for (const key of this.marzbanSecretKeys) {
            const result = await this.decodeMarzbanLink(shortUuid, key);
            if (result) return result;

            this.logger.debug('Legacy subscription token did not match a configured key.');
        }

        this.logger.debug(`Decoding Marzban link failed with all keys`);

        return null;
    }

    private async decodeMarzbanLink(
        token: string,
        marzbanSecretKey: string,
    ): Promise<{
        username: string;
        createdAt: Date;
    } | null> {
        if (token.split('.').length === 3) {
            try {
                const payload = await this.jwtService.verifyAsync(token, {
                    secret: marzbanSecretKey,
                    algorithms: ['HS256'],
                });

                if (payload.access !== 'subscription') {
                    throw new Error('JWT access field is not subscription');
                }

                const jwtCreatedAt = new Date(payload.iat * 1000);

                if (!this.checkSubscriptionValidity(jwtCreatedAt, payload.sub)) {
                    return null;
                }

                this.logger.debug('Legacy JWT verified successfully.');

                return {
                    username: payload.sub,
                    createdAt: jwtCreatedAt,
                };
            } catch {
                this.logger.debug('Legacy JWT verification failed.');
            }
        }

        const uToken = token.slice(0, token.length - 10);
        const uSignature = token.slice(token.length - 10);

        this.logger.debug('Verifying legacy token signature.');

        let decoded: string;
        try {
            decoded = Buffer.from(uToken, 'base64url').toString();
        } catch {
            this.logger.debug('Legacy token base64 decoding failed.');
            return null;
        }

        const hash = createHash('sha256');
        hash.update(uToken + marzbanSecretKey);
        const digest = hash.digest();

        const expectedSignature = Buffer.from(digest).toString('base64url').slice(0, 10);

        const actualSignatureBuffer = Buffer.from(uSignature);
        const expectedSignatureBuffer = Buffer.from(expectedSignature);
        if (
            actualSignatureBuffer.length !== expectedSignatureBuffer.length ||
            !timingSafeEqual(actualSignatureBuffer, expectedSignatureBuffer)
        ) {
            this.logger.debug('Signature mismatch');
            return null;
        }

        const parts = decoded.split(',');
        if (parts.length < 2) {
            this.logger.debug('Legacy token format is invalid.');
            return null;
        }

        const username = parts[0];
        const createdAtInt = parseInt(parts[1], 10);

        if (isNaN(createdAtInt)) {
            this.logger.debug('Legacy token timestamp is invalid.');
            return null;
        }

        const createdAt = new Date(createdAtInt * 1000);

        if (!this.checkSubscriptionValidity(createdAt, username)) {
            return null;
        }

        this.logger.debug('Legacy subscription token decoded successfully.');

        return {
            username,
            createdAt,
        };
    }

    private checkSubscriptionValidity(createdAt: Date, username: string): boolean {
        username = '[redacted]';
        const validFrom = this.configService.get('MARZBAN_LEGACY_SUBSCRIPTION_VALID_FROM');

        if (!validFrom) {
            return true;
        }

        const validFromDate = new Date(validFrom);
        if (createdAt < validFromDate) {
            this.logger.debug(
                `createdAt JWT: ${createdAt.toISOString()} is before validFrom: ${validFromDate.toISOString()}`,
            );

            this.logger.warn(
                `${JSON.stringify({ username, createdAt })} – subscription createdAt is before validFrom`,
            );

            return false;
        }

        return true;
    }
}
