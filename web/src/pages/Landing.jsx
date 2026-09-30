import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="landing tm-landing">
      <header className="landing-bar">
        <img src="/engagesphere-logo.png" alt="EngageSphere" className="landing-logo" />
        <div className="landing-ctas">
          <Link to="/sign-in" className="ghost light">Sign in</Link>
          <Link to="/register" className="primary small">Create account</Link>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-copy">
          <p className="eyebrow">AI labeling work</p>
          <h1>Label data. Earn rewards.</h1>
          <p>
            Complete labeling tasks, keep your quality score up, and withdraw when pay is released.
          </p>
          <div className="landing-ctas">
            <Link className="primary small" to="/sign-in">Sign in</Link>
            <Link className="ghost" to="/register">Create account</Link>
          </div>
        </div>
        <div className="landing-stats">
          <div className="dash-kpi"><div><div className="meta">Task types</div><div className="dash-kpi-n">3</div><div className="meta">Image, text, intent</div></div></div>
          <div className="dash-kpi"><div><div className="meta">Pay</div><div className="dash-kpi-n">Tiered</div><div className="meta">Bronze to Platinum</div></div></div>
          <div className="dash-kpi"><div><div className="meta">Payout</div><div className="dash-kpi-n">Held</div><div className="meta">Released by admin</div></div></div>
          <div className="dash-kpi"><div><div className="meta">Support</div><div className="dash-kpi-n">Live</div><div className="meta">Chat and Telegram</div></div></div>
        </div>
      </section>

      <section className="landing-steps">
        <h2>How it works</h2>
        <ol>
          <li><b>Pick a task</b><span>Choose image, text, or intent work.</span></li>
          <li><b>Label the items</b><span>One item at a time, then submit.</span></li>
          <li><b>Withdraw</b><span>Pay stays pending until it is released.</span></li>
        </ol>
      </section>

      <footer className="tm-foot">
        <span>© 2026 EngageSphere. All rights reserved.</span>
        <span>Secure worker and admin accounts</span>
      </footer>
    </div>
  );
}
