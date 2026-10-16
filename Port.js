const exportButton = document.getElementById("export-backup");
const Message = document.getElementById("backupmessage");
const importButton = document.getElementById("import-backup");
const importFileInput = document.getElementById("import-backup-file");
const importConfirmation = document.getElementById("import-confirmation");
const confirmImportButton = document.getElementById("confirm-import");
const cancelImportButton = document.getElementById("cancel-import");

const attachmentDatabaseName = "mosaic-task-attachments";
const attachmentStoreName = "attachments";
let pendingImport = null;

//openAttachment Database opens the indexedDB database.
function openAttachmentDatabase() {

    //if the db is not in window, it returns a reject error.
    if (!("indexedDB" in window)) {
        return Promise.reject(
            new Error("This browser does not support attachment storage")
        );
    }

    //a promise is made to open the database.
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(attachmentDatabaseName, 1);

        //if Message.toggleAttribute("status");an upgrade in the request is needed, get the result.
        request.onupgradeneeded = () => {
            const database = request.result;

            //if the database does not contain an attachment store name, create a id.
            if (!database.objectStoreNames.contains(attachmentStoreName)) {
                const store = database.createObjectStore(attachmentStoreName, {
                    keyPath: "id"
                });

                //create an index with task id.
                store.createIndex("taskId", "taskId", { unique: false});
            }
        };

        //if successful, get the result, close and trigger resolve.
        request.onsuccess = () => {
            const database = request.result;
            database.onversionchange = () => database.close();
            resolve(database);
        };

        //if there's any errors or blockage, give a message and block if necessary.
        request.onerror = () => {
            reject(request.error || new Error("Could not open attachment storage!"));
        };

        request.onblocked = () => {
            reject(new Error("Attachment storage is blocked by another opened page."));
        };
    });
}

//read all attachments reads all attachments in the database.
async function readAllAttachments() {

    //initializes database
    const database = await openAttachmentDatabase();

    //tries to make a new promise
    try {
        return await new Promise((resolve, reject) => {
            //get the transaction data
            const transaction = database.transaction(
                attachmentStoreName,
                "readonly"
            );

            //get request data from transaction
            const request = transaction
                .objectStore(attachmentStoreName)
                .getAll();

            //initialize records
            let records = [];

            //if successful, get the result.
            request.onsuccess = () => {
                records = request.result;
            }

            //if an error happened, show a new error.
            request.onerror = () => {
                reject(request.error || new Error("Could not read attachment!"));
            }

            //resolve if a transaction is successfully complete.
            transaction.oncomplete = () => resolve(records);
            
            //if there's an error, it gives the error.
            transaction.onerror = () => {
                reject(
                    transaction.error || new Error("Could not read attachments.")
                );
            };

            //if it aborts, it gives an error too, but will also trigger some abort function. 
            transaction.onabort = () => {
                reject(
                    transaction.error || new Error("Reading attachments was cancelled.")
                );
            };
        });

    } finally {

        //close the database after all of these stuff.
        database.close();
    }
}

//file url to data
function blobToDataUrl(blob) {

    //creates a new promise where it checks if there's no instances of blub.
    return new Promise((resolve, reject) => {

        if (!(blob instanceof Blob)) {
            //it returns an error if there's no attachment stored.
            reject(new Error("An attachment was not stored as a file!"));
            return;
        }

        //new file reader
        const reader = new FileReader();

        //on load, it checks if the result not a string. 
        reader.onload = () => {
            if (typeof reader.result !== "string") {
                //then, it would not encode for export and give an error back.
                reject(new Error("Could not encode attachment for export!"));
                return;
            }

            //resolve
            resolve(reader.result);
        };

        //on error, it will just give a reject and an an error message.
        reader.onerror = () => {
            reject(reader.error || new Error("Could not read attachment file!"));
        };

        //reader reads the data from the blob.
        reader.readAsDataURL(blob);
    });
}

//read mosaic's local storage.
function readMosaicLocalStorage() {
    //initialize save data array object.
    const savedData = {};

    //for each lindex, create a key.
    for (let index= 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);

        //if the key (which may come from mosaic or the background color)
        if (key && (key.startsWith("mosaic-") || key == "backgroundColor")) {

            //create a saved data key with that key
            savedData[key] = localStorage.getItem(key);
        }
    }
    //return the saved data.
    return savedData;
}

//this one creates backups.
async function createBackup() {

    //initializes saved data and attachments data.
    const savedData = readMosaicLocalStorage();
    const storedAttachments = await readAllAttachments();

    //create a promise where
    const attachments = await Promise.all(

        //it maps all attachments that has the blob (file URL) and the metadata.
        storedAttachments.map(async (attachment) => {
            const { blob, ...metadata } = attachment;   

            //return as metadata with the blob url.
            return {
                ...metadata,
                dataUrl: await blobToDataUrl(blob)
            };
        })
    );

    //return as a file with
    return {    

        //the name
        format: "project-mosaic-backup",

        //the version
        version: 1,

        //date
        exportedAt: new Date().toISOString(),

        //local storage = saved data + attachments.
        localStorage: savedData,
        attachments
    };
}

//download backup function
function downloadBackup(backup) {
    //initializes stringified json, file url, object url, timestamp and link
    const json = JSON.stringify(backup, null, 2);
    const file = new Blob([json], {type: "application/json"});
    const objectUrl = URL.createObjectURL(file);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const link = document.createElement("a");

    //configures the link and let the download start.
    link.href = objectUrl;
    link.download = `project-mosaic-backup-${timestamp}.json`;
    document.body.append(link);
    link.click();
    link.remove();

    //after 1 second, revoke the URL
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

//decodes the backup - a LONG one.
function decodeBackup(backup) {

    //if there's no backup file, does not have the appropriate format or version, 
    //throw an error.
    if(
        !backup ||
        backup.format !== "project-mosaic-backup" ||
        backup.version !== 1
    ) {
        throw new Error("This is not a supported backup.");
    }

    //if the backup has no attachments, no object or local storage data,
    //throw an error.
    if(
        !backup.localStorage ||
        typeof backup.localStorage !== "object" ||
        Array.isArray(backup.localStorage) ||
        !Array.isArray(backup.attachments)
    ) {
        throw new Error("The backup file has missing data.");
    }

    //initialize saved data object
    const savedData = {};

    //per key/value of object entries in the localstorage,
    //if the file does not meet these criteria:
    //- no mosaic- in the name
    //- no background color
    //throw an error that states the file has invalid data.
    for (const [key, value] of Object.entries(backup.localStorage)) {
        if (
            !(key.startsWith("mosaic-") || key === "backgroundColor") ||
            typeof value !== "string"
        ) {
            throw new Error("The backup contains invalid saved data.");
        }

        //and set the save data key to the value.
        savedData[key] = value;
    }

    //this one is a long one. per attachment, 
    //if the attachment does nothave complete data, 
    //or it's data aren't strings
    //throw an error regarding invalid attachments. 
    const attachments = backup.attachments.map((attachment) => {
        if (
            !attachment ||
            typeof attachment.id !== "string" ||
            !attachment.id ||
            typeof attachment.taskId !=="string" ||
            !attachment.taskId ||
            typeof attachment.name !== "string" ||
            typeof attachment.type !== "string" ||
            !Number.isFinite(attachment.size) ||
            typeof attachment.dataUrl !== "string"
        ) {
            throw new Error("invalid attachment detected.")
        }

        //the match is initialized with Regular Expression
        //it checks whether the attachment.dataURL follows the expected format of
        //Base64-encoded URL.
        //if it maches, it captures some parts of it.

        const match = 
            /^data:([^;,]*);base64,([A-Za-z0-9+/]*={0,2})$/.exec(
                attachment.dataUrl);
        //im also quite new to this but the symbols mean:

                //^ = start
                //data: = is the literal text that begins with "data:"
                //([^;,]*): this is the first capture group.
                    //(...) = save this part so we can retireve it 
                    //[^;,] = accept any character except ; and ,
                    //* = allow zero or more characters
                //;base64; = is the literal separator
                //([A-Za-z0-9+/]*={0,2}) = the second capture group.
                    //accepts base 64 letters A-Z, a-z, 0-9, +, / followed by 0 or padding char.
                //$ = end of the text
        
        //if it doesn't match, throw an error.
        if (!match) {
            throw new Error(`Invalid file data for "${attachment.name}".`);
        }

        //initialize binary.
        let binary;

        //try to decode the Base64 text into a string containing the original binary data
        //else it catches an encoding error.
        try {
            binary = atob(match[2]);
        } catch {
            throw new Error(`Invalid encoded file data for "${attachment.name}".`);
        }

        //initialize a unit8array object.
        //Unit8Arrays create array of bytes with enough space to hold every byte in binary
        const bytes = new Uint8Array(binary.length);

        //per index, read binary index.
        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
        }

        //initializes a blob object and matches the type with the attachment.
        const blob = new Blob([bytes], {
            type: match[1] || attachment.type
        });

        //if the blob ise and attachment size does not match, throw an error.
        if (blob.size !== attachment.size) {
            throw new Error(`File check failed for "${attachment.name}"`);
        }

        //return id, taskid, name, type, size, last modified and object url info
        return {
            id: attachment.id,
            taskId: attachment.taskId,
            name: attachment.name,
            type: attachment.type,
            size: attachment.size,
            lastModified: attachment.lastModified,
            blob
        };
    });

    //creates a new set object.
    const attachmentIds = new Set();

    //per attachment, if it has a duplicate, it throws an error.
    for (const attachment of attachments) {
        if (attachmentIds.has(attachment.id)) {
            throw new Error("The backup contains duplicate attachment IDs.");
        }
        //else, it adds the attachment.
        attachmentIds.add(attachment.id);
    }
    //return save data and attachment data.
    return {
        savedData,
        attachments
    };
}

//replaces all attachments from the import.
async function replaceAllAttachments(attachments) {
    //opens the database
    const database = await openAttachmentDatabase();

    //tries to create a promise where it reads the transaction
    try {
        await new Promise((resolve, reject) => {
            const transaction = database.transaction(
                attachmentStoreName,
                "readwrite"
            );
            //and clear transaction store.
            const store = transaction.objectStore(attachmentStoreName);
            store.clear();

            //per attachment, place it.
            for (const attachment of attachments) {
                store.put(attachment);
            }

            //resolve it.
            transaction.oncomplete = resolve;

            //else, it throws errors.
            transaction.onerror = () => {
                reject(transaction.error || new Error("Could not save attachments."));
            };
            transaction.onabort = () => {
                reject(
                    transaction.error || 
                    new Error("Saving attachments was cancelled")
                );
            };
        });

    //Then, close the db.
    } finally {
        database.close();
    }
}

//replaces mosaic's local storage.
function replaceMosaicLocalStorage(savedData) {

    //initializes key removal object
    const keysToRemove = [];

    //per existing key, record it.
    for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);

        //if the key starts with mosaic0 or background color, push it.
        if (key && (key.startsWith("mosaic-") || key === "backgroundColor")) {
            keysToRemove.push(key);
        }
    }

    //for those keys recorded for removal, remove them.
    for (const key of keysToRemove) {
        localStorage.removeItem(key);
    }

    //for those data imported, add them.
    for (const [key, value] of Object.entries(savedData)) {
        localStorage.setItem(key, value);
    }
}

//imports backup data.
async function importBackupData(decodedBackup) {

    //gets local storage and attachment data. 
    const previousData = readMosaicLocalStorage();
    const previousAttachments = await readAllAttachments();


    //triggers data replacement procedures.
    try {
        await replaceAllAttachments(decodedBackup.attachments);
        replaceMosaicLocalStorage(decodedBackup.savedData);

    } catch (error) {
        try {
        //else, it tries to bring back previous data.
        await replaceAllAttachments(previousAttachments);
        replaceMosaicLocalStorage(previousData);

        //if all else fails, show an error (that i wish won't ever happen)
        } catch (restoreError) {
            throw new Error(
                `Import and data restore failed! I am terribly sorry. 
                ${
                    restoreError instanceof Error
                        ? restoreError.message
                        : String(restoreError)
                }`
            );
        }
        throw error;
    }
}

//event listener of export button in settings
exportButton.addEventListener("click", async () => {

    //export button is disabled and a status message is shown. 
    exportButton.disabled = true;
    Message.textContent = "Preparing your backup...";

    //try downloading the backup with a status message
    try {
        const backup = await createBackup();
        downloadBackup(backup);
         
        Message.textContent = "Downloading backup....";

    //if there's an error, show the error.
    } catch (error) {
        console.error("Could not export backup!", error);
        Message.textContent =
            error instanceof Error
            ? `Export failed: ${error.message}`
            : `Export failed: ${String(error)}`;
    
    //if successful, enable the export button again. 
    } finally {
        exportButton.disabled = false;

        window.setTimeout(() => {
            Message.textContent = "";
             
        }, 5000);
    }
});

//import button click listener
importButton.addEventListener("click", () => {
    importFileInput.click();
});

//import button change listener - the main thing
importFileInput.addEventListener("change", async () => {

    //reads the file
    const file = importFileInput.files[0];

    //if there's no file, return
    if (!file) {
        return
    }

    //if there is, disable the button and show status.
    importButton.disabled = true;
    Message.textContent = "Checking backup file...";

    //it tries to decode the backup first. 
    try {
        const backup = JSON.parse(await file.text()); 
        pendingImport = decodeBackup(backup);
        
        //Show confirmation
        importConfirmation.showModal();
        Message.textContent = "Review the confirmation dialog to continue.";

        //Else, and i wish this never happen, return an error to both console and Message.
    } catch (error) {
        pendingImport = null;
        importButton.disabled = false;
        console.error("Could not import Mosaic backup!", error);
        Message.textContent =
        error instanceof Error 
            ? `Import failed: ${error.message}`
            : `Import failed: ${String(error)}`;
    
    //Clear the chosen file; keep the import button disabled while confirmation is open.
    } finally {
        importFileInput.value = "";
    }
});

confirmImportButton.addEventListener("click", async () => {
    if (!pendingImport) {
        importConfirmation.close();
        return;
    }

    const decodedBackup = pendingImport;
    pendingImport = null;
    importConfirmation.close();
    Message.textContent = "Importing backup...";

    try {
        await importBackupData(decodedBackup);
        Message.textContent =
            "Import complete. Reload Mosaic to apply imported data.";
    } catch (error) {
        console.error("Could not import Mosaic backup!", error);
        Message.textContent =
            error instanceof Error
                ? `Import failed: ${error.message}`
                : `Import failed: ${String(error)}`;
    } finally {
        importFileInput.value = "";
        importButton.disabled = false;
    }
});

cancelImportButton.addEventListener("click", () => {
    importConfirmation.close();
});

importConfirmation.addEventListener("close", () => {
    if (pendingImport) {
        pendingImport = null;
        importFileInput.value = "";
        importButton.disabled = false;
        Message.textContent = "Import cancelled.";
    }
});
