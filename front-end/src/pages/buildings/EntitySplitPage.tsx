import { ArrowLeftOutlined } from '@ant-design/icons'
import { Button, Card, Grid, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { DetailPanel } from './components/DetailPanel'
import { MasterListPanel } from './components/MasterListPanel'
import { UpsertDrawer } from './components/UpsertDrawer'
import type { BuildingEntity, BuildingFormValues, StatusFilter } from './components/types'
import { mockBuildings } from './mockData'
import './EntitySplitPage.css'


export function EntitySplitPage() {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const isTablet = Boolean(screens.md) && !screens.lg

  const [loadingList, setLoadingList] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [items, setItems] = useState<BuildingEntity[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create')
  const [saving, setSaving] = useState(false)
  const [showMobileDetail, setShowMobileDetail] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setItems(mockBuildings)
      const selectedFromQuery = new URLSearchParams(window.location.search).get('buildingId')
      const exists = mockBuildings.some((item) => item.id === selectedFromQuery)
      setSelectedId(exists ? selectedFromQuery ?? undefined : mockBuildings[0]?.id)
      setLoadingList(false)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchInput.trim().toLowerCase()), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])


  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const searchMatched =
          debouncedSearch.length === 0 ||
          item.name.toLowerCase().includes(debouncedSearch) ||
          item.code.toLowerCase().includes(debouncedSearch)
        const statusMatched = statusFilter === 'all' || item.status === statusFilter
        return searchMatched && statusMatched
      }),
    [items, debouncedSearch, statusFilter],
  )

  const selectedItem = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId])

  const openCreate = () => {
    setDrawerMode('create')
    setDrawerOpen(true)
  }

  const openEdit = (item: BuildingEntity) => {
    setSelectedId(item.id)
    setDrawerMode('edit')
    setDrawerOpen(true)
  }

  const handleSelect = (id: string) => {
    setSelectedId(id)
    const search = new URLSearchParams(window.location.search)
    search.set('buildingId', id)
    window.history.replaceState(null, '', `/buildings?${search.toString()}`)
    setLoadingDetail(true)
    if (isMobile) {
      setShowMobileDetail(true)
    }
    window.setTimeout(() => setLoadingDetail(false), 250)
  }

  const handleDelete = (id: string) => {
    setItems((current) => {
      const next = current.filter((item) => item.id !== id)
      if (selectedId === id) {
        setSelectedId(next[0]?.id)
      }
      return next
    })
    message.success('Building deleted successfully')
  }

  const handleSubmit = async (values: BuildingFormValues) => {
    setSaving(true)
    await new Promise((resolve) => window.setTimeout(resolve, 450))

    if (drawerMode === 'create') {
      const next: BuildingEntity = {
        id: String(Date.now()),
        units: 0,
        createdAt: new Date().toISOString(),
        ...values,
      }
      setItems((current) => [next, ...current])
      setSelectedId(next.id)
      if (isMobile) {
        setShowMobileDetail(true)
      }
      message.success('Building created successfully')
    } else if (selectedItem) {
      setItems((current) => current.map((item) => (item.id === selectedItem.id ? { ...item, ...values } : item)))
      setSelectedId(selectedItem.id)
      message.success('Building updated successfully')
    }

    setSaving(false)
    setDrawerOpen(false)
  }

  const existingCodes = useMemo(() => {
    if (drawerMode === 'edit' && selectedItem) {
      return items.filter((item) => item.id !== selectedItem.id).map((item) => item.code)
    }
    return items.map((item) => item.code)
  }, [drawerMode, items, selectedItem])

  return (
    <div className="split-page">
      {(!isMobile || !showMobileDetail) && (
        <Card className="master-card" styles={{ body: { padding: isTablet ? 12 : 16 } }}>
          <MasterListPanel
            loading={loadingList}
            items={filteredItems}
            selectedId={selectedId}
            searchValue={searchInput}
            statusFilter={statusFilter}
            onSearchChange={setSearchInput}
            onStatusFilterChange={setStatusFilter}
            onSelect={handleSelect}
            onAdd={openCreate}
          />
        </Card>
      )}

      {(!isMobile || showMobileDetail) && (
        <Card className="detail-card" styles={{ body: { padding: isTablet ? 16 : 20 } }}>
          {isMobile && (
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => setShowMobileDetail(false)} style={{ marginBottom: 8 }}>
              Back to list
            </Button>
          )}
          <DetailPanel loading={loadingDetail || loadingList} item={selectedItem} onEdit={openEdit} onDelete={handleDelete} />
        </Card>
      )}

      <UpsertDrawer
        open={drawerOpen}
        mode={drawerMode}
        item={drawerMode === 'edit' ? selectedItem : null}
        loading={saving}
        existingCodes={existingCodes}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
