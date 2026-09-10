import { Link } from 'react-router-dom';
import { useState } from 'react';

const HERO =
  'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1800&q=80';
const HERO_FALLBACK = 'https://picsum.photos/id/180/1800/1200';

export default function Landing() {
  const [src, setSrc] = useState(HERO);

  return (
    <div className="landing">
      <header className="landing-bar">
        <span className="brand">AI Workstation</span>
        <Link to="/login" className="ghost">Sign in</Link>
      </header>

      <section className="landing-hero">
        <div className="landing-copy">
          <h1>Label training data. Get paid.</h1>
          <p>
            Image, text, and intent tasks. Pay is listed on the card. After you
            submit, an admin releases it, then you withdraw.
          </p>
          <div className="landing-ctas">
            <Link className="primary small" to="/login">Sign in</Link>
            <Link className="ghost" to="/login?register=1">Create account</Link>
          </div>
        </div>
        <div className="landing-media">
          <img
            src={src}
            alt="Laptop on a desk"
            width={1800}
            height={1200}
            fetchPriority="high"
            decoding="async"
            onError={() => setSrc(HERO_FALLBACK)}
          />
        </div>
      </section>

      <section className="landing-steps">
        <h2>How it works</h2>
        <ol>
          <li>
            <b>Pick a task</b>
            <span>Open anything still available.</span>
          </li>
          <li>
            <b>Label the items</b>
            <span>One screen at a time. Submit when you finish.</span>
          </li>
          <li>
            <b>Withdraw</b>
            <span>Pay sits as pending until an admin releases it.</span>
          </li>
        </ol>
      </section>

      <footer className="landing-foot">
        <p>Demo: john@demo.local / john123 · admin@demo.local / admin123</p>
      </footer>
    </div>
  );
}
