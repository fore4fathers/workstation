import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { logout } from '../session.js';

const links = [
  { to: '/', label: 'Dashboard', end: true, icon: 'home' },
  { to: '/available-tasks', label: 'Available Tasks', end: true, icon: 'list' },
  { to: '/drive-sets', label: 'Label Sets', icon: 'grid' },
  { to: '/profile', label: 'Training', icon: 'cap' },
  { to: '/wallet', label: 'Earnings', icon: 'card' },
  { to: '/account', label: 'Profile', icon: 'user' },
];

function Glyph({ name }) {
  const p = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (name === 'home') return <svg {...p}><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" /></svg>;
  if (name === 'list') return <svg {...p}><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg>;
  if (name === 'clip') return <svg {...p}><path d="M9 6h11v12H9zM9 10h11" /><path d="M6 8v10a2 2 0 0 0 2 2h8" /></svg>;
  if (name === 'cap') return <svg {...p}><path d="m3 10 9-5 9 5-9 5-9-5z" /><path d="M7 12v4c2 2 8 2 10 0v-4" /></svg>;
  if (name === 'card') return <svg {...p}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /></svg>;
  if (name === 'user') return <svg {...p}><circle cx="12" cy="8" r="3" /><path d="M5 19c1.5-3 4-4.5 7-4.5S17.5 16 19 19" /></svg>;
  if (name === 'grid') return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
  if (name === 'help') return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7V14" /><path d="M12 17h.01" /></svg>;
  return <svg {...p}><path d="M10 7V5H5v14h5v-2M9 12h10M15 8l4 4-4 4" /></svg>;
}

export default function WorkerLayout({ session }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const name = session?.user?.display_name || 'Trainer';
  const tier = session?.user?.tier_name || 'Bronze';

  return (
    <div className="tm-shell">
      <button type="button" className="tm-burger" aria-label="Menu" onClick={() => setOpen((v) => !v)}>
        <span /><span /><span />
      </button>
      {open ? <button type="button" className="tm-backdrop" aria-label="Close menu" onClick={() => setOpen(false)} /> : null}
      <aside className={`tm-side${open ? ' open' : ''}`}>
        <div className="tm-brand">
          <img src="/engagesphere-logo.png" alt="EngageSphere" className="tm-logo-img" />
        </div>
        <nav>
          {links.map((l) => (
            <NavLink
              key={l.label}
              to={l.to}
              end={l.end || l.to === '/tasks'}
              className={({ isActive }) => (isActive ? 'active' : '')}
              onClick={() => setOpen(false)}
            >
              <Glyph name={l.icon} />
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="tm-promo">
          <b>Level up your skills</b>
          <p>Complete training to unlock higher-paying tasks.</p>
          <NavLink to="/profile" onClick={() => setOpen(false)}>Go to Training</NavLink>
        </div>
        <div className="tm-side-foot">
          <NavLink to="/chat" onClick={() => setOpen(false)}><Glyph name="help" /> Help Center</NavLink>
          <button type="button" onClick={() => logout(navigate)}><Glyph name="out" /> Log Out</button>
        </div>
      </aside>
      <div className="tm-main">
        <header className="tm-top">
          <div />
          <div className="tm-hello">
            <NavLink to="/chat" className="tm-bell" aria-label="Notifications">●</NavLink>
            <div>
              <b>Hello, {name.split(' ')[0]}</b>
              <span>AI Trainer · {tier}</span>
            </div>
          </div>
        </header>
        <Outlet context={{ session }} />
        <footer className="tm-foot">
          <span>© 2026 EngageSphere. All rights reserved.</span>
          <span>Terms of Service · Privacy Policy · Payment Policy</span>
        </footer>
      </div>
    </div>
  );
}
