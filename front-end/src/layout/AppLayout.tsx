import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons'
import { Button, Drawer, Grid, Layout, Menu, Space, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { RouteConfig } from '../routes/routeConfig'
import './AppLayout.css'

const { Header, Sider, Content, Footer } = Layout
const SIDEBAR_STORAGE_KEY = 'app_sidebar_collapsed'

interface AppLayoutProps {
  pathname: string
  onNavigate: (path: string) => void
  items: RouteConfig[]
  pageTitle: string
  content: ReactNode
}

export function AppLayout({ pathname, onNavigate, items, pageTitle, content }: AppLayoutProps) {
  const screens = Grid.useBreakpoint()
  const isDesktop = Boolean(screens.lg)

  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true')
  const [mobileOpen, setMobileOpen] = useState(false)

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

  return (
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
          <Space className="header-space" size={12}>
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
          </Space>
        </Header>
        <Content className="app-content">{content}</Content>
        <Footer className="app-footer">© {new Date().getFullYear()} Rent Apartment Management</Footer>
      </Layout>
    </Layout>
  )
}
