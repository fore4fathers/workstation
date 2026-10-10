import { useEffect, useRef, useState } from 'react';
import { getSocket } from './socket.js';
import { useLanguage } from './i18n.jsx';
import { money } from './format.js';

function playTone(context) {
  if (!context || context.state !== 'running') return;
  const now = context.currentTime;
  [880, 1174].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = now + index * 0.12;
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.2);
  });
}

export default function WithdrawalNotifications({ session }) {
  const { t } = useLanguage();
  const [notices, setNotices] = useState([]);
  const nextId = useRef(0);
  const audioContext = useRef(null);

  useEffect(() => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return undefined;

    const unlockSound = () => {
      if (!audioContext.current) audioContext.current = new AudioContextClass();
      if (audioContext.current.state === 'suspended') audioContext.current.resume().catch(() => {});
    };
    window.addEventListener('pointerdown', unlockSound);
    window.addEventListener('keydown', unlockSound);
    return () => {
      window.removeEventListener('pointerdown', unlockSound);
      window.removeEventListener('keydown', unlockSound);
      audioContext.current?.close().catch(() => {});
      audioContext.current = null;
    };
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;

    function onNotification(notification) {
      const { type, amount, user_name: userName } = notification || {};
      let messageKey;
      if (type === 'withdrawal_requested' && session.user.role === 'admin') {
        messageKey = 'notifications.withdrawalRequested';
      } else if (type === 'withdrawal_submitted' && session.user.role === 'worker') {
        messageKey = 'notifications.withdrawalSubmitted';
      } else if (type === 'withdrawal_approved') {
        messageKey = session.user.role === 'admin'
          ? 'notifications.withdrawalApprovedAdmin'
          : 'notifications.withdrawalApprovedWorker';
      } else {
        return;
      }

      const message = t(messageKey)
        .replace('{name}', userName || t('Worker'))
        .replace('{amount}', money(amount));
      const id = ++nextId.current;
      setNotices((current) => [...current.slice(-2), { id, message }]);
      playTone(audioContext.current);
      window.setTimeout(() => {
        setNotices((current) => current.filter((notice) => notice.id !== id));
      }, 7000);
    }

    socket.on('withdrawal:notification', onNotification);
    return () => socket.off('withdrawal:notification', onNotification);
  }, [session.user.role, t]);

  if (!notices.length) return null;

  return (
    <div className="withdrawal-notifications" aria-live="polite" aria-relevant="additions">
      {notices.map((notice) => (
        <div className="withdrawal-notice" role="status" key={notice.id}>
          <span>{notice.message}</span>
          <button
            type="button"
            aria-label={t('Close')}
            onClick={() => setNotices((current) => current.filter((item) => item.id !== notice.id))}
          >×</button>
        </div>
      ))}
    </div>
  );
}
