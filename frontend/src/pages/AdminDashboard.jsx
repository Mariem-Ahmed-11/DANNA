import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../api'
import { useLocale } from '../i18n'
import Icon from '../components/Icon'

const TREND_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const TREND_SERIES = {
  approved: [3, 2.6, 3.1, 4, 4.5, 3.8, 4.5, 5, 5.6, 6.2, 6.9, 8],
  pending: [2, 1.5, 2.2, 1.8, 2.4, 2, 2.7, 2.2, 2.8, 2.4, 3, 2.6],
  rejected: [1.2, 1.5, 1, 1.8, 1.4, 2, 1.7, 2.2, 1.9, 2.6, 2.2, 3.5],
}

const SERIES_META = [
  { key: 'approved', label: 'Approved', color: '#0a8f9b', fill: 'url(#saAreaApproved)' },
  { key: 'pending', label: 'Pending', color: '#e2a43d', fill: 'url(#saAreaPending)' },
  { key: 'rejected', label: 'Rejected', color: '#df7187', fill: 'url(#saAreaRejected)' },
]

const STATUS_META = {
  approved: { label: 'Active', tone: 'teal' },
  pending_review: { label: 'Pending', tone: 'amber' },
  rejected: { label: 'Rejected', tone: 'rose' },
  suspended: { label: 'Suspended', tone: 'red' },
}

const EMPTY_ANALYTICS = {
  hospitals: {
    total: 0,
    by_status: { approved: 0, pending_review: 0, rejected: 0, suspended: 0 },
  },
  registration_requests: { pending: 0 },
  incubators: {
    units: 0,
    total_capacity: 0,
    hospital_reported_available_capacity: 0,
  },
  data_reviews: {
    total: 0,
    by_status: {
      pending_review: 0,
      approved_for_publication: 0,
      changes_requested: 0,
    },
  },
}

function formatNumber(value, language = 'en') {
  return new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en').format(value ?? 0)
}

function timeAgo(value, language) {
  if (!value) return ''

  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return ''

  const diffSeconds = (then - Date.now()) / 1000
  const formatter = new Intl.RelativeTimeFormat(language === 'ar' ? 'ar' : 'en', {
    numeric: 'auto',
  })

  if (Math.abs(diffSeconds) < 60) return formatter.format(0, 'second')
  if (Math.abs(diffSeconds) < 3600) return formatter.format(Math.round(diffSeconds / 60), 'minute')
  if (Math.abs(diffSeconds) < 86400) return formatter.format(Math.round(diffSeconds / 3600), 'hour')
  if (Math.abs(diffSeconds) < 2592000) return formatter.format(Math.round(diffSeconds / 86400), 'day')

  return new Date(value).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

function buildSmoothPath(points) {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  let path = `M ${points[0].x} ${points[0].y}`

  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] || points[index]
    const p1 = points[index]
    const p2 = points[index + 1]
    const p3 = points[index + 2] || p2

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
  }

  return path
}

function TrendChart({ hiddenSeries, onToggle, loading }) {
  const { t, language } = useLocale()
  const [hovered, setHovered] = useState(null)

  const width = 640
  const height = 210
  const padding = { top: 16, right: 16, bottom: 30, left: 30 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const baseline = padding.top + plotHeight
  const maxValue = 10

  const points = useMemo(() => {
    return SERIES_META.reduce((seriesMap, series) => {
      seriesMap[series.key] = TREND_SERIES[series.key].map((value, index) => ({
        x: padding.left + (plotWidth / (TREND_MONTHS.length - 1)) * index,
        y: padding.top + (1 - value / maxValue) * plotHeight,
        value,
      }))
      return seriesMap
    }, {})
  }, [padding.left, padding.top, plotHeight, plotWidth])

  const gridValues = [0, 2, 4, 6, 8, 10]

  function handlePointerMove(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    if (!rect.width) return
    const x = ((event.clientX - rect.left) / rect.width) * width
    const clamped = Math.max(padding.left, Math.min(width - padding.right, x))
    const index = Math.round(((clamped - padding.left) / plotWidth) * (TREND_MONTHS.length - 1))
    setHovered(index)
  }

  const hoveredX = hovered === null
    ? null
    : padding.left + (plotWidth / (TREND_MONTHS.length - 1)) * hovered

  const visibleSeries = SERIES_META.filter((series) => !hiddenSeries[series.key])
  const tooltipY = hovered === null || !visibleSeries.length
    ? 0
    : Math.min(...visibleSeries.map((series) => points[series.key][hovered].y))
  const tooltipAbove = tooltipY > height * 0.38
  const tooltipLeft = hoveredX === null
    ? 0
    : Math.min(Math.max(hoveredX, width * 0.11), width * 0.89)

  return (
    <div className="sa-chart">
      <div className="sa-card-head sa-chart-head">
        <div>
          <h2>{t('Hospital Registration Trends')}</h2>
          <p>{t('Monthly registration requests across the DANNA network.')}</p>
        </div>
        <div className="sa-legend" aria-label={t('Chart legend')}>
          {SERIES_META.map((series) => (
            <button
              aria-pressed={!hiddenSeries[series.key]}
              className={`sa-legend-item ${hiddenSeries[series.key] ? 'is-muted' : ''}`}
              key={series.key}
              onClick={() => onToggle(series.key)}
              type="button"
            >
              <span className="sa-legend-mark" style={{ '--series-color': series.color }} />
              {t(series.label)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="sa-chart-skeleton" aria-hidden="true">
          <span /><span /><span /><span /><span />
        </div>
      ) : (
        <div className="sa-chart-canvas">
          <svg
            aria-label={t('Hospital registration trends line chart')}
            onMouseLeave={() => setHovered(null)}
            onMouseMove={handlePointerMove}
            role="img"
            viewBox={`0 0 ${width} ${height}`}
          >
            <defs>
              <linearGradient id="saAreaApproved" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#0a8f9b" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#0a8f9b" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="saAreaPending" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#e2a43d" stopOpacity="0.13" />
                <stop offset="100%" stopColor="#e2a43d" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="saAreaRejected" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#df7187" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#df7187" stopOpacity="0" />
              </linearGradient>
            </defs>

            {gridValues.map((value) => {
              const y = padding.top + (1 - value / maxValue) * plotHeight
              return (
                <g key={value}>
                  <line
                    className="sa-grid-line"
                    x1={padding.left}
                    x2={width - padding.right}
                    y1={y}
                    y2={y}
                  />
                  <text className="sa-axis-label" textAnchor="end" x={padding.left - 9} y={y + 3.5}>
                    {value}
                  </text>
                </g>
              )
            })}

            {TREND_MONTHS.map((month, index) => {
              const x = padding.left + (plotWidth / (TREND_MONTHS.length - 1)) * index
              return (
                <text
                  className="sa-axis-label sa-axis-month"
                  key={month}
                  textAnchor="middle"
                  x={x}
                  y={height - 8}
                >
                  {t(month)}
                </text>
              )
            })}

            {SERIES_META.filter((series) => !hiddenSeries[series.key]).map((series) => {
              const seriesPoints = points[series.key]
              const linePath = buildSmoothPath(seriesPoints)
              const areaPath = `${linePath} L ${seriesPoints[seriesPoints.length - 1].x} ${baseline} L ${seriesPoints[0].x} ${baseline} Z`

              return (
                <g key={series.key}>
                  <path d={areaPath} fill={series.fill} />
                  <path
                    d={linePath}
                    fill="none"
                    stroke={series.color}
                    strokeLinecap="round"
                    strokeWidth="2"
                  />
                  {series.key === 'approved' && seriesPoints.map((point, index) => (
                    <circle
                      cx={point.x}
                      cy={point.y}
                      fill="#ffffff"
                      key={`${series.key}-${index}`}
                      r="2.6"
                      stroke={series.color}
                      strokeWidth="1.7"
                    />
                  ))}
                </g>
              )
            })}

            {hovered !== null && (
              <g>
                <line
                  className="sa-hover-line"
                  x1={hoveredX}
                  x2={hoveredX}
                  y1={padding.top}
                  y2={baseline}
                />
                {SERIES_META.filter((series) => !hiddenSeries[series.key]).map((series) => {
                  const point = points[series.key][hovered]
                  return (
                    <circle
                      cx={point.x}
                      cy={point.y}
                      fill={series.color}
                      key={`hover-${series.key}`}
                      r="4.3"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  )
                })}
              </g>
            )}
          </svg>

          {hovered !== null && (
            <div
              className="sa-chart-tooltip"
              style={{
                left: `${(tooltipLeft / width) * 100}%`,
                top: `${(tooltipY / height) * 100}%`,
                transform: tooltipAbove
                  ? 'translate(-50%, calc(-100% - 12px))'
                  : 'translate(-50%, 14px)',
              }}
            >
              <strong>{t(TREND_MONTHS[hovered])}</strong>
              {visibleSeries.map((series) => (
                <span key={series.key}>
                  <i style={{ background: series.color }} />
                  {t(series.label)}
                  <b>{formatNumber(TREND_SERIES[series.key][hovered], language)}</b>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatusDonut({ data, loading }) {
  const { t, language } = useLocale()

  const segments = [
    { key: 'approved', label: 'Active', color: '#0a8f9b', value: data.by_status.approved ?? 0 },
    { key: 'pending', label: 'Pending', color: '#e2a43d', value: data.by_status.pending_review ?? 0 },
    { key: 'suspended', label: 'Suspended', color: '#df7187', value: data.by_status.suspended ?? 0 },
  ]

  if ((data.by_status.rejected ?? 0) > 0) {
    segments.push({
      key: 'rejected',
      label: 'Rejected',
      color: '#b45d70',
      value: data.by_status.rejected,
    })
  }

  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  const radius = 56
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="sa-status">
      <div className="sa-card-head">
        <div>
          <h2>{t('Hospital Status')}</h2>
          <p>{t('Approval state across the network.')}</p>
        </div>
        <Link className="sa-text-link" to="/hospitals">
          {t('View all')}
          <Icon name="arrowRight" size={14} />
        </Link>
      </div>

      <div className="sa-donut-layout">
        <div className="sa-donut">
          {loading ? (
            <div className="sa-donut-skeleton" aria-hidden="true" />
          ) : (
            <>
              <svg aria-hidden="true" viewBox="0 0 150 150">
                <circle
                  cx="75"
                  cy="75"
                  fill="none"
                  r={radius}
                  stroke="#edf3f4"
                  strokeWidth="17"
                />
                {segments.map((segment) => {
                  if (!segment.value || !total) return null
                  const length = (segment.value / total) * circumference
                  const dash = Math.max(length - (length > 8 ? 3 : 0), 0.5)
                  const dashOffset = -offset
                  offset += length

                  return (
                    <circle
                      cx="75"
                      cy="75"
                      fill="none"
                      key={segment.key}
                      r={radius}
                      stroke={segment.color}
                      strokeDasharray={`${dash} ${circumference - dash}`}
                      strokeDashoffset={dashOffset}
                      strokeWidth="17"
                      transform="rotate(-90 75 75)"
                    />
                  )
                })}
              </svg>
              <span className="sa-donut-center">
                <strong>{formatNumber(total, language)}</strong>
                <small>{t('Total Hospitals')}</small>
              </span>
            </>
          )}
        </div>

        <ul className="sa-status-legend">
          {segments.map((segment) => (
            <li key={segment.key}>
              <span className="sa-status-dot" style={{ background: segment.color }} />
              <span className="sa-status-name">{t(segment.label)}</span>
              <strong>{formatNumber(segment.value, language)}</strong>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function KpiCard({ icon, tone, label, value, note, trend, trendTone, to, loading }) {
  const { t, language } = useLocale()

  return (
    <article className="sa-kpi">
      <div className={`sa-kpi-icon ${tone}`}>
        <Icon name={icon} size={26} />
      </div>
      <div className="sa-kpi-body">
        <span className="sa-kpi-label">{t(label)}</span>
        {loading ? (
          <span className="sa-skeleton sa-kpi-skeleton" aria-hidden="true" />
        ) : (
          <strong className="sa-kpi-value">{formatNumber(value, language)}</strong>
        )}
        <span className={`sa-kpi-trend ${trendTone || ''}`}>
          <Icon name={trendTone === 'warn' ? 'clock' : 'arrowUpRight'} size={12} />
          {t(trend)}
        </span>
      </div>
      <Link aria-label={`${t('Open')} ${t(label)}`} className="sa-kpi-arrow" to={to}>
        <Icon name="chevronRight" size={14} />
      </Link>
      <span className="sa-kpi-note">{note}</span>
    </article>
  )
}

export default function AdminDashboard() {
  const { t, language } = useLocale()
  const [analytics, setAnalytics] = useState(null)
  const [hospitals, setHospitals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [hiddenSeries, setHiddenSeries] = useState({})
  const [openMenu, setOpenMenu] = useState(null)
  const [activity, setActivity] = useState([])
  const [activityLoading, setActivityLoading] = useState(true)
  const [activityError, setActivityError] = useState('')

  const loadData = useCallback(async (signal) => {
    try {
      const [analyticsPayload, hospitalsPayload] = await Promise.all([
        apiRequest('/api/admin/analytics', { signal }),
        apiRequest('/api/hospitals', { signal }),
      ])

      setAnalytics(analyticsPayload.data)
      setHospitals(Array.isArray(hospitalsPayload.data) ? hospitalsPayload.data : [])
    } catch (requestError) {
      if (requestError.name !== 'AbortError') {
        setError(t(requestError.message || 'Dashboard data could not be loaded.'))
      }
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [t])

  useEffect(() => {
    const controller = new AbortController()
    // The fetch helper only updates state after the request settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData(controller.signal)
    return () => controller.abort()
  }, [loadData, reloadKey])

  useEffect(() => {
    if (openMenu === null) return undefined

    function closeMenu() {
      setOpenMenu(null)
    }

    document.addEventListener('pointerdown', closeMenu)
    return () => document.removeEventListener('pointerdown', closeMenu)
  }, [openMenu])

  useEffect(() => {
    const controller = new AbortController()
    apiRequest('/api/admin/audit-logs', { signal: controller.signal })
      .then((payload) => {
        if (!Array.isArray(payload.data)) {
          throw new Error('The server returned incomplete audit log data.')
        }
        setActivity(payload.data.slice(0, 5))
        setActivityError('')
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          setActivityError(requestError.message || 'Recent activity could not be loaded.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setActivityLoading(false)
      })
    return () => controller.abort()
  }, [])

  const data = analytics || EMPTY_ANALYTICS
  const recentHospitals = useMemo(
    () => [...hospitals]
      .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
      .slice(0, 5),
    [hospitals]
  )

  const kpis = [
    {
      icon: 'building',
      tone: 'teal',
      label: 'Total Hospitals',
      value: data.hospitals.total,
      note: t('Across all account statuses'),
      trend: 'Live network',
      to: '/hospitals',
    },
    {
      icon: 'clipboard',
      tone: 'amber',
      label: 'Registration Requests',
      value: data.registration_requests.pending,
      note: t('Awaiting Super Admin review'),
      trend: 'Onboarding queue',
      trendTone: 'warn',
      to: '/hospital-requests',
    },
    {
      icon: 'bed',
      tone: 'blue',
      label: 'Incubator Units',
      value: data.incubators.units,
      note: t('{count} total reported capacity', {
        count: formatNumber(data.incubators.total_capacity, language),
      }),
      trend: 'Hospital reported',
      to: '/hospitals',
    },
    {
      icon: 'fileCheck',
      tone: 'rose',
      label: 'Pending Data Reviews',
      value: data.data_reviews.by_status.pending_review,
      note: t('{count} total review submissions', {
        count: formatNumber(data.data_reviews.total, language),
      }),
      trend: 'Needs a decision',
      trendTone: 'warn',
      to: '/data-reviews',
    },
  ]

  const quickActions = [
    {
      icon: 'plus',
      title: 'Add Hospital',
      subtitle: 'Register a new hospital',
      to: '/hospitals',
      solid: true,
    },
    {
      icon: 'clipboard',
      title: 'Review Requests',
      subtitle: 'Manage pending requests',
      to: '/hospital-requests',
    },
    {
      icon: 'shield',
      title: 'Review Data',
      subtitle: 'Check submissions',
      to: '/data-reviews',
    },
    {
      icon: 'users',
      title: 'Manage Users',
      subtitle: 'Add or manage accounts',
      to: '/users',
    },
  ]

  function toggleSeries(key) {
    setHiddenSeries((current) => ({ ...current, [key]: !current[key] }))
  }

  return (
    <div className="sa-dashboard">
      {error && (
        <div className="sa-data-error" role="alert">
          <span>
            <Icon name="alertCircle" size={18} />
            {t(error)}
          </span>
          <button
            onClick={() => {
              setLoading(true)
              setError('')
              setReloadKey((current) => current + 1)
            }}
            type="button"
          >
            {t('Retry')}
          </button>
        </div>
      )}

      <div className="sa-layout">
        <div className="sa-main-col">
          <section className="sa-hero">
        <img
          alt={t('Newborn baby receiving care in a neonatal incubator')}
          className="sa-hero-photo"
          src="/assets/hero-nicu.jpg"
        />
        <span aria-hidden="true" className="sa-hero-wash" />
        <span aria-hidden="true" className="sa-hero-glow" />

        <div className="sa-hero-copy">
          <span className="sa-eyebrow">
            <span className="sa-double-chevron">
              <Icon name="chevronRight" size={11} />
              <Icon name="chevronRight" size={11} />
            </span>
            {t('DANNA HEALTHCARE PLATFORM')}
          </span>
          <h1>
            {t('Smarter Coordination.')}
            <br />
            {t('Better Neonatal Care.')}
          </h1>
          <p>{t('Connecting hospitals, families and healthcare providers for a safer tomorrow.')}</p>
          <div className="sa-hero-actions">
            <Link className="sa-primary-button" to="/hospitals">
              {t('Explore Hospitals')}
              <Icon name="arrowRight" size={17} />
            </Link>
          </div>
        </div>

        <div className="sa-hero-badge">
          <span className="sa-hero-badge-icon">
            <Icon name="heartShield" size={22} />
          </span>
          <span>
            {t('Advanced technology. Compassionate care.')}
            <i />
          </span>
        </div>
      </section>

      <section aria-label={t('Key performance indicators')} className="sa-kpis">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} loading={loading} {...kpi} />
        ))}
      </section>

      <section className="sa-mid-grid">
        <article className="sa-card sa-chart-card">
          <TrendChart hiddenSeries={hiddenSeries} loading={loading} onToggle={toggleSeries} />
        </article>
        <article className="sa-card">
          <StatusDonut data={data.hospitals} loading={loading} />
        </article>
      </section>

      <section className="sa-bottom-grid">
        <article className="sa-card sa-table-card">
          <div className="sa-card-head">
            <div>
              <h2>{t('Recent Hospitals')}</h2>
              <p>{t('The latest facilities added to DANNA.')}</p>
            </div>
            <Link className="sa-text-link" to="/hospitals">
              {t('View all')}
              <Icon name="arrowRight" size={14} />
            </Link>
          </div>

          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>{t('Hospital Name')}</th>
                  <th>{t('City')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('Last Updated')}</th>
                  <th aria-label={t('Actions')} />
                </tr>
              </thead>
              <tbody>
                {loading && Array.from({ length: 4 }).map((_, index) => (
                  <tr className="sa-table-skeleton-row" key={`skeleton-${index}`}>
                    <td><span className="sa-skeleton" /></td>
                    <td><span className="sa-skeleton" /></td>
                    <td><span className="sa-skeleton" /></td>
                    <td><span className="sa-skeleton" /></td>
                    <td />
                  </tr>
                ))}

                {!loading && recentHospitals.length === 0 && (
                  <tr>
                    <td className="sa-table-empty" colSpan="5">
                      <Icon name="building" size={22} />
                      {t('No hospitals have been registered yet.')}
                    </td>
                  </tr>
                )}

                {!loading && recentHospitals.map((hospital, index) => {
                  const meta = STATUS_META[hospital.status] || STATUS_META.pending_review
                  return (
                    <tr key={hospital.id}>
                      <td>
                        <div className="sa-hospital-cell">
                          <span className={`sa-hospital-thumb tone-${index % 4}`}>
                            <Icon name="building" size={17} />
                          </span>
                          <Link className="sa-hospital-name" to="/hospitals">
                            {hospital.name}
                          </Link>
                        </div>
                      </td>
                      <td className="sa-muted-cell">{hospital.city}</td>
                      <td>
                        <span className={`sa-status-text ${meta.tone}`}>
                          <i />
                          {t(meta.label)}
                        </span>
                      </td>
                      <td className="sa-muted-cell">{timeAgo(hospital.updated_at, language)}</td>
                      <td className="sa-actions-cell">
                        <button
                          aria-expanded={openMenu === hospital.id}
                          aria-label={`${t('Actions for')} ${hospital.name}`}
                          className="sa-kebab"
                          onClick={(event) => {
                            event.stopPropagation()
                            setOpenMenu((current) => current === hospital.id ? null : hospital.id)
                          }}
                          type="button"
                        >
                          <Icon name="more" size={18} />
                        </button>
                        {openMenu === hospital.id && (
                          <div className="sa-row-menu" onPointerDown={(event) => event.stopPropagation()} role="menu">
                            <Link onClick={() => setOpenMenu(null)} role="menuitem" to="/hospitals">
                              <Icon name="building" size={15} />
                              {t('View')}
                            </Link>
                            <Link onClick={() => setOpenMenu(null)} role="menuitem" to="/hospitals">
                              <Icon name="settings" size={15} />
                              {t('Edit')}
                            </Link>
                            <Link onClick={() => setOpenMenu(null)} role="menuitem" to="/hospitals">
                              <Icon name="alertCircle" size={15} />
                              {t('Suspend')}
                            </Link>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </article>

        <article className="sa-card sa-quick-card">
          <div className="sa-card-head">
            <div>
              <h2>{t('Quick Actions')}</h2>
              <p>{t('Shortcuts for daily administration.')}</p>
            </div>
          </div>

          <div className="sa-quick-list">
            {quickActions.map((action) => (
              <Link className="sa-quick-action" key={action.title} to={action.to}>
                <span className={`sa-quick-icon ${action.solid ? 'is-solid' : ''}`}>
                  <Icon name={action.icon} size={17} />
                </span>
                <span>
                  <strong>{t(action.title)}</strong>
                  <small>{t(action.subtitle)}</small>
                </span>
                <Icon className="sa-quick-arrow" name="chevronRight" size={15} />
              </Link>
            ))}
          </div>
        </article>
      </section>

        </div>

        <aside aria-label={t('Platform information')} className="sa-rail">
          <article className="sa-card sa-about-card">
          <img
            alt={t('Modern hospital building')}
            className="sa-about-photo"
            loading="lazy"
            src="/assets/hospital-building.jpg"
          />
          <div className="sa-about-body">
            <h2>DANNA</h2>
            <strong>{t('Neonatal Care Hospital Management')}</strong>
            <p>
              {t('A comprehensive platform for managing neonatal care hospitals, ensuring better resources, higher standards and improved outcomes for every newborn.')}
            </p>
            <Link className="sa-soft-button" to="/about-danna">
              {t('About DANNA')}
              <Icon name="arrowRight" size={15} />
            </Link>
          </div>
        </article>

        <article className="sa-card sa-activity-card">
          <div className="sa-card-head">
            <h2>{t('Recent Activity')}</h2>
            <Link className="sa-text-link" to="/audit-logs">
              {t('View all')}
            </Link>
          </div>

          <ul className="sa-activity-list">
          {activityLoading && <li className="sa-activity-state">{t('Loading recent activity…')}</li>}
          {!activityLoading && activityError && (
            <li className="sa-activity-state is-error" role="alert">{t(activityError)}</li>
          )}
          {!activityLoading && !activityError && activity.length === 0 && (
            <li className="sa-activity-state">{t('No audit events have been recorded yet.')}</li>
          )}
          {!activityLoading && !activityError && activity.map((item) => {
            const label = item.action === 'manual_activation'
              ? 'User account activated'
              : item.event_type === 'account' && item.new_status === 'suspended'
                ? 'User account deactivated'
                : ({
                    registration: 'Registration received',
                    approval: 'Hospital approved',
                    rejection: 'Hospital rejected',
                    suspension: 'Hospital suspended',
                    reactivation: 'Hospital reactivated',
                    resubmission: 'Registration resubmitted',
                  }[item.action] || 'Status updated')
            const tone = ['approval', 'reactivation', 'manual_activation'].includes(item.action)
              || item.new_status === 'active'
              || item.new_status === 'approved'
              ? 'teal'
              : item.new_status === 'pending_review'
                ? 'amber'
                : 'rose'
            return (
            <li key={`${item.event_type}-${item.event_id}`}>
              <span className={`sa-activity-icon ${tone}`}>
                <Icon name={item.event_type === 'account' ? 'userCheck' : 'building'} size={18} />
              </span>
              <span className="sa-activity-copy">
                <strong>{t(label)}</strong>
                <small>{item.subject_name}</small>
                <em>{timeAgo(item.created_at, language)}</em>
              </span>
              <Icon className="sa-activity-chevron" name="chevronRight" size={15} />
            </li>
            )
          })}
          </ul>
        </article>

        <article className="sa-promo">
          <span aria-hidden="true" className="sa-promo-orb" />
          <div className="sa-promo-copy">
            <h2>{t('Better data. Better decisions. Healthier futures.')}</h2>
            <Link className="sa-primary-button sa-promo-button" to="/platform-guide">
              {t('Learn More')}
              <Icon name="arrowRight" size={14} />
            </Link>
          </div>
          <img
            alt={t('Smiling doctor with a stethoscope')}
            className="sa-promo-photo"
            loading="lazy"
            src="/assets/doctor-promo.jpg"
          />
        </article>
        </aside>
      </div>

    </div>
  )
}
