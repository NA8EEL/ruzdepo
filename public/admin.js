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
                loadCompletedWorks();
                loadCompletedWorkCategories();
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

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');

        document.getElementById('login-message').innerHTML = '';
        document.getElementById('login-form').reset();
        isLoggedIn = true;
        showDashboard();
        loadProjects();
        loadReviews();
        loadCompletedWorks();
        loadCompletedWorkCategories();
    } catch (err) {
        document.getElementById('login-message').innerHTML = `<div class="message error">${err.message}</div>`;
    }
});

// Logout
document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
        await fetch('/api/admin/logout', { method: 'POST' });
    } catch (err) {
        console.error('Logout error:', err);
    } finally {
        isLoggedIn = false;
        window.location.href = 'index.html';
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
            let errMsg = `HTTP ${res.status}`;
            try {
                const ct = res.headers.get('content-type') || '';
                if (ct.includes('application/json')) {
                    const data = await res.json();
                    errMsg = data.error || JSON.stringify(data);
                } else {
                    errMsg = (await res.text()).substring(0, 200);
                }
            } catch (_) {}
            throw new Error(errMsg);
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
/*
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
*/

// Add Completed Work
const completedWorkForm = document.getElementById('completed-work-form');
if (completedWorkForm) {
    completedWorkForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const title = document.getElementById('completed-work-title').value;
        const description = document.getElementById('completed-work-description').value;
        const category = document.getElementById('completed-work-category').value;
        const imageFile = document.getElementById('completed-work-image').files[0];
        const msgDiv = document.getElementById('completed-work-message');

        if (!title || !description || !category || !imageFile) {
            msgDiv.innerHTML = '<div class="message error">Please fill all fields</div>';
            return;
        }

        const formData = new FormData();
        formData.append('title', title);
        formData.append('description', description);
        formData.append('category', category);
        formData.append('image', imageFile);

        try {
            const res = await fetch('/api/admin/completed-works', {
                method: 'POST',
                body: formData
            });

            if (!res.ok) {
                let errMsg = `HTTP ${res.status}`;
                try {
                    const ct = res.headers.get('content-type') || '';
                    if (ct.includes('application/json')) {
                        const data = await res.json();
                        errMsg = data.error || JSON.stringify(data);
                    } else {
                        errMsg = (await res.text()).substring(0, 200);
                    }
                } catch (_) {}
                throw new Error(errMsg);
            }

            msgDiv.innerHTML = '<div class="message success">Completed work uploaded!</div>';
            document.getElementById('completed-work-form').reset();
            setTimeout(() => {
                msgDiv.innerHTML = '';
                loadCompletedWorks();
            }, 2000);
        } catch (err) {
            msgDiv.innerHTML = `<div class="message error">Error: ${err.message}</div>`;
        }
    });
}

async function loadCompletedWorkCategories() {
    try {
        const res = await fetch('/api/completed-work-categories');
        if (!res.ok) throw new Error('Failed to load categories');

        const categories = await res.json();
        renderCompletedWorkCategoryOptions(categories);
        renderCategoryManagementList(categories);
    } catch (err) {
        console.error('Error loading completed work categories:', err);
        document.getElementById('category-list').innerHTML = '<div class="empty-state">Unable to load categories</div>';
    }
}

function renderCompletedWorkCategoryOptions(categories) {
    const select = document.getElementById('completed-work-category');
    if (!select) return;

    select.innerHTML = categories.map(category =>
        `<option value="${category.name}">${category.name}</option>`
    ).join('');
}

function renderCategoryManagementList(categories) {
    const container = document.getElementById('category-list');
    if (!container) return;

    if (categories.length === 0) {
        container.innerHTML = '<div class="empty-state">No categories yet</div>';
        return;
    }

    const rows = categories.map(category => `
        <tr>
            <td>${category.name}</td>
            <td><button class="delete-btn" onclick="deleteCompletedWorkCategory(${category.id})">Delete</button></td>
        </tr>
    `).join('');

    container.innerHTML = `<table><thead><tr><th>Name</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>`;
}

window.deleteCompletedWorkCategory = async function(id) {
    if (!confirm('Delete this category? All works in this category will become Uncategorized.')) return;
    try {
        const res = await fetch(`/api/admin/completed-work-categories/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Delete failed');
        }
        await loadCompletedWorkCategories();
        loadCompletedWorks();
    } catch (err) {
        alert('Error: ' + err.message);
    }
};

const categoryForm = document.getElementById('category-form');
if (categoryForm) {
    categoryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('new-category-name').value.trim();
        const msgDiv = document.getElementById('category-message');

        if (!name) {
            msgDiv.innerHTML = '<div class="message error">Please enter a category name</div>';
            return;
        }

        try {
            const res = await fetch('/api/admin/completed-work-categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Add category failed');
            }

            msgDiv.innerHTML = '<div class="message success">Category added!</div>';
            document.getElementById('new-category-name').value = '';
            await loadCompletedWorkCategories();
            loadCompletedWorks();
            setTimeout(() => { msgDiv.innerHTML = ''; }, 2000);
        } catch (err) {
            msgDiv.innerHTML = `<div class="message error">Error: ${err.message}</div>`;
        }
    });
}

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
            // Escape single quotes in titles to prevent breaking the onclick handler
            const safeTitle = p.title.replace(/'/g, "\\'");
            html += `<tr>
                <td>${p.title}</td>
                <td><img src="${p.beforeImagePath}" alt="before" class="project-img"></td>
                <td><img src="${p.afterImagePath}" alt="after" class="project-img"></td>
                <td>
                    <button class="delete-btn" onclick="openEditProject(${p.id}, '${safeTitle}')" style="margin-right: 5px;">Edit</button>
                    <button class="delete-btn" onclick="deleteProject(${p.id})">Delete</button>
                </td>
            </tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (err) {
        console.error('Error loading projects:', err);
        document.getElementById('projects-list').innerHTML = '<div class="empty-state">Error loading projects</div>';
    }
}

// Open Edit Project Modal
window.openEditProject = function(id, title) {
    document.getElementById('edit-project-id').value = id;
    document.getElementById('edit-project-title').value = title;
    
    // Use 'flex' instead of 'block' so the centering CSS works
    document.getElementById('edit-project-modal').style.display = 'flex';
};

// Close Edit Project Modal
window.closeEditProject = function() {
    document.getElementById('edit-project-modal').style.display = 'none';
    document.getElementById('edit-project-form').reset();
    document.getElementById('edit-project-message').innerHTML = '';
};

// Optional: Close modal if user clicks outside of the modal content box
document.getElementById('edit-project-modal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeEditProject();
    }
});

// Submit Edit Project Form
const editProjectForm = document.getElementById('edit-project-form');
if (editProjectForm) {
    editProjectForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = document.getElementById('edit-project-id').value;
        const title = document.getElementById('edit-project-title').value;
        const beforeFile = document.getElementById('edit-before-image').files[0];
        const afterFile = document.getElementById('edit-after-image').files[0];
        const msgDiv = document.getElementById('edit-project-message');

        const formData = new FormData();
        formData.append('title', title);
        if (beforeFile) formData.append('beforeImage', beforeFile);
        if (afterFile) formData.append('afterImage', afterFile);

        try {
            const res = await fetch(`/api/admin/projects/${id}`, {
                method: 'PUT',
                body: formData
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Update failed');
            }

            msgDiv.innerHTML = '<div class="message success">Project updated successfully!</div>';
            
            setTimeout(() => {
                closeEditProject();
                loadProjects(); // Refresh the table
            }, 1500);
        } catch (err) {
            msgDiv.innerHTML = `<div class="message error">Error: ${err.message}</div>`;
        }
    });
}

// Load Completed Works
async function loadCompletedWorks() {
    try {
        const res = await fetch('/api/completed-works');
        const works = await res.json();
        const container = document.getElementById('completed-works-list');

        if (works.length === 0) {
            container.innerHTML = '<div class="empty-state">No completed works yet</div>';
            return;
        }

        let html = '<table><thead><tr><th>Title</th><th>Image</th><th>Category</th><th>Action</th></tr></thead><tbody>';
        works.forEach(w => {
            html += `<tr>
                <td>${w.title}</td>
                <td><img src="${w.imagePath}" alt="${w.title}" class="project-img"></td>
                <td>${w.category}</td>
                <td><button class="delete-btn" onclick="deleteCompletedWork(${w.id})">Delete</button></td>
            </tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (err) {
        console.error('Error loading completed works:', err);
        document.getElementById('completed-works-list').innerHTML = '<div class="empty-state">Error loading completed works</div>';
    }
}

// Delete Completed Work
async function deleteCompletedWork(id) {
    if (!confirm('Delete this completed work?')) return;
    try {
        const res = await fetch(`/api/admin/completed-works/${id}`, { method: 'DELETE' });
        if (res.ok) loadCompletedWorks();
    } catch (err) {
        alert('Error: ' + err.message);
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
