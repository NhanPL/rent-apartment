import { useEffect, useMemo, useState } from 'react'
import type { Building, BuildingPayload } from '../../types/building'
import { useBreakpoint } from '../../utils/responsive'
import { BuildingFormDrawer } from './BuildingFormDrawer'
import './BuildingsPage.css'

const mockBuildings: Building[] = [
  { id: '1', code: 'BLD-001', name: 'Sunrise Riverside', address: '12 Nguyễn Văn Cừ, Quận 5, TP.HCM', note: 'Gần trung tâm' },
  { id: '2', code: 'BLD-002', name: 'Green Valley', address: '88 Phạm Văn Đồng, TP. Thủ Đức', note: 'Nhiều tiện ích' },
]

export function BuildingsPage() {
  const { xs } = useBreakpoint()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<Building[]>([])
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'code' | 'name'>('code')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<'create' | 'update'>('create')
  const [selected, setSelected] = useState<Building | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setItems(mockBuildings)
      setLoading(false)
    }, 500)

    return () => clearTimeout(timer)
  }, [])

  const data = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const filtered = items.filter(
      (item) => item.name.toLowerCase().includes(keyword) || item.code.toLowerCase().includes(keyword),
    )

    return filtered.sort((a, b) => a[sortBy].localeCompare(b[sortBy]))
  }, [items, search, sortBy])

  const openCreate = () => {
    setDrawerMode('create')
    setSelected(null)
    setDrawerOpen(true)
  }

  const openEdit = (item: Building) => {
    setDrawerMode('update')
    setSelected(item)
    setDrawerOpen(true)
  }

  const handleDelete = (id: string) => {
    const ok = window.confirm('Bạn chắc chắn muốn xóa Building này?')
    if (!ok) return

    setSubmitting(true)
    setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id))
      setSubmitting(false)
    }, 400)
  }

  const handleSubmit = (payload: BuildingPayload) => {
    setSubmitting(true)
    setTimeout(() => {
      if (drawerMode === 'create') {
        setItems((current) => [{ ...payload, id: String(Date.now()) }, ...current])
      } else if (selected) {
        setItems((current) => current.map((item) => (item.id === selected.id ? { ...item, ...payload } : item)))
      }
      setDrawerOpen(false)
      setSubmitting(false)
    }, 450)
  }

  const codesForValidation = items
    .filter((item) => (drawerMode === 'update' ? item.id !== selected?.id : true))
    .map((item) => item.code)

  return (
    <section className="buildings-page">
      <div className="card action-bar">
        <div>
          <h2>Buildings</h2>
          <p>Quản lý danh sách tòa nhà trong hệ thống.</p>
        </div>

        <div className="actions-right">
          <input
            placeholder="Search name/code"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as 'code' | 'name')}>
            <option value="code">Sort by code</option>
            <option value="name">Sort by name</option>
          </select>
          <button type="button" className="btn" onClick={openCreate}>New Building</button>
        </div>
      </div>

      {loading ? (
        <div className="card">Loading buildings...</div>
      ) : data.length === 0 ? (
        <div className="card empty-state">Chưa có tòa nhà nào</div>
      ) : xs ? (
        <div className="card-list">
          {data.map((item) => (
            <article key={item.id} className="card item-card">
              <h3>{item.name}</h3>
              <p><strong>Code:</strong> {item.code}</p>
              <p><strong>Address:</strong> {item.address}</p>
              <div className="item-actions">
                <button type="button" className="link-btn" onClick={() => openEdit(item)}>Edit</button>
                <button type="button" className="link-btn danger" disabled={submitting} onClick={() => handleDelete(item.id)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Address</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.id}>
                  <td>{item.code}</td>
                  <td>{item.name}</td>
                  <td className="truncate" title={item.address}>{item.address}</td>
                  <td>
                    <button type="button" className="link-btn" onClick={() => openEdit(item)}>Edit</button>
                    <button type="button" className="link-btn danger" disabled={submitting} onClick={() => handleDelete(item.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BuildingFormDrawer
        key={`${drawerMode}-${selected?.id ?? 'new'}-${drawerOpen ? 'open' : 'closed'}`}
        open={drawerOpen}
        mode={drawerMode}
        building={selected}
        loading={submitting}
        existingCodes={codesForValidation}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmit}
      />
    </section>
  )
}
