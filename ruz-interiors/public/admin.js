document.addEventListener('DOMContentLoaded', () => {
    const projectForm = document.getElementById('project-form');
    const reviewForm = document.getElementById('review-form');
    const projectList = document.getElementById('project-list');
    const reviewList = document.getElementById('review-list');

    // Handle project image uploads
    projectForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(projectForm);
        try {
            const response = await fetch('/api/admin/projects', {
                method: 'POST',
                body: formData
            });
            if (response.ok) {
                alert('Project uploaded successfully!');
                loadProjects();
            } else {
                alert('Failed to upload project.');
            }
        } catch (error) {
            console.error('Error:', error);
        }
    });

    // Handle review submissions
    reviewForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(reviewForm);
        try {
            const response = await fetch('/api/admin/reviews', {
                method: 'POST',
                body: formData
            });
            if (response.ok) {
                alert('Review submitted successfully!');
                loadReviews();
            } else {
                alert('Failed to submit review.');
            }
        } catch (error) {
            console.error('Error:', error);
        }
    });

    // Load existing projects
    async function loadProjects() {
        try {
            const response = await fetch('/api/projects');
            const projects = await response.json();
            projectList.innerHTML = '';
            projects.forEach(project => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <h3>${project.title}</h3>
                    <img src="${project.beforeImage}" alt="Before Image">
                    <img src="${project.afterImage}" alt="After Image">
                    <button onclick="deleteProject('${project.id}')">Delete</button>
                `;
                projectList.appendChild(li);
            });
        } catch (error) {
            console.error('Error loading projects:', error);
        }
    }

    // Load existing reviews
    async function loadReviews() {
        try {
            const response = await fetch('/api/reviews');
            const reviews = await response.json();
            reviewList.innerHTML = '';
            reviews.forEach(review => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <strong>${review.clientName}</strong> (${review.rating} stars)
                    <p>${review.text}</p>
                    <button onclick="deleteReview('${review.id}')">Delete</button>
                `;
                reviewList.appendChild(li);
            });
        } catch (error) {
            console.error('Error loading reviews:', error);
        }
    }

    // Delete project function
    async function deleteProject(id) {
        try {
            const response = await fetch(`/api/admin/projects/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                alert('Project deleted successfully!');
                loadProjects();
            } else {
                alert('Failed to delete project.');
            }
        } catch (error) {
            console.error('Error deleting project:', error);
        }
    }

    // Delete review function
    async function deleteReview(id) {
        try {
            const response = await fetch(`/api/admin/reviews/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                alert('Review deleted successfully!');
                loadReviews();
            } else {
                alert('Failed to delete review.');
            }
        } catch (error) {
            console.error('Error deleting review:', error);
        }
    }

    // Initial load
    loadProjects();
    loadReviews();
});