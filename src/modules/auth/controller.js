'use strict';
const authService = require('./service');

async function register(req, res, next) {
  try {
    const { user, token } = await authService.register(req.body);
    res.status(201).json({ user, token });
  } catch (err) { next(err); }
}

async function login(req, res, next) {
  try {
    const { user, token } = await authService.login(req.body);
    res.json({ user, token });
  } catch (err) { next(err); }
}

async function getMe(req, res, next) {
  try {
    const user = await authService.getProfile(req.user.sub);
    if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    res.json({ user });
  } catch (err) { next(err); }
}

async function patchMe(req, res, next) {
  try {
    const user = await authService.updateProfile(req.user.sub, req.body);
    res.json({ user });
  } catch (err) { next(err); }
}

module.exports = { register, login, getMe, patchMe };
