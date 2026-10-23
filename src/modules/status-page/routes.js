'use strict';
const { Router } = require('express');
const path       = require('path');
const { getStatusPage } = require('./service');

const router = Router();

// Set EJS view directory for this module
const viewsDir = path.join(__dirname, 'views');

router.get('/status/:slug', async (req, res, next) => {
  try {
    const data = await getStatusPage(req.params.slug);
    if (!data) {
      return res.status(404).send('<h1>Status page not found</h1>');
    }
    res.render(path.join(viewsDir, 'status'), {
      slug:     data.user.slug,
      monitors: data.monitors,
    });
  } catch (err) { next(err); }
});

router.get('/status/:slug.json', async (req, res, next) => {
  try {
    const data = await getStatusPage(req.params.slug);
    if (!data) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Status page not found' } });
    }
    res.json(data);
  } catch (err) { next(err); }
});

module.exports = router;
