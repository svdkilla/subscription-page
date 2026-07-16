import DOMPurify from 'isomorphic-dompurify';
import { z } from 'zod';

import {
    SubscriptionPageRawConfigSchema as PublishedSubscriptionPageRawConfigSchema,
    TSubscriptionPageRawConfig as TPublishedSubscriptionPageRawConfig,
} from '@remnawave/subscription-page-types';

export const CUSTOM_LINK_ACTIONS = ['open', 'copy', 'qr'] as const;
export const CUSTOM_LINK_MODES = ['literal', 'template', 'subscriptionLinks'] as const;
export const ALLOWED_CUSTOM_LINK_SCHEMES = [
    'https',
    'http',
    'vless',
    'vmess',
    'trojan',
    'ss',
    'hysteria2',
    'hy2',
    'tuic',
    'wireguard',
    'sub',
] as const;
export const CUSTOM_LINK_SUBSCRIPTION_PROTOCOLS = [
    'vless',
    'vmess',
    'trojan',
    'ss',
    'hysteria2',
    'hy2',
    'tuic',
    'wireguard',
    'sub',
] as const;

const HTML_DELIMITERS = /[<>]/u;

const hasControlCharacters = (value: string): boolean =>
    Array.from(value).some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
    });
const SCHEME_PATTERN = /^([A-Za-z][A-Za-z0-9+.-]*):/u;
const PERCENT_ESCAPE_PATTERN = /%[0-9A-Fa-f]{2}/u;
const TEMPLATE_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/gu;
const ALLOWED_TEMPLATE_VARIABLES = new Set(['shortUuid', 'subscriptionUrl', 'username']);
const allowedSchemes = new Set<string>(ALLOWED_CUSTOM_LINK_SCHEMES);
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
    if (!allowedSchemes.has(scheme)) return `URI scheme '${scheme}' is not allowed`;

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

const getTemplateError = (template: string): string | null => {
    for (const match of template.matchAll(TEMPLATE_PATTERN)) {
        if (!ALLOWED_TEMPLATE_VARIABLES.has(match[1]!)) {
            return `Template variable '{{${match[1]}}}' is not allowed`;
        }
    }
    const remainder = template.replace(TEMPLATE_PATTERN, 'value');
    if (remainder.includes('{{') || remainder.includes('}}')) {
        return 'Template contains malformed variable syntax';
    }

    return getCustomLinkUriError(
        template
            .replace(/\{\{username\}\}/gu, 'example-user')
            .replace(/\{\{shortUuid\}\}/gu, '01234567')
            .replace(/\{\{subscriptionUrl\}\}/gu, 'https://subscription.invalid/example'),
    );
};

const CustomLinkSchema = z
    .object({
        id: z
            .string()
            .min(1)
            .max(64)
            .regex(/^[A-Za-z0-9_-]+$/u),
        enabled: z.boolean().default(true),
        displayName: z.record(
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
        ),
        uri: z.string().default(''),
        action: z.enum(CUSTOM_LINK_ACTIONS),
        iconKey: z.string().optional(),
        order: z.number().int().min(0).max(10_000),
        mode: z.enum(CUSTOM_LINK_MODES).default('literal'),
        protocol: z.enum(CUSTOM_LINK_SUBSCRIPTION_PROTOCOLS).optional(),
    })
    .superRefine((value, context) => {
        if (value.mode === 'subscriptionLinks') {
            if (!value.protocol) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Protocol is required',
                    path: ['protocol'],
                });
            }
            return;
        }
        const error =
            value.mode === 'template'
                ? getTemplateError(value.uri)
                : getCustomLinkUriError(value.uri);
        if (error) context.addIssue({ code: z.ZodIssueCode.custom, message: error, path: ['uri'] });
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
                USE_PROFILES: { svg: true, svgFilters: false },
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
            });
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

    let svgLibrary: Record<string, string>;
    try {
        svgLibrary = sanitizeSvgLibrary(baseResult.data.svgLibrary);
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
        for (const locale of baseResult.data.locales) {
            if (!link.displayName[locale]) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Missing required locale '${locale}'`,
                    path: ['customLinks', index, 'displayName', locale],
                });
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

    return { ...baseResult.data, svgLibrary, customLinks: customLinksResult.data };
});

export type TSubscriptionPageCustomLink = z.infer<typeof CustomLinkSchema>;
export type TSubscriptionPageConfig = {
    customLinks: TSubscriptionPageCustomLink[];
} & TPublishedSubscriptionPageRawConfig;
