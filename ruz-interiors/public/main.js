// JavaScript for the public-facing site
// This script handles the functionality for the before-and-after image slider

document.addEventListener('DOMContentLoaded', function() {
    const slider = document.getElementById('slider');
    const beforeImage = document.getElementById('before-image');
    const afterImage = document.getElementById('after-image');

    // Update the width of the before image based on the slider value
    slider.addEventListener('input', function() {
        const value = slider.value;
        beforeImage.style.width = value + '%'; // Adjust the width of the before image
    });
});