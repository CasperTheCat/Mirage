import express from "express";
import { fileURLToPath } from 'url';
import path,{ dirname } from 'path';
import {MirageApp} from './MirageApp.js';
import {getBoardsForUser, getUserInfo} from "./apidecl.js";
import { MirageDB } from './db.js';
import passport from "passport";
import {ensureLoggedIn} from 'connect-ensure-login';
import {InsertNewUserToDB} from "./auth.js";
import bodyParser from 'body-parser';
import session from 'express-session';
import { readFile } from "fs/promises";
import { HexHashToFilesystem, DoesFileExist, IngestImageFromPath, CheckFolder, DiscardOrMark, SanitiseTag,  GetPrelimTags, RuntimeGenerateThumbnail } from "./imageHandler.js";
import {InitDB} from "./init/db.js";
import {InitAuthStrat} from "./init/auth.js";
import {TagArrayToString} from "./tagHandler.js";
import connectPgSimple, { type PGStoreOptions } from "connect-pg-simple";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const __imagePath = path.resolve(__dirname, "../images");
const __cacheRoot = path.resolve(__dirname, "../cache");
const __overlayPath = path.resolve(__dirname, "../src/overlay.png");

async function entry()
{
    const app = express();

    const state = new MirageApp();

    // Init

    let mirageDB: MirageDB = new MirageDB();

    try
    {
        await InitDB(mirageDB);   
        console.log("[INFO] DB Online");
 
    }
    catch (Exception)
    {
        console.log("[ERRO] DB Failure");
        throw Exception;
    }
    
    const StoreOptions: connectPgSimple.PGStoreOptions = {
        pgPromise: mirageDB.pgdb,
        tableName: 'session'
      };

    const connector = connectPgSimple(session);

    app.use(session({
        store: new connector(StoreOptions),
          secret: [
            process.env.SESSION_PRIMARY_SECRET,
            process.env.SESSION_OLD_SECRET
          ],
          cookie: {
            secure: false,
            httpOnly: true,
            sameSite: true,
            maxAge: 24 * 60 * 60 * 1000
          },
          saveUninitialized: true,
          resave: false
        }));
    app.use(passport.initialize());
    app.use(passport.session());


    InitAuthStrat(mirageDB).then
    (() => 
        {
            console.log("[INFO] Passport Initialised");
        }
    ).catch
    ((err) =>
        {
            console.log("[ERRO] Passport Failure");
            throw err;
        }
    )

    let imageCount = 0;
    let lastSweep: number = 0;
    let nextSweep: number = 0;
    let recheckDuration: number = 3 * 24 * 60 * 60 * 1000;

    // Get Folder
    // This isn't valid unless DB is up
    async function CheckImages()
    {   
        let DiscardMarkTimeStart = process.hrtime();     
        let checkedImages = await CheckFolder(__imagePath, mirageDB, __imagePath, __cacheRoot);
        let DiscardMarkTimeStop = process.hrtime(DiscardMarkTimeStart);

        console.log(`[INFO] Mirage checked ${checkedImages} files in ${DiscardMarkTimeStop[0] + DiscardMarkTimeStop[1] * 1e-9 } seconds.`);        

        // Update this
        imageCount = await mirageDB.GetImageCount();
        const thisMoment = new Date();
        nextSweep = thisMoment.getTime() + recheckDuration;
    }

    async function MarkImages()
    {
        let DiscardMarkTimeStart = process.hrtime();
        await DiscardOrMark(__imagePath, mirageDB);
        let DiscardMarkTimeStop = process.hrtime(DiscardMarkTimeStart);
        let thisSweep: Date = new Date();
        console.log(`[INFO] Image sweep completed in ${DiscardMarkTimeStop[0] + DiscardMarkTimeStop[1] * 1e-9 } seconds`);  
        console.log(`[INFO] Next update in ${(Math.abs(nextSweep - thisSweep.getTime()))/(1000 * 60)} minutes`);  

        // Update this
        imageCount = await mirageDB.GetImageCount();
    }

    {
        await MarkImages();
        CheckImages();
    }

    // Queue Sweep two hourly
    setInterval(MarkImages, 2 * 60 * 60 * 1000);

    // Queue Image Check every 3 days
    setInterval(CheckImages, recheckDuration);

    imageCount = await mirageDB.GetImageCount();


    app.get('/login',
        (req, res) => 
        {
            res.sendFile(path.resolve(__dirname, '../', 'public', 'login.html'));
        }
    );

    app.post('/login', bodyParser.urlencoded({extended: false}), passport.authenticate('local', {
        successRedirect: '/',
        failureRedirect: '/login',
        failureMessage: true
    }));

    app.get('/logout', 
    (req, res) =>
        {
            req.logout((err) => {
                if (!err)
                {
                    res.redirect('/');
                }
              });
            //res.redirect('/');
        }
    );

    app.get('/signup',
    (req, res) => 
    {
        res.sendFile(path.resolve(__dirname, '../', 'public', 'signup.html'));
    }
    );

    app.post('/signup', bodyParser.urlencoded({extended: false}),
    (req, res) => 
    {
        InsertNewUserToDB(mirageDB, req, res);
    }
    );

    app.use('/static', express.static('public'))

    // Main Route
    app.get('/', (req, res) => 
    {
        //console.log(mirageDB.GetUserByUID(req.user.userid));
        res.sendFile(path.resolve(__dirname, '../', 'public', 'index.html'));
    });

    //ensureLoggedIn()

    // Declare Stat endpoint ("Not really part of the API family")
    app.get('/stats', ensureLoggedIn(),  async (req, res) => 
    {
        try
        {
            let count = await mirageDB.GetImageCount();

            res.send(count);//`{ \"count\": ${countInt} }`);
        }
        catch (Exception)
        {
            res.status(404).send();
        }
        //state.LastUpdatedItemCount += 1;
    });

    // Declare API
    app.get('/api', (req, res) => 
    {
        // Return something?
    });



    app.get('/api/user', ensureLoggedIn(), async (req, res) => 
    {
        getUserInfo(req, res, mirageDB);
    });

    app.get('/api/board', ensureLoggedIn(),  (req, res) => 
        {
            getBoardsForUser(req, res, mirageDB);
        } 
    );

    app.get("/api/search/image/restricted", ensureLoggedIn(),
        async (req, res) =>
        {
            try
            {
                //let a = await mirageDB.GetAllImages();
                let a = await mirageDB.GetUntaggedImagesSortedLimited();
                let out = Array(a.length);

                for (let i = 0; i < a.length; ++i)
                {
                    out[i] = {
                        "width": a[i]["width"],
                        "height": a[i]["height"],
                        "hash": `${a[i]["normalhash"].toString('hex')}`
                    };
                }

                res.status(200).send(
                    {
                        "images": out
                    }
                );

            }
            catch (Exception)
            {
                console.log(Exception);
            }
        }
    );

    app.get("/api/search/file/restricted", ensureLoggedIn(),
        async (req, res) =>
        {
            try
            {
                //let a = await mirageDB.GetAllImages();
                let a = await mirageDB.GetUntaggedFilesSortedLimited();
                let out = Array(a.length);

                for (let i = 0; i < a.length; ++i)
                {
                    out[i] = {
                        "name": a[i]["name"],
                        "size": a[i]["size"],
                        "hash": `${a[i]["hash"].toString('hex')}`
                    };
                }

                res.status(200).send(
                    {
                        "files": out
                    }
                );

            }
            catch (Exception)
            {
                console.log(Exception);
            }
        }
    );

    app.get("/api/search/image", ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                //let a = await mirageDB.GetAllImages();
                let a = await mirageDB.GetUntaggedImages();
                let out = Array(a.length);

                for (let i = 0; i < a.length; ++i)
                {
                    out[i] = {
                        "width": a[i]["width"],
                        "height": a[i]["height"],
                        "hash": `${a[i]["normalhash"].toString('hex')}`
                    };
                }
        
                res.status(200).send(
                    {
                        "images": out
                    }
                );

            }
            catch (Exception)
            {
                console.log(Exception);
            }
        }
    );

    // app.get("/image/:id", ensureLoggedIn(), 
    //     (req, res) => 
    //     {
    //         console.log(`Serve Image: ${req.params.id}`);
    //         res.sendFile(path.resolve(__dirname, '../', 'public', 'index.html'));
    //     }
    // );

    async function SplitTSV(tsv:string)
    {
        var regex:RegExp = /[^\s']+|'([^']*)'/gi;
        var outArray:string[] = [];

        
        do {
            //Each call to exec returns the next regex match as an array
            var match = regex.exec(tsv);
            if (match != null) {
                //Index 1 in the array is the captured group if it exists
                //Index 0 is the matched text, which we use if no captured group exists
                outArray.push(match[1] ? match[1] : match[0]);
            }
        } while (match != null);

        return outArray;
    }

    app.get('/api/image/tags', ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let x = await mirageDB.GetTagList();

                if (x && x.length > 0 && "array_agg" in x[0])
                {
                    let result = { "tags": x[0]["array_agg"] };

                    res.status(200).send(result);
                }
                else
                {
                    res.status(404).send("{ \"code\": 2, \"reason\": \"Tag listing failed\" }");
                }
            }
            catch (Exception)
            {
                console.log(Exception);
                res.status(500).send("{ \"code\": 0, \"reason\": \"Exception\" }");
            }
        }
    );

    app.post('/api/image/tag/count',  bodyParser.json({ limit: '100mb', strict: true }), ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let results:number[] = [];
                let tags: string[] = req.body;
                for (let tag of tags)
                {
                    let sanitag = `'${SanitiseTag(tag)}'`;
                    let countOfTag = await mirageDB.GetImageCountByTag(sanitag);
                    if ("count" in countOfTag)
                    {
                        results.push(countOfTag["count"]);
                    }
                }
                

                res.status(200).send(JSON.stringify(results));

            }
            catch (Exception)
            {
                console.log(Exception);
                res.status(500).send("{ \"code\": 0, \"reason\": \"Exception\" }");
            }
        }
    );

    app.post('/api/image/tag/delete',  bodyParser.json({ limit: '100mb', strict: true }), ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let tags: string[] = req.body;
                for (let tag of tags)
                {
                    //
                    let sanitag = SanitiseTag(tag);
                    mirageDB.DeleteTag(sanitag);
                }
                
                res.status(200).send();

            }
            catch (Exception)
            {
                console.log(Exception);
                res.status(500).send("{ \"code\": 0, \"reason\": \"Exception\" }");
            }
        }
    );

    app.post('/api/image/tag/rename',  bodyParser.json({ limit: '100mb', strict: true }), ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let x = req.body;
                if ("tagPairs" in req.body)
                {
                    for (let pair of req.body["tagPairs"])
                    {
                        if (pair.length === 2)
                        {
                            let oldTag: string = SanitiseTag(pair[0]);
                            let newTag: string = SanitiseTag(pair[1]);

                            mirageDB.RenameTag(oldTag, newTag);
                        }
                    }
                    res.status(200).send();
                }
                else
                {
                    res.status(404).send("{ \"code\": 1, \"reason\": \"Exception\" }");
                }

            }
            catch (Exception)
            {
                console.log(Exception);
                res.status(500).send("{ \"code\": 0, \"reason\": \"Exception\" }");
            }
        }
    );

    app.post('/api/image/tag/applyquery',  bodyParser.json({ limit: '100mb', strict: true }), ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let x = req.body;
                if ("tagPairs" in req.body)
                {
                    for (let pair of req.body["tagPairs"])
                    {
                        if (pair.length === 2)
                        {
                            let tsquery: string = SanitiseTag(pair[0], true);
                            let newTag: string = SanitiseTag(pair[1], false);

                            console.log(tsquery, newTag);

                            mirageDB.AppendTag(tsquery, newTag);
                        }
                    }
                    res.status(200).send();
                }
                else
                {
                    res.status(404).send("{ \"code\": 1, \"reason\": \"Exception\" }");
                }

            }
            catch (Exception)
            {
                console.log(Exception);
                res.status(500).send("{ \"code\": 0, \"reason\": \"Exception\" }");
            }
        }
    );

    app.post('/api/image/tag/append',  bodyParser.json({ limit: '100mb', strict: true }), ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let x = req.body;
                if ("tagPairs" in req.body)
                {
                    for (let pair of req.body["tagPairs"])
                    {
                        if (pair.length === 2)
                        {
                            let targetTag: string = SanitiseTag(pair[0], false);
                            let newTag: string = SanitiseTag(pair[1], false);

                            console.log(targetTag, newTag);

                            mirageDB.AppendTag(`'${targetTag}'`, newTag);
                        }
                    }
                    res.status(200).send();
                }
                else
                {
                    res.status(404).send("{ \"code\": 1, \"reason\": \"Exception\" }");
                }

            }
            catch (Exception)
            {
                console.log(Exception);
                res.status(500).send("{ \"code\": 0, \"reason\": \"Exception\" }");
            }
        }
    );

    app.get('/api/image/meta/:id/tag', ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let y = Buffer.from(req.params.id, 'hex');
                let x = await mirageDB.GetImageTagsByHash(y);
                
                if (x)
                {
                    //let imgtags = x["tags"];
                    let inTab = await SplitTSV(x["tags"].toLowerCase());//.split(" ");

                    let result = { "tags": inTab };

                    res.status(200).send(result);
                }
                else
                {
                    res.status(404).send("{ \"code\": 2, \"reason\": \"Hash not found\" }");
                }
            }
            catch (Exception)
            {
                console.log(Exception);
                res.status(500).send("{ \"code\": 0, \"reason\": \"Exception\" }");
            }
        }
    );

    app.post('/api/image/meta/:id/tag', bodyParser.json({ limit: '100mb', strict: true }), ensureLoggedIn(),
        async (req, res) => 
        {
            try
            {
                let y = Buffer.from(req.params.id, 'hex');
                let resarray: string[] = req.body;

                resarray = resarray.filter(e => e);

                for (let i = 0; i < resarray.length; ++i)
                {                   
                    resarray[i] = `'${SanitiseTag(resarray[i])}'`;
                }
                let newTags = resarray.join(" ");
                //let x = await mirageDB.GetImageTagsByHash(y);
                await mirageDB.UpdateImageTagsByHash(y, newTags);
                res.status(200).send(newTags);
                
                // if (x)
                // {
                //     let inTab = req.params.tag.toLowerCase();

                //     await mirageDB.UpdateImageTagsByHash(y, inTab);
                //     res.status(200).send(inTab);
                // }
                // else
                // {
                //     res.status(404).send("{ \"code\": 2, \"reason\": \"Hash not found\" }");
                // }
            }
            catch (Exception)
            {
                console.log(Exception);
                res.status(500).send("{ \"code\": 0, \"reason\": \"Exception\" }");
            }
        }
    );

    // app.post('/api/image/meta/:id/tag/:tag', ensureLoggedIn(), 
    //     async (req, res) => 
    //     {
    //         try
    //         {
    //             let y = Buffer.from(req.params.id, 'hex');
    //             let x = await mirageDB.GetImageTagsByHash(y);
                
    //             if (x)
    //             {
    //                 //let imgtags = x["tags"];
    //                 let inTab = x["tags"].toLowerCase();//.split(" ");
    //                 let selectedTag = `'${req.params.tag.toLowerCase()}'`;

    //                 let idx = inTab.indexOf(selectedTag);
    //                 if (idx < 0)
    //                 {
    //                     // Add the tag
    //                     let result = inTab + " " + selectedTag;  
    //                     await mirageDB.UpdateImageTagsByHash(y, result);
    //                     res.status(200).send(result);
    //                 }
    //                 else
    //                 {
    //                     res.status(404).send("{ \"code\": 1, \"reason\": \"Tag already exists\" }");
    //                 }
    //             }
    //             else
    //             {
    //                 res.status(404).send("{ \"code\": 2, \"reason\": \"Hash not found\" }");
    //             }
    //         }
    //         catch (Exception)
    //         {
    //             console.log(Exception);
    //             res.status(500).send("{ \"code\": 0, \"reason\": \"Exception\" }");
    //         }
    //     }
    // );

    app.delete('/api/image/meta/:id/tag/:tag', ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let y = Buffer.from(req.params.id, 'hex');
                let x = await mirageDB.GetImageTagsByHash(y);
                
                if (x)
                {
                    //let imgtags = x["tags"];
                    let inTab = x["tags"].toLowerCase().split(" ");
                    let selectedTag = `'${req.params.tag.toLowerCase()}'`;

                    let idx = inTab.indexOf(selectedTag);
                    if (idx > -1)
                    {
                        inTab.splice(idx, 1);

                        let result = inTab.join(" ");    
                        await mirageDB.UpdateImageTagsByHash(y, result);
                        res.status(200).send(result);
                    }
                    else
                    {
                        res.status(404).send("{ \"code\": 1, \"reason\": \"Tag not found\" }");
                    }
                }
                else
                {
                    res.status(404).send("{ \"code\": 2, \"reason\": \"Hash not found\" }");
                }
            }
            catch (Exception)
            {
                console.log(Exception);
                res.status(500).send("{ \"code\": 0, \"reason\": \"Exception\" }");
            }
        }
    );

    app.get("/api/image/data/:id", ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let y = Buffer.from(req.params.id, 'hex');
                let x = await mirageDB.GetImagePathByHash(y);
                
                try
                {
                    if (x)
                    {
                        let loadPath = x["path"];

                        res.sendFile(path.resolve(__imagePath, loadPath));
                    }
                    else
                    {
                        // Mark deleted
                        res.status(404).send();
                    }
                }
                catch (Exception)
                {
                    // Mark
                    console.log(`[WARN] Marking ${y} as dead.`)
                    mirageDB.MarkImageDeletedHash(y);

                    // Mark deleted
                    res.status(404).send();
                }
            }
            catch (Exception)
            {
                console.log(Exception);            
                res.status(500).send();
            }
        }
    );

    app.get("/api/image/tn/:id", ensureLoggedIn(),
        async (req, res) =>
        {
            try
            {
                let y = Buffer.from(req.params.id, 'hex');

                // Try to get the path
                let rootCtrl = await HexHashToFilesystem(__cacheRoot + "/tn/", req.params.id, ".webp");
                let rootName = rootCtrl.path + rootCtrl.filename;
                let doesCacheExist = await DoesFileExist(rootName);

                if (doesCacheExist)
                {
                    res.sendFile(rootName);
                }
                else
                {
                    // Generate on the fly
                    let result = await RuntimeGenerateThumbnail(y, __cacheRoot, mirageDB, __imagePath, __overlayPath);

                    // Second Chance
                    if (result)
                    {
                        doesCacheExist = await DoesFileExist(rootName);
                        if (doesCacheExist)
                        {
                            res.sendFile(rootName);
                            return;
                        }
                    }

                    // Mark deleted
                    res.status(404).send();

                    // Mark
                    console.log(`[WARN] Marking ${req.params.id} as dead?`)
                    mirageDB.MarkImageDeletedHash(y);
                }
            }
            catch (Exception)
            {
                console.log(Exception);
                res.status(500).send();
            }
        }
    );

    app.get("/api/image/meta/:id", ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let y = Buffer.from(req.params.id, 'hex');
                let x = await mirageDB.GetImageByHashShort(y);

                //console.log(x);
                

                let z = {
                    "width": x["width"],
                    "height": x["height"],
                    "hash": `${req.params.id}`
                };

                res.send(z);
            }
            catch (Exception)
            {
                console.log(Exception);
                res.status(404).send();
            }
        }
    );

    app.get("/api/image/meta/:id/full", ensureLoggedIn(),
        async (req, res) =>
        {
            try
            {
                let y = Buffer.from(req.params.id, 'hex');
                let x = await mirageDB.GetImageByHash(y);

                //console.log(x);

                let z = {
                    "width": x["width"],
                    "height": x["height"],
                    "hash": `${x["normalhash"].toString('hex')}`,
                    "path": x["path"],
                    "perc": x["perceptualHash"]
                };

                res.send(z);
            }
            catch (Exception)
            {
                console.log(Exception);
                res.status(404).send();
            }
        }
    );

    app.get("/api/image/batch/meta", bodyParser.json({ limit: '100mb', strict: true }), ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let bodyjson: JSON[] = req.body;
                let results = [];
                if (
                    "partial" in bodyjson &&
                    Array.isArray(bodyjson["partial"]) &&
                    bodyjson["partial"].length > 0 &&
                    typeof bodyjson["partial"][0] === 'string'
                )
                {
                    // Good stuff
                    const hashes: string[] = bodyjson["partial"];

                    for (let i = 0; i < hashes.length; ++i )
                    {
                        let y = Buffer.from(hashes[i], 'hex');
                        let x = await mirageDB.GetImageByHash(y);

                        let z = {
                            "width": x["width"],
                            "height": x["height"],
                            "hash": `${x["normalhash"].toString('hex')}`,
                            "path": x["path"],
                            "perc": x["perceptualHash"]
                        };
        
                        results.push(z);
                    }
                }

                if (
                    "complete" in bodyjson &&
                    Array.isArray(bodyjson["complete"]) &&
                    bodyjson["complete"].length > 0 &&
                    typeof bodyjson["complete"][0] === 'string'
                )
                {
                    // Good stuff
                    const hashes: string[] = bodyjson["complete"];

                    for (let i = 0; i < hashes.length; ++i )
                    {
                        let y = Buffer.from(hashes[i], 'hex');
                        let x = await mirageDB.GetImageByHash(y);

                        let z = {
                            "width": x["width"],
                            "height": x["height"],
                            "hash": `${x["normalhash"].toString('hex')}`,
                            "path": x["path"],
                            "perc": x["perceptualHash"],
                            "tags": x["tags"]
                        };
        
                        results.push(z);
                    }
                }

                if (results.length < 1)
                {
                    console.log(bodyjson);
                    res.status(404).send();
                }
                else
                {
                    res.status(200).send(results);
                }

            }
            catch (Exception)
            {
                console.log(Exception);
                res.status(404).send();
            }

        }
    );

    app.get("/api/image/meta/:id/suggested", ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let y = Buffer.from(req.params.id, 'hex');
                let x = await mirageDB.GetImageByHash(y);

                //console.log(x);

                let z = {
                    "suggested":  GetPrelimTags(x["path"])
                };

                res.send(z);
            }
            catch (Exception)
            {
                console.log(Exception);
                res.status(404).send();
            }
        }
    );

    app.get("/api/search/bytag", ensureLoggedIn(), 
        async (req, res) => 
        {
            res.status(200).send(
                {
                    "images": []
                }
            );

            return;
            try
            {
                let a = await mirageDB.GetUntaggedImages();
                let out = Array(a.length);

                for (let i = 0; i < a.length; ++i)
                {
                    out[i] = {
                        "width": a[i]["width"],
                        "height": a[i]["height"],
                        "url": `/api/image/data/${a[i]["normalhash"].toString('hex')}`
                    };
                }
        
                res.status(200).send(
                    {
                        "images": out
                    }
                );

            }
            catch (Exception)
            {
                console.log(Exception);
            }
            //res.sendFile(path.resolve(__dirname, '../', 'public', 'index.html'));
        }
    );

    app.post("/api/tools/speedtag/commit", bodyParser.json({ limit: '100mb', strict: true }), ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                //loadedImages

                let bodyjson: JSON[] = req.body;
                for (let entry of bodyjson)
                {
                    if (
                        "loadedImages" in entry &&
                        Array.isArray(entry["loadedImages"]) &&
                        entry["loadedImages"].length > 0 &&
                        typeof entry["loadedImages"][0] === 'string'
                    )
                    {
                        // Good stuff
                        const hashes: string[] = entry["loadedImages"];

                        for (let i = 0; i < hashes.length; ++i )
                        {
                            console.log(hashes[i]);
                            // Get hash
                            const lHash = Buffer.from(hashes[i], 'hex');
                            const image = await mirageDB.GetImageByHash(lHash);
                            let prelimTags = GetPrelimTags(image["path"]);


                            prelimTags = prelimTags.filter(e => e);

                            for (let i = 0; i < prelimTags.length; ++i)
                            {                   
                                prelimTags[i] = `'${SanitiseTag(prelimTags[i])}'`;
                            }
                            const newTags = prelimTags.join(" ");

                            await mirageDB.UpdateImageTagsByHash(lHash, newTags);
                            
                            //const hexhash: Buffer = Buffer.from(hashes[i], 'hex');
                            //await mirageDB.AddImageToBoard(boardid, hexhash);
                        }

                        //tagToFind = entry["baseTag"];
                        break;
                    }
                    else
                    {
                        res.status(404).send();
                    }
                }

                // let a = await mirageDB.GetUntaggedImages();
                // let currentIndex: number = 0;
                // let runningCount = Math.max(a.length, 256);
                // let out = Array(runningCount);
                // let tagToFind: string = "";

                // let bodyjson: JSON[] = req.body;
                // for (let entry of bodyjson)
                // {
                //     if ("baseTag" in entry)
                //     {
                //         // Good stuff
                //         tagToFind = entry["baseTag"];
                //         break;
                //     }
                //     else
                //     {
                //         res.status(404).send();
                //     }
                // }


                // for (let i = 0; i < a.length; ++i)
                // {
                //     // Query the tags that we *would* have
                //     let prelimTags = GetPrelimTags(a[i]["path"]);

                //     if (prelimTags.indexOf(tagToFind) > -1)
                //     {
                //         out[currentIndex] = {
                //             "width": a[i]["width"],
                //             "height": a[i]["height"],
                //             "hash": `${a[i]["normalhash"].toString('hex')}`
                //         };

                //         ++currentIndex;
                //     }
                // }

                res.status(200).send();

                // res.status(200).send(
                //     {
                //         "images": out
                //     }
                // );
            }
            catch (Exception)
            {
                //console.log(Exception);
                console.log("[WARN] Tag Search Failed");
                res.status(404).send();
            }
            //res.sendFile(path.resolve(__dirname, '../', 'public', 'index.html'));
        }
    );

    app.get("/api/tools/speedtag/show/:tag", ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let a = await mirageDB.GetUntaggedImagesSpeedTag();
                let currentIndex: number = 0;
                let runningCount = Math.max(a.length, 256);
                let out = [];
                let tagToFind = req.params.tag;
                tagToFind = tagToFind.toLowerCase();

                // Construct Regex
                const Regex: RegExp = new RegExp(tagToFind)

                for (let i = 0; i < a.length; ++i)
                {
                    // Query the tags that we *would* have
                    let prelimTags = GetPrelimTags(a[i]["path"]);

                    // Combine prelimTags into one string
                    // This lets us search between tags
                    prelimTags = prelimTags.filter(e => e);
                    const newTags = prelimTags.join(" ");  

                    if (Regex.test(newTags))
                    {
                        out.push({
                            "width": a[i]["width"],
                            "height": a[i]["height"],
                            "hash": `${a[i]["normalhash"].toString('hex')}`
                        });

                        ++currentIndex;
                    }

                    // if (prelimTags.indexOf(tagToFind) > -1)
                    // {

                    // }
                }
        
                res.status(200).send(
                    {
                        "images": out
                    }
                );
            }
            catch (Exception)
            {
                //console.log(Exception);
                console.log("[WARN] Tag Search Failed");
                res.status(404).send();
            }
            //res.sendFile(path.resolve(__dirname, '../', 'public', 'index.html'));
        }
    );

    app.get("/api/search/bytag/:tags", ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let a: any;
                if (req.params.tags === "*")
                {
                    // Don't allow on a large instance. We'll crash the browser immediately
                    if (imageCount > 9999)
                    {
                        res.status(403).send("{\"error\": 3, \"reason\": \"This instance has enough images that loading them all is a risk to client device stability!\" }");
                        return;
                    }

                    a = await mirageDB.GetAllImagesShort();
                }
                else
                {
                    a = await mirageDB.GetImageByTagShort(req.params.tags);
                }

                let out = Array(a.length);

                for (let i = 0; i < a.length; ++i)
                {
                    out[i] = {
                        "width": a[i]["width"],
                        "height": a[i]["height"],
                        "hash": `${a[i]["normalhash"].toString('hex')}`
                    };
                }
        
                res.status(200).send(
                    {
                        "images": out
                    }
                );

            }
            catch (Exception)
            {
                //console.log(Exception);
                console.log("[WARN] Tag Search Failed");
                res.status(404).send();
            }
            //res.sendFile(path.resolve(__dirname, '../', 'public', 'index.html'));
        }
    );

    app.get("/api/search/all", ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let a: any;
                a = await mirageDB.GetAllImages();

                let out = Array(a.length);

                for (let i = 0; i < a.length; ++i)
                {
                    out[i] = {
                        "width": a[i]["width"],
                        "height": a[i]["height"],
                        "hash": `${a[i]["normalhash"].toString('hex')}`,
                        "path": a[i]["path"],
                        "perc": a[i]["perceptualHash"]
                    };
                }
        
                res.status(200).send(
                    {
                        "images": out
                    }
                );

            }
            catch (Exception)
            {
                //console.log(Exception);
                console.log("[WARN] Tag Search Failed");
                res.status(404).send();
            }
        }
    );

    app.post('/api/board/remove', bodyParser.json({ limit: '100mb', strict: true }), ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let bodyjson: JSON[] = req.body;
                for (let entry of bodyjson)
                {
                    if (
                        "board" in entry && typeof entry["board"] === 'number' &&
                        "hashes" in entry &&
                        Array.isArray(entry["hashes"]) &&
                        entry["hashes"].length > 0 &&
                        typeof entry["hashes"][0] === 'string'
                        )
                    {
                        // Good stuff
                        const hashes: string[] = entry["hashes"];
                        const boardid: number = entry["board"];

                        for (let i = 0; i < hashes.length; ++i )
                        {
                            const hexhash: Buffer = Buffer.from(hashes[i], 'hex');
                            await mirageDB.RemoveImageToBoard(boardid, hexhash);
                        }
                    }
                    else
                    {
                        res.status(404).send();
                    }
                }
                
                // Convert from hash to UI

                res.status(200).send();

            }
            catch (Exception)
            {
                console.log(Exception);
                res.status(500).send("{ \"code\": 0, \"reason\": \"Exception\" }");
            }
        }
    );

    

    app.post('/api/board/create', bodyParser.json({ limit: '100mb', strict: true }), ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let bodyjson: string[] = req.body;
                for (let entry of bodyjson)
                {
                    const userid: any = req.user;
                    await mirageDB.AddBoard(userid, entry);
                }
                
                // Convert from hash to UI

                res.status(200).send();

            }
            catch (Exception)
            {
                console.log(Exception);
                res.status(500).send("{ \"code\": 0, \"reason\": \"Exception\" }");
            }
        }
    );

    app.post('/api/board/delete', bodyParser.json({ limit: '100mb', strict: true }), ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let bodyjson: JSON[] = req.body;
                for (let entry of bodyjson)
                {
                    const userid: any = req.user;
                    await mirageDB.RemoveBoard(userid, entry["boardid"]);
                }
                
                // Convert from hash to UI

                res.status(200).send();

            }
            catch (Exception)
            {
                console.log(Exception);
                res.status(500).send("{ \"code\": 0, \"reason\": \"Exception\" }");
            }
        }
    );

    app.post('/api/board/add', bodyParser.json({ limit: '100mb', strict: true }), ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let bodyjson: JSON[] = req.body;
                for (let entry of bodyjson)
                {
                    if (
                        "board" in entry && typeof entry["board"] === 'number' &&
                        "hashes" in entry &&
                        Array.isArray(entry["hashes"]) &&
                        entry["hashes"].length > 0 &&
                        typeof entry["hashes"][0] === 'string'
                        )
                    {
                        // Good stuff
                        const hashes: string[] = entry["hashes"];
                        const boardid: number = entry["board"];
                        //console.log(boardid, hashes);

                        for (let i = 0; i < hashes.length; ++i )
                        {
                            const hexhash: Buffer = Buffer.from(hashes[i], 'hex');
                            await mirageDB.AddImageToBoard(boardid, hexhash);
                        }
                    }
                    else
                    {
                        res.status(404).send();
                    }
                }
                
                // Convert from hash to UI

                res.status(200).send();

            }
            catch (Exception)
            {
                console.log(Exception);
                res.status(500).send("{ \"code\": 0, \"reason\": \"Exception\" }");
            }
        }
    );

    app.get('/api/board/:boardid/images', ensureLoggedIn(), async (req, res) => 
    {
        // Use a board
        // BOARD FETCH RETURNS IDS
        try
        {
            let a = await mirageDB.GetImagesByBoardShort(parseInt(req.params.boardid, 10));
            let out = Array(a.length);

            for (let i = 0; i < a.length; ++i)
            {
                out[i] = {
                    "width": a[i]["width"],
                    "height": a[i]["height"],
                    "hash": `${a[i]["normalhash"].toString('hex')}`
                };
            }

            res.status(200).send(
                {
                    "boardName": "NAME",
                    "images": out
                }
            );
        }
        catch (Exception)
        {
            console.log("dd");
            res.status(404).send();
        }
    });


    app.get("/api/file/data/:id", ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let y = Buffer.from(req.params.id, 'hex');
                let x = await mirageDB.GetFilePathByHash(y);
                
                if (x)
                {
                    let loadPath = x["path"];

                    res.sendFile(path.resolve(__imagePath, loadPath));
                }
                else
                {
                    // Mark deleted
                    res.status(404).send();

                    // Mark
                    console.log(`[WARN] Marking ${y} as dead.`)
                    mirageDB.MarkFileDeletedHash(y);
                }
            }
            catch (Exception)
            {
                console.log(Exception);
                res.status(500).send();
            }
        }
    );

    app.get('/api/file/meta/:id/tag', ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let y = Buffer.from(req.params.id, 'hex');
                let x = await mirageDB.GetFileTagsByHash(y);
                
                if (x)
                {
                    //let imgtags = x["tags"];
                    let inTab = await SplitTSV(x["tags"].toLowerCase());//.split(" ");

                    let result = { "tags": inTab };

                    res.status(200).send(result);
                }
                else
                {
                    res.status(404).send("{ \"code\": 2, \"reason\": \"Hash not found\" }");
                }
            }
            catch (Exception)
            {
                console.log(Exception);
                res.status(500).send("{ \"code\": 0, \"reason\": \"Exception\" }");
            }
        }
    );

    app.get("/api/file/search/bytag/:tags", ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let a: any;
                if (req.params.tags === "*")
                {
                    // Don't allow on a large instance. We'll crash the browser immediately
                    if (imageCount > 9999)
                    {
                        res.status(400).send("{\"error\": 3, \"reason\": \"This instance has enough images that loading them all is a risk to client device stability!\" }");
                        return;
                    }

                    a = await mirageDB.GetAllFilesShort();
                }
                else
                {
                    a = await mirageDB.GetFileByTagShort(req.params.tags);
                }

                let out = Array(a.length);

                for (let i = 0; i < a.length; ++i)
                {
                    out[i] = {
                        "name": a[i]["name"],
                        "size": a[i]["size"],
                        "hash": `${a[i]["hash"].toString('hex')}`
                    };
                }

                res.status(200).send(
                    {
                        "files": out
                    }
                );

            }
            catch (Exception)
            {
                //console.log(Exception);
                console.log("[WARN] Tag Search Failed");
                res.status(404).send();
            }
            //res.sendFile(path.resolve(__dirname, '../', 'public', 'index.html'));
        }
    );

    app.get("/api/file/search/fuzzy/:tags", ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let a: any;
                if (req.params.tags === "*")
                {
                    // Don't allow on a large instance. We'll crash the browser immediately
                    if (imageCount > 9999)
                    {
                        res.status(400).send("{\"error\": 3, \"reason\": \"This instance has enough images that loading them all is a risk to client device stability!\" }");
                        return;
                    }

                    a = await mirageDB.GetAllFilesShort();
                }
                else
                {
                    a = await mirageDB.GetFileByTagShort(req.params.tags);
                }


                let out = [];

                if (a.length > 0)
                {
                    out = Array(a.length);
                    for (let i = 0; i < a.length; ++i)
                    {
                        out[i] = {
                            "name": a[i]["name"],
                            "size": a[i]["size"],
                            "hash": `${a[i]["hash"].toString('hex')}`
                        };
                    }
                }
                else
                {
                    // Try to fuzzy search
                    let fuzzyFiles = await mirageDB.GetAllFiles();
                    let currentIndex: number = 0;
                    let runningCount = Math.max(a.length, 256);
                    let tagToFind = req.params.tags;
                    tagToFind = tagToFind.toLowerCase();

                    // Construct Regex
                    const Regex: RegExp = new RegExp(tagToFind)

                    for (let i = 0; i < fuzzyFiles.length; ++i)
                    {
                        // Query the tags that we *would* have
                        let prelimTags = GetPrelimTags(fuzzyFiles[i]["path"]);

                        // Combine prelimTags into one string
                        // This lets us search between tags
                        prelimTags = prelimTags.filter(e => e);
                        const newTags = prelimTags.join(" ");  

                        if (Regex.test(newTags))
                        {
                            out.push({
                                "name": fuzzyFiles[i]["name"],
                                "size": fuzzyFiles[i]["size"],
                                "hash": `${fuzzyFiles[i]["hash"].toString('hex')}`
                            });

                            ++currentIndex;
                        }
                    }
                }

                res.status(200).send(
                    {
                        "files": out
                    }
                );

            }
            catch (Exception)
            {
                console.log(Exception);
                console.log("[WARN] Tag Search Failed");
                res.status(404).send();
            }
            //res.sendFile(path.resolve(__dirname, '../', 'public', 'index.html'));
        }
    );


    app.post('/api/file/meta/:id/tag', bodyParser.json({ limit: '100mb', strict: true }), ensureLoggedIn(),
        async (req, res) => 
        {
            try
            {
                let y = Buffer.from(req.params.id, 'hex');
                let resarray: string[] = req.body;

                resarray = resarray.filter(e => e);

                for (let i = 0; i < resarray.length; ++i)
                {                   
                    resarray[i] = `'${SanitiseTag(resarray[i])}'`;
                }
                let newTags = resarray.join(" ");
                //let x = await mirageDB.GetImageTagsByHash(y);
                await mirageDB.UpdateFileTagsByHash(y, newTags);
                res.status(200).send(newTags);
                
                // if (x)
                // {
                //     let inTab = req.params.tag.toLowerCase();

                //     await mirageDB.UpdateImageTagsByHash(y, inTab);
                //     res.status(200).send(inTab);
                // }
                // else
                // {
                //     res.status(404).send("{ \"code\": 2, \"reason\": \"Hash not found\" }");
                // }
            }
            catch (Exception)
            {
                console.log(Exception);
                res.status(500).send("{ \"code\": 0, \"reason\": \"Exception\" }");
            }
        }
    );

    app.get("/api/file/meta/:id/suggested", ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let y = Buffer.from(req.params.id, 'hex');
                let x = await mirageDB.GetFileByHash(y);

                let z = {
                    "suggested":  GetPrelimTags(x["path"], false)
                };

                res.send(z);
            }
            catch (Exception)
            {
                console.log(Exception);
                res.status(404).send();
            }
        }
    );








    const port = process.env.PORT || 3000;

    app.listen(port, () => console.log(`[INFO] Launching on port ${port}`));

    console.log("[INFO] Mirage Online");
}

entry();