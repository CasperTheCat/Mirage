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
        await db.InitialiseAuth();
        await db.InitialiseUsers();
        await db.InitialiseBoards();
    }
    catch (Err)
    {
        console.log(Err);
    }
};

export {InitDB};
