'use strict';
const { query }         = require('../../db/pool');
const { sendEmail }     = require('./email');
const { sendTelegram }  = require('./telegram');
const logger            = require('../logger');

const COOLDOWN_MINUTES = 10;

/**
 * Send all configured alerts for a monitor event, with cooldown to prevent
 * alert storms from flapping monitors.
 *
 * @param {object} monitor   Full monitor row
 * @param {'down'|'recovered'} type
 * @param {object} result    Check result
 */
async function notify(monitor, type, result) {
  // Cooldown check: skip if same type was sent in the last COOLDOWN_MINUTES
  const { rows: recent } = await query(
    `SELECT id FROM alerts_log
     WHERE monitor_id = $1 AND type = $2 AND sent_at > now() - interval '${COOLDOWN_MINUTES} minutes'
     LIMIT 1`,
    [monitor.id, type],
  );

  if (recent.length > 0) {
    logger.info({ monitorId: monitor.id, type }, 'Alert suppressed by cooldown');
    return;
  }

  // Get current open incident id for logging
  const { rows: incidentRows } = await query(
    `SELECT id FROM incidents WHERE monitor_id = $1 AND resolved_at IS NULL LIMIT 1`,
    [monitor.id],
  );
  const incidentId = incidentRows[0]?.id ?? null;

  // Get user email and telegram chat id
  const { rows: userRows } = await query(
    'SELECT email, telegram_chat_id FROM users WHERE id = $1',
    [monitor.user_id],
  );
  const user = userRows[0];
  if (!user) return;

  const channels = [];

  // Email
  if (user.email) {
    channels.push(
      sendEmail(monitor, type, result, user.email)
        .then(() => logAlert(monitor.id, incidentId, type, 'email', null))
        .catch(err => logAlert(monitor.id, incidentId, type, 'email', err.message)),
    );
  }

  // Telegram
  if (user.telegram_chat_id) {
    channels.push(
      sendTelegram(monitor, type, result, user.telegram_chat_id)
        .then(() => logAlert(monitor.id, incidentId, type, 'telegram', null))
        .catch(err => logAlert(monitor.id, incidentId, type, 'telegram', err.message)),
    );
  }

  await Promise.allSettled(channels);
}

async function logAlert(monitorId, incidentId, type, channel, error) {
  try {
    await query(
      `INSERT INTO alerts_log (monitor_id, incident_id, type, channel, error)
       VALUES ($1, $2, $3, $4, $5)`,
      [monitorId, incidentId, type, channel, error],
    );
  } catch (err) {
    logger.error({ err, monitorId }, 'Failed to log alert');
  }
}

module.exports = { notify };
