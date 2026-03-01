import { useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { Building, BuildingPayload } from '../../types/building'

interface BuildingFormDrawerProps {
  open: boolean
  mode: 'create' | 'update'
  building: Building | null
  existingCodes: string[]
  loading: boolean
  onClose: () => void
  onSubmit: (payload: BuildingPayload) => void
}

const emptyForm: BuildingPayload = {
  code: '',
  name: '',
  address: '',
  note: '',
}

export function BuildingFormDrawer({
  open,
  mode,
  building,
  existingCodes,
  loading,
  onClose,
  onSubmit,
}: BuildingFormDrawerProps) {
  const initialForm = useMemo(
    () =>
      mode === 'update' && building
        ? {
            code: building.code,
            name: building.name,
            address: building.address,
            note: building.note ?? '',
          }
        : emptyForm,
    [mode, building],
  )

  const [form, setForm] = useState<BuildingPayload>(initialForm)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const initialSnapshot = useMemo(() => JSON.stringify(initialForm), [initialForm])

  const isDirty = open && JSON.stringify(form) !== initialSnapshot

  const requestClose = () => {
    if (isDirty) {
      const accept = window.confirm('Bạn có thay đổi chưa lưu. Bạn có chắc muốn đóng?')
      if (!accept) return
    }
    onClose()
  }

  const onFieldChange =
    (field: keyof BuildingPayload) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((current) => ({ ...current, [field]: event.target.value }))
    }

  const validate = () => {
    const nextErrors: Record<string, string> = {}
    if (!form.code.trim()) nextErrors.code = 'Code là bắt buộc.'
    if (!form.name.trim()) nextErrors.name = 'Name là bắt buộc.'
    if (!form.address.trim()) nextErrors.address = 'Address là bắt buộc.'

    const duplicate = existingCodes.some((code) => code.toLowerCase() === form.code.trim().toLowerCase())
    if (duplicate) nextErrors.code = 'Code đã tồn tại.'

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validate()) return

    onSubmit({
      code: form.code.trim(),
      name: form.name.trim(),
      address: form.address.trim(),
      note: form.note?.trim() ?? '',
    })
  }

  return (
    <>
      <div className={`drawer-mask ${open ? 'show' : ''}`} onClick={requestClose} />
      <aside className={`building-drawer ${open ? 'open' : ''}`}>
        <header className="drawer-header">
          <h3>{mode === 'create' ? 'New Building' : 'Update Building'}</h3>
          <button type="button" className="icon-btn" onClick={requestClose}>✕</button>
        </header>

        <form className="drawer-form" onSubmit={handleSubmit}>
          <label>
            <span>Code *</span>
            <input value={form.code} onChange={onFieldChange('code')} placeholder="BLD-001" />
            {errors.code && <small className="field-error">{errors.code}</small>}
          </label>

          <label>
            <span>Name *</span>
            <input value={form.name} onChange={onFieldChange('name')} placeholder="Sunrise Building" />
            {errors.name && <small className="field-error">{errors.name}</small>}
          </label>

          <label>
            <span>Address *</span>
            <input value={form.address} onChange={onFieldChange('address')} placeholder="12 Nguyễn Văn Cừ" />
            {errors.address && <small className="field-error">{errors.address}</small>}
          </label>

          <label>
            <span>Note</span>
            <textarea rows={5} value={form.note} onChange={onFieldChange('note')} placeholder="Ghi chú" />
          </label>

          <footer className="drawer-actions">
            <button type="button" className="btn secondary" onClick={requestClose}>Cancel</button>
            <button type="submit" className="btn" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
          </footer>
        </form>
      </aside>
    </>
  )
}
