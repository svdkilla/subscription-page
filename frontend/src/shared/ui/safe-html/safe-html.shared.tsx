import DOMPurify from 'dompurify'

const ALLOWED_TAGS = [
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
    'span'
]

export const sanitizeLocalizedHtmlForDisplay = (source: string | undefined): string => {
    if (!source || source.length > 4_096) return ''
    return DOMPurify.sanitize(source, {
        ALLOWED_TAGS,
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
            'img'
        ]
    })
}
