import sharp from 'sharp';
import type { Sharp } from 'sharp';
import crypto from "crypto";
import {existsSync, createReadStream} from 'fs';
import type { MirageDB } from './db.js';
import {TagArrayToString} from './tagHandler.js';
import { mkdir, readdir, readFile, stat, unlink } from "fs/promises";
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
                        let extension = path.extname(itemPath);
                        
                        if (videoTypes.indexOf(extension.toLowerCase()) >= 0)
                        {
                            console.log(`[INFO] Ingesting Video ${rlpath}`);
                            await IngestVideo(root, rlpath, imageHash, cache, db, prelimTags);
                        }
                        else
                        {
                            console.log(`[INFO] Ingesting Image ${rlpath}`);
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

async function HexHashToFilesystem(base: string, hex: string, ext: string)
{
    // We go 8 folders deep in twos
    let fDepth: number = 8;
    let nPerFolder: number = 2;
    let modifiedPath: string = "";

    for(let i = 0; i < fDepth; ++i)
    {
        modifiedPath = modifiedPath + hex.slice(i * nPerFolder, (i+1)*nPerFolder) + "/";// hex[i*2] + hex[i*2 + 1]);
    }

    // Trailing Slash on base?
    let correctedBase: string = base;
    if(base.length > 1 && base[base.length -1] != "/")
    {
        correctedBase += "/";
    }

    modifiedPath = base + modifiedPath;
    let modifiedFileName: string = hex.slice(fDepth * nPerFolder) + ext;

    return { path: modifiedPath, filename: modifiedFileName};
}

// Bad old code from 07
async function GenerateVideoThumbnail(uri, root, hash)
{
    let writeLocation: string = root + "/video/";
    let cachedWrite = await HexHashToFilesystem(writeLocation, hash, "");
    await mkdir(cachedWrite.path, { recursive: true});

    return new Promise((res, rej) => {
        ffmpeg(uri)
            // .on('filenames', (fn) =>{
            //     console.log("generating: " + fn);
            // })
            .on('end', () => {
                //console.log("End on: " + hash + " " + uri);
                res(hash);

            })
            .screenshots({folder: cachedWrite.path, filename: cachedWrite.filename, count: 1, timemarks: ["25%"]})
            .on('error', (re) => {
                rej(re);
            });
            ;
    });
}

async function DoesFileExist(name: string)
{
    try
    {
        const fst = await stat(name);
        return fst.isFile();
    }
    catch (Exception)
    {
        //console.log(`[INFO] DoesFileExist Exception ${Exception}`);
    }
    return false;
}

async function GenerateThumbnail(sharp: Sharp, cache: string, hashname: string)
{
    console.log(`[INFO] Caching ${hashname}`);
    const filePath = cache + "/tn/" + hashname + ".webp";

    // Check Existance
    let existsTn = await DoesFileExist(filePath);
    if (!existsTn)
    {
        console.log(`[INFO] Cache creation for ${hashname}`);
        await sharp.clone().resize({width: 500}).webp({ quality: 100 }).toFile(filePath);
    }
    else
    {
        console.log(`[INFO] Cache exists for ${hashname}`);
    }
}

async function RuntimeGenerateThumbnail(hash: Buffer, cache: string, db: MirageDB, rootPath: string, watermarkPath: string)
{
    try
    {
        let hashname = hash.toString("hex");
        //console.log(`[INFO] JIT Caching ${hashname}`);
        const hexPath = await HexHashToFilesystem(cache + "/tn/", hashname, ".webp");
        const filePath = hexPath.path + hexPath.filename;

        // Create path
        await mkdir(hexPath.path, { recursive: true});
        //const filePath = cache + "/tn/" + hashname + ".webp";

        // Check Existance
        let existsTn = await DoesFileExist(filePath);
        if (!existsTn)
        {
            console.log(`[INFO][Cache] ${hashname}`);

            // Ask DB for the real path to create for

            let x = await db.GetImagePathByHash(hash);
            let loadPath = x["path"];

            let dbCanonPath = path.resolve(rootPath, loadPath);
            let existsCanon = await DoesFileExist(dbCanonPath);

            if (existsCanon)
            {
                let extension = path.extname(dbCanonPath);

                if (videoTypes.indexOf(extension.toLowerCase()) >= 0)
                {
                    await GenerateVideoThumbnail(dbCanonPath, cache, hashname);

                    //const genCacheName = cache + "/video/" + hashname + ".png";
                    const genCache = await HexHashToFilesystem(cache + "/video/", hashname, ".png");
                    const genCacheName = genCache.path + genCache.filename;

                    let imageBuffer: Sharp = sharp(genCacheName);
                    await imageBuffer.resize({width: 500}).composite([{ input: watermarkPath, gravity: 'south', blend: "over" }]).webp({ quality: 80 }).toFile(filePath);

                    //await unlink(genCacheName);
                }
                else
                {
                    let imageBuffer: Sharp = sharp(dbCanonPath, { animated: true });
                    await imageBuffer.resize({width: 500}).webp({ quality: 80 }).toFile(filePath);
                }
                return true;
            }
        }
        else
        {
            console.log(`[INFO] Cache exists for ${hashname}`);
        }
    }
    catch (Exception)
    {
        console.log(`[EXCP] RuntimeGenerateThumbnail Exception ${Exception}`);
    }

    return false;
}

async function IngestVideo(root: string, relpath: string, normalhash: Buffer, cache: string, db: MirageDB, prelimTags: string = "")
{
    const loadPath = path.resolve(root, relpath);
    const hashHex = normalhash.toString("hex");
    const genCache = await HexHashToFilesystem(cache + "/video/", hashHex, ".png");
    const genCacheName = genCache.path + genCache.filename;

    await GenerateVideoThumbnail(loadPath, cache, hashHex);

    let imageBuffer: Sharp = sharp(genCacheName);

    let meta = await imageBuffer.metadata();

    let width = meta.width;
    let height = meta.height;

    //await GenerateThumbnail(imageBuffer, cache, hashHex);
    //await unlink(genCacheName);

    // What we could do is add the video here. With newtab opening the original, we would be fine
    db.AddImage(normalhash, Buffer.from(""), width, height, relpath, prelimTags);
}

async function IngestImage(root: string, relpath: string, normalhash: Buffer, cache: string, db: MirageDB, prelimTags: string = "")
{
    const loadPath = path.resolve(root, relpath);
    let imageBuffer: Sharp = sharp(loadPath);

    let meta = await imageBuffer.metadata();

    let width = meta.width;
    let height = meta.height;

    //await GenerateThumbnail(imageBuffer, cache, normalhash.toString("hex"));

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


export { HexHashToFilesystem, IngestImageFromPath, CheckFolder, DiscardOrMark, SanitiseTag, GetPrelimTags, DoesFileExist, RuntimeGenerateThumbnail};