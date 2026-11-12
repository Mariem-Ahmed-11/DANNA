import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiRequest } from '../api'
import { useDialogA11y } from '../useDialogA11y'
import { useLocale } from '../i18n'
import '../App.css'

const requestFields = [
  ['city', 'City'],
  ['governorate', 'Governorate'],
  ['address', 'Address'],
  ['phone', 'Phone'],
  ['contact_email', 'Contact email'],
  ['website_url', 'Website'],
  ['working_hours', 'Working hours'],
  ['establishment_year', 'Establishment year'],
  ['short_description', 'Short description'],
  ['overview', 'Overview'],
]

function AdminRegistrationRequestDetail() {
  const { requestId } = useParams()
  const { t } = useLocale()
  const navigate = useNavigate()
  const [hospital, setHospital] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [decisionError, setDecisionError] = useState('')
  const [rejectionOpen, setRejectionOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  function closeRejection() {
    if (saving) return
    setRejectionOpen(false)
    setReason('')
    setDecisionError('')
  }

  const rejectionDialogRef = useDialogA11y(rejectionOpen, closeRejection)

  useEffect(() => {
    const controller = new AbortController()
    apiRequest('/api/admin/hospital-requests', { signal: controller.signal })
      .then((payload) => {
        if (!Array.isArray(payload.data)) {
          throw new Error('The server returned an invalid hospital request list.')
        }
        const request = payload.data.find((item) => String(item.id) === requestId)
        if (!request) {
          throw new Error('This registration request is no longer pending review.')
        }
        setHospital(request)
        setLoadError('')
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setLoadError(error.message || 'The registration request could not be loaded.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [requestId, reloadKey])

  function retry() {
    setLoading(true)
    setReloadKey((current) => current + 1)
  }

  async function review(action, rejectionReason = null) {
    setSaving(true)
    setDecisionError('')
    try {
      await apiRequest(`/api/admin/hospitals/${hospital.id}/${action}`, {
        method: 'POST',
        ...(rejectionReason ? { body: JSON.stringify({ reason: rejectionReason }) } : {}),
      })
      navigate('/hospital-requests', {
        replace: true,
        state: { message: t(action === 'approve' ? 'Hospital registration approved.' : 'Hospital registration rejected.') },
      })
    } catch (error) {
      const validationMessage = error.status === 422
        ? Object.values(error.errors || {}).flat()[0]
        : ''
      setDecisionError(validationMessage || error.message || t('The hospital review could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  function submitRejection(event) {
    event.preventDefault()
    const trimmedReason = reason.trim()
    if (trimmedReason.length < 10 || trimmedReason.length > 2000) {
      setDecisionError(t('Provide a meaningful reason of at least 10 characters.'))
      return
    }
    review('reject', trimmedReason)
  }

  if (loading) {
    return (
      <main className="main-content hospital-detail-page">
        <div className="hospital-detail-loading" role="status">{t('Loading registration request…')}</div>
      </main>
    )
  }

  if (loadError || !hospital) {
    return (
      <main className="main-content hospital-detail-page">
        <div className="hospital-feedback error" role="alert">
          <span>{t(loadError || 'The registration request could not be loaded.')}</span>
          <button type="button" className="secondary-button" onClick={retry}>{t('Retry')}</button>
        </div>
      </main>
    )
  }

  const contact = hospital.users?.[0]
  return (
    <main className="main-content hospital-detail-page registration-request-detail">
      <header className="topbar">
        <div>
          <Link className="hospital-detail-back" to="/hospital-requests">
            {t('Back to Registration Requests')}
          </Link>
          <h1>{hospital.name}</h1>
          <p>{t('Review this hospital registration and its submitted profile details.')}</p>
        </div>
        <span className="sa-status-text amber"><i aria-hidden="true" />{t('Pending')}</span>
      </header>

      {decisionError && <div className="hospital-feedback error" role="alert">{decisionError}</div>}

      <section className="hospital-detail-grid registration-request-grid">
        <article className="panel hospital-detail-card hospital-detail-profile">
          <h2>{t('Hospital information')}</h2>
          <dl>
            {requestFields.map(([field, label]) => {
              const value = hospital[field]
              if (value === null || value === undefined || value === '') return null
              return (
                <div key={field}>
                  <dt>{t(label)}</dt>
                  <dd>{Array.isArray(value) ? value.join(', ') : value}</dd>
                </div>
              )
            })}
          </dl>
        </article>
        <article className="panel hospital-detail-card">
          <h2>{t('Responsible staff')}</h2>
          {contact ? (
            <dl className="registration-request-contact">
              <div><dt>{t('Name')}</dt><dd>{contact.name}</dd></div>
              <div><dt>{t('Email address')}</dt><dd>{contact.email}</dd></div>
            </dl>
          ) : (
            <div className="hospital-detail-empty">{t('No contact attached')}</div>
          )}
        </article>
      </section>

      <div className="registration-request-actions">
        <button
          type="button"
          className="sa-primary-button"
          onClick={() => review('approve')}
          disabled={saving}
        >
          {t(saving ? 'Saving…' : 'Approve registration')}
        </button>
        <button
          type="button"
          className="sa-danger-button"
          onClick={() => {
            setReason('')
            setDecisionError('')
            setRejectionOpen(true)
          }}
          disabled={saving}
        >
          {t('Reject registration')}
        </button>
      </div>

      {rejectionOpen && (
        <div className="lifecycle-dialog-backdrop">
          <section
            ref={rejectionDialogRef}
            tabIndex={-1}
            className="lifecycle-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="registration-rejection-heading"
          >
            <h2 id="registration-rejection-heading">{t('Reject {hospital}', { hospital: hospital.name })}</h2>
            <p>{t('This reason will be visible to the hospital administrator and saved in decision history.')}</p>
            <form onSubmit={submitRejection}>
              <label htmlFor="registration-rejection-reason">{t('Reason for rejection')}</label>
              <textarea
                id="registration-rejection-reason"
                required
                minLength={10}
                maxLength={2000}
                rows={5}
                value={reason}
                aria-invalid={Boolean(decisionError)}
                onChange={(event) => {
                  setReason(event.target.value)
                  setDecisionError('')
                }}
              />
              {decisionError && <span className="hospital-field-error" role="alert">{decisionError}</span>}
              <div className="profile-form-actions">
                <button className="primary-button lifecycle-dialog-submit" type="submit" disabled={saving}>
                  {t(saving ? 'Saving…' : 'Confirm rejection')}
                </button>
                <button className="secondary-button" type="button" onClick={closeRejection} disabled={saving}>
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

export default AdminRegistrationRequestDetail
