import { message, Modal, notification } from 'antd'
import type { ReactNode } from 'react'
import { translate } from './i18n'

let configured = false

function localizeContent(content: ReactNode) {
  return typeof content === 'string' ? translate(content) : content
}

export function configureAntdFeedbackLocalization() {
  if (configured) return
  configured = true

  for (const method of ['success', 'error', 'info', 'warning', 'loading'] as const) {
    const original = message[method].bind(message)
    message[method] = ((content: Parameters<typeof original>[0], ...args: unknown[]) => {
      if (content && typeof content === 'object' && 'content' in content) {
        return original({ ...content, content: localizeContent(content.content) }, ...args as [])
      }
      return original(localizeContent(content as ReactNode), ...args as [])
    }) as typeof message[typeof method]
  }

  const originalConfirm = Modal.confirm.bind(Modal)
  Modal.confirm = ((config) => originalConfirm({
    ...config,
    title: localizeContent(config.title),
    content: localizeContent(config.content),
    okText: localizeContent(config.okText ?? translate('OK')),
    cancelText: localizeContent(config.cancelText ?? translate('Cancel')),
  })) as typeof Modal.confirm

  for (const method of ['success', 'error', 'info', 'warning'] as const) {
    const original = notification[method].bind(notification)
    notification[method] = ((config) => original({
      ...config,
      message: localizeContent(config.message),
      description: localizeContent(config.description),
    })) as typeof notification[typeof method]
  }
}
