const translations = Object.fromEntries(
    [
        'installationGuideHeader',
        'connectionKeysHeader',
        'linkCopied',
        'linkCopiedToClipboard',
        'getLink',
        'scanQrCode',
        'scanQrCodeDescription',
        'copyLink',
        'name',
        'status',
        'active',
        'inactive',
        'expires',
        'bandwidth',
        'scanToImport',
        'expiresIn',
        'expired',
        'unknown',
        'indefinitely'
    ].map((key) => [key, { en: key === 'connectionKeysHeader' ? 'Connection keys' : key }])
)

export const getE2EAppConfig = (version: number) => ({
    version: '1',
    locales: ['en'],
    brandingSettings: {
        title: 'E2E Subscription',
        logoUrl: version === 1 ? '' : 'https://example.com/updated-logo.svg',
        supportUrl: 'https://example.com/support'
    },
    uiConfig: {
        subscriptionInfoBlockType: 'expanded',
        installationGuidesBlockType: 'cards'
    },
    baseSettings: {
        metaTitle: version === 1 ? 'Subscription E2E' : 'Subscription E2E Updated',
        metaDescription: 'E2E subscription page',
        showConnectionKeys: version === 1,
        hideGetLinkButton: false
    },
    baseTranslations: translations,
    svgLibrary: {
        Link: '<svg viewBox="0 0 24 24" onload="window.__svgXss=1"><script>window.__svgXss=1</script><path d="M1 1h4v4z" /></svg>'
    },
    platforms: {},
    customLinks: [
        {
            id: 'vless-qr',
            enabled: true,
            displayName: { en: 'VLESS QR' },
            uri: '',
            action: 'qr',
            iconKey: 'Link',
            order: 0,
            mode: 'subscriptionLinks',
            protocol: 'vless'
        },
        {
            id: 'hy2-copy',
            enabled: true,
            displayName: { en: 'HY2 Copy' },
            uri: '',
            action: 'copy',
            order: 1,
            mode: 'subscriptionLinks',
            protocol: 'hy2'
        },
        {
            id: 'help-open',
            enabled: true,
            displayName: { en: 'Open help' },
            uri: 'https://example.com/help',
            action: 'open',
            order: 2,
            mode: 'literal'
        }
    ]
})

export const E2E_SUBSCRIPTION_RESPONSE = {
    response: {
        isFound: true,
        user: {
            shortUuid: 'e2e-short-uuid',
            daysLeft: 30,
            trafficUsed: '1 GB',
            trafficLimit: '10 GB',
            lifetimeTrafficUsed: '2 GB',
            trafficUsedBytes: '1073741824',
            trafficLimitBytes: '10737418240',
            lifetimeTrafficUsedBytes: '2147483648',
            username: 'e2e-user',
            expiresAt: '2099-01-01T00:00:00.000Z',
            isActive: true,
            userStatus: 'ACTIVE',
            trafficLimitStrategy: 'NO_RESET'
        },
        links: [
            'vless://secret@example.com:443?security=tls#E2E-VLESS',
            'hy2://secret@example.com:443#E2E-HY2'
        ],
        ssConfLinks: {},
        subscriptionUrl: 'https://example.com/e2e-short-uuid'
    }
}
