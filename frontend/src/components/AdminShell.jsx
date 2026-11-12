import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { apiRequest } from '../api'
import { useLocale } from '../i18n'
import Icon from './Icon'
import HospitalFooter from './HospitalFooter'

const primaryNav = [
  { label: 'Dashboard', icon: 'dashboard', path: '/' },
  { label: 'Hospitals', icon: 'building', path: '/hospitals' },
  {
    label: 'Registration Requests',
    icon: 'clipboard',
    path: '/hospital-requests',
    badge: 'registration',
  },
  { label: 'Data Review', icon: 'fileCheck', path: '/data-reviews', badge: 'reviews' },
  { label: 'Users', icon: 'users', path: '/users' },
]

const hospitalNav = [
  { label: 'Workspace', icon: 'dashboard', path: '/' },
  { label: 'Incubator Units', icon: 'bed', path: '/incubators' },
  { label: 'Equipment', icon: 'activity', path: '/equipment' },
  { label: 'Services', icon: 'heartPulse', path: '/services' },
  { label: 'Staff', icon: 'users', path: '/staff' },
  { label: 'Data Reviews', icon: 'fileCheck', path: '/data-reviews' },
  { label: 'Profile', icon: 'building', path: '/hospital-profile' },
]

const adminNav = [
  { label: 'System Settings', icon: 'settings', path: '/settings' },
  { label: 'Reports', icon: 'chart', path: '/reports' },
  { label: 'Audit Logs', icon: 'shield', path: '/audit-logs' },
]

const paletteExtra = [
  { label: 'Change Password', icon: 'settings', path: '/change-password' },
  { label: 'Profile', icon: 'building', path: '/profile' },
  { label: 'About DANNA', icon: 'heart', path: '/about-danna' },
]

export default function AdminShell({
  user,
  onLogout,
  isLoggingOut,
  logoutError,
  children,
}) {
  const { language, setLanguage, t } = useLocale()
  const location = useLocation()
  const navigate = useNavigate()
  const isSuperAdmin = user?.role === 'super_admin'
  const navigationItems = isSuperAdmin ? primaryNav : hospitalNav
  const showSearch = isSuperAdmin || [
    '/hospitals',
    '/hospital-requests',
    '/data-reviews',
    '/users',
    '/incubators',
    '/equipment',
    '/services',
    '/staff',
  ].some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`))
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpenPath, setMobileOpenPath] = useState(null)
  const mobileOpen = mobileOpenPath === location.pathname
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [counts, setCounts] = useState(null)
  const [countsError, setCountsError] = useState('')
  const [countsReloadKey, setCountsReloadKey] = useState(0)
  const [hospitalLogoUrl, setHospitalLogoUrl] = useState(user?.hospital?.logo_url || '')
  const searchInputRef = useRef(null)
  const notificationRef = useRef(null)
  const profileRef = useRef(null)

  const badges = useMemo(
    () => ({
      registration: counts?.registration ?? 0,
      reviews: counts?.reviews ?? 0,
    }),
    [counts]
  )
  const formatCount = (value) => new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en').format(value)
  const accountImage = isSuperAdmin
    ? '/dhana-logo-removebg-preview.png'
    : hospitalLogoUrl || '/assets/hospital-building.jpg'

  useEffect(() => {
    if (isSuperAdmin) return undefined
    function updateHospitalLogo(event) {
      setHospitalLogoUrl(event.detail || '')
    }

    window.addEventListener('danna:hospital-logo-updated', updateHospitalLogo)
    return () => window.removeEventListener('danna:hospital-logo-updated', updateHospitalLogo)
  }, [isSuperAdmin])

  function handleAccountImageError(event) {
    const fallbackImage = isSuperAdmin
      ? '/dhana-logo-removebg-preview.png'
      : '/assets/hospital-building.jpg'
    if (!event.currentTarget.src.endsWith(fallbackImage)) {
      event.currentTarget.src = fallbackImage
    }
  }

  const paletteItems = useMemo(
    () => [...navigationItems, ...(isSuperAdmin ? adminNav : []), ...paletteExtra]
      .filter((item) => isSuperAdmin || item.path !== '/about-danna')
      .filter((item) => item.label.toLowerCase().includes(searchTerm.trim().toLowerCase())),
    [isSuperAdmin, navigationItems, searchTerm]
  )

  useEffect(() => {
    if (!isSuperAdmin) return undefined
    const controller = new AbortController()

    apiRequest('/api/admin/analytics', { signal: controller.signal })
      .then((payload) => {
        if (controller.signal.aborted) return
        const registration = payload?.data?.registration_requests?.pending
        const reviews = payload?.data?.data_reviews?.by_status?.pending_review
        if (!Number.isInteger(registration) || registration < 0
          || !Number.isInteger(reviews) || reviews < 0) {
          throw new Error('Notification counts could not be loaded.')
        }
        setCounts({ registration, reviews })
        setCountsError('')
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setCountsError(error.message || 'Notification counts could not be loaded.')
        }
      })

    return () => controller.abort()
  }, [countsReloadKey, isSuperAdmin])

  useEffect(() => {
    function handleKeyDown(event) {
      const key = event.key.toLowerCase()

      if ((event.metaKey || event.ctrlKey) && key === 'k') {
        event.preventDefault()
        setSearchTerm('')
        setSearchOpen((current) => !current)
        setNotificationsOpen(false)
        setProfileOpen(false)
      }

      if (event.key === 'Escape') {
        setSearchTerm('')
        setSearchOpen(false)
        setNotificationsOpen(false)
        setProfileOpen(false)
        setMobileOpenPath(null)
      }
    }

    function handlePointerDown(event) {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setNotificationsOpen(false)
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [])

  useEffect(() => {
    if (!searchOpen) return undefined

    const timeout = window.setTimeout(() => searchInputRef.current?.focus(), 30)
    return () => window.clearTimeout(timeout)
  }, [searchOpen])

  function isActive(path) {
    if (path === '/') return location.pathname === '/'
    return location.pathname === path || location.pathname.startsWith(`${path}/`)
  }

  function openPalette(event) {
    event?.preventDefault()
    setSearchTerm('')
    setSearchOpen(true)
    setNotificationsOpen(false)
    setProfileOpen(false)
  }

  function closePalette() {
    setSearchTerm('')
    setSearchOpen(false)
  }

  function goBack() {
    const historyIndex = window.history.state?.idx
    if (Number.isInteger(historyIndex) && historyIndex > 0) {
      navigate(-1)
      return
    }

    navigate('/')
  }

  function runPalette(event) {
    if (event.key === 'Enter' && paletteItems[0]) {
      event.preventDefault()
      closePalette()
      navigate(paletteItems[0].path)
    }
  }

  const notificationItems = isSuperAdmin && counts ? [
    ...(badges.registration > 0 ? [{
      icon: 'clipboard',
      tone: 'amber',
      title: t('Registration requests awaiting review'),
      meta: `${badges.registration} · ${t('Hospital onboarding')}`,
    }] : []),
    ...(badges.reviews > 0 ? [{
      icon: 'fileCheck',
      tone: 'teal',
      title: t('Facility submissions awaiting a decision'),
      meta: `${badges.reviews} · ${t('Data review queue')}`,
    }] : []),
  ] : []

  return (
    <div
      className={`sa-workspace ${isSuperAdmin ? '' : 'is-hospital'} ${collapsed ? 'is-collapsed' : ''}`}
      dir={language === 'ar' ? 'rtl' : 'ltr'}
    >
      <div
        aria-hidden="true"
        className={`sa-sidebar-scrim ${mobileOpen ? 'is-visible' : ''}`}
        onClick={() => setMobileOpenPath(null)}
      />

      <aside className={`sa-sidebar ${mobileOpen ? 'is-mobile-open' : ''}`} aria-label={t('Main navigation')}>
        <div className="sa-brand">
          <img
            alt={t('DANNA neonatal-care logo')}
            className="sa-brand-logo"
            src="/dhana-logo-removebg-preview.png"
          />
          <div className="sa-brand-copy">
            <strong>DANNA</strong>
            <span>{t('Better Care. Brighter Futures.')}</span>
          </div>
        </div>

        <div className="sa-nav-scroll">
          <p className="sa-menu-label">{t('WORKSPACE')}</p>
          <nav className="sa-nav">
            {navigationItems.map((item) => {
              const count = item.badge ? badges[item.badge] : 0
              return (
                <Link
                  aria-current={isActive(item.path) ? 'page' : undefined}
                  className={`sa-nav-item ${isActive(item.path) ? 'is-active' : ''}`}
                  key={item.path}
                  title={t(item.label)}
                  to={item.path}
                >
                  <span className="sa-nav-icon">
                    <Icon name={item.icon} size={21} />
                  </span>
                  <span className="sa-nav-label">{t(item.label)}</span>
                  {counts && count > 0 && (
                    <span className="sa-nav-badge" aria-label={formatCount(count)}>
                      {formatCount(count)}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>

          {isSuperAdmin ? (
            <>
              <div className="sa-nav-divider" />
              <p className="sa-menu-label">{t('ADMINISTRATION')}</p>
              <nav className="sa-nav">
                {adminNav.map((item) => (
                  <Link
                    aria-current={isActive(item.path) ? 'page' : undefined}
                    className={`sa-nav-item ${isActive(item.path) ? 'is-active' : ''}`}
                    key={item.path}
                    title={t(item.label)}
                    to={item.path}
                  >
                    <span className="sa-nav-icon">
                      <Icon name={item.icon} size={21} />
                    </span>
                    <span className="sa-nav-label">{t(item.label)}</span>
                  </Link>
                ))}
              </nav>
            </>
          ) : (
            <>
              <div className="sa-nav-divider" />
              <nav className="sa-nav">
                <Link
                  aria-current={isActive('/change-password') ? 'page' : undefined}
                  className={`sa-nav-item ${isActive('/change-password') ? 'is-active' : ''}`}
                  to="/change-password"
                >
                  <span className="sa-nav-icon"><Icon name="shield" size={21} /></span>
                  <span className="sa-nav-label">{t('Change Password')}</span>
                </Link>
                <button
                  aria-label={t(isLoggingOut ? 'Signing out…' : 'Logout')}
                  className="sa-nav-item sa-hospital-logout"
                  disabled={isLoggingOut}
                  onClick={onLogout}
                  type="button"
                >
                  <span className="sa-nav-icon"><Icon name="logout" size={21} /></span>
                  <span className="sa-nav-label">{t(isLoggingOut ? 'Signing out…' : 'Logout')}</span>
                </button>
              </nav>
            </>
          )}
        </div>

        <div className="sa-sidebar-story">
          <div className="sa-story-photo-wrap">
            <img
              alt={t('Nurse caring for a newborn in the neonatal unit')}
              className="sa-story-photo"
              loading="lazy"
              src="/assets/sidebar-newborn.jpg"
            />
          </div>
          <p className="sa-story-quote">{t('Every newborn deserves the best start in life.')}</p>
          <span className="sa-story-underline" />
        </div>

        <div className="sa-sidebar-foot">
          <div className="sa-sidebar-user">
            <img
              alt={t(isSuperAdmin ? 'Super Admin profile' : 'Hospital account')}
              className="sa-sidebar-avatar"
              onError={handleAccountImageError}
              src={accountImage}
            />
            <span>
              <strong>{user?.name || t(isSuperAdmin ? 'Super Admin' : 'Hospital user')}</strong>
              <small>{t(isSuperAdmin ? 'Super Admin' : 'Hospital')}</small>
            </span>
          </div>
          <button
            aria-label={t('Sign out')}
            className="sa-icon-button sa-signout"
            disabled={isLoggingOut}
            onClick={onLogout}
            title={t(isLoggingOut ? 'Signing out…' : 'Sign out')}
            type="button"
          >
            <Icon name="logout" size={19} />
          </button>
        </div>

        <span aria-hidden="true" className="sa-wave sa-wave-teal" />
        <span aria-hidden="true" className="sa-wave sa-wave-amber" />
      </aside>

      <div className="sa-shell">
        <header className="sa-header">
          <div className="sa-header-start">
            <button
              aria-label={t('Go back')}
              className="sa-icon-button sa-back-button"
              onClick={goBack}
              title={t('Go back')}
              type="button"
            >
              <Icon name="chevronLeft" size={19} />
            </button>
            <button
              aria-label={t('Toggle navigation')}
              className="sa-icon-button sa-menu-button"
              onClick={() => {
                if (window.matchMedia('(max-width: 1023px)').matches) {
                  setMobileOpenPath((current) => current === location.pathname ? null : location.pathname)
                } else {
                  setCollapsed((current) => !current)
                }
              }}
              title={t('Toggle navigation')}
              type="button"
            >
              <Icon name="menu" size={21} />
            </button>

            {showSearch && (
              <button className="sa-search" onClick={openPalette} type="button">
                <Icon name="search" size={18} />
                <span>{t('Search hospitals, users, or requests…')}</span>
                <kbd aria-hidden="true">⌘ K</kbd>
              </button>
            )}
          </div>

          <div className="sa-header-actions">
            <button
              className="sa-language"
              onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
              type="button"
            >
              <Icon name="globe" size={18} />
              <span>{language === 'ar' ? 'English' : 'العربية'}</span>
              <Icon name="chevronDown" size={14} />
            </button>

            <div className="sa-popover-wrap" ref={notificationRef}>
              <button
                aria-expanded={notificationsOpen}
                aria-label={t('Notifications')}
                className={`sa-icon-button sa-bell ${notificationsOpen ? 'is-open' : ''}`}
                onClick={() => {
                  setNotificationsOpen((current) => !current)
                  setProfileOpen(false)
                }}
                type="button"
              >
                <Icon name="bell" size={20} />
                {isSuperAdmin && counts && badges.registration + badges.reviews > 0 && (
                  <span className="sa-notification-dot" aria-hidden="true">
                    {formatCount(badges.registration + badges.reviews)}
                  </span>
                )}
                <span className="sa-bell-sparkle">
                  <Icon name="sparkle" size={10} />
                </span>
              </button>

              {notificationsOpen && (
                <div className="sa-popover sa-notifications" role="dialog" aria-label={t('Notifications')}>
                  <div className="sa-popover-head">
                    <strong>{t('Notifications')}</strong>
                    <span>
                      {counts ? t('{count} pending', {
                        count: formatCount(badges.registration + badges.reviews),
                      }) : ''}
                    </span>
                  </div>
                  {isSuperAdmin && countsError && (
                    <div className="sa-notification-empty" role="alert">
                      <p>{t('Notification counts could not be loaded.')}</p>
                      <button
                        className="sa-notification-retry"
                        onClick={() => {
                          setCountsError('')
                          setCounts(null)
                          setCountsReloadKey((current) => current + 1)
                        }}
                        type="button"
                      >
                        {t('Retry')}
                      </button>
                    </div>
                  )}
                  {isSuperAdmin && !counts && !countsError && (
                    <p className="sa-notification-empty">{t('Loading notification counts…')}</p>
                  )}
                  {notificationItems.length === 0 && counts && (
                    <p className="sa-notification-empty">{t('No pending notifications.')}</p>
                  )}
                  {!isSuperAdmin && (
                    <p className="sa-notification-empty">{t('No pending notifications.')}</p>
                  )}
                  {notificationItems.map((item) => (
                    <div className="sa-notification-item" key={item.title}>
                      <span className={`sa-notification-icon ${item.tone}`}>
                        <Icon name={item.icon} size={17} />
                      </span>
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.meta}</small>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="sa-popover-wrap" ref={profileRef}>
              <button
                aria-expanded={profileOpen}
                className="sa-profile"
                onClick={() => {
                  setProfileOpen((current) => !current)
                  setNotificationsOpen(false)
                }}
                type="button"
              >
                <img
                  alt={t(isSuperAdmin ? 'Super Admin profile' : 'Hospital account')}
                  className="sa-avatar"
                  onError={handleAccountImageError}
                  src={accountImage}
                />
                <span className="sa-profile-copy">
                  <strong>{user?.name || t(isSuperAdmin ? 'Super Admin' : 'Hospital user')}</strong>
                  <small>{t(isSuperAdmin ? 'Super Admin' : 'Hospital')}</small>
                </span>
                <Icon className="sa-profile-chevron" name="chevronDown" size={15} />
              </button>

              {profileOpen && (
                <div className="sa-popover sa-profile-menu" role="menu">
                  <div className="sa-profile-menu-head">
                    <img alt="" onError={handleAccountImageError} src={accountImage} />
                    <span>
                      <strong>{user?.name || t(isSuperAdmin ? 'Super Admin' : 'Hospital user')}</strong>
                      <small>{user?.email}</small>
                    </span>
                  </div>
                  <Link
                    onClick={() => setProfileOpen(false)}
                    role="menuitem"
                    to={isSuperAdmin ? '/profile' : '/hospital-profile'}
                  >
                    <Icon name="user" size={16} />
                    {t('Profile')}
                  </Link>
                  <Link onClick={() => setProfileOpen(false)} role="menuitem" to="/change-password">
                    <Icon name="shield" size={16} />
                    {t('Change Password')}
                  </Link>
                  <button
                    className="sa-profile-logout"
                    disabled={isLoggingOut}
                    onClick={onLogout}
                    role="menuitem"
                    type="button"
                  >
                    <Icon name="logout" size={16} />
                    {t(isLoggingOut ? 'Signing out…' : 'Logout')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {logoutError && (
          <div className="sa-logout-error" role="alert">
            {t(logoutError)}
          </div>
        )}

        <main className="sa-content">{children}</main>
        {!isSuperAdmin && <HospitalFooter />}
      </div>

      {searchOpen && (
        <div className="sa-command-backdrop" onMouseDown={closePalette}>
          <div
            aria-label={t('Command palette')}
            aria-modal="true"
            className="sa-command"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="sa-command-input">
              <Icon name="search" size={20} />
              <input
                aria-label={t('Search hospitals, users, or requests…')}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={runPalette}
                placeholder={t('Search hospitals, users, or requests…')}
                ref={searchInputRef}
                type="search"
                value={searchTerm}
              />
              <kbd>ESC</kbd>
            </div>

            <p className="sa-command-label">{t('Jump to')}</p>
            <div className="sa-command-list">
              {paletteItems.length === 0 && (
                <p className="sa-command-empty">{t('No matching pages found.')}</p>
              )}
              {paletteItems.map((item, index) => (
                <button
                  className="sa-command-item"
                  key={item.path}
                  onClick={() => {
                    closePalette()
                    navigate(item.path)
                  }}
                  type="button"
                >
                  <span className="sa-command-icon">
                    <Icon name={item.icon} size={18} />
                  </span>
                  <span>{t(item.label)}</span>
                  {index === 0 && <kbd>↵</kbd>}
                </button>
              ))}
            </div>
            <div className="sa-command-foot">
              <span>
                <kbd>↑</kbd>
                <kbd>↓</kbd>
                {t('to navigate')}
              </span>
              <span>
                <kbd>↵</kbd>
                {t('to open')}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
