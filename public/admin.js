let isLoggedIn = false;

// Check auth status on page load
function checkAuthStatus() {
    fetch('/api/admin/check')
        .then(r => r.json())
        .then(data => {
            if (data.authenticated) {
                showDashboard();
                loadProjects();
                loadReviews();
            } else {
                showLogin();
            }
        })
        .catch(err => {
            console.error('Auth check failed:', err);
            showLogin();
        });
}

function showLogin() {
    document.getElementById('login-section').style.display = 'flex';
    document.getElementById('dashboard').classList.remove('active');
}

function showDashboard() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('dashboard').classList.add('active');
}

// Login
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!res.ok) throw new Error('Login failed');

        document.getElementById('login-message').innerHTML = '';
        document.getElementById('login-form').reset();
        isLoggedIn = true;
        showDashboard();
        loadProjects();
        loadReviews();
    } catch (err) {
        document.getElementById('login-message').innerHTML = `<div class="message error">${err.message}</div>`;
    }
});

// Logout
document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
        await fetch('/api/admin/logout', { method: 'POST' });
        isLoggedIn = false;
        showLogin();
    } catch (err) {
        console.error('Logout error:', err);
    }
});

// Add Project
document.getElementById('project-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('project-title').value;
    const beforeFile = document.getElementById('before-image').files[0];
    const afterFile = document.getElementById('after-image').files[0];
    const msgDiv = document.getElementById('project-message');

    if (!title || !beforeFile || !afterFile) {
        msgDiv.innerHTML = '<div class="message error">Please fill all fields</div>';
        return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('beforeImage', beforeFile);
    formData.append('afterImage', afterFile);

    try {
        const res = await fetch('/api/admin/projects', {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Upload failed');
        }

        msgDiv.innerHTML = '<div class="message success">Project uploaded!</div>';
        document.getElementById('project-form').reset();
        setTimeout(() => {
            msgDiv.innerHTML = '';
            loadProjects();
        }, 2000);
    } catch (err) {
        msgDiv.innerHTML = `<div class="message error">Error: ${err.message}</div>`;
    }
});

// Add Review
document.getElementById('review-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('review-name').value;
    const rating = document.getElementById('review-rating').value;
    const text = document.getElementById('review-text').value;
    const msgDiv = document.getElementById('review-message');

    if (!name || !rating || !text) {
        msgDiv.innerHTML = '<div class="message error">Please fill all fields</div>';
        return;
    }

    try {
        const res = await fetch('/api/admin/reviews', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientName: name,
                rating: parseInt(rating),
                reviewText: text
            })
        });

        if (!res.ok) throw new Error('Failed to add review');

        msgDiv.innerHTML = '<div class="message success">Review added!</div>';
        document.getElementById('review-form').reset();
        setTimeout(() => {
            msgDiv.innerHTML = '';
            loadReviews();
        }, 2000);
    } catch (err) {
        msgDiv.innerHTML = `<div class="message error">Error: ${err.message}</div>`;
    }
});

// Load Projects
async function loadProjects() {
    try {
        const res = await fetch('/api/projects');
        const projects = await res.json();
        const container = document.getElementById('projects-list');

        if (projects.length === 0) {
            container.innerHTML = '<div class="empty-state">No projects yet</div>';
            return;
        }

        let html = '<table><thead><tr><th>Title</th><th>Before</th><th>After</th><th>Action</th></tr></thead><tbody>';
        projects.forEach(p => {
            html += `<tr>
                <td>${p.title}</td>
                <td><img src="${p.beforeImagePath}" alt="before" class="project-img"></td>
                <td><img src="${p.afterImagePath}" alt="after" class="project-img"></td>
                <td><button class="delete-btn" onclick="deleteProject(${p.id})">Delete</button></td>
            </tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (err) {
        console.error('Error loading projects:', err);
        document.getElementById('projects-list').innerHTML = '<div class="empty-state">Error loading projects</div>';
    }
}

// Load Reviews
async function loadReviews() {
    try {
        const res = await fetch('/api/reviews');
        const reviews = await res.json();
        const container = document.getElementById('reviews-list');

        if (reviews.length === 0) {
            container.innerHTML = '<div class="empty-state">No reviews yet</div>';
            return;
        }

        let html = '<table><thead><tr><th>Name</th><th>Rating</th><th>Review</th><th>Action</th></tr></thead><tbody>';
        reviews.forEach(r => {
            const stars = '⭐'.repeat(r.rating);
            html += `<tr>
                <td>${r.clientName}</td>
                <td>${stars}</td>
                <td>${r.reviewText.substring(0, 50)}...</td>
                <td><button class="delete-btn" onclick="deleteReview(${r.id})">Delete</button></td>
            </tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (err) {
        console.error('Error loading reviews:', err);
        document.getElementById('reviews-list').innerHTML = '<div class="empty-state">Error loading reviews</div>';
    }
}

// Delete Project
async function deleteProject(id) {
    if (!confirm('Delete this project?')) return;
    try {
        const res = await fetch(`/api/admin/projects/${id}`, { method: 'DELETE' });
        if (res.ok) loadProjects();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// Delete Review
async function deleteReview(id) {
    if (!confirm('Delete this review?')) return;
    try {
        const res = await fetch(`/api/admin/reviews/${id}`, { method: 'DELETE' });
        if (res.ok) loadReviews();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', checkAuthStatus);
