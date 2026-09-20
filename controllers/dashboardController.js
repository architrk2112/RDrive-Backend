const Folder = require('../models/folder');
const File = require('../models/file');

const findRootFolders = async (currentUserId) => {
    return await Folder.find({
        userId: currentUserId,
        parentFolderId: null
    });
}

const findRootFiles = async (currentUserId) => {
    return await File.find({
        userId: currentUserId,
        folderId: null
    });
}

const displayFoldersAndFiles = async (req, res) => {
    try {
        const userId = req.user.id;

        const folders = await findRootFolders(userId);
        const files = await findRootFiles(userId);

        console.log('Folders displayed successfully!')
        return res.status(200).json({
            message: 'Drive items fetched successfully',
            folders,
            files
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Server error' });
    }
}

module.exports = { displayFoldersAndFiles };