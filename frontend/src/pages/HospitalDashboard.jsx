import { useEffect, useState } from 'react'
import { apiRequest } from '../api'
import { useLocale } from '../i18n'
import Icon from '../components/Icon'
import '../App.css'

const reviewStatus = {
  pending_review: { label: 'Pending', tone: 'amber' },
  approved_for_publication: { label: 'Approved', tone: 'teal' },
  changes_requested: { label: 'Changes requested', tone: 'rose' },
}

const submissionType = {
  hospital_profile: 'Hospital profile',
  'App\\Models\\Hospital': 'Hospital profile',
  incubator_unit: 'Incubator unit',
  'App\\Models\\IncubatorUnit': 'Incubator unit',
  hospital_equipment: 'Equipment',
  'App\\Models\\HospitalEquipment': 'Equipment',
  medical_service: 'Medical service',
  'App\\Models\\MedicalService': 'Medical service',
}

function MetricCard({ icon, label, value, language }) {
  return (
    <article className="stat-card hospital-dashboard-stat">
      <div className="stat-top">
        <span className="stat-icon teal" aria-hidden="true"><Icon name={icon} size={19} /></span>
      </div>
      <p>{label}</p>
      <h3>{new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-US').format(value ?? 0)}</h3>
    </article>
  )
}

function StatusText({ status, t }) {
  const meta = reviewStatus[status] || { label: status, tone: 'rose' }
  return (
    <span className={`sa-status-text ${meta.tone}`}>
      <i aria-hidden="true" />
      {t(meta.label)}
    </span>
  )
}

export default function HospitalDashboard() {
  const { t, language } = useLocale()
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    apiRequest('/api/hospital/workspace', { signal: controller.signal })
      .then((payload) => {
        if (!payload.data?.hospital || !Array.isArray(payload.data?.data_reviews?.submissions)) {
          throw new Error('The server returned an invalid hospital workspace.')
        }
        setSummary(payload.data)
        setError('')
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(requestError.message || 'Hospital workspace could not be loaded.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [reloadKey])

  function retryLoading() {
    setLoading(true)
    setReloadKey((current) => current + 1)
  }

  if (loading) {
    return (
      <div className="hospital-dashboard-content" role="status" aria-label={t('Loading your hospital workspace…')}>
        <div className="hospital-workspace-skeleton" />
        <div className="hospital-workspace-skeleton-grid">
          {Array.from({ length: 4 }, (_, index) => <div className="hospital-workspace-skeleton" key={index} />)}
        </div>
        <div className="hospital-workspace-skeleton hospital-workspace-review-skeleton" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="hospital-workspace-error" role="alert">
        <p>{t(error)}</p>
        <button type="button" className="secondary-button" onClick={retryLoading}>
          {t('Retry')}
        </button>
      </div>
    )
  }

  const reviews = summary.data_reviews
  const hospitalStatus = {
    approved: { label: 'Approved', tone: 'teal' },
    pending_review: { label: 'Pending', tone: 'amber' },
    rejected: { label: 'Rejected', tone: 'rose' },
    suspended: { label: 'Suspended', tone: 'rose' },
  }[summary.hospital_status] || { label: summary.hospital_status, tone: 'amber' }

  return (
    <div className="hospital-dashboard-content">
      <section className="welcome-banner hospital-dashboard-banner">
        <img
          alt={t('Newborn receiving care in a neonatal unit')}
          className="hospital-dashboard-photo"
          src="/assets/hero-nicu.jpg"
        />
        <span aria-hidden="true" className="hospital-dashboard-photo-wash" />
        <div className="welcome-copy">
          <span className="eyebrow">{t('HOSPITAL WORKSPACE')}</span>
          <h2>{summary.hospital.name}</h2>
          <p>{t('Manage your hospital account and submitted data.')}</p>
        </div>
        <div className="hospital-dashboard-identity">
          <img
            alt={t('Hospital logo')}
            onError={(event) => {
              if (!event.currentTarget.src.endsWith('/assets/hospital-building.jpg')) {
                event.currentTarget.src = '/assets/hospital-building.jpg'
              }
            }}
            src={summary.hospital.logo_url || '/assets/hospital-building.jpg'}
          />
          <span>
            <strong>{summary.hospital.name}</strong>
            <small>{t('Hospital profile')}</small>
          </span>
        </div>
        <span className={`sa-status-text ${hospitalStatus.tone} hospital-approval-status`}>
          <i aria-hidden="true" />
          {t(hospitalStatus.label)}
        </span>
      </section>

      <section className="stats-grid hospital-dashboard-stats" aria-label={t('Hospital overview')}>
        <MetricCard icon="bed" label={t('Incubator Units')} value={summary.incubators.units} language={language} />
        <MetricCard icon="activity" label={t('Equipment')} value={summary.equipment.total} language={language} />
        <MetricCard icon="heartPulse" label={t('Services')} value={summary.medical_services.total} language={language} />
        <MetricCard icon="users" label={t('Staff')} value={summary.staff.total} language={language} />
      </section>

      <section className="sa-card sa-table-card hospital-review-overview" aria-labelledby="hospital-review-heading">
        <div className="sa-card-head">
          <div>
            <h2 id="hospital-review-heading">{t('Submitted data review status')}</h2>
            <p>{t('The latest review status of your submitted hospital data.')}</p>
          </div>
        </div>
        <div className="hospital-review-summary">
          <span className="sa-status-text amber"><i aria-hidden="true" />{t('Pending')}: {reviews.pending}</span>
          <span className="sa-status-text teal"><i aria-hidden="true" />{t('Approved')}: {reviews.approved}</span>
          <span className="sa-status-text rose"><i aria-hidden="true" />{t('Changes requested')}: {reviews.changes_requested}</span>
        </div>
        {reviews.submissions.length === 0 ? (
          <div className="sa-table-empty hospital-review-empty">
            <Icon name="fileCheck" size={27} />
            <strong>{t('No submissions for review yet')}</strong>
            <span>{t('Submitted records will appear here with their review status.')}</span>
          </div>
        ) : (
          <div className="sa-table-wrap">
            <table className="sa-table hospital-review-table">
              <thead>
                <tr>
                  <th scope="col">{t('Submitted data')}</th>
                  <th scope="col">{t('Status')}</th>
                  <th scope="col">{t('Submitted')}</th>
                </tr>
              </thead>
              <tbody>
                {reviews.submissions.map((submission) => (
                  <tr key={submission.id}>
                    <td data-label={t('Submitted data')}>{t(submissionType[submission.target_type] || 'Submitted record')}</td>
                    <td data-label={t('Status')}><StatusText status={submission.status} t={t} /></td>
                    <td data-label={t('Submitted')}>
                      {submission.submitted_at
                        ? new Date(submission.submitted_at).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
