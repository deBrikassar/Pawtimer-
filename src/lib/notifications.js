export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission !== 'denied') {
    try {
      return await Notification.requestPermission();
    } catch (e) {
      console.warn('Failed to request notification permission:', e);
      return 'denied';
    }
  }
  return 'denied';
};

export const sendNotification = (title, options = {}) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }
  
  try {
    new Notification(title, {
      icon: '/icons/app-logo.png',
      ...options
    });
    
    // Attempt to play a gentle default beep if requested
    if (options.playSound) {
      playBeep();
    }
  } catch (error) {
    console.warn('Failed to send notification:', error);
  }
};

const playBeep = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.5);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (err) {
    // Graceful fallback if audio context fails
  }
};
