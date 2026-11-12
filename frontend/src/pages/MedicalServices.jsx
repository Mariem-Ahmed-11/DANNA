import { useEffect, useMemo, useState } from 'react'
import { ApiError, apiRequest } from '../api'
import { useAuth } from '../auth'
import { useLocale } from '../i18n'
import Icon from '../components/Icon'
import '../App.css'

const emptyForm = {
  name: '',
  category: 'Neonatal Care',
  short_description: '',
  detailed_description: '',
  service_status: 'not_confirmed',
  operating_hours: '',
  notes: '',
}

const categories = [
  'Neonatal Care',
  'Neonatal Intensive Care',
  'Incubator Care',
  'Premature Infant Care',
  'Pediatric Consultation',
  'Neonatal Monitoring',
  'Other',
]

const statuses = [
  ['offered', 'Offered'],
  ['temporarily_unavailable', 'Temporarily unavailable'],
  ['not_confirmed', 'Not confirmed'],
]

function MedicalServices() {
  const { user } = useAuth()
  const { t } = useLocale()
  const isHospitalStaff = user?.role === 'hospital_staff'
  const [services, setServices] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function loadServices() {
      try {
        const payload = await apiRequest('/api/hospital/services', {
          signal: controller.signal,
        })
        if (!Array.isArray(payload.data)) {
          throw new Error('The server returned an invalid service list.')
        }
        setServices(payload.data)
        setError('')
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setError(requestError.message || 'Medical services could not be loaded.')
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    loadServices()
    return () => controller.abort()
  }, [reloadKey])

  const filteredServices = useMemo(() => {
    return services.filter((service) => {
      const matchesSearch = service.name.toLowerCase().includes(search.toLowerCase())
      const matchesCategory = categoryFilter === 'all' || service.category === categoryFilter
      const matchesStatus = statusFilter === 'all' || service.service_status === statusFilter
      return matchesSearch && matchesCategory && matchesStatus
    })
  }, [services, search, categoryFilter, statusFilter])

  function changeField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: '' }))
    setError('')
    setSuccess('')
  }

  function startEditing(service) {
    setEditingId(service.id)
    setIsFormOpen(true)
    setForm({
      name: service.name || '',
      category: service.category || 'Neonatal Care',
      short_description: service.short_description || '',
      detailed_description: service.detailed_description || '',
      service_status: service.service_status || 'not_confirmed',
      operating_hours: service.operating_hours || '',
      notes: service.notes || '',
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
    setIsSaving(true)

    const payload = {
      name: form.name.trim(),
      category: form.category,
      short_description: form.short_description.trim(),
      detailed_description: form.detailed_description.trim() || null,
      service_status: form.service_status,
      operating_hours: form.operating_hours.trim() || null,
      notes: form.notes.trim() || null,
    }

    try {
      const response = await apiRequest(
        editingId ? `/api/hospital/services/${editingId}` : '/api/hospital/services',
        {
          method: editingId ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        }
      )
      setSuccess(response.message || 'Medical service saved.')
      setForm(emptyForm)
      setEditingId(null)
      setIsFormOpen(false)
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
        setError(requestError.message || 'The medical service could not be saved.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteService(service) {
    if (!window.confirm(t('Delete "{name}"?', { name: service.name }))) return

    setError('')
    setSuccess('')
    setDeletingId(service.id)

    try {
      const response = await apiRequest(`/api/hospital/services/${service.id}`, {
        method: 'DELETE',
      })
      setServices((current) => current.filter((entry) => entry.id !== service.id))
      setSuccess(response.message || 'Medical service deleted.')
      if (editingId === service.id) cancelEditing()
    } catch (requestError) {
      setError(requestError.message || 'The medical service could not be deleted.')
    } finally {
      setDeletingId(null)
    }
  }

  function refresh() {
    setIsLoading(true)
    setReloadKey((current) => current + 1)
  }

  return (
    <main className="main-content" id="medical-services-page">
      <header className="topbar">
        <div>
          <span className="breadcrumb">Hospital workspace / Medical Services</span>
          <h1>Medical Services</h1>
          <p>
            {isHospitalStaff
              ? 'View the medical services configured for your hospital.'
              : 'Maintain a structured list of services your hospital reports offering.'}
          </p>
        </div>
        <div className="hospital-page-actions">
          {!isHospitalStaff && !isFormOpen && (
            <button type="button" className="hospital-primary-action" onClick={() => setIsFormOpen(true)}>
              <Icon name="plus" size={16} />
              Add a service
            </button>
          )}
          <button type="button" className="secondary-button" onClick={refresh} disabled={isLoading}>
            {isLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </header>

      <div className="availability-notice" role="note">
        Service information is a hospital-reported operational record and does not guarantee
        admission, treatment selection, or clinical suitability. The receiving hospital and its
        medical team make the final determination.
      </div>

      {success && <div className="hospital-feedback success" role="status">{success}</div>}
      {error && <div className="hospital-feedback error" role="alert">{error}</div>}

      {!isHospitalStaff && isFormOpen && (
      <section className="panel incubator-form-panel hospital-editor-panel">
        <div className="panel-heading">
          <div>
            <h2>{editingId ? 'Edit service' : 'Add a service'}</h2>
            <p>Record a hospital-reported service without creating public medical claims.</p>
          </div>
        </div>

        <form className="incubator-form equipment-form" onSubmit={submitForm}>
          <label>
            Service name
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

          <label>
            Category
            <select
              value={form.category}
              onChange={(event) => changeField('category', event.target.value)}
            >
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            {fieldErrors.category && <span className="hospital-field-error">{fieldErrors.category}</span>}
          </label>

          <label className="profile-field-wide">
            Short description
            <textarea
              rows="2"
              maxLength={500}
              required
              value={form.short_description}
              onChange={(event) => changeField('short_description', event.target.value)}
              aria-invalid={Boolean(fieldErrors.short_description)}
            />
            {fieldErrors.short_description && <span className="hospital-field-error">{fieldErrors.short_description}</span>}
          </label>

          <label className="profile-field-wide">
            Detailed description (optional)
            <textarea
              rows="4"
              maxLength={5000}
              value={form.detailed_description}
              onChange={(event) => changeField('detailed_description', event.target.value)}
              aria-invalid={Boolean(fieldErrors.detailed_description)}
            />
            {fieldErrors.detailed_description && <span className="hospital-field-error">{fieldErrors.detailed_description}</span>}
          </label>

          <label>
            Service status
            <select
              value={form.service_status}
              onChange={(event) => changeField('service_status', event.target.value)}
            >
              {statuses.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            {fieldErrors.service_status && <span className="hospital-field-error">{fieldErrors.service_status}</span>}
          </label>

          <label>
            Operating hours (optional)
            <input
              type="text"
              maxLength={255}
              value={form.operating_hours}
              onChange={(event) => changeField('operating_hours', event.target.value)}
              aria-invalid={Boolean(fieldErrors.operating_hours)}
            />
            {fieldErrors.operating_hours && <span className="hospital-field-error">{fieldErrors.operating_hours}</span>}
          </label>

          <label className="profile-field-wide">
            Internal notes (optional, private)
            <textarea
              rows="3"
              maxLength={2000}
              value={form.notes}
              onChange={(event) => changeField('notes', event.target.value)}
              aria-invalid={Boolean(fieldErrors.notes)}
            />
            {fieldErrors.notes && <span className="hospital-field-error">{fieldErrors.notes}</span>}
          </label>

          <div className="incubator-form-actions">
            <button type="submit" className="primary-button" disabled={isSaving}>
              {isSaving ? 'Saving…' : editingId ? 'Save service' : 'Create service'}
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

      <section className="panel no-padding-panel">
        <div className="panel-heading service-toolbar">
          <div>
            <h2>Hospital service directory</h2>
            <p>Search and filter the services currently reported by this hospital.</p>
          </div>
          <div className="filters-row">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by service name"
              aria-label="Search services by name"
            />
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Filter by category">
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
              <option value="all">All statuses</option>
              {statuses.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="empty-state">Loading services…</div>
        ) : filteredServices.length === 0 ? (
          <div className="empty-state">
            {isHospitalStaff
              ? 'No services match the current filters. Your hospital administrator manages service records.'
              : "No services match the current filters. Add a service to begin tracking the hospital's offerings."}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="dhana-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Operating hours</th>
                  {!isHospitalStaff && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredServices.map((service) => (
                  <tr key={service.id}>
                    <td data-label={t('Service')}>
                      <div className="service-name-cell">
                        <strong>{service.name}</strong>
                        <span>{service.short_description}</span>
                      </div>
                    </td>
                    <td data-label={t('Category')}>{t(service.category)}</td>
                    <td data-label={t('Status')}>
                      <span className={`status-badge status-${service.service_status}`}>
                        {statuses.find(([value]) => value === service.service_status)?.[1] || service.service_status}
                      </span>
                    </td>
                    <td data-label={t('Operating hours')}>{service.operating_hours || t('Not specified')}</td>
                    {!isHospitalStaff && (
                      <td data-label={t('Actions')}>
                        <div className="table-actions">
                          <button type="button" className="secondary-button small-button" onClick={() => startEditing(service)}>
                            Edit
                          </button>
                          <button type="button" className="danger-button small-button" onClick={() => deleteService(service)} disabled={deletingId === service.id}>
                            {deletingId === service.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}

export default MedicalServices
