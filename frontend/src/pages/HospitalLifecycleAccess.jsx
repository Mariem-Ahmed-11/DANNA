import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiRequest } from '../api'
import { useAuth } from '../auth'
import { useLocale } from '../i18n'
import '../App.css'

function HospitalLifecycleAccess({ status }) {
  const { language } = useLocale()
  const [decision, setDecision] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const { logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const controller = new AbortController()

    async function loadDecision() {
      try {
        const payload = await apiRequest('/api/hospital/lifecycle-status', {
          signal: controller.signal,
        })
        setDecision(payload.data)
        setError('')
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setError(requestError.message || 'Hospital status details could not be loaded.')
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    loadDecision()
    return () => controller.abort()
  }, [reloadKey])

  async function signOut() {
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch (logoutError) {
      setError(logoutError.message || 'Sign out failed. Please try again.')
    }
  }

  const rejected = status === 'rejected'

  return (
    <main className="main-content lifecycle-restricted-page">
      <header className="topbar">
        <div>
          <span className="breadcrumb">Hospital workspace / Account status</span>
          <h1>{rejected ? 'Registration requires updates' : 'Hospital account suspended'}</h1>
          <p>
            {rejected
              ? 'Your hospital is not approved. Review the decision, update the permitted profile information, and resubmit for review.'
              : 'Hospital operations are unavailable while this account is suspended.'}
          </p>
        </div>
      </header>

      {error && (
        <div className="hospital-feedback error" role="alert">
          <span>{error}</span>
          {!isLoading && !decision && (
            <button type="button" className="hospital-retry" onClick={() => {
              setIsLoading(true)
              setReloadKey((current) => current + 1)
            }}>
              Retry
            </button>
          )}
        </div>
      )}
      <section className="panel lifecycle-decision-panel">
        {isLoading ? (
          <p role="status">Loading hospital decision…</p>
        ) : (
          <>
            <span className={`hospital-status ${status}`}>{status.replaceAll('_', ' ')}</span>
            <h2>{decision?.hospital_name || 'Hospital status'}</h2>
            {decision?.decision ? (
              <>
                <p className="lifecycle-reason-label">
                  {rejected ? 'Reason for rejection' : 'Reason for suspension'}
                </p>
                <blockquote>{decision.decision.reason}</blockquote>
                <p className="lifecycle-date">
                  Decision recorded {new Date(decision.decision.created_at).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US')}
                </p>
              </>
            ) : (
              <p>The decision details are not currently available.</p>
            )}
            {rejected && decision?.can_resubmit && (
              <Link className="primary-button lifecycle-action-button" to="/hospital-corrections">
                Review and correct hospital information
              </Link>
            )}
          </>
        )}
      </section>

      <button type="button" className="secondary-button lifecycle-signout" onClick={signOut}>
        Sign out
      </button>
    </main>
  )
}

export default HospitalLifecycleAccess
