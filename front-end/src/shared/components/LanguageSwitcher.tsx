import { CheckOutlined, GlobalOutlined } from '@ant-design/icons'
import { Button, Dropdown, Tooltip, message } from 'antd'
import { useContext } from 'react'
import { useI18n } from '../../i18n'
import type { AppLanguage } from '../../i18n'
import { AuthContext } from '../../features/auth/auth-context-value'
import { getUserErrorMessage } from '../../services/errorMessage'

interface LanguageSwitcherProps {
  compact?: boolean
}

export function LanguageSwitcher({ compact = false }: LanguageSwitcherProps) {
  const { language, setLanguage, t } = useI18n()
  const auth = useContext(AuthContext)

  const selectLanguage = (nextLanguage: AppLanguage) => {
    if (nextLanguage === language) return
    setLanguage(nextLanguage)
    if (auth?.isAuthenticated) {
      void auth.setPreferredLanguage(nextLanguage).catch((error) => {
        message.error(getUserErrorMessage(error, t('Unable to save language preference.')))
      })
    }
  }

  return (
    <Dropdown
      trigger={['click']}
      menu={{
        selectedKeys: [language],
        items: [
          {
            key: 'en',
            label: t('English'),
            icon: language === 'en' ? <CheckOutlined /> : null,
            onClick: () => selectLanguage('en'),
          },
          {
            key: 'vi',
            label: t('Vietnamese'),
            icon: language === 'vi' ? <CheckOutlined /> : null,
            onClick: () => selectLanguage('vi'),
          },
        ],
      }}
    >
      <Tooltip title={t('Language')}>
        <Button type="text" icon={<GlobalOutlined />} aria-label={t('Language')}>
          {compact ? language.toUpperCase() : language === 'vi' ? 'Tiếng Việt' : 'English'}
        </Button>
      </Tooltip>
    </Dropdown>
  )
}
