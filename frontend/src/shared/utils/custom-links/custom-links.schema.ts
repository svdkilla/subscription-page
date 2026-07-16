import { SubscriptionPageRawConfigSchema } from '@remnawave/subscription-page-types'
import { z } from 'zod'

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
    'sub'
] as const
export const CUSTOM_LINK_SUBSCRIPTION_PROTOCOLS = [
    'vless',
    'vmess',
    'trojan',
    'ss',
    'hysteria2',
    'hy2',
    'tuic',
    'wireguard',
    'sub'
] as const

const HTML_DELIMITERS = /[<>]/u

const hasControlCharacters = (value: string): boolean =>
    Array.from(value).some((character) => {
        const code = character.charCodeAt(0)
        return code < 32 || code === 127
    })
const SCHEME_PATTERN = /^([A-Za-z][A-Za-z0-9+.-]*):/u
const PERCENT_ESCAPE_PATTERN = /%[0-9A-Fa-f]{2}/u
const TEMPLATE_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/gu
const allowedSchemes = new Set<string>(ALLOWED_CUSTOM_LINK_SCHEMES)
const allowedVariables = new Set(['shortUuid', 'subscriptionUrl', 'username'])

const decodedVariants = (value: string): null | string[] => {
    if (!value.includes('%')) return [value]
    try {
        const once = decodeURIComponent(value)
        if (PERCENT_ESCAPE_PATTERN.test(once) && decodeURIComponent(once) !== once) return null
        return [value, once]
    } catch {
        return null
    }
}

export const getCustomLinkUriError = (value: string): null | string => {
    if (!value || value.length > 4096 || value !== value.trim()) return 'Invalid URI'
    const variants = decodedVariants(value)
    if (!variants) return 'Invalid URI'
    if (variants.some((item) => hasControlCharacters(item) || HTML_DELIMITERS.test(item))) {
        return 'Invalid URI'
    }

    const match = SCHEME_PATTERN.exec(value)
    if (!match) return 'Invalid URI'
    const scheme = match[1]!.toLowerCase()
    if (!allowedSchemes.has(scheme)) return 'Invalid URI'

    if (scheme === 'http' || scheme === 'https') {
        try {
            const parsed = new URL(value)
            if (parsed.protocol !== `${scheme}:` || !parsed.hostname) return 'Invalid URI'
        } catch {
            return 'Invalid URI'
        }
    } else if (!value.slice(match[0].length) || /\s/u.test(value.slice(match[0].length))) {
        return 'Invalid URI'
    }

    return null
}

const templateError = (template: string): null | string => {
    for (const match of template.matchAll(TEMPLATE_PATTERN)) {
        if (!allowedVariables.has(match[1]!)) return 'Invalid template'
    }
    const remainder = template.replace(TEMPLATE_PATTERN, 'value')
    if (remainder.includes('{{') || remainder.includes('}}')) return 'Invalid template'
    return getCustomLinkUriError(
        template
            .replace(/\{\{username\}\}/gu, 'example-user')
            .replace(/\{\{shortUuid\}\}/gu, '01234567')
            .replace(/\{\{subscriptionUrl\}\}/gu, 'https://subscription.invalid/example')
    )
}

export const CustomLinkSchema = z
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
                .refine((value) => !HTML_DELIMITERS.test(value))
        ),
        uri: z.string().default(''),
        action: z.enum(['open', 'copy', 'qr']),
        iconKey: z.string().optional(),
        order: z.number().int().min(0).max(10_000),
        mode: z.enum(['literal', 'template', 'subscriptionLinks']).default('literal'),
        protocol: z.enum(CUSTOM_LINK_SUBSCRIPTION_PROTOCOLS).optional()
    })
    .superRefine((value, context) => {
        if (value.mode === 'subscriptionLinks') {
            if (!value.protocol) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Protocol is required',
                    path: ['protocol']
                })
            }
            return
        }
        const error =
            value.mode === 'template' ? templateError(value.uri) : getCustomLinkUriError(value.uri)
        if (error) context.addIssue({ code: z.ZodIssueCode.custom, message: error, path: ['uri'] })
    })

export const SubscriptionPageConfigSchema = z.unknown().transform((input, context) => {
    const base = SubscriptionPageRawConfigSchema.safeParse(input)
    const links = z
        .array(CustomLinkSchema)
        .max(50)
        .safeParse(
            input && typeof input === 'object' && 'customLinks' in input
                ? ((input as { customLinks?: unknown }).customLinks ?? [])
                : []
        )
    if (!base.success) base.error.issues.forEach((issue) => context.addIssue(issue))
    if (!links.success) {
        links.error.issues.forEach((issue) =>
            context.addIssue({ ...issue, path: ['customLinks', ...issue.path] })
        )
    }
    if (!base.success || !links.success) return z.NEVER

    links.data.forEach((link, index) => {
        for (const locale of base.data.locales) {
            if (!link.displayName[locale]) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Missing localized display name',
                    path: ['customLinks', index, 'displayName', locale]
                })
            }
        }
    })

    return { ...base.data, customLinks: links.data }
})

export type TSubscriptionPageCustomLink = z.infer<typeof CustomLinkSchema>
export type TSubscriptionPageConfig = z.infer<typeof SubscriptionPageConfigSchema>

export interface ResolvedCustomLink {
    action: TSubscriptionPageCustomLink['action']
    iconKey?: string
    id: string
    name: string
    uri: string
}

export const isHttpCustomLinkUri = (uri: string): boolean => {
    const scheme = SCHEME_PATTERN.exec(uri)?.[1]?.toLowerCase()
    return scheme === 'http' || scheme === 'https'
}

export const resolveCustomLinks = (
    config: TSubscriptionPageConfig,
    subscription: { links: string[]; user: { shortUuid: string; username: string } },
    locale: string,
    subscriptionUrl: string
): ResolvedCustomLink[] => {
    const values = {
        username: subscription.user.username,
        shortUuid: subscription.user.shortUuid,
        subscriptionUrl
    }

    return config.customLinks
        .filter((link) => link.enabled)
        .sort((left, right) => left.order - right.order)
        .flatMap((link) => {
            const name = link.displayName[locale] ?? Object.values(link.displayName)[0] ?? 'Link'
            let candidates: string[]
            if (link.mode === 'subscriptionLinks') {
                candidates = subscription.links.filter(
                    (uri) => SCHEME_PATTERN.exec(uri)?.[1]?.toLowerCase() === link.protocol
                )
            } else {
                // prettier-ignore
                candidates = [
                    link.mode === 'template'
                        ? link.uri.replace(
                            /\{\{(username|shortUuid|subscriptionUrl)\}\}/gu,
                            (_, key: keyof typeof values) => values[key]
                        )
                        : link.uri
                ]
            }

            return candidates
                .filter((uri) => getCustomLinkUriError(uri) === null)
                .map((uri, index) => ({
                    action: link.action,
                    iconKey: link.iconKey,
                    id: `${link.id}-${index}`,
                    name: candidates.length > 1 ? `${name} ${index + 1}` : name,
                    uri
                }))
        })
}
