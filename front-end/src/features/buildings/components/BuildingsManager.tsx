import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Building, BuildingFormValues } from '../types/building'

import './BuildingsManager.css'

const initialBuildings: Building[] = [
  {
    id: 'BLD-001',
    name: 'Sunrise Riverside',
    code: 'SR-01',
    address: '12 Nguyễn Văn Cừ, Quận 5, TP.HCM',
    totalFloors: 15,
    totalApartments: 220,
    managerName: 'Nguyễn Văn Hùng',
    status: 'active',
    description: 'Tòa nhà gần trung tâm, có hồ bơi và phòng gym.',
  },
  {
    id: 'BLD-002',
    name: 'Green Valley',
    code: 'GV-02',
    address: '88 Phạm Văn Đồng, TP. Thủ Đức',
    totalFloors: 22,
    totalApartments: 340,
    managerName: 'Trần Thị Mai',
    status: 'maintenance',
    description: 'Đang bảo trì hệ thống thang máy tầng 10-15.',
  },
]

const defaultValues: BuildingFormValues = {
  name: '',
  code: '',
  address: '',
  totalFloors: '',
  totalApartments: '',
  managerName: '',
  status: 'active',
  description: '',
}

function mapBuildingToForm(building: Building): BuildingFormValues {
  return {
    name: building.name,
    code: building.code,
    address: building.address,
    totalFloors: String(building.totalFloors),
    totalApartments: String(building.totalApartments),
    managerName: building.managerName,
    status: building.status,
    description: building.description,
  }
}

export function BuildingsManager() {
  const [buildings, setBuildings] = useState<Building[]>(initialBuildings)
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(
    initialBuildings[0]?.id ?? null,
  )
  const [editingBuildingId, setEditingBuildingId] = useState<string | null>(null)
  const [formValues, setFormValues] = useState<BuildingFormValues>(defaultValues)
  const [error, setError] = useState<string>('')

  const selectedBuilding = useMemo(
    () => buildings.find((building) => building.id === selectedBuildingId) ?? null,
    [buildings, selectedBuildingId],
  )

  const handleResetForm = () => {
    setFormValues(defaultValues)
    setEditingBuildingId(null)
    setError('')
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (
      !formValues.name.trim() ||
      !formValues.code.trim() ||
      !formValues.address.trim() ||
      !formValues.managerName.trim()
    ) {
      setError('Vui lòng nhập đầy đủ các trường bắt buộc.')
      return
    }

    const floors = Number(formValues.totalFloors)
    const apartments = Number(formValues.totalApartments)

    if (!Number.isInteger(floors) || floors <= 0) {
      setError('Số tầng phải là số nguyên dương.')
      return
    }

    if (!Number.isInteger(apartments) || apartments <= 0) {
      setError('Tổng số căn hộ phải là số nguyên dương.')
      return
    }

    const duplicateCode = buildings.some(
      (building) =>
        building.code.toLowerCase() === formValues.code.trim().toLowerCase() &&
        building.id !== editingBuildingId,
    )

    if (duplicateCode) {
      setError('Mã tòa nhà đã tồn tại. Vui lòng nhập mã khác.')
      return
    }

    if (editingBuildingId) {
      setBuildings((current) =>
        current.map((building) =>
          building.id === editingBuildingId
            ? {
                ...building,
                ...formValues,
                name: formValues.name.trim(),
                code: formValues.code.trim(),
                address: formValues.address.trim(),
                managerName: formValues.managerName.trim(),
                description: formValues.description.trim(),
                totalFloors: floors,
                totalApartments: apartments,
              }
            : building,
        ),
      )
      setSelectedBuildingId(editingBuildingId)
      handleResetForm()
      return
    }

    const newBuilding: Building = {
      id: `BLD-${Date.now()}`,
      name: formValues.name.trim(),
      code: formValues.code.trim(),
      address: formValues.address.trim(),
      totalFloors: floors,
      totalApartments: apartments,
      managerName: formValues.managerName.trim(),
      status: formValues.status,
      description: formValues.description.trim(),
    }

    setBuildings((current) => [newBuilding, ...current])
    setSelectedBuildingId(newBuilding.id)
    handleResetForm()
  }

  const handleEdit = (building: Building) => {
    setEditingBuildingId(building.id)
    setSelectedBuildingId(building.id)
    setFormValues(mapBuildingToForm(building))
    setError('')
  }

  const handleDelete = (id: string) => {
    setBuildings((current) => {
      const nextBuildings = current.filter((building) => building.id !== id)

      if (selectedBuildingId === id) {
        setSelectedBuildingId(nextBuildings[0]?.id ?? null)
      }

      if (editingBuildingId === id) {
        handleResetForm()
      }

      return nextBuildings
    })
  }

  return (
    <div className="buildings-page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Rent Apartment</p>
          <h1>Quản lý Buildings</h1>
          <p>Quản lý danh sách tòa nhà với các thao tác thêm, sửa, xóa và xem chi tiết.</p>
        </div>
      </header>

      <main className="buildings-layout">
        <section className="panel">
          <h2>{editingBuildingId ? 'Cập nhật Building' : 'Thêm Building mới'}</h2>

          <form className="building-form" onSubmit={handleSubmit}>
            <label>
              <span>Tên Building *</span>
              <input
                value={formValues.name}
                onChange={(event) => setFormValues((current) => ({ ...current, name: event.target.value }))}
                placeholder="Ví dụ: River Park"
              />
            </label>

            <label>
              <span>Mã Building *</span>
              <input
                value={formValues.code}
                onChange={(event) => setFormValues((current) => ({ ...current, code: event.target.value }))}
                placeholder="Ví dụ: RP-03"
              />
            </label>

            <label>
              <span>Địa chỉ *</span>
              <input
                value={formValues.address}
                onChange={(event) => setFormValues((current) => ({ ...current, address: event.target.value }))}
                placeholder="Nhập địa chỉ đầy đủ"
              />
            </label>

            <div className="form-grid-2">
              <label>
                <span>Số tầng *</span>
                <input
                  type="number"
                  min={1}
                  value={formValues.totalFloors}
                  onChange={(event) =>
                    setFormValues((current) => ({ ...current, totalFloors: event.target.value }))
                  }
                />
              </label>

              <label>
                <span>Tổng số căn hộ *</span>
                <input
                  type="number"
                  min={1}
                  value={formValues.totalApartments}
                  onChange={(event) =>
                    setFormValues((current) => ({ ...current, totalApartments: event.target.value }))
                  }
                />
              </label>
            </div>

            <label>
              <span>Quản lý tòa nhà *</span>
              <input
                value={formValues.managerName}
                onChange={(event) =>
                  setFormValues((current) => ({ ...current, managerName: event.target.value }))
                }
                placeholder="Tên người quản lý"
              />
            </label>

            <label>
              <span>Trạng thái</span>
              <select
                value={formValues.status}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    status: event.target.value as Building['status'],
                  }))
                }
              >
                <option value="active">Đang hoạt động</option>
                <option value="maintenance">Bảo trì</option>
              </select>
            </label>

            <label>
              <span>Mô tả</span>
              <textarea
                rows={3}
                value={formValues.description}
                onChange={(event) =>
                  setFormValues((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="Ghi chú thêm"
              />
            </label>

            {error && <p className="error-message">{error}</p>}

            <div className="form-actions">
              <button type="submit">{editingBuildingId ? 'Lưu cập nhật' : 'Thêm Building'}</button>
              {editingBuildingId && (
                <button type="button" className="ghost-button" onClick={handleResetForm}>
                  Hủy chỉnh sửa
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="panel">
          <h2>Danh sách Buildings</h2>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Tên</th>
                  <th>Mã</th>
                  <th>Địa chỉ</th>
                  <th>Trạng thái</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {buildings.map((building) => (
                  <tr key={building.id} className={selectedBuildingId === building.id ? 'row-selected' : ''}>
                    <td>{building.name}</td>
                    <td>{building.code}</td>
                    <td>{building.address}</td>
                    <td>
                      <span className={`status-chip status-${building.status}`}>
                        {building.status === 'active' ? 'Đang hoạt động' : 'Bảo trì'}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button type="button" onClick={() => setSelectedBuildingId(building.id)}>
                          Xem chi tiết
                        </button>
                        <button type="button" onClick={() => handleEdit(building)}>
                          Sửa
                        </button>
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => handleDelete(building.id)}
                        >
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {buildings.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty-state">
                      Chưa có Building nào. Hãy thêm mới để bắt đầu quản lý.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel detail-panel">
          <h2>Chi tiết Building</h2>
          {selectedBuilding ? (
            <dl>
              <div>
                <dt>Tên Building</dt>
                <dd>{selectedBuilding.name}</dd>
              </div>
              <div>
                <dt>Mã Building</dt>
                <dd>{selectedBuilding.code}</dd>
              </div>
              <div>
                <dt>Địa chỉ</dt>
                <dd>{selectedBuilding.address}</dd>
              </div>
              <div>
                <dt>Số tầng</dt>
                <dd>{selectedBuilding.totalFloors}</dd>
              </div>
              <div>
                <dt>Tổng căn hộ</dt>
                <dd>{selectedBuilding.totalApartments}</dd>
              </div>
              <div>
                <dt>Quản lý</dt>
                <dd>{selectedBuilding.managerName}</dd>
              </div>
              <div>
                <dt>Trạng thái</dt>
                <dd>{selectedBuilding.status === 'active' ? 'Đang hoạt động' : 'Bảo trì'}</dd>
              </div>
              <div>
                <dt>Mô tả</dt>
                <dd>{selectedBuilding.description || 'Không có mô tả.'}</dd>
              </div>
            </dl>
          ) : (
            <p className="empty-detail">Chọn một Building trong danh sách để xem chi tiết.</p>
          )}
        </section>
      </main>
    </div>
  )
}
