const mongoose = require("mongoose");
const { Schema } = mongoose;

const fileSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    folderId: {
        type: Schema.Types.ObjectId,
        ref: "Folder",
        default: null,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    size: {
        type: Number,
        required: true,
    },
    mimeType: {//type of file
        type: String,
        required: true,
    },
    visibility: {
        type: String,
        enum: ["private", "public"],
        default: "private",
    },
    storageKey: {// We are not storing actual file, it will be stored inside some file/object storage system which will provide an id that is what we are storing here.
        type: String,
        required: true,
    },
});

module.exports = mongoose.model("File", fileSchema);