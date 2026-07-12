import { ArrowLeftOutlined } from '@ant-design/icons'
import { Button, Card, Grid, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { DetailPanel } from './components/DetailPanel'
import { MasterListPanel } from './components/MasterListPanel'
import { UpsertDrawer } from './components/UpsertDrawer'
import type { BuildingEntity, BuildingFormValues } from './components/types'
import { createBuilding, deleteBuilding, listBuildings, updateBuilding } from './components/roomService'
import { getUserErrorMessage } from '../../services/errorMessage'
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
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create')
  const [saving, setSaving] = useState(false)
  const [showMobileDetail, setShowMobileDetail] = useState(false)

  const loadBuildings = async (preferredId?: string) => {
    setLoadingList(true)
    try {
      const buildings = await listBuildings()
      setItems(buildings)
      const selectedFromQuery = new URLSearchParams(window.location.search).get('buildingId')
      const candidateId = preferredId ?? selectedFromQuery ?? selectedId
      const exists = buildings.some((item) => item.id === candidateId)
      setSelectedId(exists ? candidateId : buildings[0]?.id)
      return buildings
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Khong tai duoc danh sach toa nha.'))
      setItems([])
      setSelectedId(undefined)
      return []
    } finally {
      setLoadingList(false)
    }
  }

  useEffect(() => {
    void loadBuildings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        return searchMatched
      }),
    [items, debouncedSearch],
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

  const handleDelete = async (id: string) => {
    try {
      await deleteBuilding(id)
      const next = await loadBuildings()
      if (selectedId === id) {
        setSelectedId(next[0]?.id)
      }
      message.success('Building deleted successfully')
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Khong the xoa toa nha.'))
      throw error
    }
  }

  const handleSubmit = async (values: BuildingFormValues) => {
    setSaving(true)
    try {
      if (drawerMode === 'create') {
        const created = await createBuilding(values)
        const next = await loadBuildings(created.id)
        const selected = next.find((item) => item.id === created.id)
        setSelectedId(selected?.id ?? created.id)
        if (isMobile) {
          setShowMobileDetail(true)
        }
        message.success('Building created successfully')
      } else if (selectedItem) {
        await updateBuilding(selectedItem.id, values)
        await loadBuildings(selectedItem.id)
        setSelectedId(selectedItem.id)
        message.success('Building updated successfully')
      }
      setDrawerOpen(false)
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Khong the luu toa nha.'))
    } finally {
      setSaving(false)
    }
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
            onSearchChange={setSearchInput}
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
