const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const { upload, uploadFile, downloadFile, viewFile, renameFile, deleteFile } = require('../controllers/fileController');

const router = express.Router();

router.post('/upload', requireAuth, upload.array('files'), uploadFile);
router.get('/:fileId/download', requireAuth, downloadFile);
router.get('/:fileId/view', requireAuth, viewFile);
router.patch('/:fileId/rename', requireAuth, renameFile);
router.delete('/:fileId', requireAuth, deleteFile);

module.exports = router;