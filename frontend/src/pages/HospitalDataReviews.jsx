import { useEffect, useState } from 'react'
import { ApiError, apiRequest } from '../api'
import { useAuth } from '../auth'
import { useLocale } from '../i18n'
import '../App.css'

const typeLabels = {
  hospital_profile: 'Hospital profile',
  incubator_unit: 'Incubator unit capacity',
  hospital_equipment: 'Hospital equipment',
  medical_service: 'Medical service',
}

const statusLabels = {
  not_submitted: 'Not submitted',
  pending_review: 'Pending review',
  approved_for_publication: 'Approved for possible publication',
  changes_requested: 'Changes requested',
}

function HospitalDataReviews() {
  const { user } = useAuth()
  const { language } = useLocale()
  const dateLocale = language === 'ar' ? 'ar-EG' : 'en-US'
  const [records, setRecords] = useState([])
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [submittingKey, setSubmittingKey] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function loadReviews() {
      try {
        const payload = await apiRequest('/api/hospital/data-reviews', {
          signal: controller.signal,
        })
        if (!Array.isArray(payload.data)) {
          throw new Error('The server returned an invalid review-status list.')
        }
        setRecords(payload.data)
        setLoadError('')
        setError('')
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setLoadError(requestError.message || 'Review statuses could not be loaded.')
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    loadReviews()
    return () => controller.abort()
  }, [reloadKey])

  async function submitForReview(record) {
    const key = `${record.target_type}:${record.target_id}`
    setSubmittingKey(key)
    setError('')
    setSuccess('')

    try {
      const response = await apiRequest(
        `/api/hospital/data-reviews/${record.target_type}/${record.target_id}`,
        { method: 'POST' }
      )
      setSuccess(response.message || 'Information submitted for review.')
      setIsLoading(true)
      setLoadError('')
      setReloadKey((current) => current + 1)
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 422) {
        setError('The submission included invalid review metadata. Refresh and try again.')
      } else {
        setError(requestError.message || 'Information could not be submitted for review.')
      }
    } finally {
      setSubmittingKey('')
    }
  }

  return (
    <main className="main-content data-review-page" id="hospital-data-reviews-page">
      <header className="topbar">
        <div>
          <span className="breadcrumb">Hospital workspace / Data review</span>
          <h1>Information review</h1>
          <p>Submit your hospital-reported information for DHANA review.</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setIsLoading(true)
            setLoadError('')
            setReloadKey((current) => current + 1)
          }}
          disabled={isLoading}
        >
          {isLoading ? 'Loading…' : 'Refresh'}
        </button>
      </header>

      <div className="availability-notice" role="note">
        Review status is separate from hospital account approval and does not confirm current
        availability, clinical suitability, or admission. Availability remains hospital-reported
        with its own last-reported timestamp.
      </div>

      {success && <div className="hospital-feedback success" role="status">{success}</div>}
      {error && <div className="hospital-feedback error" role="alert">{error}</div>}

      {isLoading ? (
        <div className="panel empty-state" role="status">Loading review statuses…</div>
      ) : loadError ? (
        <div className="panel empty-state" role="alert">
          <p>{loadError}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setIsLoading(true)
              setLoadError('')
              setReloadKey((current) => current + 1)
            }}
          >
            Retry
          </button>
        </div>
      ) : records.length === 0 ? (
        <div className="panel empty-state">
          Add a hospital profile, unit, equipment item, or medical service before submitting information for review.
        </div>
      ) : (
        <section className="data-review-list" aria-label="Hospital information review statuses">
          {records.map((record) => {
            const key = `${record.target_type}:${record.target_id}`
            const pending = record.review_status === 'pending_review'

            return (
              <article className="panel data-review-card" key={key}>
                <div className="data-review-heading">
                  <div>
                    <span className="eyebrow">{typeLabels[record.target_type] || record.target_type}</span>
                    <h2>{record.title}</h2>
                  </div>
                  <span className={`review-status-badge review-status-${record.review_status}`}>
                    {statusLabels[record.review_status] || record.review_status}
                  </span>
                </div>

                {record.last_submitted_at && (
                  <p className="data-review-meta">
                    Last submitted: {new Date(record.last_submitted_at).toLocaleString(dateLocale)}
                  </p>
                )}

                {record.current_version_changed && (
                  <div className="review-feedback">
                    <strong>Current information differs from the submitted version.</strong>
                    <p>
                      {record.review_status === 'pending_review'
                        ? 'The pending submission must be reviewed before a corrected version can be submitted.'
                        : 'Submit the updated information for a new review. The previous decision does not apply to this version.'}
                    </p>
                  </div>
                )}

                {record.latest_feedback && (
                  <div className="review-feedback">
                    <strong>Reviewer feedback</strong>
                    <p>{record.latest_feedback}</p>
                  </div>
                )}

                {record.history?.length > 0 && (
                  <details className="review-history">
                    <summary>Review history ({record.history.length})</summary>
                    <ul>
                      {record.history.map((entry, index) => (
                        <li key={`${entry.submitted_at}-${index}`}>
                          <strong>{statusLabels[entry.status] || entry.status}</strong>
                          <span>Submitted {new Date(entry.submitted_at).toLocaleString(dateLocale)}</span>
                          {entry.reviewed_at && <span>Reviewed {new Date(entry.reviewed_at).toLocaleString(dateLocale)}</span>}
                          {entry.feedback && <p>{entry.feedback}</p>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {record.target_type === 'hospital_profile' && user?.role !== 'hospital_admin' ? (
                  <p className="data-review-meta">Only a Hospital Admin can submit the hospital profile for review.</p>
                ) : (
                  <button
                    type="button"
                    className="primary-button"
                    disabled={pending || submittingKey === key}
                    onClick={() => submitForReview(record)}
                  >
                    {submittingKey === key
                      ? 'Submitting…'
                      : pending
                        ? 'Awaiting review'
                        : record.review_status === 'changes_requested'
                          ? 'Resubmit corrected information'
                          : record.review_status === 'approved_for_publication'
                            ? 'Submit updated information'
                            : 'Submit for review'}
                  </button>
                )}
              </article>
            )
          })}
        </section>
      )}
    </main>
  )
}

export default HospitalDataReviews
