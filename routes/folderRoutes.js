const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const { createFolder, fetchFolderContents, renameFolder, deleteFolder } = require('../controllers/folderController');

const router = express.Router();

router.get('/:folderId/contents', requireAuth, fetchFolderContents);
router.post('/', requireAuth, createFolder);
router.patch('/:folderId/rename', requireAuth, renameFolder);
router.delete('/:folderId', requireAuth, deleteFolder);

module.exports = router;