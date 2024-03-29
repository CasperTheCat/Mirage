// import {Pool} from 'pg';

// export default new Pool ({
//     // We should load the connection string from a file or from the environment.
//     max: 20,
//     connectionString: 'postgres://user@pass@host:port/dbname',
//     idleTimeoutMillis: 30000
// });

import type path from "path";
import pgPromise from "pg-promise";
import pkg from 'pg-promise';
const { PreparedStatement } = pkg;

// Declare PG
const config = {
    user: process.env.PGUSER || "mirage",
    password: process.env.PGPASS || "postgres",
    host: process.env.PGHOST || "localhost",
    port: parseInt( process.env.PGPORT || "5432", 10 ),
    database: process.env.PGDATABASE || "mirage"
};

class MirageDB 
{
    pgdb;
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
            name: "PSGetBoardsByUID",
            text: "SELECT boards.boardid, boards.boardname FROM boards, user_board WHERE boards.boardid = user_board.boardid AND user_board.ownerid = $1"
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

    PSGetImageByHash = new PreparedStatement(
        {
            name: "PSGetImageByHash",
            text: "SELECT * FROM images WHERE normalhash = $1"
        }
    );

    PSGetFileByHash = new PreparedStatement(
        {
            name: "PSGetFileByHash",
            text: "SELECT * FROM files WHERE hash = $1"
        }
    );

    PSGetImageByHashShort = new PreparedStatement(
        {
            name: "PSGetImageByHashShort",
            text: "SELECT height, width, normalhash FROM images WHERE live = true AND normalhash = $1"
        }
    );

    PSGetImagePathByHash = new PreparedStatement(
        {
            name: "PSGetImagePathByHash",
            text: "SELECT path FROM images WHERE normalhash = $1"
        }
    );

    PSGetFilePathByHash = new PreparedStatement(
        {
            name: "PSGetFilePathByHash",
            text: "SELECT path FROM files WHERE hash = $1"
        }
    );

    PSGetImageTagsByHash = new PreparedStatement(
        {
            name: "PSGetImageTagsByHash",
            text: "SELECT tags FROM images WHERE normalhash = $1"
        }
    );

    PSGetFileTagsByHash = new PreparedStatement(
        {
            name: "PSGetFileTagsByHash",
            text: "SELECT tags FROM files WHERE hash = $1"
        }
    );

    PSGetSharedBoardByHash = new PreparedStatement(
        {
            name: "PSGetSharedBoardByHash",
            text: "SELECT boardid FROM shared_boards WHERE shareuuid = $1"
        }
    );

    PSGetImageByTag = new PreparedStatement(
        {
            name: "PSGetImageByTag",
            text: "SELECT * FROM images WHERE live = true AND tags @@ $1::tsquery ORDER BY normalhash ASC"
        }
    );

    PSGetImageByTagShort = new PreparedStatement(
        {
            name: "PSGetImageByTagShort",
            text: "SELECT height, width, normalhash FROM images WHERE live = true AND tags @@ $1::tsquery ORDER BY normalhash ASC"
        }
    );

    PSGetFileByTagShort = new PreparedStatement(
        {
            name: "PSGetFileByTagShort",
            text: "SELECT name, size, hash FROM files WHERE live = true AND tags @@ $1::tsquery ORDER BY name ASC"
        }
    );

    PSUpdateImageLocationByID = new PreparedStatement(
        {
            name: "PSUpdateImageLocationByID",
            text: "UPDATE images SET path = $2::text, live = true::boolean WHERE imageid = $1"
        }
    );

    // PSDeleteTag = new PreparedStatement(
    //     {
    //         name: "PSDeleteTag",
    //         text: "UPDATE images SET tags = ts_delete(tags::tsvector, $2::text) WHERE tags @@ $1::tsquery"
    //     }
    // );

    PSDeleteTag = new PreparedStatement(
        {
            name: "PSDeleteTag",
            text: "UPDATE images SET tags = array_to_tsvector(array_remove(tsvector_to_array(tags), $2::text)) WHERE tags @@ $1::tsquery"
        }
    );
    
    // PSRenameTag = new PreparedStatement(
    //     {
    //         name: "PSRenameTag",
    //         text: "UPDATE images SET tags = tsvector_concat(ts_delete(tags, $3::text), $2) WHERE tags @@ $1::tsquery"
    //     }
    // );
    PSRenameTag = new PreparedStatement(
        {
            name: "PSRenameTag",
            text: "UPDATE images SET tags = array_to_tsvector(array_append(array_remove(tsvector_to_array(tags), $3::text), $2::text)) WHERE tags @@ $1::tsquery"
        }
    );
    // PSRenameTag = new PreparedStatement(
    //     {
    //         name: "PSRenameTag",
    //         text: "UPDATE images SET tags = tsvector_concat(array_to_tsvector(array_remove(tsvector_to_array(tags), $3::text)), $2::tsvector) WHERE tags @@ $1::tsquery"
    //     }
    // );    

    PSAppendTag = new PreparedStatement(
        {
            name: "PSAppendTag",
            text: "UPDATE images SET tags = array_to_tsvector(array_append(tsvector_to_array(tags), $2::text)) WHERE tags @@ $1::tsquery"
        }
    );   
    // PSAppendTag = new PreparedStatement(
    //     {
    //         name: "PSAppendTag",
    //         text: "UPDATE images SET tags = tsvector_concat(tags, $2::tsvector) WHERE tags @@ $1::tsquery"
    //     }
    // );   
    
    PSAddImageToBoard = new PreparedStatement(
        {
            name: "PSAddImageToBoard",
            text: "UPDATE boards \
                SET imageids = array_append(boards.imageids, images.imageid) \
                FROM images \
                    WHERE images.normalhash = $2 \
                    AND NOT images.imageid = ANY(boards.imageids) \
                    AND boards.boardid = $1"
        }
    );  

    PSRemoveImageFromBoard = new PreparedStatement(
        {
            name: "PSRemoveImageFromBoard",
            text: "UPDATE boards \
                SET imageids = array_remove(boards.imageids, images.imageid) \
                FROM images \
                    WHERE images.normalhash = $2 \
                    AND images.imageid = ANY(boards.imageids) \
                    AND boards.boardid = $1"
        }
    );  


    PSUpdateImageTagsByID = new PreparedStatement(
        {
            name: "PSUpdateImageTagsByID",
            text: "UPDATE images SET tags = $2::tsvector WHERE imageid = $1"
        }
    );

    PSUpdateImageTagsByHash = new PreparedStatement(
        {
            name: "PSUpdateImageTagsByHash",
            text: "UPDATE images SET tags = $2::tsvector WHERE normalhash = $1"
        }
    );

    PSUpdateFileTagsByHash = new PreparedStatement(
        {
            name: "PSUpdateFileTagsByHash",
            text: "UPDATE files SET tags = $2::tsvector WHERE hash = $1"
        }
    );

    PSGetAllImages = new PreparedStatement(
        {
            name: "PSGetAllImages",
            text: "SELECT * FROM images WHERE live = true"
        }
    );

    PSGetAllFiles = new PreparedStatement(
        {
            name: "PSGetAllFiles",
            text: "SELECT * FROM files WHERE live = true ORDER BY size ASC"
        }
    );

    PSGetAllImagesShort = new PreparedStatement(
        {
            name: "PSGetAllImagesShort",
            text: "SELECT height, width, normalhash FROM images WHERE live = true"
        }
    );

    PSGetAllFilesShort = new PreparedStatement(
        {
            name: "PSGetAllFilesShort",
            text: "SELECT name, size, hash FROM files WHERE live = true"
        }
    );
    

    PSGetAllImagesMark = new PreparedStatement(
        {
            name: "PSGetAllImagesMark",
            text: "SELECT imageid, path FROM images WHERE live = true"
        }
    );

    PSGetAllFilesMark = new PreparedStatement(
        {
            name: "PSGetAllFilesMark",
            text: "SELECT fileid, path FROM files WHERE live = true"
        }
    );

    PSMarkImageDeletedByID = new PreparedStatement(
        {
            name: "PSMarkImageDeletedByID",
            text: "UPDATE images SET live = false::boolean WHERE imageid = $1"
        }
    );

    PSMarkFileDeletedByID = new PreparedStatement(
        {
            name: "PSMarkFileDeletedByID",
            text: "UPDATE files SET live = false::boolean WHERE fileid = $1"
        }
    );

    PSMarkImageDeletedByHash = new PreparedStatement(
        {
            name: "PSMarkImageDeletedByHash",
            text: "UPDATE images SET live = false::boolean WHERE normalhash = $1"
        }
    );

    PSMarkFileDeletedByHash = new PreparedStatement(
        {
            name: "PSMarkFileDeletedByHash",
            text: "UPDATE files SET live = false::boolean WHERE hash = $1"
        }
    );    

    PSMarkImageLiveByID = new PreparedStatement(
        {
            name: "PSMarkImageLiveByID",
            text: "UPDATE images SET live = true::boolean WHERE imageid = $1"
        }
    );

    PSMarkImageLiveByHash = new PreparedStatement(
        {
            name: "PSMarkImageLiveByHash",
            text: "UPDATE images SET live = true::boolean WHERE normalhash = $1"
        }
    );

    //select * from images where cast(normalhash as text) LIKE '_x{}%';
    // TODO: This needs to handle getting images and returning many from this
    PSGetImagesByBoard = new PreparedStatement(
        {
            name: "PSGetImagesByBoard",
            text: "SELECT images.* FROM images, boards WHERE images.live = true AND images.imageid = ANY(boards.imageids) AND boards.boardid = $1 ORDER BY images.normalhash ASC"
        }
    );

    PSGetImagesByBoardShort = new PreparedStatement(
        {
            name: "PSGetImagesByBoardShort",
            text: "SELECT images.width, images.height, images.normalhash FROM images, boards WHERE images.live = true AND images.imageid = ANY(boards.imageids) AND boards.boardid = $1 ORDER BY images.normalhash ASC"
        }
    );

    PSGetImagesByBoardSearchShort = new PreparedStatement(
        {
            name: "PSGetImagesByBoardSearchShort",
            text: "SELECT images.width, images.height, images.normalhash FROM images, boards WHERE images.live = true AND images.imageid = ANY(boards.imageids) AND images.tags @@ $1::tsquery AND boards.boardid = $2 ORDER BY images.normalhash ASC"
        }
    );

    PSGetImageCount = new PreparedStatement(
        {
            name: "PSGetImageCount",
            text: "SELECT COUNT(imageid) FROM images WHERE live = true"
        }
    );

    PSGetImageCountByTag = new PreparedStatement(
        {
            name: "PSGetImageCountByTag",
            text: "SELECT COUNT(imageid) FROM images WHERE live = true AND tags @@ $1::tsquery"
        }
    );

    PSGetUntaggedImages = new PreparedStatement(
        {
            name: "PSGetUntaggedImages",
            text: "SELECT height, width, normalhash FROM images WHERE live = true AND tags = ''"
        }
    );

    PSGetUntaggedImagesSpeedTag = new PreparedStatement(
        {
            name: "PSGetUntaggedImages",
            text: "SELECT height, width, normalhash, path FROM images WHERE live = true AND tags = ''"
        }
    );

    PSGetUntaggedImagesSortedLimited = new PreparedStatement(
        {
            name: "PSGetUntaggedImagesSortedLimited",
            text: "SELECT height, width, normalhash FROM images WHERE live = true AND tags = '' ORDER BY normalhash ASC LIMIT 250"
        }
    );

    PSGetUntaggedFilesSortedLimited = new PreparedStatement(
        {
            name: "PSGetUntaggedFilesSortedLimited",
            text: "SELECT size, hash, name FROM files WHERE live = true AND tags = '' ORDER BY name ASC LIMIT 250"
        }
    );

    PSGetTagList = new PreparedStatement(
        {
            name: "PSGetTagList",
            text: "SELECT array_agg(distinct(n)) FROM images, unnest(tsvector_to_array(tags)) as n WHERE live = true"
        }
    );


    constructor()
    {
        try
        {
            this.pgdb = pgPromise()(config);
        }
        catch (Err)
        {
            console.log("DEAD");
            throw Err;
        }
    }

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
            await this.pgdb.query("DROP TABLE IF EXISTS images;");
            console.log("[WARN] Dropped Table 'images'");

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

    async InitialiseSession()
    {        
        await this.pgdb.query("CREATE TABLE IF NOT EXISTS session \
            ( \
                sid varchar NOT NULL COLLATE \"default\",\
                sess json NOT NULL,\
                expire timestamp(6) NOT NULL,\
                CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE\
            )\
            WITH (OIDS=FALSE);\
        ");

        await this.pgdb.query("CREATE INDEX IF NOT EXISTS \"IDX_session_expire\" ON session (expire);");
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
            width INT, \
            height INT, \
            path TEXT, \
            tags TSVECTOR, \
            live BOOLEAN DEFAULT TRUE NOT NULL \
        ); \
        ");

        await this.pgdb.query("\
        CREATE INDEX IF NOT EXISTS ind_tag_image ON images USING GIN (tags);\
        ");


    }

    async InitialiseBoards()
    {        
        await this.pgdb.query("CREATE TABLE IF NOT EXISTS boards \
            ( \
                boardid INT NOT NULL PRIMARY KEY GENERATED ALWAYS AS IDENTITY, \
                boardname VARCHAR, \
                imageids INT ARRAY DEFAULT '{}' NOT NULL \
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

    async InitialiseFiles()
    {
        // TODO REMOVE
        //await this.pgdb.query("DROP TABLE IF EXISTS files;");

        await this.pgdb.query("\
            CREATE TABLE IF NOT EXISTS files \
            ( \
                fileid INT NOT NULL PRIMARY KEY GENERATED ALWAYS AS IDENTITY, \
                hash BYTEA UNIQUE, \
                size BIGINT, \
                path TEXT, \
                name TEXT, \
                tags TSVECTOR, \
                live BOOLEAN DEFAULT TRUE NOT NULL \
            ); \
        ");

        await this.pgdb.query("\
            CREATE INDEX IF NOT EXISTS ind_tag_files ON files USING GIN (tags); \
        ");
    }

    async InitialiseSharedBoards()
    {
        // TODO REMOVE
        //await this.pgdb.query("DROP TABLE IF EXISTS shared_boards;");

        await this.pgdb.query("CREATE TABLE IF NOT EXISTS shared_boards \
            ( \
                boardid INT REFERENCES boards (boardid) ON UPDATE CASCADE ON DELETE CASCADE, \
                shareuuid BYTEA UNIQUE, \
                CONSTRAINT shared_board_key PRIMARY KEY (boardid)\
            ); \
        ");
    }

    async GetAuthByUsername(username: string)
    {
        return this.pgdb.oneOrNone(this.PSGetAuthByUsername, [username]);
    }

    async GetAuthByUID(uid: number)
    {
        return this.pgdb.oneOrNone(this.PSGetAuthByUID, [uid]);
    }

    async GetUserByUsername(username: string)
    {
        return this.pgdb.oneOrNone(this.PSGetUserByUsername, [username]);
    }

    async GetUserByUID(uid: number)
    {
        return this.pgdb.oneOrNone(this.PSGetUserByUID, [uid]);
    }

    async GetBoardsByUID(uid: number)
    {
        return this.pgdb.manyOrNone(this.PSGetBoardsByUID, [uid]);
    }

    async GetImageByHash(hash: Buffer)
    {
        return this.pgdb.oneOrNone(this.PSGetImageByHash, [hash]);
    }

    async GetImageByHashShort(hash: Buffer)
    {
        return this.pgdb.oneOrNone(this.PSGetImageByHashShort, [hash]);
    }

    async GetImagePathByHash(hash: Buffer)
    {
        return this.pgdb.oneOrNone(this.PSGetImagePathByHash, [hash]);
    }

    async GetImageTagsByHash(hash: Buffer)
    {
        return this.pgdb.oneOrNone(this.PSGetImageTagsByHash, [hash]);
    }

    async GetImageByTag(tags: string)
    {
        return this.pgdb.manyOrNone(this.PSGetImageByTag, [tags.toLowerCase()]);
    }

    async GetImageByTagShort(tags: string)
    {
        return this.pgdb.manyOrNone(this.PSGetImageByTagShort, [tags.toLowerCase()]);
    }

    async GetAllImages()
    {
        return this.pgdb.manyOrNone(this.PSGetAllImages, []);
    }

    async GetAllImagesShort()
    {
        return this.pgdb.manyOrNone(this.PSGetAllImagesShort, []);
    }

    async GetAllImagesMark()
    {
        return this.pgdb.manyOrNone(this.PSGetAllImagesMark, []);
    }

    async UpdateImageLocationByID(identifier: number, relPath: string)
    {
        return this.pgdb.none(this.PSUpdateImageLocationByID, [identifier, relPath]);
    }

    async UpdateImageTagsByID(identifier: number, tags: string)
    {
        return this.pgdb.none(this.PSUpdateImageTagsByID, [identifier, tags]);
    }

    async UpdateImageTagsByHash(hash: Buffer, tags: string)
    {
        return this.pgdb.none(this.PSUpdateImageTagsByHash, [hash, tags]);
    }

    async DeleteTag(tags: string)
    {
        return this.pgdb.oneOrNone(this.PSDeleteTag, [`'${tags}'`, tags]);
    }

    async RenameTag(oldTag: string, newTag: string)
    {
        return this.pgdb.none(this.PSRenameTag, [`'${oldTag}'`, newTag, oldTag]);
    }   

    async AppendTag(query: string, newTag: string)
    {
        return this.pgdb.oneOrNone(this.PSAppendTag, [query, newTag]);
    }   

    async GetImagesByBoard(boarduid: number)
    {
        return this.pgdb.manyOrNone(this.PSGetImagesByBoard, [boarduid]);
    }

    async GetImagesByBoardShort(boarduid: number)
    {
        return this.pgdb.manyOrNone(this.PSGetImagesByBoardShort, [boarduid]);
    }

    async GetImagesByBoardSearchShort(boarduid: number, search: string)
    {
        return this.pgdb.manyOrNone(this.PSGetImagesByBoardSearchShort, [boarduid, search]);
    }

    async AddImageToBoard(boarduid: number, hash: Buffer)
    {
        return this.pgdb.none(this.PSAddImageToBoard, [boarduid, hash]);
    }

    async RemoveImageToBoard(boarduid: number, hash: Buffer)
    {
        return this.pgdb.none(this.PSRemoveImageFromBoard, [boarduid, hash]);
    }
    
    async MarkImageDeleted(imageid:number)
    {
        return this.pgdb.none(this.PSMarkImageDeletedByID, [imageid]);
    }

    async MarkImageDeletedHash(hash: Buffer)
    {
        return this.pgdb.none(this.PSMarkImageDeletedByHash, [hash]);
    }

    async MarkImageLive(imageid:number)
    {
        return this.pgdb.none(this.PSMarkImageLiveByID, [imageid]);
    }

    async MarkImageLiveHash(hash: Buffer)
    {
        return this.pgdb.none(this.PSMarkImageLiveByHash, [hash]);
    }

    async GetImageCount()
    {
        return this.pgdb.one(this.PSGetImageCount, []);
    }

    async GetImageCountByTag(tag: string)
    {
        return this.pgdb.one(this.PSGetImageCountByTag, [tag]);
    }
    
    
    async GetUntaggedImages()
    {
        return this.pgdb.manyOrNone(this.PSGetUntaggedImages, []);
    }

    async GetUntaggedImagesSpeedTag()
    {
        return this.pgdb.manyOrNone(this.PSGetUntaggedImagesSpeedTag, []);
    }

    async GetUntaggedImagesSortedLimited()
    {
        return this.pgdb.manyOrNone(this.PSGetUntaggedImagesSortedLimited, []);
    }

    async GetUntaggedFilesSortedLimited()
    {
        return this.pgdb.manyOrNone(this.PSGetUntaggedFilesSortedLimited, []);
    }

    async GetFileByHash(hash: Buffer)
    {
        return this.pgdb.oneOrNone(this.PSGetFileByHash, [hash]);
    }

    async GetFilePathByHash(hash: Buffer)
    {
        return this.pgdb.oneOrNone(this.PSGetFilePathByHash, [hash]);
    }

    async MarkFileDeletedHash(hash: Buffer)
    {
        return this.pgdb.none(this.PSMarkFileDeletedByHash, [hash]);
    }
    
    async GetAllFiles()
    {
        return this.pgdb.manyOrNone(this.PSGetAllFiles, []);
    }

    async GetAllFilesMark()
    {
        return this.pgdb.manyOrNone(this.PSGetAllFilesMark, []);
    }

    async MarkFileDeleted(imageid:number)
    {
        return this.pgdb.none(this.PSMarkImageDeletedByID, [imageid]);
    }    

    async GetFileTagsByHash(hash: Buffer)
    {
        return this.pgdb.oneOrNone(this.PSGetFileTagsByHash, [hash]);
    }

    async GetFileByTagShort(tags: string)
    {
        return this.pgdb.manyOrNone(this.PSGetFileByTagShort, [tags.toLowerCase()]);
    }

    async GetAllFilesShort()
    {
        return this.pgdb.manyOrNone(this.PSGetAllFilesShort, []);
    }

    async UpdateFileTagsByHash(hash: Buffer, tags: string)
    {
        return this.pgdb.none(this.PSUpdateFileTagsByHash, [hash, tags]);
    }

    async GetSharedBoardByHash(hash: Buffer)
    {
        return this.pgdb.oneOrNone(this.PSGetSharedBoardByHash, [hash]);
    }


    async GetTagList()
    {
        return this.pgdb.manyOrNone(this.PSGetTagList, []);
    }

    async AddImage(hash: Buffer, perceptualHash: Buffer, width: number, height: number, loadPath: string, tags: string)
    {
        console.log(hash);
        try
        {
            let res = await this.pgdb.one("INSERT INTO images (normalHash, perceptualHash, width, height, path, tags) VALUES ($1, $2, $3, $4, $5, $6) RETURNING imageid;", [
                hash, 
                perceptualHash,
                width,
                height,
                loadPath,
                tags
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

    async AddFile(hash: Buffer, size: number, loadPath: string, name: string, tags: string)
    {
        console.log(hash, size, loadPath, tags);
        try
        {            
            let res = await this.pgdb.one("INSERT INTO files (hash, size, path, name, tags) VALUES ($1, $2, $3, $4, $5) RETURNING fileid;", [
                hash,
                size,
                loadPath,
                name,
                tags
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

    async AddBoard(userid:number, boardname: string)
    {
        try
        {
            let res = await this.pgdb.one("INSERT INTO boards (boardname) VALUES ($1) RETURNING boardid;", [
                boardname
            ]
            );

            let res2 = await this.pgdb.one("INSERT INTO user_board (boardid, ownerid) VALUES ($1, $2) RETURNING boardid;", [
                res.boardid, 
                userid
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

    async RemoveBoard(userid:number, boardid: number)
    {
        try
        {
            // Affirm this board is *actually* owned by the right person
            await this.pgdb.none("DELETE FROM boards USING user_board WHERE user_board.boardid = boards.boardid AND boards.boardid = $1 AND user_board.ownerid = $2;",
            [
                boardid,
                userid
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