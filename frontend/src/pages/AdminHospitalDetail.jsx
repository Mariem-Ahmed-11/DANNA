import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiRequest } from '../api'
import { useDialogA11y } from '../useDialogA11y'
import { useLocale } from '../i18n'
import Icon from '../components/Icon'
import '../App.css'

const hospitalStatuses = {
  approved: { label: 'Active', tone: 'teal' },
  pending_review: { label: 'Pending', tone: 'amber' },
  rejected: { label: 'Rejected', tone: 'rose' },
  suspended: { label: 'Suspended', tone: 'rose' },
}

const accountStatuses = {
  active: { label: 'Active', tone: 'teal' },
  pending: { label: 'Pending', tone: 'amber' },
  rejected: { label: 'Rejected', tone: 'rose' },
  suspended: { label: 'Deactivated', tone: 'rose' },
}

const lifecycleActions = {
  registration: 'Registration submitted',
  approval: 'Approved',
  rejection: 'Rejected',
  suspension: 'Suspended',
  reactivation: 'Reactivated',
  resubmission: 'Resubmitted',
}

const profileFields = [
  ['city', 'City'],
  ['governorate', 'Governorate'],
  ['address', 'Address'],
  ['phone', 'Phone'],
  ['contact_email', 'Contact email'],
  ['website_url', 'Website'],
  ['working_hours', 'Working hours'],
]

function Status({ status, statuses, t }) {
  const meta = statuses[status] || { label: status, tone: 'rose' }
  return (
    <span className={`sa-status-text ${meta.tone}`}>
      <i aria-hidden="true" />
      {t(meta.label)}
    </span>
  )
}

function AdminHospitalDetail() {
  const { hospitalId } = useParams()
  const { t } = useLocale()
  const [hospital, setHospital] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [lifecycleEvents, setLifecycleEvents] = useState([])
  const [accountEvents, setAccountEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedUser, setSelectedUser] = useState(null)
  const [reason, setReason] = useState('')
  const [actionError, setActionError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  function closeDialog() {
    if (saving) return
    setSelectedUser(null)
    setReason('')
    setActionError('')
    setSuccess('')
  }

  const dialogRef = useDialogA11y(Boolean(selectedUser), closeDialog)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      apiRequest(`/api/hospitals/${hospitalId}`, { signal: controller.signal }),
      apiRequest(`/api/admin/hospitals/${hospitalId}/accounts`, { signal: controller.signal }),
      apiRequest(`/api/admin/hospitals/${hospitalId}/lifecycle-history`, { signal: controller.signal }),
      apiRequest(`/api/admin/hospitals/${hospitalId}/user-status-history`, { signal: controller.signal }),
    ])
      .then(([hospitalPayload, accountsPayload, lifecyclePayload, accountHistoryPayload]) => {
        if (
          !hospitalPayload.data?.id
          || !Array.isArray(accountsPayload.data)
          || !Array.isArray(lifecyclePayload.data)
          || !Array.isArray(accountHistoryPayload.data)
        ) {
          throw new Error('The server returned incomplete hospital details.')
        }
        setHospital(hospitalPayload.data)
        setAccounts(accountsPayload.data)
        setLifecycleEvents(lifecyclePayload.data)
        setAccountEvents(accountHistoryPayload.data)
        setLoadError('')
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setLoadError(error.message || 'Hospital details could not be loaded.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [hospitalId, reloadKey])

  function retry() {
    setLoading(true)
    setReloadKey((current) => current + 1)
  }

  async function activateUser(event) {
    event.preventDefault()
    if (!selectedUser || saving) return
    const trimmedReason = reason.trim()
    if (trimmedReason.length < 10 || trimmedReason.length > 2000) {
      setActionError(t('Provide a reason between 10 and 2000 characters.'))
      return
    }

    setSaving(true)
    setActionError('')
    setSuccess('')
    try {
      const payload = await apiRequest(
        `/api/admin/hospitals/${hospitalId}/users/${selectedUser.id}/activate`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: trimmedReason }),
        }
      )
      setAccounts((current) => current.map((account) => (
        account.id === payload.data.id ? { ...account, status: payload.data.status } : account
      )))
      setSelectedUser(null)
      setReason('')
      setSuccess(t('User account activated.'))
      try {
        const historyPayload = await apiRequest(`/api/admin/hospitals/${hospitalId}/user-status-history`)
        if (!Array.isArray(historyPayload.data)) {
          throw new Error('The server returned an invalid user-status history.')
        }
        setAccountEvents(historyPayload.data)
      } catch {
        setActionError(t('The account was activated, but user-status history could not be refreshed.'))
      }
    } catch (error) {
      const validationMessage = error.status === 422
        ? Object.values(error.errors || {}).flat()[0]
        : ''
      setActionError(validationMessage || error.message || t('The account could not be activated.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="main-content hospital-detail-page">
        <div className="hospital-detail-loading" role="status">{t('Loading hospital details…')}</div>
      </main>
    )
  }

  if (loadError || !hospital) {
    return (
      <main className="main-content hospital-detail-page">
        <div className="hospital-feedback error" role="alert">
          <span>{t(loadError || 'Hospital details could not be loaded.')}</span>
          <button type="button" className="secondary-button" onClick={retry}>{t('Retry')}</button>
        </div>
      </main>
    )
  }

  return (
    <main className="main-content hospital-detail-page">
      <header className="topbar">
        <div>
          <Link className="hospital-detail-back" to="/hospitals">
            <Icon name="arrowRight" size={16} />
            {t('Back to Hospitals')}
          </Link>
          <h1>{hospital.name}</h1>
          <p>{t('Hospital details, account status, and lifecycle history.')}</p>
        </div>
        <Status status={hospital.status} statuses={hospitalStatuses} t={t} />
      </header>

      {success && <div className="hospital-feedback success" role="status">{success}</div>}
      {actionError && <div className="hospital-feedback error" role="alert">{actionError}</div>}

      <section className="hospital-detail-grid">
        <article className="panel hospital-detail-card hospital-detail-profile">
          <h2>{t('Hospital information')}</h2>
          <dl>
            {profileFields.map(([field, label]) => hospital[field] && (
              <div key={field}>
                <dt>{t(label)}</dt>
                <dd>{hospital[field]}</dd>
              </div>
            ))}
          </dl>
        </article>

        <article className="panel hospital-detail-card">
          <div className="section-heading">
            <div>
              <h2>{t('Hospital users')}</h2>
              <p>{t('Account status and available activation actions.')}</p>
            </div>
          </div>
          {accounts.length === 0 ? (
            <div className="hospital-detail-empty">{t('No hospital users found')}</div>
          ) : (
            <div className="hospital-detail-accounts">
              {accounts.map((account) => (
                <div className="hospital-detail-account" key={account.id}>
                  <span>
                    <strong>{account.name}</strong>
                    <small>{account.email} · {t(account.role === 'hospital_admin' ? 'Hospital Admin' : 'Hospital Staff')}</small>
                  </span>
                  <Status status={account.status} statuses={accountStatuses} t={t} />
                  {account.status === 'suspended' && hospital.status === 'approved' && (
                    <button
                      type="button"
                      className="sa-users-activate"
                      onClick={() => {
                        setSelectedUser(account)
                        setReason('')
                        setActionError('')
                      }}
                    >
                      {t('Activate')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel hospital-detail-card">
          <h2>{t('Lifecycle history')}</h2>
          {lifecycleEvents.length === 0 ? (
            <div className="hospital-detail-empty">{t('No lifecycle history is recorded for this hospital.')}</div>
          ) : (
            <ol className="hospital-detail-timeline">
              {lifecycleEvents.map((event) => (
                <li key={event.id}>
                  <span className="hospital-detail-timeline-dot" aria-hidden="true" />
                  <div>
                    <strong>{t(lifecycleActions[event.action] || event.action.replaceAll('_', ' '))}</strong>
                    <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time>
                    <p>
                      {event.previous_status
                        ? `${t(hospitalStatuses[event.previous_status]?.label || event.previous_status)} → `
                        : ''}
                      {t(hospitalStatuses[event.new_status]?.label || event.new_status)}
                      {event.actor?.name ? ` · ${event.actor.name}` : ''}
                    </p>
                    {event.reason && <blockquote>{event.reason}</blockquote>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </article>

        <article className="panel hospital-detail-card">
          <h2>{t('User-status history')}</h2>
          {accountEvents.length === 0 ? (
            <div className="hospital-detail-empty">{t('No user-status history is recorded for this hospital.')}</div>
          ) : (
            <ol className="hospital-detail-timeline">
              {accountEvents.map((event) => (
                <li key={event.id}>
                  <span className="hospital-detail-timeline-dot" aria-hidden="true" />
                  <div>
                    <strong>{event.user?.name || t('Hospital user')}</strong>
                    <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time>
                    <p>
                      {t(accountStatuses[event.previous_status]?.label || event.previous_status)}
                      {' → '}
                      {t(accountStatuses[event.new_status]?.label || event.new_status)}
                      {event.actor?.name ? ` · ${event.actor.name}` : ''}
                    </p>
                    {event.reason && <blockquote>{event.reason}</blockquote>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </article>
      </section>

      {selectedUser && (
        <div className="lifecycle-dialog-backdrop">
          <section
            ref={dialogRef}
            tabIndex={-1}
            className="lifecycle-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hospital-user-activation-heading"
          >
            <h2 id="hospital-user-activation-heading">{t('Activate user account')}</h2>
            <p>{t('Activate {name} at {hospital}?', { name: selectedUser.name, hospital: hospital.name })}</p>
            <form onSubmit={activateUser}>
              <label htmlFor="hospital-user-activation-reason">{t('Reason for activation')}</label>
              <textarea
                id="hospital-user-activation-reason"
                required
                minLength={10}
                maxLength={2000}
                rows={4}
                value={reason}
                aria-invalid={Boolean(actionError)}
                onChange={(event) => {
                  setReason(event.target.value)
                  setActionError('')
                }}
              />
              {actionError && <span className="hospital-field-error" role="alert">{actionError}</span>}
              <div className="profile-form-actions">
                <button className="primary-button lifecycle-dialog-submit" type="submit" disabled={saving}>
                  {t(saving ? 'Activating…' : 'Activate')}
                </button>
                <button className="secondary-button" type="button" onClick={closeDialog} disabled={saving}>
                  {t('Cancel')}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}

export default AdminHospitalDetail
