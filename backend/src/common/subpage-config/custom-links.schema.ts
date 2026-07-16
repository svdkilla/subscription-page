import DOMPurify from 'isomorphic-dompurify';
import { z } from 'zod';

import {
    SubscriptionPageRawConfigSchema as PublishedSubscriptionPageRawConfigSchema,
    TSubscriptionPageRawConfig as TPublishedSubscriptionPageRawConfig,
} from '@remnawave/subscription-page-types';

export const CUSTOM_LINK_ACTIONS = ['open', 'copy', 'qr'] as const;
export const CUSTOM_LINK_MODES = ['literal', 'subscriptionLinks'] as const;
export const BLOCKED_CUSTOM_LINK_SCHEMES = [
    'about',
    'blob',
    'data',
    'file',
    'filesystem',
    'javascript',
    'vbscript',
    'view-source',
] as const;
const HTML_DELIMITERS = /[<>]/u;

const hasControlCharacters = (value: string): boolean =>
    Array.from(value).some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
    });
const SCHEME_PATTERN = /^([A-Za-z][A-Za-z0-9+.-]*):/u;
const PERCENT_ESCAPE_PATTERN = /%[0-9A-Fa-f]{2}/u;
const blockedSchemes = new Set<string>(BLOCKED_CUSTOM_LINK_SCHEMES);
const SVG_ALLOWED_TAGS = [
    'svg',
    'g',
    'path',
    'circle',
    'ellipse',
    'line',
    'polyline',
    'polygon',
    'rect',
    'defs',
    'linearGradient',
    'radialGradient',
    'stop',
    'clipPath',
    'mask',
    'title',
    'desc',
];
const SVG_ALLOWED_ATTRIBUTES = [
    'xmlns',
    'viewBox',
    'width',
    'height',
    'fill',
    'fill-opacity',
    'stroke',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-opacity',
    'opacity',
    'd',
    'cx',
    'cy',
    'r',
    'rx',
    'ry',
    'x',
    'y',
    'x1',
    'x2',
    'y1',
    'y2',
    'points',
    'transform',
    'offset',
    'stop-color',
    'stop-opacity',
    'id',
    'clip-path',
    'mask',
    'role',
    'aria-hidden',
    'focusable',
];
const LOCALIZED_HTML_ALLOWED_TAGS = [
    'br',
    'b',
    'strong',
    'i',
    'em',
    'u',
    's',
    'code',
    'kbd',
    'p',
    'ul',
    'ol',
    'li',
    'span',
];
const BUTTON_APP_SCHEMES = new Set([
    'clashmeta',
    'flclashx',
    'happ',
    'hiddify',
    'http',
    'https',
    'incy',
    'koala-clash',
    'prizrak-box',
    'shadowrocket',
    'stash',
    'streisand',
    'v2rayng',
]);
const BUTTON_TEMPLATE_VALUES: Record<string, string> = {
    USERNAME: 'test-user',
    SUBSCRIPTION_LINK: 'https://subscription.invalid/test-marker',
    HAPP_CRYPT3_LINK: 'happ://crypt3/test-marker',
    HAPP_CRYPT4_LINK: 'happ://crypt4/test-marker',
};
const BUTTON_TEMPLATE_PATTERN = /\{\{(\w+)\}\}/gu;

const getDecodedVariants = (value: string): string[] | null => {
    if (!value.includes('%')) return [value];
    try {
        const once = decodeURIComponent(value);
        if (PERCENT_ESCAPE_PATTERN.test(once) && decodeURIComponent(once) !== once) return null;
        return [value, once];
    } catch {
        return null;
    }
};

const sanitizeLocalizedRecord = <T extends Record<string, string>>(record: T): T =>
    Object.fromEntries(
        Object.entries(record).map(([locale, source]) => [
            locale,
            DOMPurify.sanitize(source.slice(0, 4_096), {
                ALLOWED_TAGS: LOCALIZED_HTML_ALLOWED_TAGS,
                ALLOWED_ATTR: [],
                ALLOW_ARIA_ATTR: false,
                ALLOW_DATA_ATTR: false,
                FORBID_TAGS: [
                    'script',
                    'style',
                    'svg',
                    'math',
                    'iframe',
                    'object',
                    'embed',
                    'form',
                    'input',
                    'button',
                    'a',
                    'img',
                ],
            }),
        ]),
    ) as T;

const sanitizeLocalizedConfig = (
    config: TPublishedSubscriptionPageRawConfig,
): TPublishedSubscriptionPageRawConfig =>
    ({
        ...config,
        baseTranslations: Object.fromEntries(
            Object.entries(config.baseTranslations).map(([key, value]) => [
                key,
                sanitizeLocalizedRecord(value),
            ]),
        ),
        platforms: Object.fromEntries(
            Object.entries(config.platforms).map(([platformKey, platform]) => [
                platformKey,
                {
                    ...platform,
                    displayName: sanitizeLocalizedRecord(platform.displayName),
                    apps: platform.apps.map((app) => ({
                        ...app,
                        blocks: app.blocks.map((block) => ({
                            ...block,
                            title: sanitizeLocalizedRecord(block.title),
                            description: sanitizeLocalizedRecord(block.description),
                            buttons: block.buttons.map((button) => ({
                                ...button,
                                text: sanitizeLocalizedRecord(button.text),
                            })),
                        })),
                    })),
                },
            ]),
        ),
    }) as TPublishedSubscriptionPageRawConfig;

const getButtonLinkError = (rawValue: string, type: string): string | null => {
    if (!rawValue || rawValue.length > 4_096 || rawValue !== rawValue.trim()) {
        return 'Button URI is missing, too long, or surrounded by whitespace';
    }
    const variants = getDecodedVariants(rawValue);
    if (
        !variants ||
        variants.some((value) => hasControlCharacters(value) || HTML_DELIMITERS.test(value))
    ) {
        return 'Button URI contains unsafe or ambiguous encoding';
    }

    let unknownTemplate = false;
    const value = rawValue.replace(BUTTON_TEMPLATE_PATTERN, (_match, key: string) => {
        const replacement = BUTTON_TEMPLATE_VALUES[key];
        if (!replacement) {
            unknownTemplate = true;
            return 'invalid-template-value';
        }
        return replacement;
    });
    if (unknownTemplate || value.includes('{{') || value.includes('}}')) {
        return 'Button URI contains an unsupported template variable';
    }

    const match = SCHEME_PATTERN.exec(value);
    if (!match) return 'Button URI must use an explicit scheme';
    const scheme = match[1]!.toLowerCase();
    const allowedSchemes = type === 'external' ? new Set(['http', 'https']) : BUTTON_APP_SCHEMES;
    if (!allowedSchemes.has(scheme)) return `Button URI scheme '${scheme}' is not allowed`;

    if (scheme === 'http' || scheme === 'https') {
        try {
            const parsed = new URL(value);
            if (parsed.protocol !== `${scheme}:` || !parsed.hostname) {
                return 'Button HTTP(S) URI must contain a valid host';
            }
        } catch {
            return 'Button HTTP(S) URI is invalid';
        }
    }
    return null;
};

const isSafeHttpUrl = (value: string, allowEmpty = false): boolean => {
    if (allowEmpty && value === '') return true;
    if (!value || value.length > 4_096 || value !== value.trim()) return false;
    const variants = getDecodedVariants(value);
    if (!variants || variants.some(hasControlCharacters)) return false;
    try {
        const parsed = new URL(value);
        return ['http:', 'https:'].includes(parsed.protocol) && Boolean(parsed.hostname);
    } catch {
        return false;
    }
};

export const getCustomLinkUriError = (value: string): string | null => {
    if (!value) return 'URI is required';
    if (value.length > 4096) return 'URI must not exceed 4096 characters';
    if (value !== value.trim()) return 'URI must not have leading or trailing whitespace';

    const variants = getDecodedVariants(value);
    if (!variants) return 'URI contains malformed or ambiguous percent-encoding';
    if (variants.some((item) => hasControlCharacters(item) || HTML_DELIMITERS.test(item))) {
        return 'URI contains unsafe characters or markup';
    }

    const match = SCHEME_PATTERN.exec(value);
    if (!match) return 'URI must start with an explicit allowed scheme';
    const scheme = match[1]!.toLowerCase();
    if (blockedSchemes.has(scheme)) return `URI scheme '${scheme}' is not allowed`;

    if (scheme === 'http' || scheme === 'https') {
        try {
            const parsed = new URL(value);
            if (parsed.protocol !== `${scheme}:` || !parsed.hostname) {
                return 'HTTP(S) URI must contain a valid host';
            }
        } catch {
            return 'HTTP(S) URI is invalid';
        }
    } else {
        const payload = value.slice(match[0].length);
        if (!payload || /\s/u.test(payload)) {
            return 'VPN URI must contain a non-empty payload without whitespace';
        }
    }

    return null;
};

const CustomLinkSchema = z
    .object({
        id: z
            .string()
            .min(1)
            .max(64)
            .regex(/^[A-Za-z0-9_-]+$/u),
        enabled: z.boolean().default(true),
        displayName: z
            .record(
                z.string().regex(/^[a-z]{2}$/u),
                z
                    .string()
                    .trim()
                    .min(1)
                    .max(100)
                    .refine(
                        (value) => !HTML_DELIMITERS.test(value),
                        'Display name must not contain HTML',
                    ),
            )
            .optional()
            .default({}),
        uri: z.string().default(''),
        action: z.enum(CUSTOM_LINK_ACTIONS).default('copy'),
        iconKey: z.string().optional(),
        order: z.number().int().min(0).max(10_000),
        mode: z.enum(CUSTOM_LINK_MODES).default('literal'),
    })
    .superRefine((value, context) => {
        const error = getCustomLinkUriError(value.uri);
        if (error) {
            context.addIssue({ code: z.ZodIssueCode.custom, message: error, path: ['uri'] });
            return;
        }

        const usesHttp = /^https?:/iu.test(value.uri);
        if (value.mode === 'literal' && !usesHttp) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Header link must use HTTP(S)',
                path: ['uri'],
            });
        }
        if (value.mode === 'subscriptionLinks' && usesHttp) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Connection link must use a non-HTTP URI scheme',
                path: ['uri'],
            });
        }
    });

const sanitizeSvgLibrary = (library: Record<string, string>): Record<string, string> =>
    Object.fromEntries(
        Object.entries(library).map(([key, source]) => {
            if (
                source.length === 0 ||
                source.length > 50_000 ||
                /<!DOCTYPE|<!ENTITY/iu.test(source)
            ) {
                throw new Error('SVG is outside the allowed size or document format');
            }
            const sanitized = DOMPurify.sanitize(source, {
                ALLOWED_TAGS: SVG_ALLOWED_TAGS,
                ALLOWED_ATTR: SVG_ALLOWED_ATTRIBUTES,
                FORBID_TAGS: [
                    'script',
                    'foreignObject',
                    'iframe',
                    'object',
                    'embed',
                    'style',
                    'image',
                ],
                FORBID_ATTR: ['style', 'href', 'xlink:href'],
                ALLOW_DATA_ATTR: false,
            }).replace(/\s+xmlns:xlink=(?:"[^"]*"|'[^']*')/giu, '');
            const elements = sanitized.match(/<[A-Za-z][^>]*>/gu)?.length ?? 0;
            if (!/^<svg(?:\s|>)/iu.test(sanitized) || elements > 256) {
                throw new Error('SVG is invalid or too complex');
            }
            return [key, sanitized];
        }),
    );

export const SubscriptionPageConfigSchema = z.unknown().transform((input, context) => {
    const baseResult = PublishedSubscriptionPageRawConfigSchema.safeParse(input);
    const customLinksResult = z
        .array(CustomLinkSchema)
        .max(50)
        .safeParse(
            input && typeof input === 'object' && 'customLinks' in input
                ? ((input as { customLinks?: unknown }).customLinks ?? [])
                : [],
        );

    if (!baseResult.success) baseResult.error.issues.forEach((issue) => context.addIssue(issue));
    if (!customLinksResult.success) {
        customLinksResult.error.issues.forEach((issue) =>
            context.addIssue({ ...issue, path: ['customLinks', ...issue.path] }),
        );
    }
    if (!baseResult.success || !customLinksResult.success) return z.NEVER;

    const sanitizedBaseConfig = sanitizeLocalizedConfig(baseResult.data);
    if (!isSafeHttpUrl(sanitizedBaseConfig.brandingSettings.logoUrl, true)) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Logo URL must be empty or use HTTP(S)',
            path: ['brandingSettings', 'logoUrl'],
        });
    }
    if (!isSafeHttpUrl(sanitizedBaseConfig.brandingSettings.supportUrl)) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Support URL must use HTTP(S)',
            path: ['brandingSettings', 'supportUrl'],
        });
    }
    if (
        sanitizedBaseConfig.baseSettings.metaTitle.length > 256 ||
        sanitizedBaseConfig.baseSettings.metaDescription.length > 1_024
    ) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Metadata text is too long',
            path: ['baseSettings'],
        });
    }
    Object.entries(sanitizedBaseConfig.platforms).forEach(([platformKey, platform]) => {
        platform.apps.forEach((app, appIndex) => {
            app.blocks.forEach((block, blockIndex) => {
                block.buttons.forEach((button, buttonIndex) => {
                    const error = getButtonLinkError(button.link, button.type);
                    if (error) {
                        context.addIssue({
                            code: z.ZodIssueCode.custom,
                            message: error,
                            path: [
                                'platforms',
                                platformKey,
                                'apps',
                                appIndex,
                                'blocks',
                                blockIndex,
                                'buttons',
                                buttonIndex,
                                'link',
                            ],
                        });
                    }
                });
            });
        });
    });

    let svgLibrary: Record<string, string>;
    try {
        svgLibrary = sanitizeSvgLibrary(sanitizedBaseConfig.svgLibrary);
    } catch {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'SVG library contains an unsafe or over-complex icon',
            path: ['svgLibrary'],
        });
        return z.NEVER;
    }
    const validSvgKeys = new Set(Object.keys(svgLibrary));
    customLinksResult.data.forEach((link, index) => {
        if (link.mode === 'literal') {
            for (const locale of sanitizedBaseConfig.locales) {
                if (!link.displayName[locale]) {
                    context.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `Missing required locale '${locale}'`,
                        path: ['customLinks', index, 'displayName', locale],
                    });
                }
            }
        }
        if (link.iconKey && !validSvgKeys.has(link.iconKey)) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Unknown icon key',
                path: ['customLinks', index, 'iconKey'],
            });
        }
    });

    return { ...sanitizedBaseConfig, svgLibrary, customLinks: customLinksResult.data };
});

export type TSubscriptionPageCustomLink = z.infer<typeof CustomLinkSchema>;
export type TSubscriptionPageConfig = {
    customLinks: TSubscriptionPageCustomLink[];
} & TPublishedSubscriptionPageRawConfig;
