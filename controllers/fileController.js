const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const multer = require('multer');

const File = require('../models/file');
const r2 = require('../config/r2');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 * 1024,
    },
});

const sanitizeFileName = (fileName = '') => {
    const safeName = fileName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '');
    return safeName || `file-${Date.now()}`;
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
            const key = `uploads/${userId}/${Date.now()}-${safeName}`;

            await r2.send(new PutObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: key,
                Body: file.buffer,
                ContentType: file.mimetype,
            }));

            const fileDoc = await File.create({
                userId,
                folderId,
                name: safeName,
                size: file.size,
                mimeType: file.mimetype,
                visibility: req.body.visibility || 'private',
                storageKey: key,
            });

            uploadedFiles.push(fileDoc);
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

        if(!fileDoc) {
            return res.status(404).json({ message: 'File not found' });
        }

        const command = new GetObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: fileDoc.storageKey,
        });

        const url = await getSignedUrl(r2, command, { expiresIn: 3600 });

        return res.status(200).json({
            message: 'File download URL generated successfully',
            url,
            file: fileDoc,
        });
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

        fileDoc.name = trimmedName;
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

        if (fileDoc.storageKey) {
            await r2.send(new DeleteObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: fileDoc.storageKey,
            }));
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
