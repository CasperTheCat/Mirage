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
import { IngestImageFromPath, CheckFolder, DiscardOrMark } from "./imageHandler.js";
import {InitDB} from "./init/db.js";
import {InitAuthStrat} from "./init/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const __imagePath = path.resolve(__dirname, "../images");

async function entry()
{
    const app = express();

    const state = new MirageApp();

    // Init

    let mirageDB: MirageDB = new MirageDB();


    app.use(session({ secret: 'keyboard cat' }));
    app.use(passport.initialize());
    app.use(passport.session());

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


    // Get Folder
    // This isn't valid unless DB is up
    {
        await DiscardOrMark(__imagePath, mirageDB);
    
        let checkedImages = await CheckFolder(__imagePath, mirageDB, __imagePath);
        console.log(`[INFO] Mirage checked ${checkedImages} files.`);
    }

    let imageCount = await mirageDB.GetImageCount();


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
            req.logout();
            res.redirect('/');
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

    app.post('/api/image/tag/delete',  bodyParser.json({ limit: '100mb', strict: true }), ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let tags: string[] = req.body;
                for (let tag of tags)
                {
                    mirageDB.DeleteTag(tag);
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
                            let oldTag: string = pair[0];
                            let newTag: string = pair[1];

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
                    let temp = resarray[i].toLowerCase();
                    temp.replace(/[.,\/#!$%\^&\*;:{}=\-_`\'\"~()]/g,"");
                    temp.replace(/\s{2,}/g," ");
                    
                    resarray[i] = `'${temp}'`;
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
                
                if (x)
                {
                    let loadPath = x["path"];

                    res.sendFile(path.resolve(__imagePath, loadPath));
                }
                else
                {
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

    app.get("/api/image/meta/:id", ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let y = Buffer.from(req.params.id, 'hex');
                let x = await mirageDB.GetImageByHashShort(y);

                console.log(x);
                

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

    app.get("/api/search/bytag/:tags", ensureLoggedIn(), 
        async (req, res) => 
        {
            try
            {
                let a: any;
                if (req.params.tags === "*")
                {
                    // Don't allow on a large instance. We'll crash the browser immediately
                    if (imageCount > 10000)
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



    const port = process.env.PORT || 3000;

    app.listen(port, () => console.log(`App on port ${port}`));
}

entry();