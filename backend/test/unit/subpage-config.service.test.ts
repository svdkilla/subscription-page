import { describe, expect, it, vi } from 'vitest';

import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';

import { TypedConfigService } from '@common/config/app-config';
import { AxiosService } from '@common/axios';

import { SubpageConfigService } from '@modules/root/subpage-config.service';

import { createSubpageConfigFixture } from '../fixtures/subpage-config.fixture';

const createService = () => {
    const settings: Record<string, unknown> = {
        INTERNAL_JWT_SECRET: 'x'.repeat(64),
        SUBPAGE_CONFIG_UUID: '00000000-0000-0000-0000-000000000000',
        CONFIG_CACHE_TTL_MS: 0,
        CONFIG_LKG_TTL_MS: 60_000,
    };
    const configService = {
        getOrThrow: vi.fn((key: string) => settings[key]),
    } as unknown as TypedConfigService;
    const axios = {
        getSubscriptionPageConfigByUuid: vi.fn(),
        getSubscriptionPageConfigList: vi.fn(),
    };
    const service = new SubpageConfigService(configService, axios as unknown as AxiosService);
    const encryptedUuid = service.getEncryptedSubpageConfigUuid(
        '11111111-1111-4111-8111-111111111111',
    );
    return { axios, encryptedUuid, service };
};

describe('SubpageConfigService cache-aside behavior', () => {
    it('refreshes title, logo and connection-key settings without a restart', async () => {
        const { axios, service } = createService();
        const initial = createSubpageConfigFixture();
        const updated = createSubpageConfigFixture();
        updated.baseSettings.metaTitle = 'Updated title';
        updated.baseSettings.showConnectionKeys = false;
        updated.brandingSettings.logoUrl = 'https://example.com/updated-logo.svg';
        axios.getSubscriptionPageConfigByUuid
            .mockResolvedValueOnce({ isOk: true, response: { config: initial } })
            .mockResolvedValueOnce({ isOk: true, response: { config: updated } });

        expect((await service.getBaseSettings(null)).metaTitle).toBe('Subscription');
        const settings = await service.getBaseSettings(null);
        expect(settings.metaTitle).toBe('Updated title');
        expect(settings.showConnectionKeys).toBe(false);
        expect(axios.getSubscriptionPageConfigByUuid).toHaveBeenCalledTimes(2);
    });

    it('coalesces concurrent misses into one upstream fetch', async () => {
        const { axios, encryptedUuid, service } = createService();
        let resolveRequest!: (value: object) => void;
        axios.getSubscriptionPageConfigByUuid.mockImplementation(
            () =>
                new Promise<object>((resolve) => {
                    resolveRequest = resolve;
                }),
        );

        const requests = [
            service.getSubscriptionPageConfig(encryptedUuid),
            service.getSubscriptionPageConfig(encryptedUuid),
            service.getSubscriptionPageConfig(encryptedUuid),
        ];
        await Promise.resolve();
        expect(axios.getSubscriptionPageConfigByUuid).toHaveBeenCalledTimes(1);
        resolveRequest({ isOk: true, response: { config: createSubpageConfigFixture() } });

        const results = await Promise.all(requests);
        expect(new Set(results.map((result) => result.etag)).size).toBe(1);
    });

    it('serves a bounded last-known-good config when the panel is unavailable', async () => {
        const { axios, encryptedUuid, service } = createService();
        axios.getSubscriptionPageConfigByUuid
            .mockResolvedValueOnce({
                isOk: true,
                response: { config: createSubpageConfigFixture() },
            })
            .mockResolvedValueOnce({ isOk: false, code: 'UPSTREAM_UNAVAILABLE' });

        const first = await service.getSubscriptionPageConfig(encryptedUuid);
        const fallback = await service.getSubscriptionPageConfig(encryptedUuid);
        expect(fallback.etag).toBe(first.etag);
        expect(fallback.config.baseSettings.metaTitle).toBe('Subscription');
    });

    it('does not replace last-known-good data with an invalid config', async () => {
        const { axios, encryptedUuid, service } = createService();
        axios.getSubscriptionPageConfigByUuid
            .mockResolvedValueOnce({
                isOk: true,
                response: { config: createSubpageConfigFixture() },
            })
            .mockResolvedValueOnce({ isOk: true, response: { config: { version: 'invalid' } } });

        const first = await service.getSubscriptionPageConfig(encryptedUuid);
        const fallback = await service.getSubscriptionPageConfig(encryptedUuid);
        expect(fallback.etag).toBe(first.etag);
    });

    it('evicts a deleted config instead of serving it as last-known-good', async () => {
        const { axios, encryptedUuid, service } = createService();
        axios.getSubscriptionPageConfigByUuid
            .mockResolvedValueOnce({
                isOk: true,
                response: { config: createSubpageConfigFixture() },
            })
            .mockResolvedValueOnce({ isOk: false, code: 'NOT_FOUND' })
            .mockResolvedValueOnce({ isOk: false, code: 'UPSTREAM_UNAVAILABLE' });

        await service.getSubscriptionPageConfig(encryptedUuid);
        await expect(service.getSubscriptionPageConfig(encryptedUuid)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        await expect(service.getSubscriptionPageConfig(encryptedUuid)).rejects.toBeInstanceOf(
            ServiceUnavailableException,
        );
    });

    it('returns a controlled 503 when no valid config has ever loaded', async () => {
        const { axios, encryptedUuid, service } = createService();
        axios.getSubscriptionPageConfigByUuid.mockResolvedValue({
            isOk: false,
            code: 'UPSTREAM_UNAVAILABLE',
        });

        await expect(service.getSubscriptionPageConfig(encryptedUuid)).rejects.toBeInstanceOf(
            ServiceUnavailableException,
        );
    });
});
