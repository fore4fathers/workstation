import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { IconChat, IconHome, IconLeaders, IconProfile, IconTasks, IconWallet } from '../icons.jsx';
import { useCompactHeader } from '../useCompactHeader.js';

const tabs = [
  { to: '/', label: 'Home', Icon: IconHome, end: true },
  { to: '/tasks', label: 'Tasks', Icon: IconTasks },
  { to: '/leaders', label: 'Leaders', Icon: IconLeaders },
  { to: '/wallet', label: 'Wallet', Icon: IconWallet },
  { to: '/profile', label: 'Profile', Icon: IconProfile },
];

export default function WorkerLayout({ session }) {
  const compact = useCompactHeader();
  const loc = useLocation();
  const onChat = loc.pathname === '/chat';

  return (
    <div className={`app-shell${compact ? ' is-compact' : ''}`}>
      <header className="site-nav">
        <NavLink to="/" end className="brand">AI Workstation</NavLink>
        <nav className="site-nav-links" aria-label="Worker">
          {tabs.map((t) => {
            const Icon = t.Icon;
            return (
              <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                <span className="ico"><Icon /></span>
                {t.label}
              </NavLink>
            );
          })}
        </nav>
      </header>
      {!onChat && (
        <NavLink to="/chat" className="chat-fab" aria-label="Chat">
          <IconChat />
        </NavLink>
      )}
      <main className="app-main">
        <Outlet context={{ session }} />
      </main>
    </div>
  );
}
