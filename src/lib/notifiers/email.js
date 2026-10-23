'use strict';
const nodemailer = require('nodemailer');
const env        = require('../../config/env');
const logger     = require('../logger');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return transporter;
}

/**
 * Send an alert email.
 * @param {object} monitor
 * @param {'down'|'recovered'} type
 * @param {object} result
 * @param {string} toEmail
 */
async function sendEmail(monitor, type, result, toEmail) {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    logger.warn('Email notifier not configured, skipping');
    return;
  }

  const isDown = type === 'down';
  const emoji  = isDown ? '🔴' : '🟢';
  const subject = isDown
    ? `${emoji} [Sentinel] ${monitor.name} is DOWN`
    : `${emoji} [Sentinel] ${monitor.name} recovered`;

  const reason = result.error
    ? `Error: ${result.error}`
    : result.statusCode
      ? `HTTP ${result.statusCode} (expected ${monitor.expected_status})`
      : 'Unknown';

  const html = `
    <h2>${emoji} Monitor ${isDown ? 'DOWN' : 'Recovered'}</h2>
    <table>
      <tr><td><b>Monitor</b></td><td>${monitor.name}</td></tr>
      <tr><td><b>URL</b></td><td><a href="${monitor.url}">${monitor.url}</a></td></tr>
      <tr><td><b>Status</b></td><td>${isDown ? 'DOWN' : 'RECOVERED'}</td></tr>
      ${isDown ? `<tr><td><b>Reason</b></td><td>${reason}</td></tr>` : ''}
      <tr><td><b>Time</b></td><td>${new Date().toISOString()}</td></tr>
    </table>
    <p style="color:#888;font-size:12px">Sent by Sentinel uptime monitoring</p>
  `;

  await getTransporter().sendMail({
    from:    env.SMTP_FROM || 'Sentinel <no-reply@sentinel.example.com>',
    to:      toEmail,
    subject,
    html,
  });
}

module.exports = { sendEmail };
