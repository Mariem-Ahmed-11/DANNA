import { useEffect, useMemo, useState } from 'react'
import { ApiError, apiRequest } from '../api'
import '../App.css'

const typeLabels = {
  hospital_profile: 'Hospital profile',
  incubator_unit: 'Incubator unit capacity',
  hospital_equipment: 'Hospital equipment',
  medical_service: 'Medical service',
}

const statusLabels = {
  pending_review: 'Pending review',
  approved_for_publication: 'Approved for possible publication',
  changes_requested: 'Changes requested',
}

const statusOptions = [
  ['pending_review', 'Pending review'],
  ['approved_for_publication', 'Approved for possible publication'],
  ['changes_requested', 'Changes requested'],
]

const typeOptions = Object.entries(typeLabels)

function formatValue(value) {
  if (value === null || value === undefined || value === '') return 'Not provided'
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'Not provided'
  if (typeof value === 'object') return new Date(value).toLocaleString()
  return String(value)
}

function AdminDataReviews() {
  const [submissions, setSubmissions] = useState([])
  const [selected, setSelected] = useState(null)
  const [history, setHistory] = useState([])
  const [reasons, setReasons] = useState({})
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('pending_review')
  const [hospitalFilter, setHospitalFilter] = useState('all')
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [historyLoadingId, setHistoryLoadingId] = useState(null)
  const [workingId, setWorkingId] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function loadSubmissions() {
      try {
        const payload = await apiRequest('/api/admin/data-reviews', {
          signal: controller.signal,
        })
        if (!Array.isArray(payload.data)) {
          throw new Error('The server returned an invalid review queue.')
        }
        setSubmissions(payload.data)
        setLoadError('')
        setError('')
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setLoadError(requestError.message || 'Review submissions could not be loaded.')
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    loadSubmissions()
    return () => controller.abort()
  }, [reloadKey])

  const hospitals = useMemo(() => {
    const unique = new Map()
    submissions.forEach((submission) => {
      unique.set(submission.hospital_id, submission.hospital_name)
    })
    return [...unique.entries()].sort((first, second) => first[1].localeCompare(second[1]))
  }, [submissions])

  const filteredSubmissions = useMemo(() => {
    return submissions.filter((submission) => (
      (typeFilter === 'all' || submission.target_type === typeFilter)
      && (statusFilter === 'all' || submission.status === statusFilter)
      && (hospitalFilter === 'all' || String(submission.hospital_id) === hospitalFilter)
    ))
  }, [submissions, typeFilter, statusFilter, hospitalFilter])

  async function loadHistory(submission) {
    if (selected === submission.id) {
      setSelected(null)
      setHistory([])
      setError('')
      return
    }

    setError('')
    setSelected(submission.id)
    setHistory([])
    setHistoryLoadingId(submission.id)
    try {
      const payload = await apiRequest(`/api/admin/data-reviews/${submission.id}`)
      setHistory(payload.data.history || [])
    } catch (requestError) {
      setHistory([])
      setSelected(null)
      setError(requestError.message || 'Review history could not be loaded.')
    } finally {
      setHistoryLoadingId(null)
    }
  }

  async function decide(submission, action) {
    setError('')
    setSuccess('')
    setWorkingId(submission.id)

    try {
      const response = await apiRequest(
        `/api/admin/data-reviews/${submission.id}/${action}`,
        {
          method: 'POST',
          ...(action === 'request-changes'
            ? { body: JSON.stringify({ reason: reasons[submission.id] || '' }) }
            : {}),
        }
      )
      setSuccess(response.message || 'Review decision recorded.')
      setIsLoading(true)
      setLoadError('')
      setReloadKey((current) => current + 1)
      if (selected === submission.id) {
        setSelected(null)
        setHistory([])
      }
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 422) {
        const message = requestError.errors?.reason?.[0]
        setError(message || 'The review decision contains invalid information.')
      } else {
        setError(requestError.message || 'The review decision could not be saved.')
      }
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <main className="main-content data-review-page" id="admin-data-reviews-page">
      <header className="topbar">
        <div>
          <span className="breadcrumb">Super Admin / Information review</span>
          <h1>Hospital data review</h1>
          <p>Review submitted hospital information for possible future publication.</p>
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
        Approval applies only to the submitted information snapshot. It does not publish an API,
        approve a hospital account, or verify current equipment or incubator availability.
      </div>

      {success && <div className="hospital-feedback success" role="status">{success}</div>}
      {error && <div className="hospital-feedback error" role="alert">{error}</div>}

      <section className="panel review-filters" aria-label="Filter review submissions">
        <label>
          Hospital
          <select value={hospitalFilter} onChange={(event) => setHospitalFilter(event.target.value)}>
            <option value="all">All hospitals</option>
            {hospitals.map(([id, name]) => <option key={id} value={String(id)}>{name}</option>)}
          </select>
        </label>
        <label>
          Data type
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">All data types</option>
            {typeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          Review status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </section>

      {isLoading ? (
        <div className="panel empty-state">Loading review submissions…</div>
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
      ) : filteredSubmissions.length === 0 ? (
        <div className="panel empty-state">
          {submissions.length === 0
            ? 'No hospital information has been submitted for review.'
            : 'No submissions match these filters.'}
        </div>
      ) : (
        <section className="data-review-list" aria-label="Review submissions">
          {filteredSubmissions.map((submission) => {
            const pending = submission.status === 'pending_review'

            return (
              <article className="panel data-review-card" key={submission.id}>
                <div className="data-review-heading">
                  <div>
                    <span className="eyebrow">
                      {typeLabels[submission.target_type] || submission.target_type}
                      {' · '}{submission.hospital_name}
                    </span>
                    <h2>{submission.snapshot?.name || submission.hospital_name}</h2>
                  </div>
                  <span className={`review-status-badge review-status-${submission.status}`}>
                    {statusLabels[submission.status] || submission.status}
                  </span>
                </div>

                <p className="data-review-meta">
                  Submitted {new Date(submission.submitted_at).toLocaleString()}
                  {submission.reviewer_name && ` · Reviewed by ${submission.reviewer_name}`}
                  {submission.reviewed_at && ` · ${new Date(submission.reviewed_at).toLocaleString()}`}
                </p>

                <dl className="review-snapshot">
                  {Object.entries(submission.snapshot || {}).map(([field, value]) => (
                    value !== null && value !== '' && (
                      <div key={field}>
                        <dt>{field.replaceAll('_', ' ')}</dt>
                        <dd>{formatValue(value)}</dd>
                      </div>
                    )
                  ))}
                </dl>

                {submission.feedback && (
                  <div className="review-feedback">
                    <strong>Previous review feedback</strong>
                    <p>{submission.feedback}</p>
                  </div>
                )}

                <button
                  type="button"
                  className="review-history-toggle"
                  onClick={() => loadHistory(submission)}
                  disabled={historyLoadingId !== null && historyLoadingId !== submission.id}
                  aria-expanded={selected === submission.id}
                >
                  {historyLoadingId === submission.id
                    ? 'Loading review history…'
                    : selected === submission.id
                      ? 'Hide review history'
                      : 'Show review history'}
                </button>

                {selected === submission.id && (
                  <ol className="admin-review-history">
                    {historyLoadingId === submission.id && <li role="status">Loading review history…</li>}
                    {!historyLoadingId && history.length === 0 && <li>No review history is available.</li>}
                    {history.map((entry) => (
                      <li key={entry.id}>
                        <strong>{statusLabels[entry.status] || entry.status}</strong>
                        <span>Submitted {new Date(entry.submitted_at).toLocaleString()}</span>
                        {entry.reviewer_name && <span>Reviewed by {entry.reviewer_name}</span>}
                        {entry.reviewed_at && <span>{new Date(entry.reviewed_at).toLocaleString()}</span>}
                        {entry.feedback && <p>{entry.feedback}</p>}
                      </li>
                    ))}
                  </ol>
                )}

                {pending && (
                  <div className="review-actions">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => decide(submission, 'approve')}
                      disabled={workingId === submission.id}
                    >
                      {workingId === submission.id ? 'Saving…' : 'Approve for possible publication'}
                    </button>
                    <label className="review-reason-field">
                      Reason for requesting changes
                      <textarea
                        rows="2"
                        maxLength={2000}
                        value={reasons[submission.id] || ''}
                        onChange={(event) => setReasons((current) => ({
                          ...current,
                          [submission.id]: event.target.value,
                        }))}
                        aria-label={`Reason for changes to ${submission.snapshot?.name || submission.hospital_name}`}
                        required
                      />
                    </label>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => decide(submission, 'request-changes')}
                      disabled={workingId === submission.id}
                    >
                      Request changes
                    </button>
                  </div>
                )}
              </article>
            )
          })}
        </section>
      )}
    </main>
  )
}

export default AdminDataReviews
