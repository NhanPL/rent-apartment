import { Children, cloneElement, isValidElement } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { useI18n } from '../../i18n'

const translatableProps = new Set([
  'aria-label',
  'alt',
  'cancelText',
  'content',
  'description',
  'emptyText',
  'label',
  'message',
  'okText',
  'placeholder',
  'text',
  'tab',
  'title',
  'tooltip',
])

const structuredProps = new Set(['columns', 'items', 'locale', 'options', 'rules'])
const renderProps = new Set([
  'footer',
  'itemRender',
  'labelRender',
  'optionRender',
  'panelRender',
  'render',
  'renderItem',
  'tagRender',
  'title',
  'titleRender',
])

type Translate = (value: string, parameters?: Record<string, string | number>) => string

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function localizeStructuredValue(value: unknown, t: Translate, key?: string): unknown {
  if (typeof value === 'string') return key && translatableProps.has(key) ? t(value) : value
  if (isValidElement(value)) return localizeNode(value, t)
  if (Array.isArray(value)) return value.map((item) => localizeStructuredValue(item, t))
  if (!isPlainObject(value)) return value

  return Object.fromEntries(
    Object.entries(value).map(([childKey, childValue]) => {
      if (typeof childValue === 'function' && renderProps.has(childKey)) {
        return [childKey, (...args: unknown[]) => localizeNode(childValue(...args), t)]
      }
      return [childKey, localizeStructuredValue(childValue, t, childKey)]
    }),
  )
}

function localizeElement(element: ReactElement, t: Translate): ReactElement {
  const props = element.props as Record<string, unknown>
  const nextProps: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(props)) {
    if (key === 'children') {
      nextProps.children = Array.isArray(value)
        ? Children.map(value as ReactNode, (child) => localizeNode(child, t))
        : localizeNode(value as ReactNode, t)
    } else if (typeof value === 'string' && translatableProps.has(key)) {
      nextProps[key] = t(value)
    } else if (isValidElement(value)) {
      nextProps[key] = localizeNode(value, t)
    } else if (structuredProps.has(key)) {
      nextProps[key] = localizeStructuredValue(value, t)
    } else if (typeof value === 'function' && renderProps.has(key)) {
      nextProps[key] = (...args: unknown[]) => localizeNode(value(...args), t)
    }
  }

  return Object.keys(nextProps).length > 0 ? cloneElement(element, nextProps) : element
}

function localizeNode(node: ReactNode, t: Translate): ReactNode {
  if (typeof node === 'string') return t(node)
  if (Array.isArray(node)) return node.map((child) => localizeNode(child, t))
  if (!isValidElement(node)) return node
  return localizeElement(node, t)
}

export function Localized({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  return <>{localizeNode(children, t)}</>
}
