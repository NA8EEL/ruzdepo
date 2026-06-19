# RUZ Interiors

## Overview
RUZ Interiors is a web application designed for an interior design company, showcasing before-and-after transformations of projects along with client testimonials. The application features a public-facing website and an admin dashboard for managing projects and reviews.

## Project Structure
```
ruz-interiors
├── public
│   ├── index.html        # Main structure of the public-facing website
│   ├── admin.html        # Admin dashboard for managing projects and reviews
│   ├── style.css         # Styles for the entire website
│   ├── main.js           # JavaScript for the public-facing site
│   └── admin.js          # JavaScript for the admin dashboard
├── uploads               # Directory for storing uploaded images
├── data
│   └── db.sqlite         # SQLite database file for project and review data
├── package.json          # npm configuration file with project dependencies
├── server.js             # Express application setup and API endpoints
└── README.md             # Documentation for the project
```

## Technologies Used
- **Frontend:** HTML, CSS, Vanilla JavaScript
- **Backend:** Node.js with Express.js
- **Database:** SQLite
- **File Uploads:** Multer for handling image uploads

## Features
- **Responsive Design:** The website is fully responsive, ensuring a seamless experience on both mobile and desktop devices.
- **Before & After Slider:** An interactive slider that allows users to compare before and after images of interior design projects.
- **Client Reviews:** A section displaying testimonials from clients, fetched dynamically from the database.
- **Admin Dashboard:** A secure area for administrators to upload new projects and manage client reviews.

## Setup Instructions
1. **Clone the Repository:**
   ```
   git clone <repository-url>
   cd ruz-interiors
   ```

2. **Install Dependencies:**
   ```
   npm install
   ```

3. **Run the Server:**
   ```
   node server.js
   ```

4. **Access the Application:**
   Open your browser and navigate to `http://localhost:3000` to view the public-facing site. Access the admin dashboard at `http://localhost:3000/admin` (authentication required).

## Usage
- Use the admin dashboard to upload new before-and-after images and manage client reviews.
- The public-facing site allows users to view projects and read testimonials.

## License
This project is licensed under the MIT License.