import { useEffect, useState } from 'react'
import { ApiError, apiRequest } from '../api'
import { useAuth } from '../auth'
import { useLocale } from '../i18n'
import Icon from '../components/Icon'
import '../App.css'

const emptyForm = {
  name: '',
  incubator_unit_id: '',
  quantity: '1',
  tracking_mode: 'shared_quantity',
  asset_label: '',
  operational_status: 'unknown',
  availability_status: 'unknown',
  notes: '',
}

const operationalStatuses = [
  ['operational', 'Operational'],
  ['needs_maintenance', 'Needs maintenance'],
  ['out_of_service', 'Out of service'],
  ['unknown', 'Unknown'],
]

const availabilityStatuses = [
  ['available', 'Available'],
  ['in_use', 'In use'],
  ['unavailable', 'Unavailable'],
  ['unknown', 'Unknown'],
]

function reportedAt(value, language) {
  if (!value) return 'Availability has not been reported yet.'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Last-reported time is unavailable.'
    : `Last reported ${date.toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US')}`
}

function Equipment() {
  const { user } = useAuth()
  const { language, t } = useLocale()
  const isHospitalStaff = user?.role === 'hospital_staff'
  const [equipment, setEquipment] = useState([])
  const [units, setUnits] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function loadData() {
      try {
        const [equipmentPayload, unitsPayload] = await Promise.all([
          apiRequest('/api/hospital/equipment', { signal: controller.signal }),
          apiRequest('/api/hospital/incubator-units', { signal: controller.signal }),
        ])
        if (!Array.isArray(equipmentPayload.data) || !Array.isArray(unitsPayload.data)) {
          throw new Error('The server returned invalid equipment or unit data.')
        }
        setEquipment(equipmentPayload.data)
        setUnits(unitsPayload.data)
        setError('')
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setError(requestError.message || 'Equipment could not be loaded.')
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    loadData()
    return () => controller.abort()
  }, [reloadKey])

  function changeField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'tracking_mode' && value === 'individual' ? { quantity: '1' } : {}),
    }))
    setFieldErrors((current) => ({ ...current, [field]: '' }))
    setError('')
    setSuccess('')
  }

  function startEditing(item) {
    setEditingId(item.id)
    setIsFormOpen(true)
    setForm({
      name: item.name || '',
      incubator_unit_id: item.incubator_unit_id ? String(item.incubator_unit_id) : '',
      quantity: String(item.quantity),
      tracking_mode: item.tracking_mode,
      asset_label: item.asset_label || '',
      operational_status: item.operational_status,
      availability_status: item.availability_status,
      notes: item.notes || '',
    })
    setFieldErrors({})
    setError('')
    setSuccess('')
  }

  function cancelEditing() {
    setEditingId(null)
    setIsFormOpen(false)
    setForm(emptyForm)
    setFieldErrors({})
    setError('')
  }

  async function submitForm(event) {
    event.preventDefault()
    if (isSaving) return

    setFieldErrors({})
    setError('')
    setSuccess('')

    let payload
    if (isHospitalStaff) {
      const currentItem = equipment.find((item) => item.id === editingId)
      payload = {}
      if (currentItem && form.operational_status !== currentItem.operational_status) {
        payload.operational_status = form.operational_status
      }
      if (currentItem && form.availability_status !== currentItem.availability_status) {
        payload.availability_status = form.availability_status
      }
      if (Object.keys(payload).length === 0) {
        setError('Change an equipment status before saving.')
        return
      }
    } else {
      payload = {
          name: form.name.trim(),
          incubator_unit_id: form.incubator_unit_id ? Number(form.incubator_unit_id) : null,
          quantity: Number(form.quantity),
          tracking_mode: form.tracking_mode,
          asset_label: form.asset_label.trim() || null,
          operational_status: form.operational_status,
          availability_status: form.availability_status,
          notes: form.notes.trim() || null,
        }
    }

    setIsSaving(true)
    try {
      const response = await apiRequest(
        editingId ? `/api/hospital/equipment/${editingId}` : '/api/hospital/equipment',
        {
          method: editingId ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        }
      )
      setSuccess(response.message || 'Equipment saved.')
      setForm(emptyForm)
      setEditingId(null)
      setIsFormOpen(false)
      setIsLoading(true)
      setReloadKey((current) => current + 1)
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 422) {
        setFieldErrors(
          Object.fromEntries(
            Object.entries(requestError.errors).map(([field, messages]) => [
              field,
              messages[0],
            ])
          )
        )
        setError('Review the highlighted fields and try again.')
      } else {
        setError(requestError.message || 'The equipment could not be saved.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteItem(item) {
    if (!window.confirm(t('Delete "{name}" from this inventory?', { name: item.name }))) return

    setError('')
    setSuccess('')
    setDeletingId(item.id)
    try {
      const response = await apiRequest(`/api/hospital/equipment/${item.id}`, {
        method: 'DELETE',
      })
      setEquipment((current) => current.filter((entry) => entry.id !== item.id))
      setSuccess(response.message || 'Equipment record deleted.')
      if (editingId === item.id) cancelEditing()
    } catch (requestError) {
      setError(requestError.message || 'The equipment could not be deleted.')
    } finally {
      setDeletingId(null)
    }
  }

  function refresh() {
    setIsLoading(true)
    setReloadKey((current) => current + 1)
  }

  return (
    <main className="main-content" id="hospital-equipment-page">
      <header className="topbar">
        <div>
          <span className="breadcrumb">Hospital workspace / Equipment</span>
          <h1>Hospital Equipment</h1>
          <p>Maintain an internal inventory of equipment and its reported status.</p>
        </div>
        <div className="hospital-page-actions">
          {!isHospitalStaff && !isFormOpen && (
            <button type="button" className="hospital-primary-action" onClick={() => setIsFormOpen(true)}>
              <Icon name="plus" size={16} />
              Add equipment
            </button>
          )}
          <button type="button" className="secondary-button" onClick={refresh} disabled={isLoading}>
            {isLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </header>

      <div className="availability-notice" role="note">
        Availability is reported by your hospital and may not be current in real time. It does
        not guarantee clinical suitability or admission; the hospital and its medical team
        confirm all decisions.
      </div>

      {success && <div className="hospital-feedback success" role="status">{success}</div>}
      {error && <div className="hospital-feedback error" role="alert">{error}</div>}

      {((!isHospitalStaff && isFormOpen) || editingId) && (
      <section className="panel incubator-form-panel hospital-editor-panel">
        <div className="panel-heading">
          <div>
            <h2>{isHospitalStaff ? 'Update equipment status' : editingId ? 'Edit equipment' : 'Add equipment'}</h2>
            <p>
              {isHospitalStaff
                ? 'Staff may update operational and availability status only.'
                : 'Track a shared quantity together or record one individually identified item.'}
            </p>
          </div>
        </div>

        <form className="incubator-form equipment-form" onSubmit={submitForm}>
          {!isHospitalStaff && (
          <label>
            Equipment name
            <input
              type="text"
              maxLength={255}
              required
              value={form.name}
              onChange={(event) => changeField('name', event.target.value)}
              aria-invalid={Boolean(fieldErrors.name)}
            />
            {fieldErrors.name && <span className="hospital-field-error">{fieldErrors.name}</span>}
          </label>
          )}

          {!isHospitalStaff && (
          <label>
            Neonatal care unit (optional)
            <select
              value={form.incubator_unit_id}
              onChange={(event) => changeField('incubator_unit_id', event.target.value)}
              aria-invalid={Boolean(fieldErrors.incubator_unit_id)}
            >
              <option value="">Not assigned to a unit</option>
              {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
            {fieldErrors.incubator_unit_id && <span className="hospital-field-error">{fieldErrors.incubator_unit_id}</span>}
          </label>
          )}

          {!isHospitalStaff && (
          <label>
            Tracking mode
            <select
              value={form.tracking_mode}
              onChange={(event) => changeField('tracking_mode', event.target.value)}
            >
              <option value="shared_quantity">Shared quantity</option>
              <option value="individual">Individual item</option>
            </select>
            {fieldErrors.tracking_mode && <span className="hospital-field-error">{fieldErrors.tracking_mode}</span>}
          </label>
          )}

          {!isHospitalStaff && (
          <label>
            Quantity
            <input
              type="number"
              min="1"
              max="4294967295"
              step="1"
              required
              disabled={form.tracking_mode === 'individual'}
              value={form.quantity}
              onChange={(event) => changeField('quantity', event.target.value)}
              aria-invalid={Boolean(fieldErrors.quantity)}
            />
            {fieldErrors.quantity && <span className="hospital-field-error">{fieldErrors.quantity}</span>}
          </label>
          )}

          <label>
            Operational status
            <select
              value={form.operational_status}
              onChange={(event) => changeField('operational_status', event.target.value)}
            >
              {operationalStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            {fieldErrors.operational_status && <span className="hospital-field-error">{fieldErrors.operational_status}</span>}
          </label>

          <label>
            Availability
            <select
              value={form.availability_status}
              onChange={(event) => changeField('availability_status', event.target.value)}
            >
              {availabilityStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            {fieldErrors.availability_status && <span className="hospital-field-error">{fieldErrors.availability_status}</span>}
          </label>

          {!isHospitalStaff && (
          <label>
            Asset label (optional)
            <input
              type="text"
              maxLength={255}
              value={form.asset_label}
              onChange={(event) => changeField('asset_label', event.target.value)}
              aria-invalid={Boolean(fieldErrors.asset_label)}
            />
            {fieldErrors.asset_label && <span className="hospital-field-error">{fieldErrors.asset_label}</span>}
          </label>
          )}

          {!isHospitalStaff && (
          <label className="equipment-notes-field">
            Internal notes
            <textarea
              maxLength={5000}
              rows="3"
              value={form.notes}
              onChange={(event) => changeField('notes', event.target.value)}
              aria-invalid={Boolean(fieldErrors.notes)}
            />
            {fieldErrors.notes && <span className="hospital-field-error">{fieldErrors.notes}</span>}
          </label>
          )}

          <div className="incubator-form-actions">
            <button type="submit" className="primary-button" disabled={isSaving}>
              {isSaving ? 'Saving…' : isHospitalStaff ? 'Update status' : editingId ? 'Save changes' : 'Add equipment'}
            </button>
            {editingId && (
              <button type="button" className="secondary-button" onClick={cancelEditing} disabled={isSaving}>
                Cancel
              </button>
            )}
            {!editingId && (
              <button type="button" className="secondary-button" onClick={cancelEditing} disabled={isSaving}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>
      )}

      <section className="incubator-unit-list">
        <div className="section-heading">
          <div>
            <h2>Equipment inventory</h2>
            <p>Each record represents one shared status group or one individually tracked item.</p>
          </div>
          <span className="count-badge">{equipment.length} records</span>
        </div>

        {isLoading ? (
          <div className="panel empty-state" role="status"><p>Loading hospital equipment…</p></div>
        ) : equipment.length === 0 ? (
          <div className="panel empty-state incubator-empty">
            <h3>No equipment records yet</h3>
            <p>
              {isHospitalStaff
                ? 'Your hospital has not configured any equipment records.'
                : 'Add equipment reported by your hospital. No equipment is assumed or prefilled.'}
            </p>
          </div>
        ) : (
          <div className="incubator-unit-grid">
            {equipment.map((item) => (
              <article className="panel incubator-unit-card equipment-card" key={item.id}>
                <div className="incubator-unit-heading">
                  <div>
                    <span className="eyebrow">{item.tracking_mode === 'individual' ? 'INDIVIDUAL ITEM' : 'SHARED QUANTITY'}</span>
                    <h3>{item.name}</h3>
                  </div>
                  <span className={`hospital-status ${item.availability_status}`}>
                    {t(item.availability_status.replaceAll('_', ' '))}
                  </span>
                </div>
                <div className="equipment-details">
                  <p><span>Quantity</span><strong>{item.quantity}</strong></p>
                  <p><span>Operational</span><strong>{t(item.operational_status.replaceAll('_', ' '))}</strong></p>
                  <p><span>Unit</span><strong>{item.incubator_unit?.name || 'Hospital-wide / unassigned'}</strong></p>
                  <p><span>Asset label</span><strong>{item.asset_label || '—'}</strong></p>
                </div>
                {item.notes && <p className="equipment-notes"><strong>Internal notes:</strong> {item.notes}</p>}
                <p className="availability-updated">{reportedAt(item.availability_reported_at, language)}</p>
                <div className="incubator-card-actions">
                  <button type="button" className="secondary-button" onClick={() => startEditing(item)}>
                    {isHospitalStaff ? 'Update status' : 'Edit'}
                  </button>
                  {!isHospitalStaff && (
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => deleteItem(item)}
                      disabled={deletingId === item.id}
                    >
                      {deletingId === item.id ? 'Deleting…' : 'Delete'}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

export default Equipment
