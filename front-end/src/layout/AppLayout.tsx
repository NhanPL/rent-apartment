import { LockOutlined, LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined, UserOutlined } from '@ant-design/icons'
import { Alert, Button, Drawer, Dropdown, Form, Grid, Input, Layout, Menu, Modal, Typography, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ChangePasswordPayload } from '../features/auth/types/auth'
import type { SidebarRouteItem } from '../routes/routeConfig'
import { getFormErrorMessage, getUserErrorMessage } from '../services/errorMessage'
import { useI18n } from '../i18n'
import { LanguageSwitcher } from '../shared/components/LanguageSwitcher'
import { Localized } from '../shared/components/Localized'
import './AppLayout.css'

const { Header, Sider, Content, Footer } = Layout
const SIDEBAR_STORAGE_KEY = 'app_sidebar_collapsed'

interface AppLayoutProps {
  pathname: string
  onNavigate: (path: string) => void
  items: SidebarRouteItem[]
  pageTitle: string
  content: ReactNode
  currentUserName: string
  onLogout: () => Promise<void>
  onChangePassword: (payload: ChangePasswordPayload) => Promise<void>
}

export function AppLayout({ pathname, onNavigate, items, pageTitle, content, currentUserName, onLogout, onChangePassword }: AppLayoutProps) {
  const { t } = useI18n()
  const screens = Grid.useBreakpoint()
  const isDesktop = Boolean(screens.lg)

  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null)
  const [changePasswordForm] = Form.useForm<ChangePasswordPayload>()

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed))
  }, [collapsed])

  const menuItems = useMemo(
    () =>
      items.map((item) => ({
        key: item.path,
        icon: item.icon,
        label: item.label,
        title: item.label,
      })),
    [items],
  )

  const navMenu = (
    <Menu
      mode="inline"
      selectedKeys={[pathname]}
      items={menuItems}
      onClick={(info: { key: string }) => {
        onNavigate(info.key)
        setMobileOpen(false)
      }}
    />
  )

  const handleChangePassword = async (values: ChangePasswordPayload) => {
    setChangingPassword(true)
    setChangePasswordError(null)
    try {
      await onChangePassword(values)
      message.success(t('Password changed successfully. Please sign in again.'))
      setChangePasswordOpen(false)
      changePasswordForm.resetFields()
    } catch (error) {
      setChangePasswordError(getUserErrorMessage(error, t('Unable to change your password.')))
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <Localized>
    <Layout className="app-layout">
      {isDesktop ? (
        <Sider theme="light" collapsible collapsed={collapsed} trigger={null} width={240} collapsedWidth={80} className="app-sider">
          <div className="logo-wrap">{collapsed ? 'RA' : 'Rent Apartment'}</div>
          {navMenu}
        </Sider>
      ) : (
        <Drawer title="Rent Apartment" placement="left" open={mobileOpen} onClose={() => setMobileOpen(false)} width={280} styles={{ body: { padding: 0 } }}>
          {navMenu}
        </Drawer>
      )}

      <Layout>
        <Header className="app-header">
          <div className="header-main">
            <Button
              type="text"
              icon={isDesktop ? (collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />) : <MenuUnfoldOutlined />}
              onClick={() => (isDesktop ? setCollapsed((current) => !current) : setMobileOpen((current) => !current))}
            />
            <div className="header-text">
              <Typography.Title level={4} className="header-title" ellipsis={{ tooltip: pageTitle }}>
                {pageTitle}
              </Typography.Title>
              <Typography.Text type="secondary" className="header-subtitle" ellipsis>
                Rent Apartment Management
              </Typography.Text>
            </div>
          </div>
          <LanguageSwitcher compact />
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                {
                  key: 'change-password',
                  label: 'Change password',
                  icon: <LockOutlined />,
                  onClick: () => {
                    setChangePasswordError(null)
                    setChangePasswordOpen(true)
                  },
                },
                {
                  key: 'logout',
                  label: 'Logout',
                  icon: <LogoutOutlined />,
                  onClick: () => {
                    void onLogout()
                  },
                },
              ],
            }}
          >
            <Button type="text" icon={<UserOutlined />} className="user-menu-button">
              {currentUserName}
            </Button>
          </Dropdown>
        </Header>
        <Content className="app-content">{content}</Content>
        <Footer className="app-footer">© {new Date().getFullYear()} Rent Apartment Management</Footer>
      </Layout>
      <Modal
        title="Change password"
        open={changePasswordOpen}
        okText="Change password"
        confirmLoading={changingPassword}
        onOk={() => changePasswordForm.submit()}
        onCancel={() => {
          setChangePasswordOpen(false)
          setChangePasswordError(null)
        }}
        afterClose={() => {
          changePasswordForm.resetFields()
          setChangePasswordError(null)
        }}
        destroyOnHidden
        width={480}
      >
        {changePasswordError ? (
          <Alert
            showIcon
            type="error"
            message="Password change failed"
            description={changePasswordError}
            style={{ marginBottom: 16 }}
          />
        ) : null}
        <Form<ChangePasswordPayload>
          form={changePasswordForm}
          layout="vertical"
          onFinish={handleChangePassword}
          onFinishFailed={(error) => setChangePasswordError(getFormErrorMessage(error))}
          requiredMark={false}
        >
          <Form.Item
            name="currentPassword"
            label="Current password"
            rules={[{ required: true, message: 'Please enter your current password.' }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="New password"
            dependencies={['currentPassword']}
            rules={[
              { required: true, message: 'Please enter a new password.' },
              { min: 8, message: 'The new password must contain at least 8 characters.' },
              { max: 72, message: 'The new password cannot exceed 72 characters.' },
              ({ getFieldValue }) => ({
                validator(_, value: string) {
                  if (!value || value !== getFieldValue('currentPassword')) return Promise.resolve()
                  return Promise.reject(new Error('The new password must be different from the current password.'))
                },
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="Confirm new password"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: 'Please confirm your new password.' },
              ({ getFieldValue }) => ({
                validator(_, value: string) {
                  if (!value || value === getFieldValue('newPassword')) return Promise.resolve()
                  return Promise.reject(new Error('The password confirmation does not match.'))
                },
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
    </Localized>
  )
}
