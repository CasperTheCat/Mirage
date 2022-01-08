// import {Pool} from 'pg';

// export default new Pool ({
//     // We should load the connection string from a file or from the environment.
//     max: 20,
//     connectionString: 'postgres://user@pass@host:port/dbname',
//     idleTimeoutMillis: 30000
// });

import pgPromise from "pg-promise";
import pkg from 'pg-promise';
const { PreparedStatement } = pkg;

// Declare PG
const config = {
    user: process.env.PGUSER || "postgres",
    password: process.env.PGUSER || "postgres",
    host: process.env.PGHOST || "localhost",
    port: parseInt( process.env.PGPORT || "5432", 10 ),
    database: process.env.PGDATABASE || "mirage"
};

class MirageDB 
{
    pgdb = pgPromise()(config);
    PSGetAuthByUsername = new PreparedStatement(
        {
            name: "PSGetAuthByUsername",
            text: "SELECT * FROM auth WHERE username = $1"
        }
    );

    PSGetAuthByUID = new PreparedStatement(
        {
            name: "PSGetAuthByUID",
            text: "SELECT * FROM auth WHERE userid = $1"
        }
    );

    PSGetUserByUsername = new PreparedStatement(
        {
            name: "PSGetUserByUsername",
            text: "SELECT users.* FROM users, auth WHERE users.userid = auth.userid AND auth.username = $1"
        }
    );

    PSGetUserByUID = new PreparedStatement(
        {
            name: "PSGetUserByUID",
            text: "SELECT * FROM users WHERE userid = $1"
        }
    );

    PSGetBoardReferencesByUID = new PreparedStatement(
        {
            name: "PSGetBoardReferencesByUID",
            text: "SELECT * FROM user_board WHERE ownerid = $1"
        }
    );

    PSGetBoardsByUID = new PreparedStatement(
        {
            name: "PSGetBoardReferencesByUID",
            text: " SELECT boards.* FROM boards, user_board WHERE boards.boardid = user_board.boardid AND user_board.ownerid = $1"
        }
    );

    PSGetBoardByBID = new PreparedStatement(
        {
            name: "PSGetBoardByBID",
            text: "SELECT * FROM boards WHERE boardid = $1"
        }
    );

    PSGetImagesInBoard = new PreparedStatement(
        {
            name: "PSGetImagesInBoard",
            text: "SELECT * FROM boardcontents WHERE boardid = $1"
        }
    );



    // constructor()
    // {
    // }

    async ClearDB()
    {
        try
        {
            console.log("[WARN] Clearing Database");
            await this.pgdb.query("DROP TABLE IF EXISTS users;");
            console.log("[WARN] Dropped Table 'users'");
            await this.pgdb.query("DROP TABLE IF EXISTS user_board;");
            console.log("[WARN] Dropped Table 'user_board'");
            await this.pgdb.query("DROP TABLE IF EXISTS boards");
            console.log("[WARN] Dropped Table 'boards'");
            await this.pgdb.query("DROP TABLE IF EXISTS auth;");
            console.log("[WARN] Dropped Table 'auth'");

        }
        catch (Err)
        {
            console.log("Failed to Clear Database");
            console.log(Err);
        }
        
    }


    async InitialiseAuth()
    {        
        await this.pgdb.query("CREATE TABLE IF NOT EXISTS auth \
            ( \
                userid INT NOT NULL PRIMARY KEY GENERATED ALWAYS AS IDENTITY, \
                username TEXT UNIQUE, \
                password BYTEA, \
                salt BYTEA \
            ); \
        ");
    }

    async InitialiseUsers()
    {
        await this.pgdb.query("CREATE TABLE IF NOT EXISTS users \
            ( \
                userid INT REFERENCES auth (userid) ON UPDATE CASCADE ON DELETE CASCADE, \
                displayname VARCHAR, \
                CONSTRAINT auth_user_key PRIMARY KEY (userid) \
            ); \
        ");
    }

    async InitialiseImages()
    {
        await this.pgdb.query("\
        CREATE TABLE IF NOT EXISTS images \
        ( \
            imageid INT NOT NULL PRIMARY KEY GENERATED ALWAYS AS IDENTITY, \
            normalHash BYTEA UNIQUE, \
            perceptualHash BYTEA, \
            path TEXT, \
            tags TSVECTOR \
        ); \
        ");

        await this.pgdb.query("\
        CREATE INDEX ind_tag_image ON images USING GIN (tags);\
        ");


    }

    async InitialiseBoards()
    {        
        await this.pgdb.query("CREATE TABLE IF NOT EXISTS boards \
            ( \
                boardid INT NOT NULL PRIMARY KEY GENERATED ALWAYS AS IDENTITY, \
                boardname VARCHAR, \
                boardurls VARCHAR ARRAY \
            ); \
        ");

        await this.pgdb.query("CREATE TABLE IF NOT EXISTS user_board \
        ( \
            boardid INT REFERENCES boards (boardid) ON UPDATE CASCADE ON DELETE CASCADE, \
            ownerid INT REFERENCES auth (userid) ON UPDATE CASCADE, \
            CONSTRAINT user_board_key PRIMARY KEY (boardid, ownerid)\
        ); \
    ");
    }

    async GetAuthByUsername(username: string)
    {
        return this.pgdb.one(this.PSGetAuthByUsername, [username]);
    }

    async GetAuthByUID(uid: number)
    {
        return this.pgdb.one(this.PSGetAuthByUID, [uid]);
    }

    async GetUserByUsername(username: string)
    {
        return this.pgdb.one(this.PSGetUserByUsername, [username]);
    }

    async GetUserByUID(uid: number)
    {
        return this.pgdb.one(this.PSGetUserByUID, [uid]);
    }

    async GetBoardsByUID(uid: number)
    {
        console.log("[INFO] PSGetBoardsByUID")
        return this.pgdb.manyOrNone(this.PSGetBoardsByUID, [uid]);
    }

    async AddUser(username: string, salt, key, displayname: string = "")
    {
        try
        {
            let res = await this.pgdb.one("INSERT INTO auth (username, password, salt) VALUES ($1, $2, $3) RETURNING userid;", [
                username, 
                key,
                salt
            ]
            );

            let res2 = await this.pgdb.one("INSERT INTO users (userid, displayname) VALUES ($1, $2) RETURNING displayname;", [
                res.userid, 
                displayname
            ]
            );

            return true;
        }
        catch (Exception)
        {
            console.log(Exception);
            return false;
        }
    }


};

export {MirageDB};