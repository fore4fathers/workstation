import { Link } from 'react-router-dom';

const HERO =
  'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1400&q=80';

export default function AuthLayout({ children, title, subtitle }) {
  return (
    <div className="auth-page">
      <div className="auth-visual" aria-hidden="true">
        <img src={HERO} alt="" />
        <div className="auth-visual-copy">
          <img src="/engagesphere-logo.png" alt="EngageSphere" className="auth-logo" />
          <p>Train AI. Earn rewards.</p>
        </div>
      </div>
      <div className="auth-form-col">
        <Link to="/" className="auth-home">EngageSphere</Link>
        {title ? <h1 className="auth-title">{title}</h1> : null}
        {subtitle ? <p className="meta auth-sub">{subtitle}</p> : null}
        {children}
      </div>
    </div>
  );
}
