const fs = require('fs');
const path = require('path');

const Folder = require("../models/folder");
const File = require("../models/file");

const storageRoot = path.join(__dirname, '../storage');

const getFolderStorageDir = async (userId, folderId) => {
    const segments = [];
    let currentFolderId = folderId && folderId !== 'root' ? folderId : null;

    while (currentFolderId) {
        const currentFolder = await Folder.findOne({
            _id: currentFolderId,
            userId,
        }).lean();

        if (!currentFolder) {
            break;
        }

        segments.unshift(currentFolder.name);
        currentFolderId = currentFolder.parentFolderId || null;
    }

    const userStorageRoot = path.resolve(storageRoot, String(userId));
    const folderPath = path.resolve(userStorageRoot, ...segments);
    const relativePath = path.relative(userStorageRoot, folderPath);

    if (
        !relativePath ||
        relativePath === '..' ||
        relativePath.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativePath)
    ) {
        const error = new Error('Folder path is outside the user storage directory');
        error.code = 'ERR_STORAGE_PATH_ESCAPE';
        throw error;
    }

    return folderPath;
};

const createFolder = async (req, res) => {
    try {
        const { name, parentId } = req.body;
        const userId = req.user.id;

        const folder = await Folder.create({
            userId,
            name,
            parentFolderId: parentId
        });

        const folderPath = await getFolderStorageDir(userId, folder._id);
        await fs.promises.mkdir(folderPath, { recursive: true });

        console.log(`Folder named ${name} created successfully!`);
        return res.status(201).json({
            message: 'Folder created successfully',
            folder
        });
    } catch (error) {
        return res.status(500).json({ message: 'Server error' });
    }
}

const renameFolder = async (req, res) => {
    try {
        const { name } = req.body;
        const trimmedName = String(name || '').trim();

        if (!trimmedName) {
            return res.status(400).json({ message: 'Folder name is required' });
        }

        const folderDoc = await Folder.findOne({
            _id: req.params.folderId,
            userId: req.user.id,
        });

        if (!folderDoc) {
            return res.status(404).json({ message: 'Folder not found' });
        }

        const oldPath = await getFolderStorageDir(req.user.id, folderDoc._id);
        const parentDir = path.dirname(oldPath);
        const newPath = path.join(parentDir, trimmedName);

        if (fs.existsSync(oldPath) && oldPath !== newPath) {
            await fs.promises.rename(oldPath, newPath);
        }

        folderDoc.name = trimmedName;
        await folderDoc.save();

        return res.status(200).json({
            message: 'Folder renamed successfully',
            folder: folderDoc,
        });
    } catch (error) {
        console.error('Rename folder error:', error);
        return res.status(500).json({ message: 'Folder rename failed' });
    }
}

const findFoldersByParentId = async (userId, folderId) => {
    if (folderId === 'root')
        folderId = null;

    return await Folder.find({
        userId,
        parentFolderId: folderId
    });
}

const findFilesByParentId = async (userId, folderId) => {
    if (folderId === 'root')
        folderId = null;

    return await File.find({
        userId,
        folderId
    });
}

const fetchFolderContents = async (req, res) => {
    try {
        const { folderId } = req.params;
        const userId = req.user.id;
        const folders = await findFoldersByParentId(userId, folderId);
        const files = await findFilesByParentId(userId, folderId);

        console.log(`Folder contents fetched successfully!`);
        return res.status(200).json({
            message: 'Folder contents fetched successfully',
            folders,
            files
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Server error' });
    }
}

const deleteFolder = async (req, res) => {
    try {
        const { folderId } = req.params;
        const userId = req.user.id;
        const folder = await Folder.findOne({ _id: folderId, userId });

        if (!folder) {
            return res.status(404).json({ message: 'Folder not found' });
        }

        const folderPath = await getFolderStorageDir(userId, folder._id);
        const folderIds = [folder._id];
        const visitedIds = new Set([String(folder._id)]);

        for (let index = 0; index < folderIds.length; index += 1) {
            const children = await Folder.find({
                userId,
                parentFolderId: folderIds[index],
            }).select('_id').lean();

            for (const child of children) {
                const childId = String(child._id);
                if (!visitedIds.has(childId)) {
                    visitedIds.add(childId);
                    folderIds.push(child._id);
                }
            }
        }

        await fs.promises.rm(folderPath, { recursive: true, force: true });

        await File.deleteMany({
            userId,
            folderId: { $in: folderIds },
        });

        await Folder.deleteMany({
            userId,
            _id: { $in: folderIds },
        });

        return res.status(200).json({
            message: 'Folder and its contents deleted successfully',
            folderId: String(folder._id),
        });
    } catch (error) {
        console.error('Delete folder error:', error);

        if (error.code === 'ERR_STORAGE_PATH_ESCAPE') {
            return res.status(400).json({ message: 'Invalid folder storage path' });
        }

        if (error.name === 'CastError') {
            return res.status(400).json({ message: 'Invalid folder ID' });
        }

        return res.status(500).json({ message: 'Folder deletion failed' });
    }
}

module.exports = {
    createFolder,
    fetchFolderContents,
    renameFolder,
    deleteFolder
};