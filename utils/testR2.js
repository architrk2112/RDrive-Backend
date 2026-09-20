const {
    ListObjectsV2Command
} = require("@aws-sdk/client-s3");
require("dotenv").config();

const r2 = require("../config/r2");

const testR2 = async () => {
    const command = new ListObjectsV2Command({
        Bucket: process.env.R2_BUCKET_NAME,
    });

    const response = await r2.send(command);

    console.log("R2 connection successful");
    console.log(response);
};

testR2();