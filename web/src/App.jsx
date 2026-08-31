import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import Login from './pages/Login.jsx';
import WorkerLayout from './layouts/WorkerLayout.jsx';
import AdminLayout from './layouts/AdminLayout.jsx';
import WorkerHome from './pages/worker/Home.jsx';
import WorkerTasks from './pages/worker/Tasks.jsx';
import TaskWork from './pages/worker/TaskWork.jsx';
import Leaders from './pages/worker/Leaders.jsx';
import Wallet from './pages/worker/Wallet.jsx';
import Profile from './pages/worker/Profile.jsx';
import Chat from './pages/worker/Chat.jsx';
import AdminHome from './pages/admin/Home.jsx';
import AdminTasks from './pages/admin/Tasks.jsx';
import TaskNew from './pages/admin/TaskNew.jsx';
import AdminWallet from './pages/admin/Wallet.jsx';
import AdminInbox from './pages/admin/Inbox.jsx';
import AdminProfile from './pages/admin/Profile.jsx';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(!!getToken());
  const loc = useLocation();

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api('/api/me')
      .then((data) => setSession(data))
      .catch(() => {
        setToken(null);
        setSession(null);
      })
      .finally(() => setLoading(false));
  }, [loc.pathname]);

  if (loading) return <div className="page">Loading…</div>;

  return (
    <Routes>
      <Route path="/login" element={<Login onLogin={setSession} />} />
      <Route
        path="/*"
        element={
          !session ? (
            <Navigate to="/login" replace />
          ) : session.user.role === 'admin' ? (
            <AdminLayout session={session} />
          ) : (
            <WorkerLayout session={session} />
          )
        }
      >
        <Route index element={session?.user.role === 'admin' ? <AdminHome /> : <WorkerHome session={session} />} />
        <Route path="tasks" element={session?.user.role === 'admin' ? <AdminTasks /> : <WorkerTasks />} />
        <Route path="tasks/new" element={<TaskNew />} />
        <Route path="tasks/:id" element={<TaskWork />} />
        <Route path="leaders" element={<Leaders />} />
        <Route path="wallet" element={session?.user.role === 'admin' ? <AdminWallet /> : <Wallet />} />
        <Route path="profile" element={session?.user.role === 'admin' ? <AdminProfile session={session} /> : <Profile session={session} />} />
        <Route path="inbox" element={<AdminInbox />} />
        <Route path="chat" element={<Chat />} />
      </Route>
    </Routes>
  );
}

export function logout(navigate) {
  setToken(null);
  navigate('/login');
}
