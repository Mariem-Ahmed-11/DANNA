import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { apiRequest } from '../api'
import { useDialogA11y } from '../useDialogA11y'
import '../App.css'

function HospitalRequests() {
  const location = useLocation()
  const [requests, setRequests] = useState([])
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [workingId, setWorkingId] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [decision, setDecision] = useState(null)
  const [reasonError, setReasonError] = useState('')

  const rejectionDialogRef = useDialogA11y(Boolean(decision), () => {
    if (workingId === decision?.hospital.id) return
    setDecision(null)
  })

  useEffect(() => {
    const controller = new AbortController()

    async function fetchRequests() {
      try {
        const payload = await apiRequest('/api/admin/hospital-requests', {
          signal: controller.signal,
        })
        if (!Array.isArray(payload.data)) {
          throw new Error('The server returned an invalid hospital request list.')
        }
        setRequests(payload.data)
        setLoadError('')
        setActionError('')
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setLoadError(requestError.message || 'Hospital requests could not be loaded.')
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    fetchRequests()
    return () => controller.abort()
  }, [reloadKey])

  async function review(hospitalId, action, reason = null) {
    setWorkingId(hospitalId)
    setActionError('')
    try {
      await apiRequest(`/api/admin/hospitals/${hospitalId}/${action}`, {
        method: 'POST',
        ...(reason ? { body: JSON.stringify({ reason }) } : {}),
      })
      setRequests((current) => current.filter((hospital) => hospital.id !== hospitalId))
      setDecision(null)
    } catch (requestError) {
      if (requestError.status === 422 && requestError.errors?.reason) {
        setReasonError(requestError.errors.reason[0])
      } else {
        setActionError(requestError.message || 'The hospital review could not be saved.')
      }
    } finally {
      setWorkingId(null)
    }
  }

  function submitRejection(event) {
    event.preventDefault()
    const reason = decision?.reason?.trim() || ''
    if (reason.length < 10) {
      setReasonError('Provide a meaningful reason of at least 10 characters.')
      return
    }
    review(decision.hospital.id, 'reject', reason)
  }

  return (
    <main className="main-content" id="hospital-requests-page">
      <header className="topbar">
        <div>
          <span className="breadcrumb">Workspace / Hospital requests</span>
          <h1>Registration requests</h1>
          <p>Review and decide on hospital account applications.</p>
        </div>
      </header>

      {location.state?.message && (
        <div className="hospital-feedback success" role="status">{location.state.message}</div>
      )}
      {actionError && <div className="hospital-feedback error" role="alert">{actionError}</div>}

      <section className="panel hospitals-directory">
        <div className="directory-toolbar">
          <div>
            <h2>Pending review</h2>
            <p>
              {isLoading
                ? 'Loading requests…'
                : loadError
                  ? 'Requests unavailable'
                  : `${requests.length} pending`}
            </p>
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
        </div>
        <div className="hospital-table-wrapper">
          <table className="hospital-table">
            <thead>
              <tr><th>Hospital</th><th>City</th><th>Phone</th><th>Responsible staff</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan="5" className="no-hospitals">Loading hospital requests…</td></tr>
              ) : loadError ? (
                <tr>
                  <td colSpan="5" className="no-hospitals" role="alert">
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
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr><td colSpan="5" className="no-hospitals">There are no pending hospital requests.</td></tr>
              ) : requests.map((hospital) => {
                const contact = hospital.users?.[0]
                return (
                  <tr key={hospital.id}>
                    <td><strong>{hospital.name}</strong></td>
                    <td>{hospital.city}</td>
                    <td>{hospital.phone || 'Not provided'}</td>
                    <td>{contact ? `${contact.name} · ${contact.email}` : 'No contact attached'}</td>
                    <td>
                      <div className="hospital-review-actions">
                        <Link className="secondary-button" to={`/hospital-requests/${hospital.id}`}>
                          View details
                        </Link>
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => {
                            if (window.confirm(`Approve ${hospital.name} and activate its pending Hospital Admin account?`)) {
                              review(hospital.id, 'approve')
                            }
                          }}
                          disabled={workingId === hospital.id}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => {
                            setReasonError('')
                            setDecision({ hospital, reason: '' })
                          }}
                          disabled={workingId === hospital.id}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
      {decision && (
        <div className="lifecycle-dialog-backdrop">
          <section ref={rejectionDialogRef} tabIndex={-1} className="lifecycle-dialog" role="dialog" aria-modal="true" aria-labelledby="reject-hospital-title">
            <h2 id="reject-hospital-title">Reject {decision.hospital.name}</h2>
            <p>This reason will be visible to the hospital administrator and saved in decision history.</p>
            <form onSubmit={submitRejection}>
              <label htmlFor="hospital-rejection-reason">Reason for rejection</label>
              <textarea
                id="hospital-rejection-reason"
                required
                minLength={10}
                maxLength={2000}
                rows={5}
                value={decision.reason}
                aria-invalid={Boolean(reasonError)}
                onChange={(event) => {
                  setDecision((current) => ({ ...current, reason: event.target.value }))
                  setReasonError('')
                }}
              />
              {reasonError && <span className="hospital-field-error" role="alert">{reasonError}</span>}
              <div className="profile-form-actions">
                <button className="primary-button lifecycle-dialog-submit" type="submit" disabled={workingId === decision.hospital.id}>
                  {workingId === decision.hospital.id ? 'Saving…' : 'Confirm rejection'}
                </button>
                <button className="secondary-button" type="button" onClick={() => setDecision(null)} disabled={workingId === decision.hospital.id}>
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}

export default HospitalRequests
