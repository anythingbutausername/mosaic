//Keep list names and active list seperate from each list's saved tasks. 

const listStorageKey = "mosaic-todo-lists";
const storedLists = JSON.parse(localStorage.getItem(listStorageKey) || "null");

//Initialize lists as array of sotred lists and it's length.
let lists = Array.isArray(storedLists) && storedLists.length
    ? storedLists
    : [{id: "default", name: "My Tasks"}]; //Default is "My tasks"

//Retrieves the saved active list from local storage and if none exists, it uses the ID of the first list.
let activeListId = localStorage.getItem("mosaic-active-list") || lists[0].id;

//Recover safely if the saved active list no longer exists.
if (!lists.some((list) => list.id === activeListId)) activeListId = lists[0].id;

//Keep all list controls in one place so tabs always match saved list data.
const tabs = document.querySelector("#todo-tabs");
const listTitle = document.querySelector("#list-title");
const listMessage = document.querySelector("#message");

//Use the old key for the first list to preserve existing saved tasks.
window.TodoTabs = {

    //Get storage key of the active list id
    //with options "default", "mosaic-todos" and "mosaic-todos-[active list ID]"
    getStorageKey: () => activeListId === "default"
        ? "mosaic-todos"
        : `mosaic-todos-${activeListId}`
};

//Save lists save list names and active selection for the next page visit.
function saveLists() {

    //saves with the stringified name and key
    localStorage.setItem(listStorageKey, JSON.stringify(lists));

    //saves with the active list and it's id
    localStorage.setItem("mosaic-active-list", activeListId);
}

//render tabs builds one clickable tab for each independently stored task list.
function renderTabs() {

    //replace the tabs
    tabs.replaceChildren();

    //per list,
    for (const list of lists) {

        //create the span and button elements.
        const tab = document.createElement("span");
        const select = document.createElement("button");
        

        //set attributes to tab
        tab.className = "list-tab";

        //set attributes to select, including functions.
        select.type = "button";
        select.textContent = list.name;
        select.className = list.id === "default"
            ? "list-tab-select list-tab-default"
            : "list-tab-select list-tab-user";
        select.setAttribute("aria-selected", String(list.id === activeListId));
        select.addEventListener("click", () => switchList(list.id));
        
        tab.className = "list-tab";
        tab.setAttribute("aria-selected", String(list.id === activeListId));

        //adds the tab into the page.
        tab.append(select);

        //if this is not the default,
        if (list.id !== "default") {

            //create the close button element and it's functions.
            const close = document.createElement("button");
            close.type = "Button";
            close.className = "list-tab-close";
            close.innerHTML = " <img src='assets/icon-remove.png' width='15' height='15' alt='' > ";
            close.setAttribute("aria-label", `Remove ${list.name}`);
            close.addEventListener("click", () => removeList(list.id));

            //add the close button
            tab.append(close);
        }
        //add the tab
        tabs.append(tab);
    }
    //the list value is given a name.
    listTitle.value = lists.find((list) => list.id === activeListId).name;
}

//Switchlist changes the active storage key, clear old task details, then load that list.
async function switchList(id, changesApproved = false) {
    //if the requested list is already active, or changing lists is not allowed, dont proceed!
    if (id === activeListId ||
        (!changesApproved && !window.TaskDetails.beforeListChange())) return false;

    //activelist has the id
    activeListId = id;

    //save the list and render the tabs
    saveLists();
    renderTabs();

    //find the table body element
    document.querySelector("#todo-table-body")

        //dispatches a custom todolistchanged event to 
        //notify any listeners that the task list has changed.
        .dispatchEvent(new Event("todolistchanged"));

    //the list message will have no value
    listMessage.textContent = "";

    //do the load todo function and let it run.
    await window.TodoStore.load();
    return true;
}

// Rename the active list when its title field is committed.
listTitle.addEventListener("change", () => {

    //give the name a trimmed value of listTitle
    const name = listTitle.value.trim();

    //if there is no name, render the tabs and stawp
    if (!name) {
        renderTabs();
        return;
    }

    //list then find the specific id and the active list id (must match) and from there gets the name.
    lists.find((list) => list.id === activeListId).name = name;

    //save the list and render the tabs
    saveLists();
    renderTabs();
});

// Add a new independent list and switch to it immediately.
document.querySelector("#add-list").addEventListener("click", async () => {
    //Check before changing any saved tabs, so cancel leaves everything untouched.
    if (!window.TaskDetails.beforeListChange()) return;


    //const id = random ID with date.
    const id = crypto.randomUUID
        ? crypto.randomUUID()
        : `list-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    //list push to the last (right) available area.
    lists.push({id, name: "New List"});

    //save the list, render the tabs, run switch mechanism and focus on the title.
    saveLists();
    renderTabs();
    await switchList(id, true);
    listTitle.focus();
});

// Remove a non-default list and its attachments, then return to My Tasks if active.
async function removeList(id) {

    //if the id is default, dont proceed.
    if (id === "default") return;

    //the list is then given the id.
    const list = lists.find((item) => item.id === id);

    //if there is no list nor a confirmation screen, dont proceed.
    if (!list || !window.confirm(`Remove "${list.name}" and its tasks?`)) return;

    //the was active value gets the id that has a corresponding active list id.
    const wasActive = id === activeListId;

    //if it was active and it's unmodifiable, dont proceed.
    if (wasActive && !window.TaskDetails.beforeListChange()) return;

    //key = id
    const key = `mosaic-todos-${id}`;

    //task = if it was active or it was retrieved
    //then get key.
    const tasks = wasActive ? window.TodoStore.getTodos() :
        JSON.parse(localStorage.getItem(key) || "[]");

    //removed is the array for removed tab objects.
    const removed = [];

    //try
    try {

        //per task
        for (const task of tasks) {
            //remove all attachments.
            removed.push(await window.TaskDetails.removeAttachments(task));
        }

        //remove the key item
        localStorage.removeItem(key);

        //filter the list by id
        lists = lists.filter((item) => item.id !== id);

        //if it was active, make active list id default.
        if (wasActive) activeListId = "default";

        //save the list and render the tabs.
        saveLists();
        renderTabs();

        //if it was active, dispatch a new event and wait for the to do list to load.
        if (wasActive) {
            document.querySelector("#todo-table-body").dispatchEvent(new Event("todolistchanged"));
            await window.TodoStore.load();
        }

    //if it had an error,
    } catch (error) {
        //per attachments,
        for (const attachments of removed.reverse()) {
            //try to retireve it
            try {
                await window.TaskDetails.restoreAttachments(attachments);
            //else, show to the user that there was an error.
            } catch (restoreError) {
                console.error("Unable to restore list attachments!", restoreError);
                listMessage.textContent = "List removal failed; some attachments could not be restored.";
            }
        }

        //if it tried and succeed, tell them that the list cannot be removed.
        listMessage.textContent = "Could not remove this list.";
        console.error("Unable to remove task list!", error);
    }
}

//draw initial tabs before ToDo.js loads the selected list's tasks.
saveLists();
renderTabs();
