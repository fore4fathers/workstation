import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { logout } from '../session.js';
import { useCompactHeader } from '../useCompactHeader.js';
import { LanguageToggle, useLanguage } from '../i18n.jsx';
import WithdrawalNotifications from '../WithdrawalNotifications.jsx';

const links = [
  { to: '/', label: 'Home', key: 'admin.home', end: true },
  { to: '/wallet', label: 'Withdrawals', key: 'admin.withdrawals' },
  { to: '/deposits', label: 'Deposits', key: 'admin.deposits' },
  { to: '/workers', label: 'Workers', key: 'admin.workers' },
  { to: '/tasks', label: 'Tasks', key: 'nav.tasks' },
  { to: '/drive-sets', label: 'Label Sets', key: 'nav.labelSets' },
  { to: '/inbox', label: 'Inbox', key: 'admin.inbox' },
  { to: '/profile', label: 'Profile', key: 'nav.profile' },
];

export default function AdminLayout({ session }) {
  const { t: trText } = useLanguage();
  const navigate = useNavigate();
  const compact = useCompactHeader();
  const { t } = useLanguage();

  return (
    <div className={`admin-shell${compact ? ' is-compact' : ''}`}>
      <WithdrawalNotifications session={session} />
      <header className="site-nav admin-nav-bar">
        <NavLink to="/" end className="brand es-brand">
          <img src="/engagesphere-logo.png" alt="" />
          EngageSphere
        </NavLink>
        <nav className="site-nav-links admin-links" aria-label={trText("Admin")}>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {t(l.key, l.label)}
            </NavLink>
          ))}
        </nav>
        <div className="admin-nav-actions">
          <LanguageToggle />
          <button type="button" className="ghost nav-logout" onClick={() => logout(navigate)}>{t('admin.logOut')}</button>
        </div>
      </header>
      <main className="admin-main">
        <Outlet context={{ session }} />
      </main>
    </div>
  );
}
