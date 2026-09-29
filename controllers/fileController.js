const fs = require('fs');
const path = require('path');
const multer = require('multer');

const File = require('../models/file');
const Folder = require('../models/folder');

const storageRoot = path.join(__dirname, '../storage');
const uploadDir = path.join(storageRoot, 'tmp');

fs.mkdirSync(storageRoot, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, uploadDir),
        filename: (_req, file, cb) => {
            const safeBaseName = (file.originalname || 'upload')
                .replace(/\s+/g, '-')
                .replace(/[^a-zA-Z0-9._-]/g, '') || 'upload';

            cb(null, `${Date.now()}-${safeBaseName}`);
        },
    }),
    limits: {
        fileSize: 10 * 1024 * 1024 * 1024,
    },
});

const sanitizeFileName = (fileName = '') => {
    const safeName = String(fileName).replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '');
    return safeName || `file-${Date.now()}`;
};

const buildFolderPath = async (userId, folderId) => {
    const segments = [];
    let currentFolderId = folderId && folderId !== 'root' ? folderId : null;

    while (currentFolderId) {
        const folderDoc = await Folder.findOne({
            _id: currentFolderId,
            userId,
        }).lean();

        if (!folderDoc) {
            break;
        }

        segments.unshift(folderDoc.name);
        currentFolderId = folderDoc.parentFolderId || null;
    }

    const userStorageRoot = path.join(storageRoot, String(userId));
    return path.join(userStorageRoot, ...segments);
};

const resolveStoragePath = (storageKey) => {
    const normalizedKey = String(storageKey || '').replace(/\\/g, '/');
    return path.join(storageRoot, normalizedKey);
};

const uploadFile = async (req, res) => {
    try {
        const files = Array.isArray(req.files) ? req.files : req.file ? [req.file] : [];

        if (!files.length) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const userId = req.user.id;
        const parentId = req.body.parentId ?? req.body.folderId;
        const folderId = parentId && parentId !== 'root' ? parentId : null;
        const uploadedFiles = [];

        for (const file of files) {
            const safeName = sanitizeFileName(file.originalname);
            const uniqueFileName = `${Date.now()}-${safeName}`;
            const targetFolderPath = await buildFolderPath(userId, folderId);
            const targetFilePath = path.join(targetFolderPath, uniqueFileName);

            try {
                await fs.promises.mkdir(targetFolderPath, { recursive: true });
                await fs.promises.rename(file.path, targetFilePath);

                const storageKey = path.relative(storageRoot, targetFilePath).split(path.sep).join('/');

                const fileDoc = await File.create({
                    userId,
                    folderId,
                    name: file.originalname,
                    size: file.size,
                    mimeType: file.mimetype,
                    visibility: req.body.visibility || 'private',
                    storageKey,
                });

                uploadedFiles.push(fileDoc);

                console.log(`Upload successful: ${file.originalname}`);
            } finally {
                if(file.path) {
                    try {
                        await fs.promises.unlink(file.path);
                    } catch (error) {
                        if (error.code !== 'ENOENT') {
                            console.error('Failed to remove temporary upload:', error);
                        }
                    }
                }
            }
        }

        return res.status(201).json({
            message: 'File uploaded successfully',
            files: uploadedFiles,
        });
    } catch (error) {
        console.error('Upload error:', error);
        return res.status(500).json({ message: 'File upload failed' });
    }
};

const downloadFile = async (req, res) => {
    try {
        const fileDoc = await File.findOne({
            _id: req.params.fileId,
            userId: req.user.id,
        });

        if (!fileDoc) {
            return res.status(404).json({ message: 'File not found' });
        }

        const filePath = resolveStoragePath(fileDoc.storageKey);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: 'File not found on disk' });
        }

        res.setHeader('Content-Type', fileDoc.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileDoc.name)}"`);

        return fs.createReadStream(filePath).pipe(res);
    } catch (error) {
        console.error('Download error:', error);
        return res.status(500).json({ message: 'File download failed' });
    }
};

const renameFile = async (req, res) => {
    try {
        const { name } = req.body;
        const trimmedName = String(name || '').trim();

        if (!trimmedName) {
            return res.status(400).json({ message: 'File name is required' });
        }

        const fileDoc = await File.findOne({
            _id: req.params.fileId,
            userId: req.user.id,
        });

        if (!fileDoc) {
            return res.status(404).json({ message: 'File not found' });
        }

        const oldPath = resolveStoragePath(fileDoc.storageKey);
        const directoryPath = path.dirname(oldPath);
        const safeName = sanitizeFileName(trimmedName);
        const uniqueFileName = `${Date.now()}-${safeName}`;
        const newPath = path.join(directoryPath, uniqueFileName);

        if (fs.existsSync(oldPath) && oldPath !== newPath) {
            await fs.promises.rename(oldPath, newPath);
        }

        fileDoc.name = trimmedName;
        fileDoc.storageKey = path.relative(storageRoot, newPath).split(path.sep).join('/');
        await fileDoc.save();

        return res.status(200).json({
            message: 'File renamed successfully',
            file: fileDoc,
        });
    } catch (error) {
        console.error('Rename file error:', error);
        return res.status(500).json({ message: 'File rename failed' });
    }
};

const updateFileVisibility = async (req, res) => {
    try {
        const { visibility } = req.body;
        const allowedVisibility = ['public', 'private'];

        if (!allowedVisibility.includes(visibility)) {
            return res.status(400).json({ message: 'Invalid visibility value' });
        }

        const fileDoc = await File.findOne({
            _id: req.params.fileId,
            userId: req.user.id,
        });

        if (!fileDoc) {
            return res.status(404).json({ message: 'File not found' });
        }

        fileDoc.visibility = visibility;
        await fileDoc.save();

        return res.status(200).json({
            message: 'File visibility updated successfully',
            file: fileDoc,
        });
    } catch (error) {
        console.error('Visibility update error:', error);
        return res.status(500).json({ message: 'File visibility update failed' });
    }
};

const deleteFile = async (req, res) => {
    try {
        const fileDoc = await File.findOne({
            _id: req.params.fileId,
            userId: req.user.id,
        });

        if (!fileDoc) {
            return res.status(404).json({ message: 'File not found' });
        }

        const filePath = resolveStoragePath(fileDoc.storageKey);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        await File.deleteOne({ _id: fileDoc._id, userId: req.user.id });

        return res.status(200).json({
            message: 'File deleted successfully',
            fileId: fileDoc._id,
        });
    } catch (error) {
        console.error('Delete file error:', error);
        return res.status(500).json({ message: 'File deletion failed' });
    }
};

module.exports = {
    upload,
    uploadFile,
    downloadFile,
    renameFile,
    updateFileVisibility,
    deleteFile,
};
