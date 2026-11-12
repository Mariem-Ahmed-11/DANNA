import { useEffect, useState } from 'react'
import { ApiError, apiRequest } from '../api'
import { useAuth } from '../auth'
import { useLocale } from '../i18n'
import Icon from '../components/Icon'
import '../App.css'

const emptyForm = {
  name: '',
  total_capacity: '',
  available_capacity: '',
  price: '',
};

function formatPrice(value, language) {
  if (value === null || value === undefined || value === '') return '—'
  return new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-US', {
    style: 'currency',
    currency: 'EGP',
  }).format(Number(value))
}

function formatUpdatedAt(value, language) {
  if (!value) return 'Availability has not been reported yet.'

  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Last update time is unavailable.'
    : `Last reported ${date.toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US')}`
}

function availabilityStatus(unit) {
  if (unit.total_capacity === 0) return { label: 'No capacity recorded', tone: 'unknown' }
  if (unit.available_capacity === 0) return { label: 'Currently reported as full', tone: 'unavailable' }
  if (unit.available_capacity === unit.total_capacity) return { label: 'All capacity reported available', tone: 'available' }
  return { label: 'Some capacity reported available', tone: 'limited' }
}

function IncubatorUnits() {
  const { user } = useAuth()
  const { language, t } = useLocale()
  const isHospitalStaff = user?.role === 'hospital_staff'
  const [units, setUnits] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function loadUnits() {
      try {
        const payload = await apiRequest('/api/hospital/incubator-units', {
          signal: controller.signal,
        })
        if (!Array.isArray(payload.data)) {
          throw new Error('The server returned an invalid incubator unit list.')
        }
        setUnits(payload.data)
        setError('')
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setError(requestError.message || 'Incubator availability could not be loaded.')
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    loadUnits()
    return () => controller.abort()
  }, [reloadKey])

  function changeField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: '' }))
    setError('')
    setSuccess('')
  }

  function startEditing(unit) {
    setEditingId(unit.id)
    setIsFormOpen(true)
    setForm({
      name: unit.name,
      total_capacity: String(unit.total_capacity),
      available_capacity: String(unit.available_capacity),
      price: unit.price ?? '',
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
    setFieldErrors({})
    setError('')
    setSuccess('')
    setIsSaving(true)

    try {
      const payload = await apiRequest(
        editingId
          ? `/api/hospital/incubator-units/${editingId}`
          : '/api/hospital/incubator-units',
        {
          method: editingId ? 'PATCH' : 'POST',
          body: JSON.stringify(
            isHospitalStaff
              ? { available_capacity: Number(form.available_capacity) }
              : {
                  name: form.name.trim(),
                  total_capacity: Number(form.total_capacity),
                  available_capacity: Number(form.available_capacity),
                  price: Number(form.price),
                }
          ),
        }
      )

      setSuccess(payload.message || 'Incubator availability saved.')
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
        setError(requestError.message || 'The record could not be saved.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteUnit(unit) {
    if (!window.confirm(t('Delete "{name}" and its availability record?', { name: unit.name }))) return

    setError('')
    setSuccess('')
    try {
      const payload = await apiRequest(`/api/hospital/incubator-units/${unit.id}`, {
        method: 'DELETE',
      })
      setUnits((current) => current.filter((entry) => entry.id !== unit.id))
      setSuccess(payload.message || 'Incubator availability record deleted.')
      if (editingId === unit.id) cancelEditing()
    } catch (requestError) {
      setError(requestError.message || 'The record could not be deleted.')
    }
  }

  function refresh() {
    setIsLoading(true)
    setReloadKey((current) => current + 1)
  }

  return (
    <main className="main-content" id="incubator-units-page">
      <header className="topbar">
        <div>
          <span className="breadcrumb">Hospital workspace / Incubators &amp; Availability</span>
          <h1>Incubators &amp; Availability</h1>
          <p>
            {isHospitalStaff
              ? 'View unit details and update reported available capacity.'
              : 'Manage your unit capacity and keep its reported availability current.'}
          </p>
        </div>
        <div className="hospital-page-actions">
          {!isHospitalStaff && !isFormOpen && (
            <button type="button" className="hospital-primary-action" onClick={() => setIsFormOpen(true)}>
              <Icon name="plus" size={16} />
              Add a neonatal care unit
            </button>
          )}
          <button type="button" className="secondary-button" onClick={refresh}>
            Refresh
          </button>
        </div>
      </header>

      <div className="availability-notice" role="note">
        Availability is information last reported by your hospital, not a real-time
        guarantee. Final patient acceptance is decided by the hospital and its medical team.
      </div>

      {success && <div className="hospital-feedback success" role="status">{success}</div>}
      {error && <div className="hospital-feedback error" role="alert">{error}</div>}

      {((!isHospitalStaff && isFormOpen) || editingId) && (
        <section className="panel incubator-form-panel hospital-editor-panel">
        <div className="panel-heading">
          <div>
            <h2>{isHospitalStaff ? 'Update reported availability' : editingId ? 'Update unit availability' : 'Add a neonatal care unit'}</h2>
            <p>
              {isHospitalStaff
                ? 'Only currently available capacity can be updated by staff.'
                : 'Enter the capacity reported by your hospital.'}
            </p>
          </div>
        </div>

        <form className="incubator-form" onSubmit={submitForm}>
          {!isHospitalStaff && (
          <label>
            Unit name
            <input
              type="text"
              maxLength={255}
              required
              value={form.name}
              onChange={(event) => changeField('name', event.target.value)}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? 'incubator-name-error' : undefined}
            />
            {fieldErrors.name && <span className="hospital-field-error" id="incubator-name-error">{fieldErrors.name}</span>}
          </label>
          )}
          {!isHospitalStaff && (
          <label>
            Total capacity
            <input
              type="number"
              min="0"
              max="4294967295"
              step="1"
              required
              value={form.total_capacity}
              onChange={(event) => changeField('total_capacity', event.target.value)}
              aria-invalid={Boolean(fieldErrors.total_capacity)}
              aria-describedby={fieldErrors.total_capacity ? 'incubator-total-error' : undefined}
            />
            {fieldErrors.total_capacity && <span className="hospital-field-error" id="incubator-total-error">{fieldErrors.total_capacity}</span>}
          </label>
          )}
          {!isHospitalStaff && (
          <label>
            Price (EGP)
            <input
              type="number"
              min="0"
              max="99999999.99"
              step="0.01"
              required
              value={form.price}
              onChange={(event) => changeField('price', event.target.value)}
              aria-invalid={Boolean(fieldErrors.price)}
              aria-describedby={fieldErrors.price ? 'incubator-price-error' : undefined}
            />
            {fieldErrors.price && <span className="hospital-field-error" id="incubator-price-error">{fieldErrors.price}</span>}
          </label>
          )}
          <label>
            Currently available
            <input
              type="number"
              min="0"
              max="4294967295"
              step="1"
              required
              value={form.available_capacity}
              onChange={(event) => changeField('available_capacity', event.target.value)}
              aria-invalid={Boolean(fieldErrors.available_capacity)}
              aria-describedby={fieldErrors.available_capacity ? 'incubator-available-error' : undefined}
            />
            {fieldErrors.available_capacity && <span className="hospital-field-error" id="incubator-available-error">{fieldErrors.available_capacity}</span>}
          </label>
          <div className="incubator-form-actions">
            <button type="submit" className="primary-button" disabled={isSaving}>
              {isSaving ? 'Saving…' : isHospitalStaff ? 'Update availability' : editingId ? 'Save changes' : 'Add unit'}
            </button>
            {editingId && (
              <button type="button" className="secondary-button" onClick={cancelEditing}>
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

      <section className="incubator-unit-list" aria-labelledby="incubator-list-heading">
        <div className="section-heading">
          <div>
            <h2 id="incubator-list-heading">Your units</h2>
            <p>
              {isHospitalStaff
                ? 'Staff can update reported availability; unit details and total capacity are read-only.'
                : 'Availability remains subject to confirmation by your hospital team.'}
            </p>
          </div>
          {!isLoading && <span className="demo-badge">{units.length} {units.length === 1 ? 'UNIT' : 'UNITS'}</span>}
        </div>

        {isLoading ? (
          <div className="panel incubator-empty" role="status">Loading unit records…</div>
        ) : units.length === 0 ? (
          <div className="panel incubator-empty">
            <h3>No units added yet</h3>
            <p>
              {isHospitalStaff
                ? 'Your hospital has not configured any neonatal care units.'
                : 'Add a neonatal care unit to record its total and currently available capacity.'}
            </p>
          </div>
        ) : (
          <div className="incubator-unit-grid">
            {units.map((unit) => {
              const status = availabilityStatus(unit)
              return (
              <article className="panel incubator-unit-card" key={unit.id}>
                <div className="incubator-unit-heading">
                  <div>
                    <span className="eyebrow">NEONATAL CARE UNIT</span>
                    <h3>{unit.name}</h3>
                  </div>
                  <span className={`hospital-status ${status.tone}`}>{t(status.label)}</span>
                </div>
                <div className="incubator-capacity">
                  <div><span>Total capacity</span><strong>{unit.total_capacity}</strong></div>
                  <div><span>Currently available</span><strong>{unit.available_capacity}</strong></div>
                  <div><span>Price (EGP)</span><strong>{formatPrice(unit.price, language)}</strong></div>
                </div>
                <p className="availability-updated">{formatUpdatedAt(unit.availability_updated_at, language)}</p>
                <div className="incubator-card-actions">
                  <button type="button" className="secondary-button" onClick={() => startEditing(unit)}>
                    {isHospitalStaff ? 'Update availability' : 'Edit'}
                  </button>
                  {!isHospitalStaff && (
                    <button type="button" className="danger-button" onClick={() => deleteUnit(unit)}>
                      Delete
                    </button>
                  )}
                </div>
              </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}

export default IncubatorUnits
