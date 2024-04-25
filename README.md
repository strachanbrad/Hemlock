# Hemlock

Hemlock is a web application tailored for book enthusiasts to catalog and manage their book collections. Inspired by the "BookTok" community's enthusiasm for dark romance novels and named after the captivating yet toxic Hemlock plant, this app serves a broader audience, accommodating any genre of literature.

## Dedication

Dedicated to Chelsea Strachan, whose love for dark romance books breathed life into this project. Your passion for reading and your support are the foundation of Hemlock.

![Screenshot from 2024-04-24 22-23-38](https://github.com/strachanbrad/Hemlock/assets/52078019/251e0c9c-7cd8-458d-8a00-b07445ac5d7e)
![Screenshot from 2024-04-24 22-23-28](https://github.com/strachanbrad/Hemlock/assets/52078019/93e81584-d75b-4649-8f65-084747e7740f)
![Screenshot from 2024-04-24 22-23-52](https://github.com/strachanbrad/Hemlock/assets/52078019/48ec9040-e534-42bb-ac46-daf88d7ea9fa)

## Features

- **Universal Cataloguing:** Manage your entire collection, marking books as read or unread.
- **Dynamic Ratings:** Rate books across multiple dimensions, including up to five stars overall, with customizable tags for themes like romance or suspense.
- **Detailed Book Entries:** Add comprehensive data for each book, including author, title, ISBN, and synopsis.
- **Advanced Search and Filters:** Utilize powerful sorting, searching, and filtering tools.
- **E-Book and Wishlist Management:** Keep track of your digital reads and manage a wishlist for physical copies.

## Installation

### Prerequisites

- Node.js v20.9.0 or higher (tested)
- A web server (Apache or Nginx recommended)

### Setting Up

1. **Clone the repository:**
   ```
   git clone https://github.com/strachanbrad/Hemlock.git ~/hemlock
   ```
2. **Deployment (using Nginx as an example):**
   - Ensure Nginx and Node.js are installed on your system.
   - Navigate to the Hemlock directory and run the deployment script:
     ```
     cd ~/hemlock
     ./deploy.sh
     ```
   This script assumes Nginx is installed with the user `www-data’ and the Node user as `node’. It uses PM2 to manage the Node server process.

### Development Setup

1. **Clone the repository:**
   ```
   git clone https://github.com/strachanbrad/Hemlock.git ~/hemlock
   ```
2. **Install dependencies:**
   ```
   cd hemlock
   npm run install-all
   ```
3. **Run the development server:**
   ```
   npm run dev
   ```

## TODO

- Implement a cleaner styling solution (current styles are inline and disorganized).
- Clean up the deployment strategy.
- Implement responsiveness for mobile and tablet devices.
- Prompt user to change ISBN when a book purchased is specific to different media formats.
- Separate out common code into a utils.js script.
- Develop a multi-stack/distribution deployment script.

## Known Bugs

- Carousel in fullscreen mode does not rotate sometimes.

## Future Features

- Barcode scanning for book ISBNs.
- Integration with isbndb.com API for automatic book data collection.
- Admin page for better management.
- Customizable ratings and option to hide unwanted ratings.
- User account system for personalized experiences.

## License

Hemlock is released under the GPL-3.0 license. See the LICENSE file for more details.
