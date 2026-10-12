try {
  if (location.pathname === '/' && localStorage.getItem('vesper-onboarding-complete-v1') !== '1') location.replace('/start');
} catch { /* If storage is blocked, keep the app available. */ }
