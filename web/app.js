const TOKEN_KEY = 'aw_token';
const root = document.getElementById('root');
let session = null;
let socket = null;

function token() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'request failed'), { status: res.status, data });
  return data;
}

function money(n) { return `$${Number(n || 0).toFixed(2)}`; }
function icon(type) {
  return { image: '🖼️', text: '✏️', intent: '💬' }[type] || '📋';
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function connectSocket() {
  if (!window.io || !token()) return;
  if (socket) socket.disconnect();
  socket = window.io({ auth: { token: token() } });
}

function navTo(path) {
  history.pushState({}, '', path);
  render();
}
window.addEventListener('popstate', render);

function workerTabs(active) {
  const items = [
    ['/', '🏠', 'Home'],
    ['/tasks', '✅', 'Tasks'],
    ['/leaders', '🏆', 'Leaders'],
    ['/wallet', '💳', 'Wallet'],
    ['/profile', '👤', 'Profile'],
  ];
  return `<nav class="tabbar">${items.map(([href, ico, label]) =>
    `<a href="${href}" class="${active === href ? 'active' : ''}"><span class="ico">${ico}</span>${label}</a>`).join('')}</nav>`;
}

function adminNav(active) {
  const items = [
    ['/', 'Home'],
    ['/tasks', 'Tasks'],
    ['/wallet', 'Wallet'],
    ['/inbox', 'Inbox'],
    ['/profile', 'Profile'],
  ];
  return `<div class="admin-header">
    <h1>AI Workstation Admin</h1>
    <nav class="admin-nav">${items.map(([href, label]) =>
      `<a href="${href}" class="${active === href ? 'active' : ''}">${label}</a>`).join('')}
      <button type="button" id="logout">Logout</button>
    </nav>
  </div>`;
}

async function ensureSession() {
  if (!token()) { session = null; return null; }
  try {
    session = await api('/api/me');
    return session;
  } catch {
    setToken(null);
    session = null;
    return null;
  }
}

function loginPage(err = '') {
  root.innerHTML = `<div class="login-wrap"><form class="login-card" id="login-form">
    <h1>AI Workstation</h1>
    <p class="meta">Demo logins: john@demo.local / john123 · admin@demo.local / admin123</p>
    <label>Email</label><input name="email" value="john@demo.local" autocomplete="username" />
    <label>Password</label><input name="password" type="password" value="john123" autocomplete="current-password" />
    ${err ? `<p class="error">${escapeHtml(err)}</p>` : ''}
    <button class="primary" type="submit">Sign in</button>
  </form></div>`;
  document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: { email: fd.get('email'), password: fd.get('password') },
      });
      setToken(data.token);
      connectSocket();
      navTo('/');
    } catch (ex) {
      loginPage(ex.message);
    }
  };
}

async function workerHome() {
  const s = session;
  root.innerHTML = `<div class="phone-shell">
    <div class="topbar"><button class="icon-btn">☰</button><h1>AI Workstation</h1>
      <a class="icon-btn" href="/chat">🔔</a></div>
    <div class="page">
      <div class="hello">Welcome back, <b>${escapeHtml(s.user.display_name)}</b> 👋</div>
      <div class="balance-card">
        <div><div class="meta" style="color:#dbe7ff">Balance</div><div class="amt">${money(s.account.balance)}</div></div>
        <a class="withdraw-btn" href="/wallet">Withdraw</a>
      </div>
      <div class="stats">
        <div class="stat"><div class="n">${s.stats.tasks_done}</div><div class="l">Tasks Done</div></div>
        <div class="stat"><div class="n">${s.stats.accuracy}%</div><div class="l">Accuracy</div></div>
        <div class="stat"><div class="n">Top ${s.stats.rank_pct}%</div><div class="l">Rank</div></div>
      </div>
      <div class="section-h"><h2>Recommended Tasks</h2><a href="/tasks" class="meta">View all</a></div>
      <div id="rec"></div>
    </div>
    ${workerTabs('/')}
  </div>`;
  const { tasks } = await api('/api/tasks');
  document.getElementById('rec').innerHTML = tasks.slice(0, 3).map(taskCard).join('');
}

function taskCard(t) {
  const done = t.assignment_status === 'submitted';
  return `<a class="task-card" href="${done ? '/tasks' : `/tasks/${t.id}`}">
    <div class="task-icon ${t.type}">${icon(t.type)}</div>
    <div style="flex:1">
      <h3>${escapeHtml(t.title)}</h3>
      <div class="meta">${escapeHtml(t.description || '')}</div>
    </div>
    <div style="text-align:right">
      <b>${money(t.pay_dollars)}</b>
      <div class="meta">${t.est_minutes} min${done ? ' · done' : ''}</div>
    </div>
  </a>`;
}

async function workerTasks() {
  const { tasks } = await api('/api/tasks');
  root.innerHTML = `<div class="phone-shell">
    <div class="topbar"><a class="icon-btn" href="/">←</a><h1>Tasks</h1><span></span></div>
    <div class="page">${tasks.map(taskCard).join('') || '<p class="meta">No tasks yet.</p>'}</div>
    ${workerTabs('/tasks')}
  </div>`;
}

async function taskWork(id) {
  const { task, items } = await api(`/api/tasks/${id}`);
  let idx = 0;
  const answers = {};
  await api(`/api/tasks/${id}/start`, { method: 'POST' }).catch(() => {});

  function paint(err = '') {
    const item = items[idx];
    const p = item.payload;
    let body = '';
    if (task.type === 'image') {
      body = `<img class="work-img" src="${escapeHtml(p.image_url)}" alt="item" />
        <div class="chips">${(p.labels || []).map((l) =>
          `<button type="button" class="chip ${answers[item.id] === l ? 'on' : ''}" data-a="${escapeHtml(l)}">${escapeHtml(l)}</button>`).join('')}</div>`;
    } else if (task.type === 'text') {
      body = `<p>${escapeHtml(p.text)}</p>
        <div class="chips">${(p.labels || []).map((l) =>
          `<button type="button" class="chip ${answers[item.id] === l ? 'on' : ''}" data-a="${escapeHtml(l)}">${escapeHtml(l)}</button>`).join('')}</div>`;
    } else {
      body = `<div class="utterance">${escapeHtml(p.utterance)}</div>
        <div class="chips">${(p.intents || []).map((l) =>
          `<button type="button" class="chip ${answers[item.id] === l ? 'on' : ''}" data-a="${escapeHtml(l)}">${escapeHtml(l)}</button>`).join('')}</div>`;
    }
    root.innerHTML = `<div class="phone-shell">
      <div class="topbar"><a class="icon-btn" href="/tasks">←</a><h1>${escapeHtml(task.title)}</h1><span class="meta">${idx + 1}/${items.length}</span></div>
      <div class="page">
        ${body}
        ${err ? `<p class="error">${escapeHtml(err)}</p>` : ''}
        <button class="primary" id="next">${idx === items.length - 1 ? 'Submit' : 'Next'}</button>
      </div>
    </div>`;
    root.querySelectorAll('.chip').forEach((b) => {
      b.onclick = () => { answers[item.id] = b.dataset.a; paint(); };
    });
    document.getElementById('next').onclick = async () => {
      if (!answers[item.id]) return paint('Pick a label');
      if (idx < items.length - 1) { idx += 1; paint(); return; }
      try {
        await api(`/api/tasks/${id}/submit`, {
          method: 'POST',
          body: { answers: items.map((it) => ({ item_id: it.id, answer: answers[it.id] })) },
        });
        navTo('/');
      } catch (ex) {
        paint(ex.message);
      }
    };
  }
  paint();
}

async function leaders() {
  const { leaders } = await api('/api/leaders');
  root.innerHTML = `<div class="phone-shell">
    <div class="topbar"><a class="icon-btn" href="/">←</a><h1>Leaders</h1><span></span></div>
    <div class="page"><div class="card"><table class="table">
      <tr><th>#</th><th>Name</th><th>Done</th></tr>
      ${leaders.map((l) => `<tr><td>${l.rank}</td><td>${escapeHtml(l.display_name)}${l.is_you ? ' (you)' : ''}</td><td>${l.tasks_done}</td></tr>`).join('')}
    </table></div></div>
    ${workerTabs('/leaders')}
  </div>`;
}

async function walletPage() {
  const w = await api('/api/wallet');
  root.innerHTML = `<div class="phone-shell">
    <div class="topbar"><a class="icon-btn" href="/">←</a><h1>Wallet</h1><span></span></div>
    <div class="page">
      <div class="balance-card"><div><div class="meta" style="color:#dbe7ff">Available</div>
        <div class="amt">${money(w.account.balance)}</div>
        <div class="meta" style="color:#dbe7ff">Frozen ${money(w.account.frozen)}</div></div></div>
      <form id="wd" class="card" style="margin-top:16px">
        <label>Withdraw amount</label>
        <input name="amount" type="number" step="0.01" min="0.01" />
        <label>Address (demo)</label>
        <input name="address" placeholder="optional" />
        <p class="error" id="wd-err"></p>
        <button class="primary" type="submit">Request withdrawal</button>
      </form>
      <h2>History</h2>
      ${w.withdrawals.map((x) => `<div class="task-card"><div><b>${money(x.amount)}</b><div class="meta">${x.status} · ${new Date(x.created_at).toLocaleString()}</div></div></div>`).join('') || '<p class="meta">No withdrawals</p>'}
    </div>
    ${workerTabs('/wallet')}
  </div>`;
  document.getElementById('wd').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/api/wallet/withdraw', {
        method: 'POST',
        body: { amount: Number(fd.get('amount')), address: fd.get('address') },
      });
      render();
    } catch (ex) {
      document.getElementById('wd-err').textContent = ex.message;
    }
  };
}

function profilePage() {
  const u = session.user;
  const admin = u.role === 'admin';
  root.innerHTML = admin
    ? `${adminNav('/profile')}<div class="admin-main"><div class="card">
        <h2>${escapeHtml(u.display_name)}</h2><p>${escapeHtml(u.email)}</p>
        <p class="meta">Admin</p></div></div>`
    : `<div class="phone-shell">
        <div class="topbar"><span></span><h1>Profile</h1><span></span></div>
        <div class="page">
          <div class="card">
            <h2>${escapeHtml(u.display_name)}</h2>
            <p class="meta">${escapeHtml(u.email)}</p>
            <p><a class="primary small" href="/chat" style="display:inline-block">Message support</a></p>
            <button class="primary" id="logout">Log out</button>
          </div>
        </div>
        ${workerTabs('/profile')}
      </div>`;
}

async function chatPage() {
  const data = await api('/api/chat');
  function paint(messages) {
    root.innerHTML = `<div class="phone-shell">
      <div class="topbar"><a class="icon-btn" href="/profile">←</a><h1>Support</h1><span></span></div>
      <div class="page"><div class="chat-log" id="log">
        ${messages.map((m) => `<div class="bubble ${m.sender_id === session.user.id ? 'me' : 'them'}">${escapeHtml(m.content)}</div>`).join('')}
      </div></div>
      <form class="chat-input" id="cf"><input name="content" placeholder="Message" autocomplete="off" /><button class="primary small" type="submit">Send</button></form>
    </div>`;
    const log = document.getElementById('log');
    log.scrollTop = log.scrollHeight;
    document.getElementById('cf').onsubmit = async (e) => {
      e.preventDefault();
      const content = new FormData(e.target).get('content');
      if (!String(content).trim()) return;
      const sent = await api('/api/chat', { method: 'POST', body: { content } });
      messages.push(sent.message);
      paint(messages);
    };
  }
  paint(data.messages);
  if (socket) {
    socket.off('message:new');
    socket.on('message:new', (payload) => {
      if (payload.conversation_id === data.conversation.id) {
        data.messages.push(payload.message);
        paint(data.messages);
      }
    });
  }
}

async function adminHome() {
  const stats = await api('/api/admin/stats');
  const recent = await api('/api/admin/recent');
  root.innerHTML = `${adminNav('/')}
    <div class="admin-main">
      <div class="grid-stats">
        <div class="card"><div class="stat"><div class="n">${stats.workers}</div><div class="l">Workers</div></div></div>
        <div class="card"><div class="stat"><div class="n">${stats.open_tasks}</div><div class="l">Open tasks</div></div></div>
        <div class="card"><div class="stat"><div class="n">${stats.pending_withdrawals}</div><div class="l">Pending withdrawals</div></div></div>
        <div class="card"><div class="stat"><div class="n">${stats.unread_chats}</div><div class="l">Unread chats</div></div></div>
      </div>
      <div class="card"><h3>Recent submissions</h3>
        <table class="table"><tr><th>Worker</th><th>Task</th><th>When</th></tr>
        ${recent.recent.map((r) => `<tr><td>${escapeHtml(r.display_name)}</td><td>${escapeHtml(r.title)}</td><td>${r.submitted_at ? new Date(r.submitted_at).toLocaleString() : ''}</td></tr>`).join('') || '<tr><td colspan="3" class="meta">None yet</td></tr>'}
        </table></div>
    </div>`;
}

async function adminTasks() {
  const { tasks } = await api('/api/admin/tasks');
  root.innerHTML = `${adminNav('/tasks')}<div class="admin-main">
    <div class="section-h"><h2>Tasks</h2><a class="primary small" href="/tasks/new">New task</a></div>
    <div class="card"><table class="table">
      <tr><th>Title</th><th>Type</th><th>Pay</th><th>Items</th><th>Submissions</th></tr>
      ${tasks.map((t) => `<tr><td>${escapeHtml(t.title)}</td><td>${t.type}</td><td>${money(t.pay_dollars)}</td><td>${t.item_count}</td><td>${t.submissions}</td></tr>`).join('')}
    </table></div>
  </div>`;
}

function adminTaskNew() {
  root.innerHTML = `${adminNav('/tasks')}<div class="admin-main"><form class="card" id="nt" style="max-width:640px">
    <h2>New task</h2>
    <label>Type</label>
    <select name="type">
      <option value="image">Image labeling</option>
      <option value="text">Text annotation</option>
      <option value="intent">Intent classification</option>
    </select>
    <label>Title</label><input name="title" required />
    <label>Description</label><input name="description" />
    <label>Pay (USD)</label><input name="pay" type="number" step="0.01" value="0.85" />
    <label>Est. minutes</label><input name="est" type="number" value="5" />
    <label>Items (one per line)</label>
    <textarea name="items" rows="6" placeholder="image: URL | labels csv | gold&#10;text: sentence | labels csv | gold&#10;intent: utterance | intents csv | gold"></textarea>
    <p class="meta">Format: <code>payload | label1,label2 | gold</code>. For images the payload is an image URL; for text a sentence; for intent an utterance.</p>
    <p class="error" id="nt-err"></p>
    <button class="primary" type="submit">Create</button>
  </form></div>`;
  document.getElementById('nt').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const type = fd.get('type');
    const items = String(fd.get('items') || '').split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
      const [payload, labelsRaw, gold] = line.split('|').map((s) => s.trim());
      const labels = (labelsRaw || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (type === 'image') return { image_url: payload, labels, gold: gold || null };
      if (type === 'text') return { text: payload, labels, gold: gold || null };
      return { utterance: payload, intents: labels, gold: gold || null };
    });
    try {
      await api('/api/admin/tasks', {
        method: 'POST',
        body: {
          type,
          title: fd.get('title'),
          description: fd.get('description'),
          pay_cents: Math.round(Number(fd.get('pay')) * 100),
          est_minutes: Number(fd.get('est') || 5),
          items,
        },
      });
      navTo('/tasks');
    } catch (ex) {
      document.getElementById('nt-err').textContent = ex.message;
    }
  };
}

async function adminWallet() {
  const { withdrawals } = await api('/api/admin/withdrawals');
  root.innerHTML = `${adminNav('/wallet')}<div class="admin-main"><div class="card">
    <h2>Withdrawals</h2>
    <table class="table">
      <tr><th>User</th><th>Amount</th><th>Status</th><th></th></tr>
      ${withdrawals.map((w) => `<tr>
        <td>${escapeHtml(w.display_name)}<div class="meta">${escapeHtml(w.email)}</div></td>
        <td>${money(w.amount)}</td><td>${w.status}</td>
        <td class="row-actions">${w.status === 'PENDING' ? `<button class="primary small" data-a="${w.id}">Approve</button><button data-r="${w.id}">Reject</button>` : ''}</td>
      </tr>`).join('')}
    </table>
  </div></div>`;
  root.querySelectorAll('[data-a]').forEach((b) => {
    b.onclick = async () => {
      await api(`/api/admin/withdrawals/${b.dataset.a}/approve`, { method: 'POST' });
      render();
    };
  });
  root.querySelectorAll('[data-r]').forEach((b) => {
    b.onclick = async () => {
      await api(`/api/admin/withdrawals/${b.dataset.r}/reject`, { method: 'POST' });
      render();
    };
  });
}

async function adminInbox() {
  const { conversations } = await api('/api/admin/chat');
  let current = conversations[0]?.id || null;
  async function show(id) {
    current = id;
    const detail = id ? await api(`/api/admin/chat/${id}`) : { messages: [], conversation: null };
    if (socket && id) socket.emit('join_conv', id);
    root.innerHTML = `${adminNav('/inbox')}<div class="admin-main"><div class="card inbox">
      <div class="list">${conversations.map((c) => `<div class="conv ${c.id === current ? 'active' : ''}" data-id="${c.id}">
        <b>${escapeHtml(c.display_name)}</b>${c.unread ? `<span class="badge">${c.unread}</span>` : ''}
        <div class="meta">${escapeHtml(c.last_message || '')}</div>
      </div>`).join('') || '<p class="meta">No conversations</p>'}</div>
      <div>
        <div class="chat-log" style="padding:12px; min-height:320px" id="log">
          ${(detail.messages || []).map((m) => `<div class="bubble ${m.role === 'admin' ? 'me' : 'them'}">${escapeHtml(m.content)}</div>`).join('')}
        </div>
        ${id ? `<form class="chat-input" style="position:static;transform:none;max-width:none" id="cf"><input name="content" placeholder="Reply" /><button class="primary small">Send</button></form>` : ''}
      </div>
    </div></div>`;
    root.querySelectorAll('.conv').forEach((el) => { el.onclick = () => show(Number(el.dataset.id)); });
    const form = document.getElementById('cf');
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const content = new FormData(form).get('content');
        if (!String(content).trim()) return;
        await api(`/api/admin/chat/${id}`, { method: 'POST', body: { content } });
        const idx = conversations.findIndex((c) => c.id === id);
        if (idx >= 0) conversations[idx].last_message = content;
        show(id);
      };
    }
  }
  await show(current);
}

async function render() {
  const path = location.pathname;
  bindClicks();
  if (!token()) {
    if (path !== '/login') { history.replaceState({}, '', '/login'); }
    loginPage();
    return;
  }
  await ensureSession();
  if (!session) { loginPage(); return; }
  if (!socket) connectSocket();
  const role = session.user.role;
  try {
    if (path === '/login') { navTo('/'); return; }
    if (role === 'admin') {
      if (path === '/' ) return adminHome();
      if (path === '/tasks') return adminTasks();
      if (path === '/tasks/new') return adminTaskNew();
      if (path === '/wallet') return adminWallet();
      if (path === '/inbox') return adminInbox();
      if (path === '/profile') return profilePage();
      return adminHome();
    }
    if (path === '/') return workerHome();
    if (path === '/tasks') return workerTasks();
    if (path.startsWith('/tasks/')) return taskWork(path.split('/')[2]);
    if (path === '/leaders') return leaders();
    if (path === '/wallet') return walletPage();
    if (path === '/profile') return profilePage();
    if (path === '/chat') return chatPage();
    return workerHome();
  } finally {
    bindClicks();
  }
}

function bindClicks() {
  root.onclick = (e) => {
    const a = e.target.closest('a[href]');
    if (a && a.getAttribute('href').startsWith('/')) {
      e.preventDefault();
      navTo(a.getAttribute('href'));
    }
    if (e.target.id === 'logout') {
      setToken(null);
      session = null;
      if (socket) { socket.disconnect(); socket = null; }
      navTo('/login');
    }
  };
}

render();
