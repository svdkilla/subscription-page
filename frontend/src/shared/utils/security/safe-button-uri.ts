const HTTP_SCHEMES = new Set(['http', 'https'])
const APP_SCHEMES = new Set([
    'clashmeta',
    'flclashx',
    'happ',
    'hiddify',
    'koala-clash',
    'prizrak-box',
    'shadowrocket',
    'stash',
    'streisand',
    'v2rayng',
    ...HTTP_SCHEMES
])
const SCHEME_PATTERN = /^([A-Za-z][A-Za-z0-9+.-]*):/u

const hasUnsafeCharacters = (value: string) =>
    [...value].some((character) => {
        const code = character.charCodeAt(0)
        return character === '<' || character === '>' || code <= 0x1f || code === 0x7f
    })

export const getSafeButtonUri = (
    rawValue: string,
    type: 'copyButton' | 'external' | 'subscriptionLink'
): null | string => {
    if (!rawValue || rawValue.length > 4_096 || rawValue !== rawValue.trim()) return null
    if (rawValue.includes('{{') || rawValue.includes('}}') || hasUnsafeCharacters(rawValue)) {
        return null
    }

    if (rawValue.includes('%')) {
        try {
            const once = decodeURIComponent(rawValue)
            if (hasUnsafeCharacters(once)) return null
            if (/%[0-9A-Fa-f]{2}/u.test(once) && decodeURIComponent(once) !== once) return null
        } catch {
            return null
        }
    }

    const match = SCHEME_PATTERN.exec(rawValue)
    if (!match) return null
    const scheme = match[1]!.toLowerCase()
    const allowedSchemes = type === 'external' ? HTTP_SCHEMES : APP_SCHEMES
    if (!allowedSchemes.has(scheme)) return null

    if (HTTP_SCHEMES.has(scheme)) {
        try {
            const parsed = new URL(rawValue)
            if (parsed.protocol !== `${scheme}:` || !parsed.hostname) return null
        } catch {
            return null
        }
    } else if (!rawValue.slice(match[0].length)) {
        return null
    }

    return rawValue
}

export const openSafeExternalUri = (uri: string): void => {
    const opened = window.open(uri, '_blank', 'noopener,noreferrer')
    if (opened) opened.opener = null
}
