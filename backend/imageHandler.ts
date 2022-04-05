import sharp, { Sharp } from 'sharp';
import crypto from "crypto";
import { existsSync, createReadStream} from 'fs';
import type { MirageDB } from './db.js';
import {TagArrayToString} from './tagHandler.js';
import { readdir, readFile } from "fs/promises";
import ffmpeg from "fluent-ffmpeg";
import path from 'path';

const videoTypes = ['.mkv', '.avi', '.mp4', '.webm', '.mov', ".ts"];

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

async function CheckFolder(check: string, db: MirageDB, root: string, cache: string, imageList: string[] = [])
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
                    countProcessed += await CheckFolder(itemPath, db, root, cache, imageList);
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
                        let extension = path.extname(itemPath);

                        console.log(`[INFO] Ingestingext ${extension}`);
                        
                        if (videoTypes.indexOf(extension.toLowerCase()) >= 0)
                        {
                            console.log(`[INFO] VIngesting ${rlpath}`);
                            await IngestVideo(root, rlpath, imageHash, cache, db, prelimTags);
                        }
                        else
                        {
                            await IngestImage(root, rlpath, imageHash, cache, db, prelimTags);
                        }
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
                console.log(`[INFO] Exception ${Exception}`);
            }
        }
    }
    finally
    {
        return countProcessed;
    }
    
}

// Bad old code from 07
async function generateVideoThumbnail(uri, root, hash)
{
    return new Promise((res, rej) => {
        ffmpeg(uri)
            // .on('filenames', (fn) =>{
            //     console.log("generating: " + fn);
            // })
            .on('end', () => {
                //console.log("End on: " + hash + " " + uri);

                res(hash);

            })
            .screenshots({folder: root + "/video/", filename: hash, count: 1, timemarks: ["25%"]})
            .on('error', (re) => {
                rej(re);
            });
            ;
    });
}



async function IngestVideo(root: string, relpath: string, normalhash: Buffer, cache: string, db: MirageDB, prelimTags: string = "")
{
    const loadPath = path.resolve(root, relpath);

    // Load into ffmpeg
    //let videoIngester = ffmpeg(loadPath);
    //await videoIngester.screenshots({folder: cache, filename: normalhash.toString("hex"), count: 1, timemarks: ["25%"]});

    console.log(`[INFO] VIngesting to ${cache}`);

    await generateVideoThumbnail(loadPath, cache, normalhash.toString("hex"));

    console.log(`[INFO] LogicIngesting ${cache}`);

    let imageBuffer: Sharp = sharp(cache + normalhash.toString("hex"));

    let meta = await imageBuffer.metadata();

    let width = meta.width;
    let height = meta.height;

    //db.AddImage(normalhash, Buffer.from(""), width, height, relpath, prelimTags);
}

async function IngestImage(root: string, relpath: string, normalhash: Buffer, cache: string, db: MirageDB, prelimTags: string = "")
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