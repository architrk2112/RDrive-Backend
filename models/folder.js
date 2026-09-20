const mongoose = require("mongoose");
const { Schema } = mongoose;

const folderSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    parentFolderId: {
        type: Schema.Types.ObjectId,
        ref: "Folder",
        default: null,
    },
},
);

module.exports = mongoose.model("Folder", folderSchema);