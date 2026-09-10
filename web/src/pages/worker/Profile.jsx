import { Link, useNavigate } from 'react-router-dom';
import { logout } from '../../session.js';

export default function Profile({ session }) {
  const navigate = useNavigate();
  const u = session?.user || {};
  return (
    <>
      <div className="topbar">
        <span />
        <h1>Profile</h1>
        <span />
      </div>
      <div className="page">
        <div className="card">
          <h2>{u.display_name}</h2>
          <p className="meta">{u.email}</p>
          <Link className="primary small inline" to="/chat">Message support</Link>
          <button className="primary" type="button" onClick={() => logout(navigate)}>Log out</button>
        </div>
      </div>
    </>
  );
}
