#import psycopg
import requests
import json
from HashUtil import HashList
import base64
import tarfile
import shlex
import io

ByteSizeConst = 1024
KiSize = ByteSizeConst
MiSize = KiSize * ByteSizeConst
GiSize = MiSize * ByteSizeConst
TiSize = GiSize * ByteSizeConst


def NiceSize(inputSize):
    if inputSize > KiSize:
        # At least Ki

        if inputSize > MiSize:
            # At least Mi

            if inputSize > GiSize:
                # At least Gi. Stop Here
                return inputSize / GiSize, "Gi"
            else:
                return inputSize / MiSize, "Mi"
        else:
            return inputSize / KiSize, "Ki"
    else:
        return inputSize, "B"


def PrintPrettySize(inputSize):
    fracSize, Suffix = NiceSize(inputSize)

    return "{}{}".format(str(int(fracSize)), Suffix)


def SafeTag(val):
    return val[1:-1]


def SplitTags(val):
    splitter = shlex.shlex(val)
    #splitter.whitespace += ''
    splitter.whitespace_split = True

    asTags = [SafeTag(x) for x in list(splitter)]
    return asTags

# Can we speak to Mirage's DB, or do we need to go via the API


fDepth = 8
nPerFolder = 2
nRecursiveArrayDepth = 8
nBucketSize = 32  # 256 / x buckets


def PadMe(x):
    a = str(x)
    b = len(a)
    c = max(0, 5 - b)

    return "0" * c + a


def GetImagesFromMirage(rootURL, s, WantedTags, BannedTags):
    username = ""
    password = ""

    with open("local.auth", "r") as fHandle:
        lines = fHandle.read().split("\n")
        username = lines[0]
        password = lines[1]

    data = {
        "username": username,
        "password": password
    }

    r = s.post("{}/login".format(rootURL), data=data)

    #getMetaById = "/api/image/meta/{}"

    UltimateImages = []
    # Get All Boards for the user
    UserBoards = []
    BoardList = s.get("{}/api/board".format(rootURL))

    if BoardList.status_code == 200:
        BoardListAsJson = BoardList.json()
        if "boards" in BoardListAsJson:
            UserBoards = BoardListAsJson["boards"]

            for Board in UserBoards:
                print("[DEBUG][BOARDS] Querying Board: {}".format(
                    Board["boardname"]))

                IndividualBoard = s.get(
                    "{}/api/board/{}/images/".format(rootURL, Board["boardid"]))

                if IndividualBoard.status_code == 200:
                    IBJson = IndividualBoard.json()
                    if "images" in IBJson:
                        for Image in IBJson["images"]:
                            if "hash" in Image:
                                UltimateImages.append(Image["hash"])

    for Tag, Query in WantedTags:
        print("[DEBUG][TAGS] Querying Tag: {} as {}".format(Tag, Query))

        ImageList = s.get("{}/api/search/bytag/{}".format(rootURL, Query))
        if ImageList.status_code == 200:
            ILJson = ImageList.json()
            if "images" in ILJson:
                print("[DEBUG][TAGS][ADDITIONS] {} added {} images".format(
                    Tag, len(ILJson["images"])))
                for Image in ILJson["images"]:
                    if "hash" in Image:
                        UltimateImages.append(Image["hash"])
        else:
            print("[DEBUG][TAGS] Query Failed for {}".format(Tag))

    UltimateImages = list(set(UltimateImages))
    print("[DEBUG][IMAGES] Got {} Images".format(len(UltimateImages)))

    # This check causes traffic, so don't do it if we don't need to
    if len(BannedTags) > 0:
        BannedTag2D = []

        txP = json.dumps({"complete": UltimateImages})
        ImageData = s.get("{}/api/image/batch/meta".format(rootURL),
                          data=txP, headers={"content-type": "application/json"})

        if ImageData.status_code == 200:
            IDJson = ImageData.json()
            for Image in IDJson:
                BannedTag2D.append((Image["hash"], Image["tags"]))

        # for ImageHash in UltimateImages:
        #     TagList = s.get("{}/api/image/meta/{}/tag".format(rootURL, ImageHash))

        #     if TagList.status_code == 200:
        #         TLJson = TagList.json()
        #         if "tags" in TLJson:
        #             BannedTag2D.append((ImageHash, TLJson["tags"]))

        binnedTags = []
        for idx, Image in enumerate(BannedTag2D):
            #print("[DEBUG][BANNED] Binning: {}".format(Image[0]))
            for Tag in BannedTags:

                TargetTags = SplitTags(Image[1])
                if Tag in TargetTags:
                    print("[DEBUG][BANNED] Binned {}".format(Image[0]))
                    print("[DEBUG][BANNED][REASON] Tag {} in {}".format(
                        Tag, Image[1]))
                    binnedTags.append(idx)

        for i in sorted(binnedTags, reverse=True):
            del UltimateImages[i]

        print("[DEBUG][IMAGES] Got {} Images".format(len(UltimateImages)))

    ReturnArray = []

    txP = json.dumps({"complete": UltimateImages})
    ImageData = s.get("{}/api/image/batch/meta".format(rootURL),
                      data=txP, headers={"content-type": "application/json"})

    if ImageData.status_code == 200:
        IDJson = ImageData.json()
        for Index, Image in enumerate(IDJson):
            ReturnArray.append(Image)

    # for Image in UltimateImages:
    #     ImageData = s.get("{}/api/image/meta/{}/full".format(rootURL, Image))

    #     if ImageData.status_code == 200:
    #         IDJson = ImageData.json()
    #         ReturnArray.append(IDJson)

    # print(UltimateImages)

    return ReturnArray

    exit()

    #searchAll = "/api/search/bytag/*"
    searchAll = "/api/search/all"
    #searchAll = "/api/search/bytag/eddienx89"

    print("{}{}".format(rootURL, searchAll))

    x = s.get("{}{}".format(rootURL, searchAll))

    if (x.status_code != 200):
        return []

    imageList = x.json()["images"]

    return imageList


def GetTele(hex):
    tPath = []

    for i in range(fDepth):
        tPath.append(hex[i * nPerFolder:(i+1) * nPerFolder])

    tPath.append(hex[fDepth * nPerFolder:])

    return tPath


def Telescope(modPath, hexhash, datum):

    tPath = modPath

    for i in range(fDepth):
        split = hexhash[i * nPerFolder:(i+1) * nPerFolder]
        tPath[split] = {}
        tPath = tPath[split]

    h = hexhash[fDepth * nPerFolder:]

    if h not in tPath or len(tPath[h]) == 0:
        tPath[h] = [datum]
    else:
        tPath[h].append(datum)

    return modPath


def ConvertToDict(list):
    hashDict = {}

    for i in list:
        hashDict = Telescope(hashDict, i["hash"], i)

    return hashDict


def Create256ArrayRecursive(descentLevelsRemaining):
    if 1 > descentLevelsRemaining:
        # Create empty and return
        return []
    else:
        # Create 256 more of us
        retArray = []
        for i in range(256 // nBucketSize):
            retArray.append(Create256ArrayRecursive(
                descentLevelsRemaining - 1))
        return retArray


def ConvertToBigArray(list):
    # Create Arrays

    bigArray = Create256ArrayRecursive(nRecursiveArrayDepth)

    for i in list:
        sampler = bigArray
        asHex = i["hash"]

        for split in range(nRecursiveArrayDepth):
            index = int(asHex[2 * split: (split+1) * 2],
                        base=16) // nBucketSize
            sampler = sampler[index]

        sampler.append(i)

    return bigArray


def FindHash(hex, list):
    res = GetTele(hex.hex())

    currentLoc = imageList

    for i in range(fDepth + 1):
        if res[i] in currentLoc:
            currentLoc = currentLoc[res[i]]
        else:
            print("[DEBUG] No bucket {} ({})".format(
                res[i], "/".join(res[:i+1])))
            return False

    print(currentLoc)

    return True


def FindHash256(hex, list):

    sampler = list
    asHex = hex

    for split in range(nRecursiveArrayDepth):
        index = int(asHex[2 * split: (split+1) * 2], base=16) // nBucketSize
        sampler = sampler[index]

    print("[INFO] Searching for {} in:".format(asHex))
    for i in sampler:
        print("[INFO] \t{}".format(i['hash']))

    for i in sampler:
        if asHex == i['hash']:
            return True, i

    return False, None


def CreateFromHashList(hash, name, perchash):
    asHash = hash.hex() if hash is not None else ""
    asPerc = (base64.b64decode(perchash[0]).hex(
    ), perchash[1], perchash[2]) if perchash is not None else ("", 0, 0)

    return {
        "hash": asHash,
        "name": name,
        "perc": asPerc
    }


OPCODE_CREATEFILE = 0
OPCODE_CREATEARCH = 1


if __name__ == "__main__":
    import os
    import sys

    HashListPath = sys.argv[2]
    TagListPath = sys.argv[3]
    OutPath = None
    if len(sys.argv) > 4:
        OutPath = sys.argv[4]

    QueryTags = []
    Boards = []
    WantedTags = []
    BannedTags = []

    with open(TagListPath, "r") as f:
        lines = f.read().split("\n")
        for line in lines:
            if line.startswith("#") or line.startswith(";"):
                # Skip
                continue
            elif line.startswith("+"):
                # Add a tag
                preTag = line[1:]

                # Scan for !
                if "!" in preTag:
                    loc = preTag.index("!")
                    classTag = preTag[:loc]
                    queryTag = preTag[loc + 1:]

                    QueryTags.append((classTag, queryTag))
                    WantedTags.append(classTag)
                elif "?" in preTag:
                    loc = preTag.index("?")
                    classTag = preTag[:loc]
                    board = preTag[loc + 1:]

                    Boards.append(board)
                    #QueryTags.append((classTag, "'{}'".format(preTag)))
                    WantedTags.append(classTag)
                else:
                    QueryTags.append((preTag, "'{}'".format(preTag)))
                    WantedTags.append(preTag)

            elif line.startswith("-"):
                # Add a tag
                BannedTags.append(line[1:])
            else:
                continue

    rootURL = "http://{}".format(sys.argv[1])
    s = requests.Session()

    # EES = tarfile.open(os.path.join(OutPath, "Archive.tar"), mode="w|", bufsize=1024*1024*1)
    # a = EES.gettarinfo("./GraphCheck.py")

    # print(a.name)

    imageList = GetImagesFromMirage(rootURL, s, QueryTags, BannedTags)

    if (len(imageList) == 0):
        print("List is empty! Exiting")
        exit(-1)

    print("Got {} image references".format(len(imageList)))

    # Get Files from PyDeDup?
    a = HashList.CHashList(HashListPath.encode())

    # Compute against
    hashList = []
    for (l_FileSize, l_shortHash, l_longHash, (saneRelPath, extension), l_PercHash) in a.hashList:
        hashList.append(CreateFromHashList(
            l_longHash, saneRelPath, l_PercHash))

    otherBig = ConvertToBigArray(hashList)

    CmdList = []

    for i in imageList:
        b, v = FindHash256(i["hash"], otherBig)
        if not b:
            if "path" in i:
                print("[INFO][MIRAGE][MSSNG] Did not find {} in HashList".format(
                    i["path"].encode()))
                # Enqueue
                SplitPath = i["path"].split("/")
                if not SplitPath[0].lower() in BannedTags:
                    CmdList.append((
                        OPCODE_CREATEARCH,
                        i["path"],
                        i["hash"]
                    ))
                else:
                    print("[WARN][SPLIT_FILTER] {}".format(i["path"]))
            else:
                print(
                    "[INFO][MIRAGE][MSSNG] Did not find {} in HashList".format("REDACTED"))
        else:
            print("[INFO][MIRAGE][FOUND] Found {} in HashList".format(v["name"]))
            if "path" in i:
                print(
                    "[INFO][MIRAGE][FOUND][LOCALE] {} @ {}".format(v["name"], i["path"].encode()))

    # asBigArray = ConvertToBigArray(imageList)
    # #imageList = ConvertToDict(imageList)

    # for (l_FileSize, l_shortHash, l_longHash, (saneRelPath, extension), l_PercHash) in a.hashList:
    #     # if FindHash(l_longHash, imageList):
    #     #     print("Git")
    #     #     #exit()
    #     b,v = FindHash256(l_longHash.hex(), asBigArray)
    #     if not b:
    #         print("[INFO][LIST][MSSNG] Did not find {} in Mirage".format(saneRelPath))
    #     else:
    #         print("[INFO][LIST][FOUND] Found {} in Mirage".format(saneRelPath))
    #         print("[INFO][LIST][FOUND][LOCALE] {} @ {}".format(saneRelPath, v["path"].encode()))

    if OutPath:
        if not os.path.exists(OutPath):
            os.makedirs(OutPath)

        ArchiveInUse = False
        FileArchive = None
        Failed = False
        TotalSize = 0

        for i, cmd in enumerate(CmdList):
            print("Fetching {}/{} ({:.2f})".format(
                PadMe(i + 1),
                PadMe(len(CmdList)),
                ((i+1) / len(CmdList)) * 100
            ), end='')

            if cmd[0] == OPCODE_CREATEFILE:
                Image = s.get("{}/api/image/data/{}".format(rootURL, cmd[2]))

                path = os.path.join(OutPath, cmd[1])

                if not os.path.exists(os.path.dirname(path)):
                    os.makedirs(os.path.dirname(path))

                if Image.status_code == 200 and not os.path.exists(path):
                    with open(path, 'wb+') as fd:
                        for chunk in Image.iter_content(chunk_size=128*1024):
                            fd.write(chunk)
            elif cmd[0] == OPCODE_CREATEARCH:
                if not ArchiveInUse:
                    FileArchive = tarfile.open(os.path.join(
                        OutPath, "Archive.tar"), mode="w|", bufsize=1024*1024*1)
                    ArchiveInUse = True

                Image = s.get("{}/api/image/data/{}".format(rootURL, cmd[2]))
                path = os.path.join(OutPath, cmd[1])

                if (Image.status_code == 200):
                    FileData = io.BytesIO(Image.content)
                    FileData.seek(0, 2)
                    Size = FileData.tell()
                    FileData.seek(0, 0)

                    TotalSize += Size

                    Info = tarfile.TarInfo()
                    Info.name = cmd[1]
                    Info.size = Size
                    Info.mode = 0o777
                    Info.type = tarfile.REGTYPE
                    Info.uid = 1000
                    Info.gid = 1000
                    Info.uname = "Backup User"
                    Info.gname = "Mirage"

                    FileArchive.addfile(Info, FileData)
                    print("\t\t{}\t[{}]".format(
                        PrintPrettySize(Size),
                        PrintPrettySize(TotalSize)
                    ))
                else:
                    Failed = True
                    print("[ERROR] {}".format(cmd))
                # exit()

        if (ArchiveInUse):
            print("[DEBUG][TARARCH] Closing")
            FileArchive.close()
            ArchiveInUse = False

        if Failed:
            exit(-1)

        # We have a choice
        # We can back up everything to a tape archive
        # The downside is that we have no way to check if the files are *actually* backed up
        # Or we can create a folder and let PyDedup find the files in future
