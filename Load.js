//Rewritted by hand

//Connect detail-panel controls to this code.

// Cache the detail-panel controls once so editor actions use the same elements.
const taskDetailElements = {
    body: document.querySelector("#todo-table-body"),
    listSection: document.querySelector("#todo-table").closest("section"),
    emptyPrompt: document.querySelector("#task-detail-empty"),
    form: document.querySelector("#task-edit-form"),
    title: document.querySelector("#load-title"),
    date: document.querySelector("#load-date"),
    description: document.querySelector("#load-description"),
    completed: document.querySelector("#load-completed"),
    message: document.querySelector("#taskStatus"),
    saveButton: document.querySelector("#save-task-button"),
    cancelButton: document.querySelector("#cancel-task-button"),
    deleteButton: document.querySelector("#delete-task-button"),
    yesDelete: document.querySelector("#yesDelete"),
    noDelete: document.querySelector("#noDelete"),
    attachmentInput: document.querySelector("#task-attachment-input"),
    attachmentList: document.querySelector("#task-attachment-list"),
};

const confirmDialog = document.querySelector("#DeleteConfirmation");
const attachmentDatabaseName = "mosaic-task-attachments";
const attachmentStoreName = "attachments";
let attachmentDatabasePromise;

// Keep the selected task as a draft target; input edits are not committed until Save.
let selectedTask = null;
let savedAttachments = [];
let pendingAttachments = [];
let removedAttachmentIds = new Set();
let attachmentLoadVersion = 0;
let attachmentObjectUrls = new Set();
let imagePreviewObjectUrl = null;
let activePreviewThumbnail = null;
let activePreviewContainer = null;


//FUNCTIONS GOES HERE VVVVVV

//ATTATCHMENT RELATED FUNCTIONS! 
//yes this one is a long one. buckle up!

//OpenAttachmentDatabase()
function openAttachmentDatabase() {
    //If the window does not have indexedDB, the promise will return a reject message.
    if (!("indexedDB" in window)) {
        return Promise.reject(new Error("The browser you are using doesn't support local file storage."));
    }

    //If there is no database promise, create a new one. 
    if (!attachmentDatabasePromise) {
        attachmentDatabasePromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(attachmentDatabaseName, 1);

            //runs when the database needs to be upgraded or created.
            request.onupgradeneeded = () => {

                //gets the database being opened
                const database = request.result;

                //if the attachment score doesn't exist,
                if (!database.objectStoreNames.contains(attachmentStoreName)) {

                    //creates the attachment score using the id as key.
                    const store = database.createObjectStore(attachmentStoreName, {
                        keyPath: "id"
                    });

                    //creates an index that let users find attachment by id.
                    store.createIndex("taskId", "taskId", {unique: false});
                }
            };

            //If success, it will return with a resolve
            request.onsuccess = () => {
                request.result.onversionchange = () => request.result.close();
                resolve(request.result);
            };

            //If it errors, it returns with a reject and an error message. It lets the promise be null. 
            request.onerror = () => {
                attachmentDatabasePromise = null;
                reject(request.error || new Error("Could not open file storage."));
            };

            //Same thing with blocked. Although, it blocks the process.
            request.onblocked = () => {
                attachmentDatabasePromise = null;
                reject(new Error("File storage is blocked by another open page."));
            };
        });
    }
    //return the promise cache. 
    return attachmentDatabasePromise; 
}

//getTaskAttatchments - get attatchment details and transactions.
async function getTaskAttachments(taskId) {

    //Initialize the database by running openAttatchmentDatabase by itself.
    const database = await openAttachmentDatabase();

    //Returns a new promise where..
    return new Promise((resolve, reject) => {

        //Transaction is initiallized with the database transaction 
        const transaction = database.transaction(attachmentStoreName, "readonly");

        //get transaction details
        const request = transaction
            .objectStore(attachmentStoreName)
            .index("taskId")
            .getAll(taskId);

        //if it errors, it just gives you an error message.
        request.onsuccess = () => 
            resolve(request.result);
        request.onerror = () => 
            reject(request.error || new Error("Could not load attachments."));
    });
}

//commitattatchmentChanges happens when we gonna add the attatchments themselves.
async function commitAttachmentChanges(taskId) {
    //open the database
    const database = await openAttachmentDatabase();
    //get attatchment details such as....
    const addedRecords = pendingAttachments.map(({id, file}) => ({
        id, //ID
        taskId, //Task ID
        name: file.name, //File name
        type: file.type, //File type
        size: file.size, //File size
        lastModified: file.lastModified, //Last modified date
        blob: file //Temporary URL that points to the file
    }));

    //get removed records that has ID
    const removedRecords = savedAttachments.filter(({id}) =>
        removedAttachmentIds.has(id)
    );

    //create a promise where
    await new Promise((resolve, reject) => {

        //Transaction is initiallized with the database transaction 
        const transaction = database.transaction(attachmentStoreName, "readwrite");

        //get stored name
        const store = transaction.objectStore(attachmentStoreName);

        //per remove attatchment ids,
        for (const id of removedAttachmentIds) {
            //delete it.
            store.delete(id);
        }
        //per added attatchments,
        for (const record of addedRecords) {
            //put it.
            store.put(record);
        }
        //resolve the transaction. 
        transaction.oncomplete = resolve;
        //if an error has occured or an abort request has made, just return an error.
        transaction.onerror = () =>
            reject(transaction.error 
                || new Error("Could not save attachments."));

        transaction.onabort = () =>
            reject(transaction.error 
                || new Error("Saving attachments was cancelled."));
    });

    //return those files.
    return {addedRecords, removedRecords};
}

//rollbackAttatchmentChanges handles how transactions 
//are cancelled and attatchments restored to whatever happened before it
//pretty obvi stuff.
async function rollbackAttachmentChanges({addedRecords, removedRecords}) {

    //open database
    const database = await openAttachmentDatabase();

    //crate a new promise where....
    await new Promise((resolve, reject) => {
        //Transaction is initiallized with the database transaction 
        const transaction = database.transaction(attachmentStoreName, "readwrite");
        //get stored name
        const store = transaction.objectStore(attachmentStoreName);

        //per Id added, delete it
        for (const {id} of addedRecords) {
            store.delete(id);
        }
        //per Id removed, put it
        for (const record of removedRecords) {
            store.put(record);
        }
        //resolve the thingy
        transaction.oncomplete = resolve;

        //if an error has occured or an abort request has made, just return an error.
        transaction.onerror = () =>
            reject(transaction.error 
                || new Error("Could not restore attachments."));

        transaction.onabort = () =>
            reject(transaction.error 
                || new Error("Restoring attachments was cancelled."));
    });
}

//deletetaskattatchments() handles how attatchments are deleted :3
//It deletes (obviously) the attachments from a specific task from DB and waits for the transaction to finish.
//Then, it returns the deleted attatchment records
async function deleteTaskAttachments(taskId) {

    //get task attatchments
    const attachments = await getTaskAttachments(taskId);

    //open database
    const database = await openAttachmentDatabase();

    //create a new promise where...
    await new Promise((resolve, reject) => {

        //Transaction is initiallized with the database transaction 
        const transaction = database.transaction(attachmentStoreName, "readwrite");

        //get stored name
        const store = transaction.objectStore(attachmentStoreName);

        //per attatchment id, delete it
        for (const {id} of attachments) {
            store.delete(id);
        }

        //resolve the transaction. 
        transaction.oncomplete = resolve;

        //if an error has occured or an abort request has made, just return an error.
        transaction.onerror = () =>
            reject(transaction.error ||
                new Error("Could not delete task attachments."));

        transaction.onabort = () =>
            reject(transaction.error || 
                new Error("Deleting task attachments was cancelled."));
    });

    //return task attatchments. 
    return attachments;
}

//restoretaskattatchments is when we restore previously saved attatchment 
//into the DB in a single read-write transaction until whatever happens. 
//Whatever = error btw.
async function restoreTaskAttachments(attachments) {

    //if there isn't an attatchment
    if (!attachments.length) {
        return; //go out.
    }

    //open attatchment database
    const database = await openAttachmentDatabase();

    //create a promise where...
    await new Promise((resolve, reject) => {

        //Transaction is initiallized with the database transaction 
        const transaction = database.transaction(attachmentStoreName, "readwrite");

        //get stored name
        const store = transaction.objectStore(attachmentStoreName);

        //per attatchments
        for (const attachment of attachments) {
            //put it there
            store.put(attachment);
        }
        //resolve the transaction
        transaction.oncomplete = resolve;

        //for the 99th time it returns an error when things go not good.
        transaction.onerror = () =>
            reject(transaction.error 
                || new Error("Could not restore task attachments."));

        transaction.onabort = () =>
            reject(transaction.error 
                || new Error("Restoring task attachments was cancelled."));
    });
}

//formatAttachmentSize converts a byte count into a readable file size for UI labels.
function formatAttachmentSize(size) {

    //if the size is larger than 1024, convert it into xB
    if (size < 1024) {
        return `${size} B`;
    }
    //if the size is larger than 1024x1024, convert it into xKB
    if (size < 1024 * 1024) {
        return `${(size / 1024).toFixed(1)} KB`;
    }

    //return if the size is larger than those.
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

//createAttachmentId creates ids for attachments.
function createAttachmentId() {

    //if the random UUID is available as a function, it returns a newly generated UUID.
    if (typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    //creates a new constant variable with Uint8Array.
    //It creates an array of 16 bytes.
    //Each holds an unsigned integer from 0 to 255.
    //Commonly used to store raw binary data
    const bytes = new Uint8Array(16);

    //generate random values
    crypto.getRandomValues(bytes);

    //convert the bytes to string of hexadecimals. 
    //then adds a leading 0 and joins all together without any seperators. 
    //Unreadable to me? yes, but hey i tried.
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

//close image attachment preview closes the attachment and returns to the thumbnail.
function closeImageAttachmentPreview(returnFocus = true) {

    //if the object url is active,
    if (imagePreviewObjectUrl) {

        //revoke the URL
        URL.revokeObjectURL(imagePreviewObjectUrl);

        //delete the url
        attachmentObjectUrls.delete(imagePreviewObjectUrl);

        //make it null.
        imagePreviewObjectUrl = null;
    }

    //if the active container is connected and the thumbnail is there
    if (activePreviewContainer?.isConnected && activePreviewThumbnail) {
        
        //replace the container with a thumbnail
        activePreviewContainer.replaceWith(activePreviewThumbnail);

        //set the thumbnail as false.
        activePreviewThumbnail.setAttribute("aria-pressed", "false");

        //if it returns focus, set the preview thumbnail to focus.
        if (returnFocus) {
            activePreviewThumbnail.focus();
        }
    }

    //then keep these null. 
    activePreviewThumbnail = null;
    activePreviewContainer = null;
}

//showImageAttatchmentPreview shows image preview overlay for the attatchment. It displays the file name, image if
//there is one, replaces the thumbnail with the preview and adds a shiny close button. 
function showImageAttachmentPreview(attachment, thumbnailButton) {

    //Closes the preview first (coz we dont want logical errorz)
    closeImageAttachmentPreview();

    //Initialize document elements. 
    const preview = document.createElement("div");
    const header = document.createElement("div");
    const filename = document.createElement("span");
    const closeButton = document.createElement("button");
    const image = document.createElement("img");

    //Create an URL from the blob URL it has and give it to imagePreviewObjectUrl
    imagePreviewObjectUrl = URL.createObjectURL(attachment.blob);

    //Add imagePreviewObjectUrl to the object url of the attatchment.
    attachmentObjectUrls.add(imagePreviewObjectUrl);
    //So basically we just give the thumbnail a URL

    //Initialize thumbnail and container where the preview will be
    activePreviewThumbnail = thumbnailButton;
    activePreviewContainer = preview;

    //give it a CSS class and set it's attributes 
    preview.className = "task-image-preview";
    preview.setAttribute("role", "region");
    preview.setAttribute("aria-label", `Preview of ${attachment.name}`);

    //give the header a CSS name too 
    header.className = "task-image-preview-header";

    //give the file name.... the name of the file. surprise.
    filename.textContent = attachment.name;

    //Initialize close button
    closeButton.type = "button";
    closeButton.className = "attachment-action-button";
    closeButton.title = `Close Preview of ${attachment.name}`; //Text hover
    closeButton.setAttribute("aria-label", `Close preview of ${attachment.name}`);

    const closeIcon = document.createElement("img"); //create a new image 
    closeIcon.src = "assets/icon-remove.png"; //source
    closeIcon.alt = ""; //Alt
    closeIcon.width = 12; //Width of the icon
    closeIcon.height = 12; //Height of the icon
    closeIcon.style.objectFit = "contain"; //object fit CSS 
    closeButton.append(closeIcon); //Adds close icon




    //Give it a purpose in life. unlike me. char. malayo pa sweden nhak
    closeButton.addEventListener(
        "click",
        () => closeImageAttachmentPreview(),
        {once: true}
    );

    //Initialize the image and give it an id, alt name and source
    image.id = "task-image-preview-image";
    image.src = imagePreviewObjectUrl;
    image.alt = attachment.name;

    //add these shiny thingies in the page.
    header.append(filename, closeButton);
    preview.append(header, image);

    //change thumbnail button appearance/data
    thumbnailButton.setAttribute("aria-pressed", "true");
    thumbnailButton.replaceWith(preview);

    //focus on da close button 
    closeButton.focus();
}

//renderAttatchmentList renders the list of attatchments in the UI.
//This one is a long one.
function renderAttachmentList() {

    //close the attatchment preview.
    closeImageAttachmentPreview(false);

    //per object URL of attachment URLs, revoke the object URL.
    for (const objectUrl of attachmentObjectUrls) {
        URL.revokeObjectURL(objectUrl);
    }

    //clear object urls variable 
    attachmentObjectUrls.clear();

    //clear all child elements
    //removing its contents without deleting the element itself
    taskDetailElements.attachmentList.replaceChildren();

    //initialize visible attatchment and give it saved attatchment data.
    const visibleAttachments = savedAttachments
        //list of all previously saved attachments
        .filter(({id}) => !removedAttachmentIds.has(id)) 
        //remove the attatchments where ids are in removedattatchmentsids set
        .map((attachment) => ({...attachment, pending: false}))
        //Copies each remaining attatchment into a different array and mark it as not pending
        .concat(pendingAttachments.map(({id, file}) => ({
            //adds newly selected attatchments to the list with:
            id, //ID
            name: file.name, //name
            type: file.type, ///type
            size: file.size, //size
            blob: file, //u r l
            pending: true //set pending boolean to true.
        })));
    
    //why am i taking notes of everything
    //per attatchment, and i am aware i keep spelling attachment that way
    for (const attachment of visibleAttachments) {

        //Create these elements
        const item = document.createElement("li");
        const name = document.createElement("span");
        const download = document.createElement("button");
        const downloadIcon = document.createElement("img");
        const remove = document.createElement("button");
        const removeIcon = document.createElement("img");

        //if attachment.type is string and starts with an image,
        if (typeof attachment.type === "string" && attachment.type.startsWith("image/")) {

            //create these elements relevant to the media
            const preview = document.createElement("button");
            const thumbnail = document.createElement("img");
            const thumbnailUrl = URL.createObjectURL(attachment.blob);

            //add URLs to the thumbnails
            attachmentObjectUrls.add(thumbnailUrl);

            //modify HTML and CSS of preview button
            preview.type = "button";
            preview.className = "attachment-preview-button";

            //Set CSS attribute to preview button
            preview.setAttribute("aria-label", `Preview image ${attachment.name}`);
            preview.setAttribute("aria-pressed", "false");

            //set the URL to the preview button so it can work
            preview.dataset.previewAttachmentId = attachment.id;
            thumbnail.src = thumbnailUrl;
            thumbnail.alt = "";

            //Add the preview into the page.
            preview.append(thumbnail);

            //give it a click event listener so that we can see the thing
            preview.addEventListener("click", (event) =>
                showImageAttachmentPreview(attachment, event.currentTarget)
            );

            //add the item.
            item.append(preview);
        }

        //nakakabaliw pala js

        //give the name the relevant attachment name
        name.textContent = `${attachment.name} (${formatAttachmentSize(attachment.size)})`;

        //If pending, show "pending save"
        if (attachment.pending) {
            name.textContent += " - Save Pending";
        }

        //download button attributes
        download.type = "button"; //button type
        download.className = "attachment-action-button"; //CSS Class name
        download.title = `Download ${attachment.name}`; //Text hover
        download.setAttribute("aria-label", `Download ${attachment.name}`); //Accessibility label
        downloadIcon.src = "assets/icons-05.png"; //image
        downloadIcon.alt = ""; //alt text
        download.append(downloadIcon); //add the download button to the page.

        download.addEventListener("click", () => {
            //get the URL
            const objectUrl = URL.createObjectURL(attachment.blob);
            attachmentObjectUrls.add(objectUrl);

            //create a virtual download link element
            const downloadLink = document.createElement("a");

            //give it the URL from object URL
            downloadLink.href = objectUrl;

            //tells what file to use
            downloadLink.download = attachment.name;

            //Simulate a click for it to download
            downloadLink.click();

            //After 1 second, revoke and delete the URL.
            window.setTimeout(() => {
                URL.revokeObjectURL(objectUrl);
                attachmentObjectUrls.delete(objectUrl);
            }, 1000);
        });

        //remove button attributes
        remove.type = "button"; //button type
        remove.className = "attachment-action-button"; //CSS Class name
        remove.title = `Remove ${attachment.name}`; //Text hover
        remove.setAttribute("aria-label", `Remove ${attachment.name}`); //Accessibility label
        removeIcon.src = "assets/icons-06.png"; //image
        removeIcon.alt = ""; //alt text
        remove.append(removeIcon); //add the button to da page

        //Give it an event listener that
        remove.addEventListener("click", () => {
            //if pending, it filters it out
            if (attachment.pending) {
                pendingAttachments = pendingAttachments.filter(({id}) =>
                    id !== attachment.id
                );
            } else {
                //else remove the attatchment
                removedAttachmentIds.add(attachment.id);
            }
            //render the list
            renderAttachmentList();

            //show this message when a new one is added without any save
            taskDetailElements. message.textContent =
                "Changes will be applied when you save.";
        });
        //add these items per item
        item.append(name, download, remove);
        taskDetailElements.attachmentList.append(item);
    }
}

//loadTaskAttatchments
async function loadTaskAttachments(task, loadVersion) {

    //keep the task detail elements empty
    taskDetailElements. message.textContent = "";

    //try by:
    try {
        //getting the ID 
        const attachments = await getTaskAttachments(task.id);

        //If the load version and selected task doesn't match
        if (loadVersion !== attachmentLoadVersion || selectedTask !== task) {

            //it goes out.
            return;
        }
        //give the attatchments id to saved Attatchments
        //BAKIT ATTATCHMENTS AND SPELLING KO
        savedAttachments = attachments;

        //render da list
        renderAttachmentList();

    //else, if the load and selected tasks matches with the attached details,
    } catch (error) {
        if (loadVersion === attachmentLoadVersion && selectedTask === task) {

            //it tells you that you can't load attatchments from this browser.
            taskDetailElements. message.textContent =
                "Could not load attachments from this browser.";
        }
        //and return da error.
        console.error("Unable to load task attachments!", error);
    }
}

//TASK LOAD AND MODIFICATION FUNCTIONS!

//taskeditorhaschanges compare the editor fields with the stored task before switching or deleting it.
function taskEditorHasChanges() {

    //compare against the selected task and not the table row which is rebuilt on render.
    return selectedTask !== null && (
        taskDetailElements.title.value.trim() !== selectedTask.title ||

        //for those saved tasks contain only YYYY-MM-DD, it shows those as 11:59 PM.
        //testing only stuff. before there's no time.
        taskDetailElements.date.value !== (
            selectedTask.date.length === 10
                ? `${selectedTask.date}T23:59`
                : selectedTask.date
        ) ||


        //For this one, it checks if the description differs from the saved one
        taskDetailElements.description.value !== (selectedTask.description || "") ||

        //For this one, it checks if the completion checkbox differs from the saved status.
        taskDetailElements.completed.checked !== selectedTask.completed ||
        
        //checks whether any attachments are waiting to either be saved or removed.
        pendingAttachments.length > 0 ||
        removedAttachmentIds.size > 0
    );
}

//displaytaskdetails loads one task into the editor
//while translating older date-only deadlines to end of day.
async function displayTaskDetails(task) {

    //increments the counter to identify the latest attachment-loading request
    const loadVersion = ++attachmentLoadVersion;

    //gives task info inputed to the selected task variable
    selectedTask = task;

    //initializes attachment arrays and sets
    savedAttachments = [];
    pendingAttachments = [];
    removedAttachmentIds = new Set();

    //modifies the detail element HTML stuff
    taskDetailElements.emptyPrompt.hidden = Boolean(task);
    taskDetailElements.form.hidden = !task;
    taskDetailElements.message.textContent = "";
    taskDetailElements. message.textContent = "";
    taskDetailElements.attachmentInput.value = "";

    //renders the attatchment list.
    renderAttachmentList();

    //if there is no task,
    if (!task) {
        //return to panel 
        taskDetailElements.form.reset();
        return;
    }

    //fill task editor with saved information and saved attachments. 
    taskDetailElements.title.value = task.title; //Title
    taskDetailElements.date.value = task.date.length === 10 //Date+Time
        ? `${task.date}T23:59`
        : task.date;
    taskDetailElements.description.value = task.description || ""; //Description
    taskDetailElements.completed.checked = task.completed; //Completion

    //load attatchments before continuing
    await loadTaskAttachments(task, loadVersion);
}

//selecttaskdetails protects edits when a different task is selected.
function selectTaskDetails(task) {

    //if savebutton is disabled, get out
    if (taskDetailElements.saveButton.disabled) {
        return;
    }
    //if the selected task matches with the task, get out
    if (selectedTask === task) {
        return;
    }

    //if the user wants to change tasks even before saving it, show a prompt (prompt for now)
    if (taskEditorHasChanges() &&
        !window.confirm("Discard your unsaved changes and open another task?")) {
        //then, keep both the current selection and draft if the user cancels
        return;
    }

    //render again so the selection marker follows the newly selected task.
    displayTaskDetails(task);
    window.TodoStore.render();

    //modify body element
    taskDetailElements.body
        .querySelector('[aria-selected="true"]')
        ?.focus({preventScroll: true});
}

// Validate, persist, and roll back the in-memory task if storage fails.
async function saveTaskDetails(event) {

    //stops the browser's default behavior
    event.preventDefault();

    //keep the message empty
    taskDetailElements.message.textContent = "";

    //if there is no selected task, return
    if (!selectedTask) {
        return;
    }

    //initialize taskToSave and give selected task data into it
    const taskToSave = selectedTask;

    //initialize title and give the title value to it
    const title = taskDetailElements.title.value.trim();

    //Keep legacy date-only value of the time being 23:59 (11:59PM) 
    //unchanged unless its deadline was edited.
    const date = selectedTask.date.length === 10 &&
        taskDetailElements.date.value === `${selectedTask.date}T23:59`
            ? selectedTask.date
            : taskDetailElements.date.value;

    //there is no value for date and title, show error message to the message only. No error handling much. 
    if (!title || !date || Number.isNaN(new Date(date).getTime())) {
        taskDetailElements.message.textContent =
            "Enter a task title and valid due date and time.";
        return;
    }

    //previous values will be stored with title, date description and completed values. 
    //Useful when we gonna reverse edits.
    const previousValues = {
        title: selectedTask.title,
        date: selectedTask.date,
        description: selectedTask.description || "",
        completed: selectedTask.completed
    };

    // Apply the draft before writing so ToDoStore.save persists one consistent record.
    selectedTask.title = title;
    selectedTask.date = date;
    selectedTask.description = taskDetailElements.description.value;
    selectedTask.completed = taskDetailElements.completed.checked;

    //setEditorSaving is turned to true
    setEditorSaving(true);
    let attachmentChanges;


    try {
        //check if attatchments are changed
        const hasAttachmentChanges =
            pendingAttachments.length > 0 || removedAttachmentIds.size > 0;

        //declares a variable to store the updated list
        let updatedAttachments;

        //if attatchment has changes
        if (hasAttachmentChanges) {
            //commit the changes and retrieve the updated list.
            attachmentChanges = await commitAttachmentChanges(taskToSave.id);
            updatedAttachments = await getTaskAttachments(taskToSave.id);
        }

        //save task data and refreshes the task list
        await window.TodoStore.save();
        window.TodoStore.render();

        //checks if the updated attachment data was retrieved
        if (updatedAttachments) {
            //updates the saved attachment with latest data
            savedAttachments = updatedAttachments;
        }

        //keep pending attatchment empty
        pendingAttachments = [];

        //remove attachment ids
        removedAttachmentIds.clear();

        //render the attachment list
        renderAttachmentList();

        //update HTML elements
        taskDetailElements.attachmentInput.value = "";
        taskDetailElements. message.textContent = "";
        taskDetailElements.message.textContent = "Changes saved.";

        //keep the message empty
        taskDetailElements.message.textContent = "";

    //if there's an error, 
    } catch (error) {

        //restore the in-memory record as well as reporting the failed save.
        Object.assign(taskToSave, previousValues);

        //if there are attachment changes
        if (attachmentChanges) {

            try {
                //rollback modification.
                await rollbackAttachmentChanges(attachmentChanges);

            //if there's a rollback error, give an error message that changes could not be rolled back.
            } catch (rollbackError) {
                console.error("Unable to roll back attachment changes!", rollbackError);
                taskDetailElements. message.textContent =
                    "Task save failed, and attachment changes could not be rolled back. I'm sorry!";
            }
        }

        //render window again
        window.TodoStore.render();

        //give error message if there's no rollback error.
        taskDetailElements.message.textContent = "Could not save these changes.";
        console.error("Unable to save task changes!", error);
    } finally {
        //if it's successful, set Editor saving into false.
        setEditorSaving(false);
    }
}

//setEditorSaving disables HTML elements while saving. 
function setEditorSaving(isSaving) {

    //for each of these elements,
    for (const control of [
        taskDetailElements.title,
        taskDetailElements.date,
        taskDetailElements.description,
        taskDetailElements.completed,
        taskDetailElements.attachmentInput,
        taskDetailElements.saveButton,
        taskDetailElements.cancelButton,
        taskDetailElements.deleteButton
    ]) {
        //disable
        control.disabled = isSaving;
    }
}

//cancel task details 
//cancel only resets the draft fields; the stored task remains unchanged.
function cancelTaskDetails() {

    //if there is no selected task, and the save button is disabled, return.
    if (!selectedTask || taskDetailElements.saveButton.disabled) {
        return;
    }

    //display the task details and window again. 
    displayTaskDetails(selectedTask);
    window.TodoStore.render();
}

//updateSelectedTaskRow reapplies selection styling after ToDo.js rebuilds the table rows.
function updateSelectedTaskRow() {

    // Rows carry the task's source-array index, so sorting doesn't affect its identity.
    for (const row of taskDetailElements.body.rows) {

        //Get task corresponding to the row in the task list.
        const task = window.TodoStore.getTodos()[Number(row.dataset.todoIndex)];

        //checks if the task is currently selected.
        const isSelected = task === selectedTask;

        //mark the row as selected or unselected for accessiblity
        row.setAttribute("aria-selected", String(isSelected));

        //adds selected task CSS class if selected.
        row.classList.toggle("selected-task", isSelected);
    }
}

//these one is for dialog confirmation only. 
function confirmDelete() {
    confirmDialog.showModal();
}

//delegate row clicks so action buttons and checkboxes keep their own behavior.

//updates the selected row when a task list is rendered.
taskDetailElements.body.addEventListener("todosrendered", updateSelectedTaskRow);
taskDetailElements.body.addEventListener("todolistchanged", () => displayTaskDetails(null));

//when clicked,
taskDetailElements.body.addEventListener("click", (event) => {

    //if the click come from an element or a button / input, stop.
    if (!(event.target instanceof Element) || 
        event.target.closest("button, input")) {
        return;
    }

    //finds task row containing the clicked element
    const row = event.target.closest("tr[data-todo-index]");

    //if the row was clicked,
    if (row) {
        // retrieves the task corresponding to that row.
        const task = window.TodoStore.getTodos()[Number(row.dataset.todoIndex)];

        //if that task exist
        if (task) {

            //show details.
            selectTaskDetails(task);
        }
    }
});

// Clicking unused list-panel space clears the detail selection.
taskDetailElements.listSection.addEventListener("click", (event) => {
    if (!(event.target instanceof Element) ||
        event.target.closest("#todo-form, .todo-section, tr[data-todo-index], button, input, label")) {
        return;
    }

    selectTaskDetails(null);
});

//if the body was clicked initially,
taskDetailElements.body.addEventListener("keydown", (event) => {

    //give the row the target data
    const row = event.target;

    //if the row is an instance of a table
    if (!(row instanceof HTMLTableRowElement) ||
        //and does not match with an index
        !row.matches("[data-todo-index]") ||
        //and has no event keys
        (event.key !== "Enter" && event.key !== " ")) {
        //it goes out.
        return;
    }
    
    //block the browser from doing its thing.
    event.preventDefault();

    //match pointer behavior for keyboard users navigating table rows.
    const task = window.TodoStore.getTodos()[Number(row.dataset.todoIndex)];

    //if task exist, show it.
    if (task) {
        selectTaskDetails(task);
    }
});

//if the form is submitted, save the details
taskDetailElements.form.addEventListener("submit", saveTaskDetails);


//when the completed todo checkbox is triggered or changed
taskDetailElements.completed.addEventListener("change", () => {
    //trigger the completion process. 
    if (selectedTask) {
        window.TodoStore.completionTodo(selectedTask, taskDetailElements.completed.checked);
    }
});

//if the attachment input changes,
taskDetailElements.attachmentInput.addEventListener("change", () => {

    //convert selected files into attachment objects with unique IDs 
    //then add them to the pending attachments array
    const files = Array.from(taskDetailElements.attachmentInput.files || []);
    pendingAttachments.push(...files.map((file) => ({
        id: createAttachmentId(),
        file
    })));

    //attachment input value is cleared
    taskDetailElements.attachmentInput.value = "";

    //render the attachment list.
    renderAttachmentList();

    //if there is an attachment, show this message. 
    taskDetailElements. message.textContent = files.length
        ? `${files.length} attachment${files.length === 1 ? "" : "s"} ready to save.`
        : "";
        //1 attachment ready to save
});

//if cancel button is click, cancel task details
taskDetailElements.cancelButton.addEventListener("click", cancelTaskDetails);

//if delete button is click, trigger confirmDelete() and ask for confirmation. 
taskDetailElements.deleteButton.addEventListener("click", () => {
    if (selectedTask && !taskDetailElements.saveButton.disabled) {
        confirmDelete();
    }
});

//Dialog - if the user says yes, delete and close the dialog.
taskDetailElements.yesDelete.addEventListener("click", () => {
    if (selectedTask) {
        window.TodoStore.deleteTask(selectedTask);
        confirmDialog.close();
    }
});

//Dialog - if the user says no, close the dialog.
taskDetailElements.noDelete.addEventListener("click", () => {
    confirmDialog.close();
})

//ToDo.js calls these hooks for quick completion and deletion
//without owning editor UI.
window.TaskDetails = {
    beforeListChange() {
        return !taskEditorHasChanges() ||
            window.confirm("Discard unsaved task changes and switch lists?");
    },
    //Allows deletion if the task is not saved, selected or if the user confirms discarding changes.
    beforeDelete(task) {
        return task !== selectedTask ||
            !taskEditorHasChanges() ||
            window.confirm("Delete this task and discard its unsaved changes?");
    },

    //if the deleted task was selected, it clears the task details from the editor.
    afterDelete(task) {
        if (task === selectedTask) {
            displayTaskDetails(null);
        }
    },

    //deletes all attachments that belongs to the task and returns deleted records.
    removeAttachments(task) {
        return deleteTaskAttachments(task.id);
    },

    //restores the provided attachment records when undoing a deletion
    restoreAttachments(attachments) {
        return restoreTaskAttachments(attachments);
    },

    //if this is the selected task, update it's completion checkbox to match it's status.
    syncCompletion(task, completed) {
        if (task === selectedTask) {
            taskDetailElements.completed.checked = completed;
        }
    }
};

// Initialize row state after both deferred scripts have loaded.
updateSelectedTaskRow();
