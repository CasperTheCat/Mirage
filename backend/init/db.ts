import type {MirageDB} from "../db.js";

// Init the stuff
async function InitDB(db: MirageDB, shouldDestroy: boolean = false)
{
    // Just call
    //let db = new MirageDB();
    try
    {
        if(shouldDestroy)
        {
            await db.ClearDB();
        }
        await db.InitialiseSession();
        await db.InitialiseAuth();
        await db.InitialiseUsers();
        await db.InitialiseBoards();
        await db.InitialiseImages();
    }
    catch (Err)
    {
        throw Err;
    }
};

export {InitDB};
