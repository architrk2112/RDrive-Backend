const ShareLink = require('../models/shareLink');

const buildPublicSharePayload = (share, statusOverride = null) => ({
    id: share._id,
    token: share.token,
    resourceType: share.resourceType,
    name: share.folderName || (share.resourceType === 'drive' ? 'My Entire Drive' : 'Shared folder'),
    folderId: share.folderId || null,
    rootFolderId: share.folderId || null,
    ownerName: share.userId?.name || undefined,
    createdAt: share.createdAt,
    expiresAt: share.expiresAt,
    status: statusOverride || share.status,
    url: share.url,
});

const validatePublicShare = async (req, res, next) => {
    try {
        const { token } = req.params;

        if (!token) {
            return res.status(400).json({
                message: 'Share token is required.'
            });
        }

        const share = await ShareLink.findOne({ token }).populate('userId', 'name email');

        if (!share) {
            return res.status(404).json({
                message: 'This shared link is invalid or no longer available.'
            });
        }

        if (share.status === 'revoked') {
            return res.status(403).json({
                message: 'This shared link has been revoked.',
                share: buildPublicSharePayload(share, 'revoked')
            });
        }

        if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) {
            share.status = 'expired';
            await share.save();

            return res.status(410).json({
                message: 'This shared link has expired.',
                share: buildPublicSharePayload(share, 'expired')
            });
        }

        req.share = share;
        req.publicShare = buildPublicSharePayload(share);
        return next();
    } catch (error) {
        console.error('validatePublicShare error:', error);
        return res.status(500).json({
            message: 'Failed to validate share token.',
            error: error.message,
        });
    }
};

module.exports = { validatePublicShare };