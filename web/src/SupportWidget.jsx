import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api.js';
import { getSocket } from './socket.js';
import { mergeMessage } from './chat.js';
import { LocalizedText, useLanguage } from './i18n.jsx';

export default function SupportWidget({ session }) {
  const { t: trText } = useLanguage();
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState('https://t.me/aiworkstation_support');
  const [mode, setMode] = useState('live_chat');
  const [choice, setChoice] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const logRef = useRef(null);
  const uid = session?.user?.id;
  const isActiveWorker = session?.user?.role === 'worker' && session.user.is_active && session.user.is_verified;

  useEffect(() => {
    if (!isActiveWorker) return undefined;
    api('/api/chat/support-contact').then((data) => {
      setContact(data.contact || 'https://t.me/aiworkstation_support');
      setMode(data.mode || 'live_chat');
      setChoice(data.mode === 'telegram' ? 'telegram' : 'live_chat');
    }).catch(() => {});
    return undefined;
  }, [uid, isActiveWorker]);

  useEffect(() => {
    if (!isActiveWorker || !open || choice !== 'live_chat') return undefined;
    let socket;
    let onNew;
    api('/api/chat').then((data) => {
      setConversation(data.conversation);
      setMessages(data.messages || []);
      socket = getSocket();
      if (!socket) return;
      onNew = (payload) => {
        if (payload.conversation_id === data.conversation.id) setMessages((prev) => mergeMessage(prev, payload.message));
      };
      socket.on('message:new', onNew);
    }).catch((err) => setError(err.message));
    return () => { if (socket && onNew) socket.off('message:new', onNew); };
  }, [uid, isActiveWorker, open, choice]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, open, choice]);

  async function send(e) {
    e.preventDefault();
    const content = message.trim();
    if (!content) return;
    setMessage('');
    setError('');
    try {
      const result = await api('/api/chat', { method: 'POST', body: { content } });
      setConversation(result.conversation);
      setMessages((prev) => mergeMessage(prev, result.message));
    } catch (err) { setError(err.message); }
  }

  if (!isActiveWorker) return null;
  const primary = mode === 'telegram' ? 'telegram' : 'live_chat';

  return (
    <div className="support-widget">
      {open ? <section className="support-widget-panel" aria-label={trText("Customer support")}>
        <header className="support-widget-head">
          <div><b><LocalizedText source={"Customer support"} /></b><span><LocalizedText source={"Choose how you want to contact support."} /></span></div>
          <button type="button" className="support-widget-close" aria-label={trText("Close")} onClick={() => setOpen(false)}>×</button>
        </header>
        <div className="support-widget-choices">
          <button type="button" className={choice === 'live_chat' ? 'selected' : ''} onClick={() => setChoice('live_chat')}>
            <LocalizedText source={"Live chat"} />{primary === 'live_chat' ? <span><LocalizedText source={"Preferred"} /></span> : null}
          </button>
          <a className={choice === 'telegram' ? 'selected' : ''} href={contact} target="_blank" rel="noreferrer" onClick={() => setChoice('telegram')}>
            Telegram{primary === 'telegram' ? <span><LocalizedText source={"Preferred"} /></span> : null}
          </a>
        </div>
        {choice === 'telegram' ? <div className="support-widget-telegram">
          <p><LocalizedText source={"Continue the conversation with our Telegram support team."} /></p>
          <a className="primary" href={contact} target="_blank" rel="noreferrer"><LocalizedText source={"Open Telegram"} /></a>
        </div> : <>
          <div className="support-widget-log" ref={logRef}>
            {messages.map((item) => <div key={item.id || `${item.created_at}-${item.content}`} className={`bubble ${item.sender_id === uid ? 'me' : 'them'}`}>{item.content}</div>)}
            {!messages.length ? <p className="meta"><LocalizedText source={"Message the support team"} /></p> : null}
          </div>
          <form className="support-widget-compose" onSubmit={send}>
            <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder={trText("Write a message")} aria-label={trText("Write a message")} />
            <button className="primary small" type="submit" disabled={!conversation || !message.trim()}><LocalizedText source={"Send"} /></button>
          </form>
          {error ? <p className="error support-widget-error">{error}</p> : null}
          <Link className="support-widget-full" to="/chat"><LocalizedText source={"Open full support inbox"} /></Link>
        </>}
      </section> : null}
      <button type="button" className="support-widget-launcher" aria-label={trText("Support")} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span aria-hidden="true">✦</span><LocalizedText source={"Support"} />
      </button>
    </div>
  );
}
