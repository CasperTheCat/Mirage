import sharp, { Sharp } from 'sharp';
import crypto from "crypto";
import { existsSync} from 'fs';
import type { MirageDB } from './db.js';
import { readdir, readFile } from "fs/promises";
import path from 'path';

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

async function HashFile(path: string)
{
    try
    {
        let hash = crypto.createHash("SHA512-256");

        let fileData = await readFile(path);
        hash.update(fileData);
;
        //let inputStream = createReadStream(path);
        //inputStream.pipe(hash);
        //let end = new Promise(function(resolve, reject) {
        //    hash.on('end', () => resolve(hash.read()));
        //    inputStream.on('error', reject); // or something like that. might need to close `hash`
        //});
        //let normalhash = await end;
    
        return hash.digest();
    }
    catch (Exception)
    {
        // Just rethrow it
        throw Exception;
    }
}

async function DiscardOrMark(root: string, db: MirageDB)
{
    // Get all images
    try
    {
        let imageList = await db.GetAllImagesMark();

        // Check
        for (let image of imageList)
        {
            let filePath = path.resolve(root, image["path"]);

            if(!existsSync(filePath))
            {
                console.log(`[INFO] File Missing at ID ${image["imageid"]}`);
                db.MarkImageDeleted(image["imageid"]);
            }
        }
    }
    catch (Exception)
    {
        throw Exception;
    }
}

async function CheckFolder(check: string, db: MirageDB, root: string)
{
    let countProcessed = 0;

    try
    {
        const directories = await readdir(check, { withFileTypes: true });

        for (let item of directories)
        {
            const itemPath = path.resolve(check, item.name);

            if (item.isDirectory())
            {
                countProcessed += await CheckFolder(itemPath, db, root);
            }
            else if (item.isFile())
            {
                // Check that this file exists in the DB
                let imageHash = await HashFile(itemPath);
                let rlpath = path.relative(root, itemPath);

                // Get prelimary tags
                const tagList = rlpath.split("/").slice(0, -1);
                let prelimTags = tagList.join(" ").toLowerCase();

                let result = await db.GetImageByHash(imageHash);

                if (result)
                {
                    // Check the path
                    if (result["path"] !== rlpath)
                    {
                        db.UpdateImageLocationByID(result["imageid"], rlpath);
                        console.log(`[INFO] Missing file at ${rlpath}. Updated Location`);
                    }
                    else if (!result["live"])
                    {
                        // We found a file that has been marked as deleted
                        console.log(`[INFO] Found file at ${rlpath}. Setting file live.`);
                        db.MarkImageLive(result["imageid"]);
                    }
                }
                else
                {
                    console.log(`[INFO] Ingesting ${rlpath}`);
                    await IngestImage(root, rlpath, imageHash, db, prelimTags);
                }

                ++countProcessed;
                
            }
            else
            {
                console.log("WTF?");
            }
        }
    }
    finally
    {
        return countProcessed;
    }
    
}

async function IngestImage(root: string, relpath: string, normalhash: Buffer, db: MirageDB, prelimTags: string = "")
{
    const loadPath = path.resolve(root, relpath);
    let imageBuffer: Sharp = sharp(loadPath);

    let meta = await imageBuffer.metadata();

    let width = meta.width;
    let height = meta.height;

    db.AddImage(normalhash, Buffer.from(""), width, height, relpath, prelimTags);
}

async function IngestImageFromPath(root: string, relpath: string, db: MirageDB)
{
    const loadPath = path.resolve(root, relpath);
    let imageBuffer: Sharp = sharp(loadPath);

    let meta = await imageBuffer.metadata();

    let width = meta.width;
    let height = meta.height;

    let normalhash = await HashFile(loadPath);

    db.AddImage(normalhash, Buffer.from(""), width, height, relpath, "");
}

export {IngestImageFromPath, CheckFolder, DiscardOrMark};