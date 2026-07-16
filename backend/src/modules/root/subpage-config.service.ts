import { createHash } from 'node:crypto';

import {
    Injectable,
    Logger,
    NotFoundException,
    OnApplicationBootstrap,
    ServiceUnavailableException,
    UnauthorizedException,
} from '@nestjs/common';

import { SUBPAGE_DEFAULT_CONFIG_UUID } from '@remnawave/subscription-page-types';

import { SubscriptionPageConfigSchema, TSubscriptionPageConfig } from '@common/subpage-config';
import { decryptUuid, encryptUuid } from '@common/utils/crypt-utils';
import { TypedConfigService } from '@common/config/app-config';
import { AxiosService } from '@common/axios';

interface ConfigCacheEntry {
    config: TSubscriptionPageConfig;
    etag: string;
    freshUntil: number;
    staleUntil: number;
}

interface ConfigResult {
    config: TSubscriptionPageConfig;
    etag: string;
}

@Injectable()
export class SubpageConfigService implements OnApplicationBootstrap {
    private readonly logger = new Logger(SubpageConfigService.name);
    private readonly internalJwtSecret: string;
    private readonly subpageConfigUuid: string;
    private readonly cacheTtlMs: number;
    private readonly lastKnownGoodTtlMs: number;
    private readonly cache = new Map<string, ConfigCacheEntry>();
    private readonly inFlight = new Map<string, Promise<ConfigResult>>();

    constructor(
        private readonly configService: TypedConfigService,
        private readonly axiosService: AxiosService,
    ) {
        this.internalJwtSecret = this.configService.getOrThrow('INTERNAL_JWT_SECRET');
        this.subpageConfigUuid = this.configService.getOrThrow('SUBPAGE_CONFIG_UUID');
        this.cacheTtlMs = this.configService.getOrThrow('CONFIG_CACHE_TTL_MS');
        this.lastKnownGoodTtlMs = this.configService.getOrThrow('CONFIG_LKG_TTL_MS');
    }

    public async onApplicationBootstrap(): Promise<void> {
        const configUuids = await this.fetchSubscriptionPageConfigList();
        if (configUuids.length === 0) {
            this.logger.warn(
                'Subscription page config warm-up was skipped; requests will retry through cache-aside.',
            );
            return;
        }

        const results = await Promise.allSettled(
            configUuids.map((uuid) => this.getConfigByUuid(uuid, true)),
        );
        const loaded = results.filter((result) => result.status === 'fulfilled').length;
        this.logger.log(`Subscription page config cache warm-up completed (${loaded} valid).`);
    }

    public async getSubscriptionPageConfig(encryptedUuid: string): Promise<ConfigResult> {
        const uuid = decryptUuid(encryptedUuid, this.internalJwtSecret);
        if (!uuid) throw new UnauthorizedException('Invalid subscription page session');
        return this.getConfigByUuid(uuid);
    }

    public async getBaseSettings(
        subpageConfigUuid: string | null,
    ): Promise<TSubscriptionPageConfig['baseSettings']> {
        const { config } = await this.getConfigByUuid(
            this.getFinalSubpageConfigUuid(subpageConfigUuid),
        );
        return config.baseSettings;
    }

    public getEncryptedSubpageConfigUuid(subpageConfigUuidFromRemnawave: string | null): string {
        return encryptUuid(
            this.getFinalSubpageConfigUuid(subpageConfigUuidFromRemnawave),
            this.internalJwtSecret,
        );
    }

    private async getConfigByUuid(uuid: string, forceRefresh = false): Promise<ConfigResult> {
        const now = Date.now();
        const cached = this.cache.get(uuid);
        if (!forceRefresh && cached && cached.freshUntil > now) {
            return { config: cached.config, etag: cached.etag };
        }

        const activeRequest = this.inFlight.get(uuid);
        if (activeRequest) return activeRequest;

        const request = this.refreshConfig(uuid, cached).finally(() => {
            if (this.inFlight.get(uuid) === request) this.inFlight.delete(uuid);
        });
        this.inFlight.set(uuid, request);
        return request;
    }

    private async refreshConfig(
        uuid: string,
        cached: ConfigCacheEntry | undefined,
    ): Promise<ConfigResult> {
        const upstream = await this.axiosService.getSubscriptionPageConfigByUuid(uuid);

        if (!upstream.isOk || !upstream.response) {
            if (upstream.code === 'NOT_FOUND') {
                this.cache.delete(uuid);
                throw new NotFoundException('Subscription page configuration was not found');
            }

            if (cached && cached.staleUntil > Date.now()) {
                this.logger.warn('Panel unavailable; serving a bounded last-known-good config.');
                return { config: cached.config, etag: cached.etag };
            }

            throw new ServiceUnavailableException(
                'Subscription page configuration is temporarily unavailable',
            );
        }

        const parsed = await SubscriptionPageConfigSchema.safeParseAsync(upstream.response.config);
        if (!parsed.success) {
            this.logger.error('Panel returned an invalid subscription page configuration.');
            if (cached && cached.staleUntil > Date.now()) {
                return { config: cached.config, etag: cached.etag };
            }
            throw new ServiceUnavailableException(
                'Subscription page configuration is temporarily unavailable',
            );
        }

        const config = parsed.data as TSubscriptionPageConfig;
        const now = Date.now();
        const etag = `"${createHash('sha256').update(JSON.stringify(config)).digest('base64url')}"`;
        this.cache.set(uuid, {
            config,
            etag,
            freshUntil: now + this.cacheTtlMs,
            staleUntil: now + this.lastKnownGoodTtlMs,
        });

        return { config, etag };
    }

    private async fetchSubscriptionPageConfigList(): Promise<string[]> {
        const result = await this.axiosService.getSubscriptionPageConfigList();
        if (!result.isOk || !result.response) return [];
        return result.response.configs.map((config) => config.uuid);
    }

    private getFinalSubpageConfigUuid(subpageConfigUuid: string | null): string {
        if (this.subpageConfigUuid === SUBPAGE_DEFAULT_CONFIG_UUID && subpageConfigUuid) {
            return subpageConfigUuid;
        }
        return this.subpageConfigUuid;
    }
}
