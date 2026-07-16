import { CSSProperties, useMemo } from 'react'
import DOMPurify from 'dompurify'

const ALLOWED_TAGS = [
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
    'desc'
]

const ALLOWED_ATTR = [
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
    'focusable'
]

// eslint-disable-next-line react-refresh/only-export-components
export const sanitizeSvgForDisplay = (source: string | undefined): string => {
    if (!source || source.length > 50_000) return ''
    return DOMPurify.sanitize(source, {
        USE_PROFILES: { svg: true, svgFilters: false },
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        FORBID_TAGS: ['script', 'foreignObject', 'iframe', 'object', 'embed', 'style', 'image'],
        FORBID_ATTR: ['style', 'href', 'xlink:href'],
        ALLOW_DATA_ATTR: false
    })
}

interface Props {
    className?: string
    source: string | undefined
    style?: CSSProperties
}

export function SafeSvg({ className, source, style }: Props) {
    const sanitized = useMemo(() => sanitizeSvgForDisplay(source), [source])
    if (!sanitized) return null
    return (
        <span
            aria-hidden="true"
            className={className}
            dangerouslySetInnerHTML={{ __html: sanitized }}
            style={style}
        />
    )
}
