// ============================================
// SCROLL ANIMATIONS - INTERSECTION OBSERVER
// ============================================

const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.fade-in-on-scroll').forEach(element => {
        observer.observe(element);
    });
});

// ============================================
// COMPLETED WORKS
// ============================================

let allWorks = [];
let currentFilter = 'all';
let completedWorkCategories = [];

async function loadCompletedWorks() {
    try {
        const [worksResponse, categoriesResponse] = await Promise.all([
            fetch('/api/completed-works'),
            fetch('/api/completed-work-categories')
        ]);

        if (!worksResponse.ok) throw new Error('Failed to fetch works');
        if (!categoriesResponse.ok) throw new Error('Failed to fetch categories');

        allWorks = await worksResponse.json();
        completedWorkCategories = await categoriesResponse.json();
        renderCompletedWorkFilters();
        renderCompletedWorks(allWorks);
        attachFilterListeners();
    } catch (error) {
        console.error('Error loading completed works:', error);
        document.getElementById('completed-works-container').innerHTML =
            '<p class="empty-message">No completed works yet.</p>';
    }
}

function renderCompletedWorkFilters() {
    const filterContainer = document.getElementById('completed-work-filters');
    if (!filterContainer) return;

    filterContainer.innerHTML = '<button class="filter-btn active" data-filter="all">All Works</button>' +
        completedWorkCategories.map(category =>
            `<button class="filter-btn" data-filter="${category.name}">${category.name}</button>`
        ).join('');
}

function renderCompletedWorks(works) {
    const container = document.getElementById('completed-works-container');

    if (works.length === 0) {
        container.innerHTML = '<p class="empty-message" style="grid-column: 1/-1; text-align: center; padding: 40px;">No completed works available.</p>';
        return;
    }

    container.innerHTML = works.map((work, index) => `
        <div class="work-card" style="animation-delay: ${index * 0.1}s">
            <div class="work-image-wrapper">
                <img src="${work.imagePath}" alt="${work.title}" class="work-image">
                <div class="work-category">${work.category}</div>
                <div class="work-overlay">
                    <div class="work-overlay-content">
                        <h3>${work.title}</h3>
                        <p>${work.description}</p>
                    </div>
                </div>
            </div>
            <div class="work-content">
                <h3>${work.title}</h3>
                <p>${work.description.substring(0, 80)}...</p>
            </div>
        </div>
    `).join('');

    document.querySelectorAll('.work-card').forEach(card => {
        observer.observe(card);
    });
}

function attachFilterListeners() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');

            currentFilter = e.target.dataset.filter;
            const filtered = currentFilter === 'all'
                ? allWorks
                : allWorks.filter(w => w.category === currentFilter);

            renderCompletedWorks(filtered);
        });
    });
}

// ============================================
// SERVICES
// ============================================

let allServices = [];
const serviceIcons = {
    consultation: 'icons/consultation.svg',
    home: 'icons/home.svg',
    building: 'icons/building.svg',
    palette: 'icons/palette.svg',
    visualization: 'icons/visualization.svg',
    furniture: 'icons/furniture.svg',
    lightbulb: 'icons/lightbulb.svg',
    task: 'icons/task.svg'
};

async function loadServices() {
    try {
        const response = await fetch('/api/services');
        if (!response.ok) throw new Error('Failed to fetch services');

        allServices = await response.json();
        renderServices(allServices);
        attachServiceTabListeners();
    } catch (error) {
        console.error('Error loading services:', error);
        document.getElementById('services-container').innerHTML =
            '<p class="empty-message">No services available.</p>';
    }
}

function renderServices(services) {
    const container = document.getElementById('services-container');

    if (services.length === 0) {
        container.innerHTML = '<p class="empty-message" style="grid-column: 1/-1; text-align: center; padding: 40px;">No services available.</p>';
        return;
    }

    container.innerHTML = services.map((service, index) => `
        <div class="service-card" style="animation-delay: ${index * 0.1}s">
            <div class="service-icon">
                <img src="${serviceIcons[service.iconType] || serviceIcons.consultation}" alt="${service.name}">
            </div>
            <h3>${service.name}</h3>
            <p>${service.description}</p>
        </div>
    `).join('');

    document.querySelectorAll('.service-card').forEach(card => {
        observer.observe(card);
    });
}

function attachServiceTabListeners() {
    document.querySelectorAll('.service-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.service-tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');

            const tab = e.target.dataset.tab;
            // In a real app, you'd filter services by category here
            // For now, just re-render all
            renderServices(allServices);
        });
    });
}

// ============================================
// REVIEWS (EXISTING)
// ============================================

async function loadReviews() {
    try {
        const response = await fetch('/api/reviews');
        if (!response.ok) throw new Error('Failed to fetch reviews');

        const reviews = await response.json();
        const container = document.getElementById('reviews-container');

        if (reviews.length === 0) {
            container.innerHTML = '<p class="empty-message">No reviews yet. Be the first to share your experience!</p>';
            return;
        }

        container.innerHTML = '';
        reviews.forEach((review, index) => {
            const card = createReviewCard(review);
            card.style.animation = `bounceIn 0.6s ease-out ${index * 0.1}s both`;
            container.appendChild(card);
            observer.observe(card);
        });
    } catch (error) {
        console.error('Error loading reviews:', error);
        document.getElementById('reviews-container').innerHTML =
            '<p class="error-message">Failed to load reviews. Please try again later.</p>';
    }
}

function createReviewCard(review) {
    const card = document.createElement('div');
    card.className = 'review-card';

    const header = document.createElement('div');
    header.className = 'review-header';

    const name = document.createElement('div');
    name.className = 'review-name';
    name.textContent = review.clientName;

    const rating = document.createElement('div');
    rating.className = 'review-rating';
    rating.textContent = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);

    header.appendChild(name);
    header.appendChild(rating);

    const text = document.createElement('p');
    text.className = 'review-text';
    text.textContent = `"${review.reviewText}"`;

    card.appendChild(header);
    card.appendChild(text);

    return card;
}

// ============================================
// BEFORE/AFTER PROJECTS (EXISTING)
// ============================================

async function loadProjects() {
    try {
        const response = await fetch('/api/projects');
        if (!response.ok) throw new Error('Failed to fetch projects');

        const projects = await response.json();
        const container = document.getElementById('sliders-container');

        if (projects.length === 0) {
            container.innerHTML = '<p class="empty-message">No projects available yet. Check back soon!</p>';
            return;
        }

        container.innerHTML = '';
        projects.forEach(project => {
            container.appendChild(createSlider(project));
        });
    } catch (error) {
        console.error('Error loading projects:', error);
        document.getElementById('sliders-container').innerHTML =
            '<p class="error-message">Failed to load projects. Please try again later.</p>';
    }
}

function createSlider(project) {
    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'slider-container';

    const wrapperDiv = document.createElement('div');
    wrapperDiv.className = 'slider-wrapper';

    const beforeLabel = document.createElement('div');
    beforeLabel.className = 'slider-label before-label';
    beforeLabel.textContent = 'BEFORE';

    const afterImage = document.createElement('img');
    afterImage.src = project.afterImagePath;
    afterImage.alt = 'After - ' + project.title;
    afterImage.className = 'after-image';

    const beforeImageWrapper = document.createElement('div');
    beforeImageWrapper.className = 'slider-image-wrapper before-image-wrapper';

    const beforeImage = document.createElement('img');
    beforeImage.src = project.beforeImagePath;
    beforeImage.alt = 'Before - ' + project.title;
    beforeImage.className = 'slider-image';

    beforeImageWrapper.appendChild(beforeImage);

    const sliderHandle = document.createElement('div');
    sliderHandle.className = 'slider-handle';

    const rangeInput = document.createElement('input');
    rangeInput.type = 'range';
    rangeInput.min = '0';
    rangeInput.max = '100';
    rangeInput.value = '50';
    rangeInput.className = 'slider-range';

    beforeImageWrapper.style.clipPath = 'inset(0 50% 0 0)';

    rangeInput.addEventListener('input', (e) => {
        const value = e.target.value;
        const percentage = 100 - value;
        beforeImageWrapper.style.clipPath = `inset(0 ${percentage}% 0 0)`;
        sliderHandle.style.left = value + '%';
    });

    let isSliding = false;

    rangeInput.addEventListener('mousedown', () => {
        isSliding = true;
    });

    document.addEventListener('mouseup', () => {
        isSliding = false;
    });

    wrapperDiv.addEventListener('mousemove', (e) => {
        if (!isSliding) return;

        const rect = wrapperDiv.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = (x / rect.width) * 100;
        const clampedValue = Math.max(0, Math.min(100, percentage));

        rangeInput.value = clampedValue;
        const clipPercentage = 100 - clampedValue;
        beforeImageWrapper.style.clipPath = `inset(0 ${clipPercentage}% 0 0)`;
        sliderHandle.style.left = clampedValue + '%';
    });

    wrapperDiv.appendChild(afterImage);
    wrapperDiv.appendChild(beforeImageWrapper);
    wrapperDiv.appendChild(sliderHandle);
    wrapperDiv.appendChild(rangeInput);
    wrapperDiv.appendChild(beforeLabel);

    const titleDiv = document.createElement('div');
    titleDiv.className = 'slider-title';
    const titleH3 = document.createElement('h3');
    titleH3.textContent = project.title;
    titleDiv.appendChild(titleH3);

    sliderContainer.appendChild(wrapperDiv);
    sliderContainer.appendChild(titleDiv);

    return sliderContainer;
}

// ============================================
// CTA BUTTON
// ============================================

document.querySelector('.cta-button')?.addEventListener('click', () => {
    document.getElementById('works').scrollIntoView({ behavior: 'smooth' });
});

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    loadProjects();
    loadCompletedWorks();
    loadServices();
    loadReviews();
});
