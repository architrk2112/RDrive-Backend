const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const { createShareLink, fetchAllShareLinks, revokeShareLink } = require('../controllers/shareLinksController');

const router = express.Router();

router.post('/', requireAuth, createShareLink);
router.get('/', requireAuth, fetchAllShareLinks);
router.delete('/:id', requireAuth, revokeShareLink);

module.exports = router;