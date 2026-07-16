import { SubscriptionPageRawConfigSchema } from '@remnawave/subscription-page-types'
import { z } from 'zod'

export const BLOCKED_CUSTOM_LINK_SCHEMES = [
    'about',
    'blob',
    'data',
    'file',
    'filesystem',
    'javascript',
    'vbscript',
    'view-source'
] as const
const HTML_DELIMITERS = /[<>]/u

const hasControlCharacters = (value: string): boolean =>
    Array.from(value).some((character) => {
        const code = character.charCodeAt(0)
        return code < 32 || code === 127
    })
const SCHEME_PATTERN = /^([A-Za-z][A-Za-z0-9+.-]*):/u
const PERCENT_ESCAPE_PATTERN = /%[0-9A-Fa-f]{2}/u
const blockedSchemes = new Set<string>(BLOCKED_CUSTOM_LINK_SCHEMES)

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
    if (blockedSchemes.has(scheme)) return 'Invalid URI'

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

export const CustomLinkSchema = z
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
                    .refine((value) => !HTML_DELIMITERS.test(value))
            )
            .optional()
            .default({}),
        uri: z.string().default(''),
        action: z.enum(['open', 'copy', 'qr']).default('copy'),
        iconKey: z.string().optional(),
        order: z.number().int().min(0).max(10_000),
        mode: z.enum(['literal', 'subscriptionLinks']).default('literal')
    })
    .superRefine((value, context) => {
        const error = getCustomLinkUriError(value.uri)
        if (error) {
            context.addIssue({ code: z.ZodIssueCode.custom, message: error, path: ['uri'] })
            return
        }

        const usesHttp = /^https?:/iu.test(value.uri)
        if (value.mode === 'literal' && !usesHttp) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Header link must use HTTP(S)',
                path: ['uri']
            })
        }
        if (value.mode === 'subscriptionLinks' && usesHttp) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Connection link must use a non-HTTP URI scheme',
                path: ['uri']
            })
        }
    })

const normalizeLegacyCustomLink = (value: unknown): null | unknown => {
    if (!value || typeof value !== 'object') return value
    const link = value as Record<string, unknown>

    if (link.mode === 'template') return null

    if (link.mode === 'subscriptionLinks' && typeof link.protocol === 'string') {
        const normalizedLink = { ...link }
        delete normalizedLink.protocol
        if (
            typeof normalizedLink.uri === 'string' &&
            !/^https?:/iu.test(normalizedLink.uri) &&
            getCustomLinkUriError(normalizedLink.uri) === null
        ) {
            return normalizedLink
        }
        return null
    }

    return value
}

const normalizeLegacyCustomLinks = (value: unknown): unknown => {
    if (!Array.isArray(value)) return value

    return value.flatMap((link) => {
        const normalizedLink = normalizeLegacyCustomLink(link)
        return normalizedLink === null ? [] : [normalizedLink]
    })
}

const CustomLinksSchema = z.preprocess(
    normalizeLegacyCustomLinks,
    z.array(CustomLinkSchema).max(50)
)

export const SubscriptionPageConfigSchema = z.unknown().transform((input, context) => {
    const base = SubscriptionPageRawConfigSchema.safeParse(input)
    const links = CustomLinksSchema.safeParse(
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

    const publicHeaderLinks = links.data.filter((link) => link.mode === 'literal')
    publicHeaderLinks.forEach((link, index) => {
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

    return { ...base.data, customLinks: publicHeaderLinks }
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
    locale: string
): ResolvedCustomLink[] => {
    return config.customLinks
        .filter((link) => link.enabled)
        .sort((left, right) => left.order - right.order)
        .flatMap((link) => {
            const name = link.displayName[locale] ?? Object.values(link.displayName)[0] ?? 'Link'
            const candidates = [link.uri]

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
