const crypto = require('crypto');
const ShareLink = require('../models/shareLink');
const Folder = require('../models/folder');

const createShareLink = async (req, res) => {
    try {
        const { resourceType, folderId, folderName, folderPath, expiresAt } = req.body;
        const userId = req.user.id;

        if (!["drive", "folder"].includes(resourceType)) {
            return res.status(400).json({
                message: "Invalid resource type"
            });
        }

        if (resourceType === "folder" && !folderId) {
            return res.status(400).json({
                message: "folderId is required for folder sharing"
            });
        }

        if (resourceType === "drive" && folderId) {
            return res.status(400).json({
                message: "folderId should not be provided for drive sharing"
            });
        }

        if (resourceType === "folder") {
            const folder = await Folder.findOne({
                _id: folderId,
                userId
            });

            if (!folder) {
                return res.status(404).json({
                    message: "Folder not found or you don't own it!"
                });
            }
        }

        let expiryDate = null;

        if (expiresAt) {
            expiryDate = new Date(expiresAt);

            if (Number.isNaN(expiryDate.getTime())) {
                return res.status(400).json({
                    message: "Invalid expiration date"
                });
            }

            if (expiryDate <= new Date()) {
                return res.status(400).json({
                    message: "Expiration date must be in the future"
                });
            }
        }

        const duplicate = await ShareLink.findOne({
            userId,
            resourceType,
            folderId: resourceType === 'folder' ? folderId : null,
            status: 'active',
            $or: [
                { expiresAt: null },
                { expiresAt: { $gte: new Date() } }
            ]
        }).lean();

        if (duplicate) {
            return res.status(409).json({
                message: 'You already have an active share for this same resource. Reuse it or revoke the old one first.',
                share: duplicate,
            });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const url = `${baseUrl}/share/${token}`;
        const label = resourceType === 'drive'
            ? 'My Entire Drive'
            : (folderName || 'Shared folder');

        const shareLink = await ShareLink.create({
            userId: req.user.id,
            resourceType,
            folderId: resourceType === 'folder' ? folderId : null,
            folderName: resourceType === 'folder' ? folderName || 'Shared folder' : 'My Entire Drive',
            folderPath: resourceType === 'folder' ? folderPath || 'My Drive' : 'My Drive',
            label,
            token,
            url,
            expiresAt: expiresAt ? expiryDate : null,
            status: 'active',
        });

        return res.status(201).json({
            message: 'Share link created successfully',
            share: {
                id: shareLink._id,
                token: shareLink.token,
                url: shareLink.url,
                resourceType: shareLink.resourceType,
                folderId: shareLink.folderId,
                folderName: shareLink.folderName,
                folderPath: shareLink.folderPath,
                label: shareLink.label,
                createdAt: shareLink.createdAt,
                expiresAt: shareLink.expiresAt,
                status: shareLink.status,
            },
        });
    } catch (error) {
        console.error('createShareLink error:', error);
        return res.status(500).json({ message: 'Failed to create share link', error: error.message });
    }
};

const fetchAllShareLinks = async (req, res) => {
    try {
        const userId = req.user.id;
        const shareLinks = await ShareLink.find({ userId }).sort({ createdAt: -1 });

        const links = shareLinks.map((share) => ({
            id: share._id,
            token: share.token,
            url: share.url,
            resourceType: share.resourceType,
            folderId: share.folderId,
            folderName: share.folderName,
            folderPath: share.folderPath,
            label: share.label || share.folderName || 'Shared resource',
            createdAt: share.createdAt,
            expiresAt: share.expiresAt,
            status: share.status
        }));

        return res.status(200).json({
            message: "All share links fetched successfully",
            links
        });
    } catch (error) {
        console.error('fetchAllShareLinks error:', error);
        return res.status(500).json({ message: 'Failed to fetch all share links', error: error.message });
    }
};

const revokeShareLink = async (req, res) => {
    try {
        const { id } = req.params;

        const shareLink = await ShareLink.findOne({
            _id: id,
            userId: req.user.id
        });

        if (!shareLink) {
            return res.status(404).json({
                message: 'Share link not found or you do not own it'
            });
        }

        if (shareLink.status === 'revoked') {
            return res.status(409).json({
                message: 'This share link is already revoked.'
            });
        }

        shareLink.status = 'revoked';
        await shareLink.save();

        return res.status(200).json({
            message: 'Share link revoked successfully',
            share: {
                id: shareLink._id,
                status: shareLink.status
            }
        });
    } catch (error) {
        console.error('revokeShareLink error:', error);
        return res.status(500).json({ message: 'Failed to revoke share link', error: error.message });
    }
};

const deleteShareLink = async (req, res) => {
    try {
        const { id } = req.params;

        const deletedShare = await ShareLink.findOneAndDelete({
            _id: id,
            userId: req.user.id
        });

        if (!deletedShare) {
            return res.status(404).json({
                message: 'Share link not found or you do not own it'
            });
        }

        return res.status(200).json({
            message: 'Share link deleted successfully',
            deletedId: deletedShare._id
        });
    } catch (error) {
        console.error('deleteShareLink error:', error);
        return res.status(500).json({ message: 'Failed to delete share link', error: error.message });
    }
};

module.exports = { createShareLink, fetchAllShareLinks, revokeShareLink, deleteShareLink };