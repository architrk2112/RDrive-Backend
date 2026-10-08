const express = require('express');
const { validatePublicShare } = require('../middleware/publicShareMiddleware');
const {
    getPublicShareInfo,
    getPublicFolderContents,
    getPublicDriveRoot,
    getPublicFileView,
    getPublicFileDownload,
} = require('../controllers/publicShareController');

const router = express.Router();

router.get('/:token', validatePublicShare, getPublicShareInfo);
router.get('/:token/folders/:folderId', validatePublicShare, getPublicFolderContents);
router.get('/:token/drive', validatePublicShare, getPublicDriveRoot);
router.get('/:token/files/:fileId/view', validatePublicShare, getPublicFileView);
router.get('/:token/files/:fileId/download', validatePublicShare, getPublicFileDownload);

module.exports = router;