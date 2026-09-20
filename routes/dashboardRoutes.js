const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const { displayFoldersAndFiles } = require('../controllers/dashboardController');

const router = express.Router();

router.get('/', requireAuth, displayFoldersAndFiles);

module.exports = router;