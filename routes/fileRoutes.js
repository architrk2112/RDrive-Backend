const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const { upload, uploadFile, downloadFile, updateFileVisibility, deleteFile } = require('../controllers/fileController');

const router = express.Router();

router.post('/upload', requireAuth, upload.array('files'), uploadFile);
router.get('/:fileId/download', requireAuth, downloadFile);
router.patch('/:fileId/visibility', requireAuth, updateFileVisibility);
router.delete('/:fileId', requireAuth, deleteFile);

module.exports = router;
