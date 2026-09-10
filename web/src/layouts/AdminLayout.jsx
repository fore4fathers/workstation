import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { logout } from '../session.js';
import { useCompactHeader } from '../useCompactHeader.js';

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/tasks', label: 'Tasks' },
  { to: '/payouts', label: 'Payouts' },
  { to: '/wallet', label: 'Withdrawals' },
  { to: '/workers', label: 'Workers' },
  { to: '/inbox', label: 'Inbox' },
  { to: '/profile', label: 'Profile' },
];

export default function AdminLayout({ session }) {
  const navigate = useNavigate();
  const compact = useCompactHeader();

  return (
    <div className={`admin-shell${compact ? ' is-compact' : ''}`}>
      <header className="site-nav admin-nav-bar">
        <NavLink to="/" end className="brand">AI Workstation</NavLink>
        <nav className="site-nav-links" aria-label="Admin">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <button type="button" className="ghost nav-logout" onClick={() => logout(navigate)}>Log out</button>
      </header>
      <main className="admin-main">
        <Outlet context={{ session }} />
      </main>
    </div>
  );
}
