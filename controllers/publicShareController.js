const fs = require('fs');
const path = require('path');
const Folder = require('../models/folder');
const File = require('../models/file');

const storageRoot = path.join(__dirname, '../storage');

const resolveStoragePath = (storageKey) => {
    const normalizedKey = String(storageKey || '').replace(/\\/g, '/');
    return path.join(storageRoot, normalizedKey);
};

const isFolderInsideSharedScope = async (share, folderId) => {
    if (share.resourceType === 'drive') {
        return true;
    }

    if (!share.folderId) {
        return false;
    }

    const sharedRootId = String(share.folderId);

    if (!folderId || folderId === 'root') {
        return true;
    }

    let currentId = String(folderId);

    while (currentId) {
        const folder = await Folder.findOne({
            _id: currentId,
            userId: share.userId?._id || share.userId,
        }).lean();

        if (!folder) {
            return false;
        }

        if (String(folder._id) === sharedRootId) {
            return true;
        }

        currentId = folder.parentFolderId ? String(folder.parentFolderId) : null;
    }

    return false;
};

const isFileInsideSharedScope = async (share, fileDoc) => {
    if (!fileDoc) {
        return false;
    }

    if (share.resourceType === 'drive') {
        return true;
    }

    if (!share.folderId) {
        return false;
    }

    if (!fileDoc.folderId) {
        return String(share.folderId) === 'root';
    }

    return isFolderInsideSharedScope(share, String(fileDoc.folderId));
};

const getPublicShareInfo = (req, res) => {
    return res.status(200).json({
        share: req.publicShare,
    });
};

const getPublicFolderContents = async (req, res) => {
    try {
        const { token, folderId = 'root' } = req.params;
        const share = req.share;

        if (!share) {
            return res.status(401).json({ message: 'Share validation failed.' });
        }

        if (share.resourceType !== 'drive') {
            const requestedFolderId = folderId === 'root' ? share.folderId : folderId;
            const isAllowed = await isFolderInsideSharedScope(share, requestedFolderId);

            if (!isAllowed) {
                return res.status(403).json({
                    message: 'Access denied: this folder is outside the shared scope.'
                });
            }
        }

        const ownerId = share.userId?._id || share.userId;
        const isDriveShare = share.resourceType === 'drive';
        const baseFolderId = isDriveShare ? null : share.folderId;

        const queryFolderId = folderId === 'root' ? baseFolderId : folderId;

        const folders = await Folder.find({
            userId: ownerId,
            parentFolderId: queryFolderId,
        }).lean();

        const files = await File.find({
            userId: ownerId,
            folderId: queryFolderId,
        }).lean();

        return res.status(200).json({
            token,
            share: req.publicShare,
            folders,
            files,
        });
    } catch (error) {
        console.error('getPublicFolderContents error:', error);
        return res.status(500).json({ message: 'Failed to load shared folder contents.' });
    }
};

const getPublicDriveRoot = async (req, res) => {
    try {
        const { token } = req.params;
        const share = req.share;

        if (!share || share.resourceType !== 'drive') {
            return res.status(403).json({ message: 'This link does not allow drive access.' });
        }

        const ownerId = share.userId?._id || share.userId;
        const folders = await Folder.find({
            userId: ownerId,
            parentFolderId: null,
        }).lean();

        const files = await File.find({
            userId: ownerId,
            folderId: null,
        }).lean();

        return res.status(200).json({
            token,
            share: req.publicShare,
            folders,
            files,
        });
    } catch (error) {
        console.error('getPublicDriveRoot error:', error);
        return res.status(500).json({ message: 'Failed to load shared drive contents.' });
    }
};

const streamPublicFile = async (req, res, disposition = 'inline') => {
    try {
        const { fileId } = req.params;
        const share = req.share;

        if (!share) {
            return res.status(401).json({ message: 'Share validation failed.' });
        }

        const ownerId = share.userId?._id || share.userId;
        const fileDoc = await File.findOne({
            _id: fileId,
            userId: ownerId,
        }).lean();

        if (!fileDoc) {
            return res.status(404).json({ message: 'File not found.' });
        }

        const isAllowed = await isFileInsideSharedScope(share, fileDoc);
        if (!isAllowed) {
            return res.status(403).json({
                message: 'Access denied: this file is outside the shared scope.'
            });
        }

        const filePath = resolveStoragePath(fileDoc.storageKey);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: 'File not found on disk.' });
        }

        res.setHeader('Content-Type', fileDoc.mimeType || 'application/octet-stream');
        res.setHeader(
            'Content-Disposition',
            `${disposition}; filename="${encodeURIComponent(fileDoc.name)}"`
        );

        return fs.createReadStream(filePath).pipe(res);
    } catch (error) {
        console.error('streamPublicFile error:', error);
        return res.status(500).json({ message: 'Failed to access shared file.' });
    }
};

const getPublicFileView = async (req, res) => {
    return streamPublicFile(req, res, 'inline');
};

const getPublicFileDownload = async (req, res) => {
    return streamPublicFile(req, res, 'attachment');
};

module.exports = {
    getPublicShareInfo,
    getPublicFolderContents,
    getPublicDriveRoot,
    getPublicFileView,
    getPublicFileDownload,
};