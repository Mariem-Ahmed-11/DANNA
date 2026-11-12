import { useEffect, useState } from 'react'
import { apiRequest } from '../api'
import { useLocale } from '../i18n'
import Icon from '../components/Icon'

const reportGroups = [
  {
    key: 'hospitals',
    title: 'Hospitals',
    statuses: [
      ['approved', 'Approved', 'teal'],
      ['pending_review', 'Pending', 'amber'],
      ['rejected', 'Rejected', 'rose'],
      ['suspended', 'Suspended', 'rose'],
    ],
  },
  {
    key: 'data_reviews',
    title: 'Data Review',
    statuses: [
      ['pending_review', 'Pending', 'amber'],
      ['approved_for_publication', 'Approved', 'teal'],
      ['changes_requested', 'Changes requested', 'rose'],
    ],
  },
]

function formatNumber(value, language) {
  return new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en').format(value ?? 0)
}

export default function AdminReports() {
  const { t, language } = useLocale()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    apiRequest('/api/admin/analytics', { signal: controller.signal })
      .then(({ data }) => {
        const counts = [
          data?.hospitals?.total,
          data?.registration_requests?.pending,
          data?.incubators?.units,
          data?.incubators?.total_capacity,
          data?.equipment?.total,
          data?.medical_services?.total,
          ...Object.values(data?.hospitals?.by_status || {}),
          ...Object.values(data?.data_reviews?.by_status || {}),
        ]
        if (!data?.hospitals?.by_status || !data?.data_reviews?.by_status
          || counts.some((value) => !Number.isInteger(value) || value < 0)) {
          throw new Error('The server returned incomplete report data.')
        }
        setReport(data)
        setError('')
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          setError(requestError.message || 'Reports could not be loaded.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [reloadKey])

  function retry() {
    setLoading(true)
    setError('')
    setReloadKey((key) => key + 1)
  }

  return (
    <div className="sa-admin-page">
      <header className="sa-users-heading">
        <div>
          <span className="sa-eyebrow">{t('ADMINISTRATION')}</span>
          <h1>{t('Reports')}</h1>
          <p>{t('Explore registration, capacity and data-review reporting across the network.')}</p>
        </div>
      </header>

      {error && (
        <div className="sa-admin-feedback is-error" role="alert">
          <span>{t(error)}</span>
          <button type="button" className="sa-secondary-button" onClick={retry}>{t('Retry')}</button>
        </div>
      )}

      <section className="sa-report-summary" aria-label={t('Network summary')}>
        {[
          ['Total Hospitals', report?.hospitals?.total],
          ['Registration Requests', report?.registration_requests?.pending],
          ['Incubator Units', report?.incubators?.units],
          ['Total capacity', report?.incubators?.total_capacity],
          ['Equipment', report?.equipment?.total],
          ['Medical Services', report?.medical_services?.total],
        ].map(([label, value], index) => (
          <article className="sa-card sa-report-kpi" key={label}>
            <span className={`sa-report-kpi-icon tone-${index % 3}`}>
              <Icon name={['building', 'clipboard', 'bed'][index % 3]} size={20} />
            </span>
            <span>{t(label)}</span>
            {loading
              ? <i className="sa-skeleton" aria-hidden="true" />
              : error
                ? <strong>{t('Unavailable')}</strong>
                : <strong>{formatNumber(value, language)}</strong>}
          </article>
        ))}
      </section>

      <section className="sa-report-groups">
        {reportGroups.map((group) => (
          <article className="sa-card sa-report-card" key={group.key}>
            <div className="sa-card-head">
              <div>
                <h2>{t(group.title)}</h2>
                <p>{t(group.key === 'hospitals' ? 'Hospital records by current status.' : 'Submissions by current review status.')}</p>
              </div>
            </div>
            {loading ? (
              <div className="sa-report-loading" aria-label={t('Loading report data')}>
                <span className="sa-skeleton" /><span className="sa-skeleton" /><span className="sa-skeleton" />
              </div>
            ) : error ? (
              <p className="sa-report-empty">{t('Report data is unavailable.')}</p>
            ) : (
              <ul className="sa-report-status-list">
                {group.statuses.map(([key, label, tone]) => (
                  <li key={key}>
                    <span className={`sa-status-text ${tone}`}><i aria-hidden="true" />{t(label)}</span>
                    <strong>{formatNumber(report?.[group.key]?.by_status?.[key], language)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </section>
      {!loading && !error && (
        <p className="sa-report-generated">
          {t('Report data reflects the current records in DANNA.')}
        </p>
      )}
    </div>
  )
}
