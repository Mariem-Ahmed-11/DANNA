import { useEffect, useState } from 'react'
import { apiRequest } from '../api'
import { useLocale } from '../i18n'

const actionLabels = {
  registration: 'Registration submitted',
  approval: 'Hospital approved',
  rejection: 'Hospital rejected',
  suspension: 'Hospital suspended',
  reactivation: 'Hospital reactivated',
  resubmission: 'Registration resubmitted',
  manual_activation: 'User account activated',
}

const statusLabels = {
  approved: 'Approved',
  approved_for_publication: 'Approved for publication',
  active: 'Active',
  changes_requested: 'Changes requested',
  pending_review: 'Pending review',
  rejected: 'Rejected',
  suspended: 'Suspended',
}

function formatDate(value, language) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export default function AdminAuditLogs() {
  const { t, language } = useLocale()
  const [events, setEvents] = useState([])
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ page: String(page) })
    if (search.trim()) params.set('search', search.trim())
    if (type) params.set('type', type)

    apiRequest(`/api/admin/audit-logs?${params}`, { signal: controller.signal })
      .then((payload) => {
        if (!Array.isArray(payload.data) || !Number.isInteger(payload.last_page)) {
          throw new Error('The server returned incomplete audit log data.')
        }
        setEvents(payload.data)
        setLastPage(Math.max(1, payload.last_page))
        setError('')
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          setError(requestError.message || 'Audit logs could not be loaded.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [page, reloadKey, search, type])

  function retry() {
    setLoading(true)
    setError('')
    setReloadKey((key) => key + 1)
  }

  function updateSearch(value) {
    setSearch(value)
    setPage(1)
  }

  function renderEvent(event) {
    if (event.action === 'manual_activation') return 'User account activated'
    if (event.event_type === 'account' && event.new_status === 'suspended') {
      return 'User account deactivated'
    }
    return actionLabels[event.action] || 'Status updated'
  }

  return (
    <div className="sa-admin-page">
      <header className="sa-users-heading">
        <div>
          <span className="sa-eyebrow">{t('ADMINISTRATION')}</span>
          <h1>{t('Audit Logs')}</h1>
          <p>{t('Review lifecycle and account activity recorded across the DANNA network.')}</p>
        </div>
        <label className="sa-users-search">
          <span className="visually-hidden">{t('Search audit logs')}</span>
          <input
            type="search"
            value={search}
            onChange={(event) => updateSearch(event.target.value)}
            placeholder={t('Search by hospital, user, action, or reason')}
          />
        </label>
      </header>

      <section className="sa-card sa-audit-card" aria-labelledby="audit-events-heading">
        <div className="sa-card-head sa-audit-toolbar">
          <div>
            <h2 id="audit-events-heading">{t('Recorded activity')}</h2>
            <p>{t('Showing recorded hospital lifecycle and account status changes.')}</p>
          </div>
          <label className="sa-audit-filter">
            <span className="visually-hidden">{t('Filter event type')}</span>
            <select
              value={type}
              onChange={(event) => {
                setType(event.target.value)
                setPage(1)
              }}
            >
              <option value="">{t('All activity')}</option>
              <option value="hospital">{t('Hospital lifecycle')}</option>
              <option value="account">{t('Account status')}</option>
            </select>
          </label>
        </div>

        {error ? (
          <div className="sa-users-state is-error" role="alert">
            <p>{t(error)}</p>
            <button type="button" className="sa-secondary-button" onClick={retry}>{t('Retry')}</button>
          </div>
        ) : (
          <div className="sa-table-wrap">
            <table className="sa-table sa-audit-table">
              <thead>
                <tr>
                  <th scope="col">{t('Date and time')}</th>
                  <th scope="col">{t('Activity')}</th>
                  <th scope="col">{t('Hospital')}</th>
                  <th scope="col">{t('Actor')}</th>
                  <th scope="col">{t('Status change')}</th>
                  <th scope="col">{t('Reason')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? Array.from({ length: 5 }, (_, index) => (
                  <tr className="sa-table-skeleton-row" key={`audit-skeleton-${index}`} aria-hidden="true">
                    <td colSpan="6"><span className="sa-skeleton" /></td>
                  </tr>
                )) : events.length === 0 ? (
                  <tr>
                    <td colSpan="6">
                      <div className="sa-table-empty">
                        <strong>{t(search || type ? 'No audit events match your filters.' : 'No audit events have been recorded yet.')}</strong>
                      </div>
                    </td>
                  </tr>
                ) : events.map((event) => (
                  <tr key={`${event.event_type}-${event.event_id}`}>
                    <td data-label={t('Date and time')}>{formatDate(event.created_at, language)}</td>
                    <td data-label={t('Activity')}>
                      <span className="sa-audit-action">{t(renderEvent(event))}</span>
                      {event.subject_name && event.event_type === 'account' && (
                        <small className="sa-audit-subject">{event.subject_name}</small>
                      )}
                    </td>
                    <td data-label={t('Hospital')}>{event.hospital_name || '—'}</td>
                    <td data-label={t('Actor')}>{event.actor_name || t('System')}</td>
                    <td data-label={t('Status change')}>
                      <span>{event.previous_status ? t(statusLabels[event.previous_status] || event.previous_status) : '—'}</span>
                      {event.previous_status && <span className="sa-audit-arrow" aria-hidden="true"> → </span>}
                      <span className={`sa-status-text ${['approved', 'approved_for_publication', 'active'].includes(event.new_status) ? 'teal' : event.new_status === 'pending_review' ? 'amber' : 'rose'}`}>
                        <i aria-hidden="true" />{t(statusLabels[event.new_status] || event.new_status)}
                      </span>
                    </td>
                    <td data-label={t('Reason')} className="sa-audit-reason">{event.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && lastPage > 1 && (
          <nav className="sa-pagination" aria-label={t('Audit logs pagination')}>
            <button type="button" onClick={() => setPage((current) => current - 1)} disabled={page === 1}>
              {t('Previous')}
            </button>
            <span>{t('Page {page} of {total}', { page, total: lastPage })}</span>
            <button type="button" onClick={() => setPage((current) => current + 1)} disabled={page === lastPage}>
              {t('Next')}
            </button>
          </nav>
        )}
      </section>
    </div>
  )
}
