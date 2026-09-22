export interface DeviceInfo {
  userAgent: string;
  friendlyDevice: string;
  browser: string;
  os: string;
  ipAddress: string;
}

export function detectCurrentDevice(): DeviceInfo {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';

  let browser = 'Unknown';
  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Edg')) browser = 'Edge';

  let os = 'Unknown';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Linux')) os = 'Linux';

  let friendlyDevice = 'Desktop';
  if (/Mobile|Android|iPhone|iPad/i.test(ua)) {
    friendlyDevice = /iPad|Tablet/i.test(ua) ? 'Tablet' : 'Mobile';
  }

  return {
    userAgent: ua,
    friendlyDevice,
    browser,
    os,
    ipAddress: 'client', // IP thật lấy từ server nếu cần
  };
}
