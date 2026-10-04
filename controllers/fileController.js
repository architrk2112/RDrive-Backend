const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

            cb(null, `${crypto.randomUUID()}-${safeBaseName}`);
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

const sanitizeFolderName = (folderName) => {
    const safeName = String(folderName).trim().replace(/[<>:"|?*\x00-\x1F]/g, '').replace(/[. ]+$/g, '');
    if (!safeName || safeName === '.' || safeName === '..') {
        const error = new Error('Invalid folder name in uploaded path');
        error.code = 'INVALID_UPLOAD_PATH';
        throw error;
    }
    return safeName;
};

const parseUploadPath = (relativePath, fallbackName) => {
    const rawPath = String(relativePath || fallbackName || '').replace(/\\/g, '/');
    const segments = rawPath.split('/');

    if (
        !rawPath ||
        path.posix.isAbsolute(rawPath) ||
        path.win32.isAbsolute(rawPath) ||
        segments.some((segment) => !segment || segment === '.' || segment === '..')
    ) {
        const error = new Error('Invalid relative path for uploaded file');
        error.code = 'INVALID_UPLOAD_PATH';
        throw error;
    }

    const originalFileName = segments.pop();
    const folderNames = segments.map(sanitizeFolderName);
    return { folderNames, fileName: sanitizeFileName(originalFileName) };
};

const ensureUploadFolders = async (userId, parentFolderId, folderNames, basePath) => {
    let currentParentId = parentFolderId;
    let currentPath = basePath;

    for (const name of folderNames) {
        let folder = await Folder.findOne({
            userId,
            name,
            parentFolderId: currentParentId,
        });

        if (!folder) {
            folder = await Folder.create({
                userId,
                name,
                parentFolderId: currentParentId,
            });
        }

        currentParentId = folder._id;
        currentPath = path.join(currentPath, folder.name);
    }
    await fs.promises.mkdir(currentPath, { recursive: true });

    return { folderId: currentParentId, folderPath: currentPath };
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
    const files = Array.isArray(req.files) ? req.files : req.file ? [req.file] : [];

    try {
        if (!files.length) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const userId = req.user.id;
        const parentId = req.body.parentId ?? req.body.folderId;
        const folderId = parentId && parentId !== 'root' ? parentId : null;
        const relativePaths = req.body.relativePaths
            ? JSON.parse(req.body.relativePaths)
            : files.map((file) => file.originalname);

        if (!Array.isArray(relativePaths) || relativePaths.length !== files.length) {
            const error = new Error('Invalid upload paths');
            error.code = 'INVALID_UPLOAD_PATH';
            throw error;
        }

        const uploadPaths = relativePaths.map((relativePath, index) =>
            parseUploadPath(relativePath, files[index].originalname)
        );

        if (folderId) {
            const parentFolder = await Folder.findOne({ _id: folderId, userId });
            if (!parentFolder) {
                const error = new Error('Destination folder not found');
                error.code = 'UPLOAD_PARENT_NOT_FOUND';
                throw error;
            }
        }

        const baseFolderPath = await buildFolderPath(userId, folderId);
        const uploadedFiles = [];

        for (const [index, file] of files.entries()) {
            const { folderNames, fileName } = uploadPaths[index];
            const destination = await ensureUploadFolders(userId, folderId, folderNames, baseFolderPath);
            const uniqueFileName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${fileName}`;
            const targetFolderPath = destination.folderPath;
            const targetFilePath = path.join(targetFolderPath, uniqueFileName);

            try {
                await fs.promises.mkdir(targetFolderPath, { recursive: true });
                await fs.promises.rename(file.path, targetFilePath);

                const storageKey = path.relative(storageRoot, targetFilePath).split(path.sep).join('/');

                const fileDoc = await File.create({
                    userId,
                    folderId: destination.folderId,
                    name: file.originalname,
                    size: file.size,
                    mimeType: file.mimetype,
                    visibility: req.body.visibility || 'private',
                    storageKey,
                });

                uploadedFiles.push(fileDoc);

                console.log(`Upload successful: ${file.originalname}`);
            } finally {
                if (file.path) {
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
        await Promise.all(files.map(async (file) => {
            if (!file.path) return;
            try {
                await fs.promises.unlink(file.path);
            } catch (cleanupError) {
                if (cleanupError.code !== 'ENOENT') {
                    console.error('Failed to remove temporary upload:', cleanupError);
                }
            }
        }));
        if (error.code === 'INVALID_UPLOAD_PATH' || error instanceof SyntaxError) {
            return res.status(400).json({ message: 'Invalid uploaded folder structure' });
        }
        if (error.code === 'UPLOAD_PARENT_NOT_FOUND') {
            return res.status(404).json({ message: error.message });
        }
        if (error.name === 'CastError') {
            return res.status(400).json({ message: 'Invalid destination folder ID' });
        }
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

const parseByteRange = (rangeHeader, fileSize) => {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader);
    if (!match || (!match[1] && !match[2]) || fileSize === 0) {
        return null;
    }

    let start;
    let end;

    if (!match[1]) {
        const suffixLength = Number(match[2]);
        if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
            return null;
        }
        start = Math.max(fileSize - suffixLength, 0);
        end = fileSize - 1;
    } else {
        start = Number(match[1]);
        end = match[2] ? Number(match[2]) : fileSize - 1;

        if (
            !Number.isSafeInteger(start) ||
            !Number.isSafeInteger(end) ||
            start < 0 ||
            end < start ||
            start >= fileSize
        ) {
            return null;
        }

        end = Math.min(end, fileSize - 1);
    }

    return { start, end };
};

const viewFile = async (req, res) => {
    try {
        const fileDoc = await File.findOne({
            _id: req.params.fileId,
            userId: req.user.id,
        });

        if (!fileDoc) {
            return res.status(404).json({
                message: 'File not found',
            });
        }

        const filePath = resolveStoragePath(fileDoc.storageKey);

        let fileStats;
        try {
            fileStats = await fs.promises.stat(filePath);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return res.status(404).json({ message: 'File not found on disk' });
            }
            throw error;
        }

        if (!fileStats.isFile()) {
            return res.status(404).json({
                message: 'File not found on disk',
            });
        }

        const rangeHeader = req.headers.range;
        const rangeRequested = typeof rangeHeader === 'string' && /^bytes=/i.test(rangeHeader);
        const byteRange = rangeRequested ? parseByteRange(rangeHeader, fileStats.size) : null;

        if (rangeRequested && !byteRange) {
            res.setHeader('Content-Range', `bytes */${fileStats.size}`);
            return res.status(416).end();
        }

        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader(
            'Content-Type',
            fileDoc.mimeType || 'application/octet-stream'
        );

        res.setHeader(
            'Content-Disposition',
            `inline; filename="${encodeURIComponent(fileDoc.name)}"`
        );

        const responseSize = byteRange
            ? byteRange.end - byteRange.start + 1
            : fileStats.size;
        res.setHeader('Content-Length', responseSize);

        if (byteRange) {
            res.status(206);
            res.setHeader(
                'Content-Range',
                `bytes ${byteRange.start}-${byteRange.end}/${fileStats.size}`
            );
        }

        const stream = fs.createReadStream(
            filePath,
            byteRange ? { start: byteRange.start, end: byteRange.end } : undefined
        );

        stream.on('error', (error) => {
            console.error('View file stream error:', error);
            if (!res.headersSent) {
                res.status(500).json({ message: 'Unable to stream file' });
            } else {
                res.destroy(error);
            }
        });

        return stream.pipe(res);

    } catch (error) {
        console.error('View file error:', error);

        return res.status(500).json({
            message: 'Unable to view file',
        });
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
    viewFile,
    renameFile,
    updateFileVisibility,
    deleteFile,
};
