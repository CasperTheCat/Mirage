import sharp, { Sharp } from 'sharp';
import crypto from "crypto";
import { createReadStream } from 'fs';
import type { MirageDB } from './db.js';

// async function IngestImageFromBuffer(image: Buffer, db: MirageDB)
// {
//     let imageBuffer: Sharp = sharp(image);

//     let meta = await imageBuffer.metadata();

//     let width = meta.width;
//     let height = meta.height;


//     let hash = crypto.createHash("SHA512-256");

//     let inputStream = createReadStream(path);
//     inputStream.pipe(hash);
//     hash.end();

//     let normalhash = hash.read();

//     db.AddImage(normalhash, new Buffer(""), width, height, path, "");
// }


async function IngestImageFromPath(path: string, db: MirageDB)
{
    let imageBuffer: Sharp = sharp(path);

    let meta = await imageBuffer.metadata();

    let width = meta.width;
    let height = meta.height;


    let hash = crypto.createHash("SHA512-256");

    let inputStream = createReadStream(path);
    inputStream.pipe(hash);
    hash.end();

    let normalhash = hash.read();

    db.AddImage(normalhash, Buffer.from(""), width, height, path, "");
}

export {IngestImageFromPath};