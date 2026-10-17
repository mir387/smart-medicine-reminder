
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const isNative = Capacitor.isNativePlatform();

function dateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function stableId(value) {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return ((hash >>> 0) & 0x7fffffff) || 1;
}

async function enable() {
  if (!isNative) return false;

  let permission = await LocalNotifications.checkPermissions();

  if (permission.display !== 'granted') {
    permission = await LocalNotifications.requestPermissions();
  }

  return permission.display === 'granted';
}

async function reschedule(medicines, events) {
  if (!isNative) return { scheduled: 0, permission: false };

  const permission = await LocalNotifications.checkPermissions();

  if (permission.display !== 'granted') {
    return { scheduled: 0, permission: false };
  }

  const pending = await LocalNotifications.getPending();

  if (pending.notifications.length) {
    await LocalNotifications.cancel({
      notifications: pending.notifications.map(n => ({ id: n.id }))
    });
  }

  const now = new Date();
  const notifications = [];

  for (let offset = 0; offset < 14; offset++) {
    const dayDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + offset
    );

    const day = dateKey(dayDate);

    for (const medicine of medicines || []) {
      if (!medicine.start || medicine.start > day) continue;
      if (medicine.end && medicine.end < day) continue;

      for (const time of medicine.times || []) {
        const eventKey = medicine.id + '|' + day + '|' + time;

        const alreadyAcknowledged = (events || []).some(
          event => event.key === eventKey && event.kind === 'ack'
        );

        if (alreadyAcknowledged) continue;

        const parts = time.split(':').map(Number);

        if (
          parts.length !== 2 ||
          parts.some(Number.isNaN) ||
          parts[0] > 23 ||
          parts[1] > 59 ||
          parts[0] < 0 ||
          parts[1] < 0
        ) continue;

        const at = new Date(
          dayDate.getFullYear(),
          dayDate.getMonth(),
          dayDate.getDate(),
          parts[0],
          parts[1]
        );

        if (at <= now) continue;

        notifications.push({
          id: stableId('carecue|' + eventKey),
          title: 'CareCue medicine reminder',
          body: medicine.name + ' · Check your prescribed instructions.',
          schedule: {
            at,
            allowWhileIdle: true
          },
          extra: {
            medicineId: medicine.id,
            date: day,
            time
          }
        });
      }
    }
  }

  if (notifications.length) {
    await LocalNotifications.schedule({ notifications });
  }

  return {
    scheduled: notifications.length,
    permission: true
  };
}

window.CareCueNotifications = {
  isNative,
  enable,
  reschedule
};
