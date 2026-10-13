//Initialize Storage Key
//Initialize Page Elements
const todoTableBody = document.getElementById("todo-table-body");
const form = document.querySelector("#todo-form");
const titleInput = document.querySelector("#todo-title");
const dateInput = document.querySelector("#todo-date");
const message = document.querySelector("#message");
const addButton = document.querySelector("#add-button");
//Initialize To Do Array
let todos = [];


//FUNCTIONS

//RenderToDos - Render Task List from memory data
function RenderToDos() {
    //Clear list before re-rendering so it does not have duplicates.
    todoTableBody.replaceChildren();
    const now = new Date();

    //Sorts a copy so incomplete tasks appear before completed ones.
    const orderedTodos = [...todos].sort(
        (first, second) => Number(first.completed) - Number(second.completed)
    );

    //for each todo item, create a table row.
    for (const todo of orderedTodos) {
        //Row
        const row = document.createElement("tr");
        //Row cells
        const completedCell = document.createElement("td");
        const titleCell = document.createElement("td");
        const dateCell = document.createElement("td");
        const checkbox = document.createElement("input");
        //Date
        const dueDate = document.createElement("time");
        const dueAt = new Date(
            todo.date.length === 10 ? `${todo.date}T23:59:59.999` : todo.date
        );
        const statusMessage = document.createElement("span");

        row.tabIndex = 0;
        row.dataset.todoIndex = String(todos.indexOf(todo));

        //Text content
        titleCell.textContent = todo.title;
        dueDate.dateTime = todo.date;
        //Date content. Huh? date? hindi ko sya type sorry!
        dueDate.textContent = dueAt.toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
        });


        //Completion textbox
        checkbox.type = "checkbox";
        checkbox.checked = todo.completed;
        checkbox.setAttribute("aria-label", `Mark "${todo.title}" complete`);
        checkbox.addEventListener("change", () =>
            completionTodo(todo, checkbox.checked));

        //If completed, add it into completed task list.
        if (todo.completed) {
            row.classList.add("completed-task");
        } else if (dueAt < now) {
            row.classList.add("overdue-task");
            statusMessage.textContent = " | Task overdue!";
        } else if (dueAt.toDateString() === now.toDateString()) {
            statusMessage.textContent = " | Due today";
        }
        //Add these stuff on the website.
        completedCell.append(checkbox);
        dateCell.append(dueDate, statusMessage);
        row.append(completedCell, titleCell, dateCell);
        todoTableBody.append(row);
    }

    todoTableBody.dispatchEvent(new Event("todosrendered"));
}

// Recheck deadlines every minute while the page stays open.
setInterval(RenderToDos, 60_000);

//Read any saved tasks asynchronously, then render them in the page.
//Read tasks asynchronously from LocalStorage. If there are no tasks, return an empty array.
//ALTHOUGH if there is a task, parse the JSON file and render the tasks with renderTodos().
async function loadTodos() {
    const savedTodos = localStorage.getItem(window.TodoTabs.getStorageKey());
    const parsedTodos = savedTodos ? JSON.parse(savedTodos) : [];
    todos = savedTodos
        ? parsedTodos.map((todo) => ({
            ...todo,
            id: todo.id || createTodoId(),
            description: todo.description || "",
            completed: todo.completed === true
        }))
        : [];
    if (todos.some((todo, index) => !parsedTodos[index].id)) {
        await saveTodos();
    }
    RenderToDos();
}

function createTodoId() {
    if (typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

//Save the current task data into local storage.
async function saveTodos() {
        localStorage.setItem(window.TodoTabs.getStorageKey(), JSON.stringify(todos));
}

window.TodoStore = {
    getTodos: () => todos,
    render: RenderToDos,
    save: saveTodos,
    load: loadTodos,
    completionTodo,
    deleteTask: deleteTodo
};

window.TaskDetails = {
    beforeDelete: () => true,
    removeAttachments: async () => [],
    restoreAttachments: async () => {},
    afterDelete: () => {},
    syncCompletion: () => {}
};

// Persist a checkbox change and restore the previous value if saving fails.
async function completionTodo(todo, completed) {
        const previousValue = todo.completed;
        todo.completed = completed;
        window.TaskDetails.syncCompletion(todo, completed);

        try {
            await saveTodos();
            RenderToDos();
            message.textContent = "";
        } catch (error) {
            todo.completed = previousValue;
            window.TaskDetails.syncCompletion(todo, previousValue);
            RenderToDos();
            message.textContent = "Could not complete the task. Error at line 105.";
            console.error("unable to update todo task!", error);
        }
}

// Remove a task from the list, restoring it if saving the change fails.
async function deleteTodo(todo) {
    const index = todos.indexOf(todo);
    if (index === -1) {
        return;
    }

    if (!window.TaskDetails.beforeDelete(todo)) {
        return;
    }

    let removedAttachments = [];
    let taskRemoved = false;
    message.textContent = "";
    try {
        removedAttachments = await window.TaskDetails.removeAttachments(todo);
        todos.splice(index, 1);
        taskRemoved = true;
        await saveTodos()
        window.TaskDetails.afterDelete(todo);
        RenderToDos();
        message.textContent="";
    } catch(error) {
        if (taskRemoved) {
            todos.splice(index, 0, todo);
        }
        if (removedAttachments.length) {
            try {
                await window.TaskDetails.restoreAttachments(removedAttachments);
            } catch (restoreError) {
                console.error("Unable to restore task attachments!", restoreError);
                message.textContent =
                    "Task deletion failed, and its attachments could not be restored.";
            }
        }
        RenderToDos();
        if (!message.textContent) {
            message.textContent = "Could not delete the task.";
        }
        console.error("unable to delete todo task!", error);
    }
}

//Validate and add a submitted task, then save and refresh
async function addTodo(event) {

    event.preventDefault();

    //If the text content does not ahve anything...
    message.textContent = "";

    //Trim the title and get the date. 
    const title = titleInput.value.trim();
    const date = dateInput.value;

    //If either is empty, show a message and return. 
    // This is a sort of validation to ensure data entered is complete.
    if (!title || !date) {
        message.textContent = "Enter a task and due date.";
        return;
    }

    //Disable the button while saving to prevent duplications.
    addButton.disabled = true;

    //Then, save before clearing the form so a storage error can be reported.
    try {
        todos.push({id: createTodoId(), title, date, description: "", completed: false});
        await saveTodos();
        RenderToDos();
        form.reset();
        titleInput.focus();

    //If it fails, remove the last tasks entered and add an error message.
    } catch(error) {
        todos.pop();
        message.textContent = "Could not save the task. Error at line 105.";
        console.error("Unable to save to todo list!", error);
    } finally {
        addButton.disabled = false;
    }
}

//ToggleAddMenu = Show or hide the add task form when "Add Task" is clicked.
function toggleAddMenu() {
    //Get the section that has the form
    const todoSection = document.getElementById("todo-section");
    
    //Toggle the display between "none" and "block"!
    todoSection.classList.toggle("todo-section-hidden");
    
    //This may be inefficient. uh oh. 
}

// Wire up form submission, set the initial date, and load saved tasks.
form.addEventListener("submit", addTodo);

// Show a clear message if loading from local storage fails.
loadTodos().catch((error) => {
    message.textContent = "Could not load saved tasks!";
    console.error("Unable to load todo list!", error);
});


//toggleAddMenu(); //must not show the thing yet.