const { ObjectId } = require("mongodb");
const mongoose = require("mongoose");
const { Schema } = mongoose;

const shareLinkSchema = new Schema({
    userId: {
        type: ObjectId,
        ref: "User",
        required: true
    },
    resourceType: {
        type: String,
        enum: ["drive", "folder"],
        required: true
    },
    folderId: {
        type: ObjectId,
        ref: "Folder",
        default: null
    },
    folderName: {
        type: String,
        default: null
    },
    folderPath: {
        type: String,
        default: null
    },
    label: {
        type: String,
        required: true,
        default: "Shared resource"
    },
    token: {
        type: String,
        required: true,
        unique: true
    },
    url: {
        type: String,
        required: true
    },
    expiresAt: {
        type: Date,
        default: null
    },
    status: {
        type: String,
        enum: ["active", "expired", "revoked"],
        default: "active"
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("ShareLink", shareLinkSchema);