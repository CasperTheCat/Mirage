import sharp, { Sharp } from 'sharp';
import crypto from "crypto";
import { existsSync, createReadStream} from 'fs';
import type { MirageDB } from './db.js';
import {TagArrayToString} from './tagHandler.js';
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

function IntHashFile(path: string): Promise<Buffer>
{
    return new Promise<Buffer>(function (resolve, reject)
    {
    
        let hash = crypto.createHash("SHA512-256");

        const stream = createReadStream(path);
        stream.on('error', err => reject(err));
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest()));
    });
}

async function HashFile(path: string)
{
    
    try
    {
        return await IntHashFile(path);
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

function GetPrelimTags(rlpath)
{
    // Get prelimary tags
    const tagList = rlpath.split("/").slice(0, -1);
    let cleanTags: string[] = [];

    for (let uncleanTag of tagList)
    {
        cleanTags.push(SanitiseTag(uncleanTag))
    }

    return cleanTags;
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

async function CheckFolder(check: string, db: MirageDB, root: string, imageList: string[] = [])
{
    let countProcessed = 0;

    if (imageList.length === 0)
    {
        // Get known paths
        let fetchedList = await db.GetAllImagesMark();
        for (let item of fetchedList)
        {
            imageList.push(item["path"]);
        }
    }

    try
    {
        const directories = await readdir(check, { withFileTypes: true });

        for (let item of directories)
        {
            try
            {
                const itemPath = path.resolve(check, item.name);
                let rlpath = path.relative(root, itemPath);
                
                // Pre Check
                if (imageList.indexOf(rlpath) > -1)
                {
                    // Ignore. It's here
                    ++countProcessed;
                }
                else if (item.isDirectory())
                {
                    countProcessed += await CheckFolder(itemPath, db, root, imageList);
                }
                else if (item.isFile())
                {
                    // Check that this file exists in the DB
                    let imageHash = await HashFile(itemPath);
                    //let rlpath = path.relative(root, itemPath);

                    // // Get prelimary tags
                    // const tagList = rlpath.split("/").slice(0, -1);
                    // let cleanTags: string[] = [];

                    // for (let uncleanTag of tagList)
                    // {
                    //     cleanTags.push(SanitiseTag(uncleanTag))
                    // }

                    let preLim = GetPrelimTags(rlpath);
                    let temp = [];

                    for (let plt = 0; plt < preLim.length; ++plt)
                    {
                        temp.push(`'${preLim[plt]}'`);
                    }

                    let prelimTags = "";//temp.join(" ");// GetPrelimTags(rlpath).join(" ");//    let prelimTags = cleanTags.join(" ");

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
            catch (Exception)
            {

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

function SanitiseTag(tag: string, lowerOnly: boolean = false)
{
    let temp = tag.toLowerCase();

    if (!lowerOnly)
    {
        //temp = temp.replace(/[.,\/#!$%\^&\*;:{}=\-_\`\'\"~()]/g,"");
        //temp = temp.replace(/[.,\\\/#!$%\^&\*;:{}=\-_\`\'\"~()]/g,"");
        //temp = temp.replace(/[.,\\\/#!$%\^&\*;:{}=_\`\'\"~()]/g,"");
        temp = temp.replace(/[.,\\\/#!$%\^&\*;:{}=\`\'\"~()]/g,"");
        temp = temp.replace(/[_]/g," ");
        temp = temp.replace(/\s{2,}/g," ");
    }

    return temp;
}


export {IngestImageFromPath, CheckFolder, DiscardOrMark, SanitiseTag, GetPrelimTags};