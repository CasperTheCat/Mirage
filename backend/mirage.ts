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

import { IngestImageFromPath } from "./imageHandler.js";

const app = express();

const state = new MirageApp();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Init

let mirageDB: MirageDB = new MirageDB();

import {InitDB} from "./init/db.js";
import {InitAuthStrat} from "./init/auth.js";


app.use(session({ secret: 'keyboard cat' }));
app.use(passport.initialize());
app.use(passport.session());

InitDB(mirageDB).then
(() => 
    {
        console.log("[INFO] DB Online");
    }
)
.catch
((err) =>
    {
        console.log("[ERRO] DB Failure");
        throw err;
    }
)

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

app.get('/login',
    (req, res) => 
    {
        res.sendFile(path.resolve(__dirname, '../', 'public', 'login.html'));
    }
);

app.post('/login', bodyParser.urlencoded({extended: false}), passport.authenticate('local', {
    successRedirect: '/dummy',
    failureRedirect: '/login',
    failureMessage: true
  }));

app.get('/logout', 
(req, res) =>
    {
        //req.logout();
        res.redirect('/');
    }
);

app.get('/dummy', ensureLoggedIn(), 
    (req, res) => 
        {
            console.log("Trigger");
            res.sendFile(path.resolve(__dirname, '../', 'public', 'index.html'));
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
app.get('/stats', (req, res) => 
{
    res.send(`{ \"count\": ${state.LastUpdatedItemCount} }`);

    state.LastUpdatedItemCount += 1;
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

// IngestImageFromPath("test.png", mirageDB);

app.get("/image/:id", ensureLoggedIn(), 
    (req, res) => 
    {
        console.log(`Serve Image: ${req.params.id}`);
        res.sendFile(path.resolve(__dirname, '../', 'public', 'index.html'));
    }
);

app.get("/api/image/:id/data", ensureLoggedIn(), 
    async (req, res) => 
    {
        try
        {
            let y = Buffer.from(req.params.id, 'hex');
            let x = await mirageDB.GetImageByHash(y);
            
            if (x)
            {
                let loadPath = x["path"];

                res.sendFile(path.resolve(__dirname, "../images", loadPath));
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

app.get("/api/image/:id", ensureLoggedIn(), 
    async (req, res) => 
    {
        let y = Buffer.from(req.params.id, 'hex');
        let x = await mirageDB.GetImageByHash(y);
        

        let z = {
            "width": x["width"],
            "height": x["height"],
            "url": `/api/image/${req.params.id}/data`
        };

        res.send(z);
        //res.sendFile(path.resolve(__dirname, '../', 'public', 'index.html'));
    }
);

app.get("/api/bytag/:tags", ensureLoggedIn(), 
    async (req, res) => 
    {
        try
        {
            let a = await mirageDB.GetImageByTag(req.params.tags);
            let out = Array(a.length);

            for (let i = 0; i < a.length; ++i)
            {
                out[i] = {
                    "width": a[i]["width"],
                    "height": a[i]["height"],
                    "url": `/api/image/${a[i]["normalhash"].toString('hex')}/data`
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

app.get('/api/board/:boardid/images', ensureLoggedIn(), async (req, res) => 
{
    // Use a board
    // BOARD FETCH RETURNS IDS
    try
    {
        let a = await mirageDB.GetImagesByBoard(parseInt(req.params.boardid, 10));
        let out = Array(a.length);

        for (let i = 0; i < a.length; ++i)
        {
            out[i] = {
                "width": a[i]["width"],
                "height": a[i]["height"],
                "url": `/api/image/${a[i]["normalhash"].toString('hex')}/data`
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
