'use strict';
const svc = require('./service');

async function list(req, res, next) {
  try {
    const monitors = await svc.listMonitors(req.user.sub);
    res.json({ monitors });
  } catch (err) { next(err); }
}

async function get(req, res, next) {
  try {
    const monitor = await svc.getMonitor(req.params.id, req.user.sub);
    if (!monitor) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Monitor not found' } });
    res.json({ monitor });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const monitor = await svc.createMonitor(req.user.sub, req.body);
    res.status(201).json({ monitor });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const monitor = await svc.updateMonitor(req.params.id, req.user.sub, req.body);
    if (!monitor) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Monitor not found' } });
    res.json({ monitor });
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const deleted = await svc.deleteMonitor(req.params.id, req.user.sub);
    if (!deleted) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Monitor not found' } });
    res.status(204).end();
  } catch (err) { next(err); }
}

async function checks(req, res, next) {
  try {
    const limit = parseInt(req.query.limit ?? '100', 10);
    const rows  = await svc.getChecks(req.params.id, req.user.sub, limit);
    if (!rows) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Monitor not found' } });
    res.json({ checks: rows });
  } catch (err) { next(err); }
}

async function incidents(req, res, next) {
  try {
    const rows = await svc.getIncidents(req.params.id, req.user.sub);
    if (!rows) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Monitor not found' } });
    res.json({ incidents: rows });
  } catch (err) { next(err); }
}

module.exports = { list, get, create, update, remove, checks, incidents };
