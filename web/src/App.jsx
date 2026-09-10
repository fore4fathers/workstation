import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import { connectSocket, disconnectSocket } from './socket.js';
import Login from './pages/Login.jsx';
import Landing from './pages/Landing.jsx';
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
import TaskDetail from './pages/admin/TaskDetail.jsx';
import AdminWallet from './pages/admin/Wallet.jsx';
import AdminInbox from './pages/admin/Inbox.jsx';
import AdminProfile from './pages/admin/Profile.jsx';
import AdminPayouts from './pages/admin/Payouts.jsx';
import AdminWorkers from './pages/admin/Workers.jsx';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(!!getToken());
  const loc = useLocation();

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      setSession(null);
      return;
    }
    api('/api/me')
      .then((data) => {
        setSession(data);
        connectSocket();
      })
      .catch(() => {
        setToken(null);
        setSession(null);
        disconnectSocket();
      })
      .finally(() => setLoading(false));
  }, [loc.pathname]);

  if (loading) {
    return (
      <div className="page work-busy">
        <span className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    );
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login onLogin={setSession} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  const isAdmin = session.user.role === 'admin';

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      {isAdmin ? (
        <Route path="/*" element={<AdminLayout session={session} />}>
          <Route index element={<AdminHome />} />
          <Route path="tasks" element={<AdminTasks />} />
          <Route path="tasks/new" element={<TaskNew />} />
          <Route path="tasks/:id" element={<TaskDetail />} />
          <Route path="payouts" element={<AdminPayouts />} />
          <Route path="workers" element={<AdminWorkers />} />
          <Route path="wallet" element={<AdminWallet />} />
          <Route path="inbox" element={<AdminInbox />} />
          <Route path="profile" element={<AdminProfile session={session} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      ) : (
        <Route path="/*" element={<WorkerLayout session={session} />}>
          <Route index element={<WorkerHome session={session} />} />
          <Route path="tasks" element={<WorkerTasks />} />
          <Route path="tasks/:id" element={<TaskWork />} />
          <Route path="leaders" element={<Leaders />} />
          <Route path="wallet" element={<Wallet />} />
          <Route path="profile" element={<Profile session={session} />} />
          <Route path="chat" element={<Chat session={session} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      )}
    </Routes>
  );
}


