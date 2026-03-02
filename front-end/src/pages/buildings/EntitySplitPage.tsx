import { Card, Grid, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import type { BuildingFormValues } from './components/types'
import type { BuildingEntity, StatusFilter } from './components/types'
import { DetailPanel } from './components/DetailPanel'
import { MasterListPanel } from './components/MasterListPanel'
import { UpsertDrawer } from './components/UpsertDrawer'

const mockBuildings: BuildingEntity[] = [
  {
    id: '1',
    code: 'BLD-001',
    name: 'Sunrise Riverside',
    address: '12 Nguyễn Văn Cừ, Quận 5, TP.HCM',
    note: 'Near downtown district',
    status: 'active',
    units: 56,
    manager: 'Thanh Nguyen',
    createdAt: '2024-01-10',
  },
  {
    id: '2',
    code: 'BLD-002',
    name: 'Green Valley',
    address: '88 Phạm Văn Đồng, TP. Thủ Đức',
    note: 'High occupancy rate',
    status: 'inactive',
    units: 42,
    manager: 'Minh Tran',
    createdAt: '2024-02-05',
  },
]

export function EntitySplitPage() {
  const screens = Grid.useBreakpoint()
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setItems(mockBuildings)
      setSelectedId(mockBuildings[0]?.id)
      setLoadingList(false)
    }, 400)

    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchInput.trim().toLowerCase()), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const searchMatched =
        debouncedSearch.length === 0 ||
        item.name.toLowerCase().includes(debouncedSearch) ||
        item.code.toLowerCase().includes(debouncedSearch)
      const statusMatched = statusFilter === 'all' || item.status === statusFilter
      return searchMatched && statusMatched
    })
  }, [items, debouncedSearch, statusFilter])

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
    setLoadingDetail(true)
    window.setTimeout(() => setLoadingDetail(false), 250)
  }

  const handleDelete = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id))
    if (selectedId === id) {
      const remain = items.filter((item) => item.id !== id)
      setSelectedId(remain[0]?.id)
    }
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
    <div style={{ display: 'flex', gap: 16, minHeight: 'calc(100vh - 200px)' }}>
      <Card style={{ width: screens.md ? 340 : '100%' }} bodyStyle={{ padding: 16 }}>
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

      {screens.md && (
        <Card style={{ flex: 1 }} bodyStyle={{ padding: 20 }}>
          <DetailPanel loading={loadingDetail || loadingList} item={selectedItem} onEdit={openEdit} onDelete={handleDelete} />
        </Card>
      )}

      {!screens.md && (
        <Card style={{ width: '100%' }} bodyStyle={{ padding: 20 }}>
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
