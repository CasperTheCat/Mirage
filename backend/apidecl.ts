// Fetches the full list of images that the user has access to globally.
// Can be delayed

// Also fetch the user's boards.
// This is needed the moment after login flow
// But it's smaller
// Let's just load the board names
// We can look for the boards later!

async function getBoardsForUser(req, res, db)
{
    console.log("[INFO] Request for user " + req.user.toString());
    try
    {
        let boardList = await db.GetBoardsByUID(req.user);
        console.log(boardList);

        boardList = JSON.stringify(boardList);

        res.status(200).send(`{ "boards": ${boardList} }`);
    }
    catch (Except)
    {
        console.log(Except);
        res.sendStatus(500);
    }
}



async function getUserInfo(req, res, db)
{
    console.log("[INFO] Requesting User Data for user " + req.user.toString());
    try
    {
        let userData = await db.GetUserByUID(req.user);

        userData = JSON.stringify(userData);

        res.status(200).send(userData);//`{ "userdata": ${userData} }`);
    }
    catch (Except)
    {
        console.log(Except);
        res.sendStatus(500);
    }
}




export {getBoardsForUser, getUserInfo};