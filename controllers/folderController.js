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

    return path.join(storageRoot, String(userId), ...segments);
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

module.exports = {
    createFolder,
    fetchFolderContents,
    renameFolder,
};