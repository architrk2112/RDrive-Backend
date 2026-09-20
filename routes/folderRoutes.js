const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const { createFolder, fetchFolderContents } = require('../controllers/folderController');

const router = express.Router();

router.get('/:folderId/contents', requireAuth, fetchFolderContents);
router.post('/', requireAuth, createFolder);

module.exports = router;