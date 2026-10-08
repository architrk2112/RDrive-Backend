const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const { createShareLink, fetchAllShareLinks, revokeShareLink, deleteShareLink } = require('../controllers/shareLinksController');

const router = express.Router();

router.post('/', requireAuth, createShareLink);
router.get('/', requireAuth, fetchAllShareLinks);
router.patch('/:id/revoke', requireAuth, revokeShareLink);
router.delete('/:id', requireAuth, deleteShareLink);

module.exports = router;