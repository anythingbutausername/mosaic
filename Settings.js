const color = document.getElementById("backgroundColor");
const colorApply = document.getElementById("applyColor");
const resetButton = document.getElementById("reset");
const wallpaperUpload = document.getElementById("wallpaper-upload");
const removeWallpaper = document.getElementById("remove-wallpaper");
const wallpaperBlur = document.getElementById("blur");
const wallpaperLayer = document.getElementById("wallpaper-layer");


//color relevant settings

//this one applies the color when the color apply button is clicked.
colorApply.addEventListener("click", () => {

    //it initializes color Value, it then sets it to the body, 
    //then place it at local storage.
    var colorVal = color.value;
    getColorBackground(colorVal);
    localStorage.setItem("backgroundColor", colorVal);
});

//reset button that runs reset()
resetButton.addEventListener("click", reset);

//this one applies the color by setting the property in css.
function getColorBackground(colorVal) {
    console.log("getColorBackground run!");
    document.documentElement.style.setProperty(
        "--background-color",
        colorVal
    );
}

//this one just sets the color as white and removes the corresponding color value.
function reset() {
    document.documentElement.style.setProperty(
        "--background-color",
        "#ffffff"
    );
    color.value = "#ffffff";
    localStorage.removeItem("backgroundColor");
}

//apply wallpaper by checking if there's an image, and applying it if there's one.
function applyWallpaper(image) {
    if (image) {
        wallpaperLayer.style.backgroundImage = `url("${image}")`;
    } else {
        wallpaperLayer.style.backgroundImage = "";
    }
}

//toggle wallpaper blur setting
function applyWallpaperBlur(blurred) {
    wallpaperLayer.classList.toggle("wallpaper-blurred", blurred);
}

//load saved wallpaper
applyWallpaper(localStorage.getItem("mosaic-wallpaper"));
wallpaperBlur.checked = localStorage.getItem("mosaic-wallpaper-blur") === "true";
applyWallpaperBlur(wallpaperBlur.checked);

//blur button listener
wallpaperBlur.addEventListener("change", () => {

    //set the item from local storage
    localStorage.setItem("mosaic-wallpaper-blur", String(wallpaperBlur.checked));

    //apply blur into it
    applyWallpaperBlur(wallpaperBlur.checked);
});


//event listener for the wallpaper upload thingy
wallpaperUpload.addEventListener("change", () => {
    const file = wallpaperUpload.files[0];

    //if there's no file or not an image file, it will NOT work.
    if (!file || !file.type.startsWith("image/")) return;

    //loads a new instance of a file reader.
    const reader = new FileReader();

    //read the image from the result
    reader.onload = () => {
        const image = reader.result;

        //tries to place it in localstorage.
        //Applies the wallpaper.
        try {
            localStorage.setItem("mosaic-wallpaper", image);
            applyWallpaper(image);

        //if there's an error, probably the file size, it will tell the user about the file size.
        } catch {
            alert("Image is too large to save. Please try a smaller image.");
        }
    };
    //reader reads the file.
    reader.readAsDataURL(file);
});

//remove the wallpaper by setting apply wallpaper as null.
removeWallpaper.addEventListener("click", () => {
    localStorage.removeItem("mosaic-wallpaper");
    applyWallpaper(null);
})
