'use strict';
const env    = require('../../config/env');
const logger = require('../logger');

/**
 * Send a Telegram message to a chat.
 * No external library needed — plain fetch to the Bot API.
 *
 * @param {string} chatId
 * @param {string} text  Markdown text
 */
async function sendTelegramMessage(chatId, text) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    logger.warn('Telegram bot token not configured, skipping');
    return;
  }

  const url  = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Telegram API error ${resp.status}: ${body}`);
  }
}

/**
 * Send an alert via Telegram.
 * @param {object} monitor
 * @param {'down'|'recovered'} type
 * @param {object} result
 * @param {string} chatId
 */
async function sendTelegram(monitor, type, result, chatId) {
  const isDown = type === 'down';
  const emoji  = isDown ? '🔴' : '🟢';

  const reason = result.error
    ? `Error: \`${result.error}\``
    : result.statusCode
      ? `HTTP \`${result.statusCode}\` (expected \`${monitor.expected_status}\`)`
      : 'Unknown';

  const text = isDown
    ? `${emoji} *Monitor DOWN*\n*${monitor.name}*\n${monitor.url}\n${reason}\n_${new Date().toISOString()}_`
    : `${emoji} *Monitor Recovered*\n*${monitor.name}*\n${monitor.url}\n_${new Date().toISOString()}_`;

  await sendTelegramMessage(chatId, text);
}

module.exports = { sendTelegram };
