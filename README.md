# EXIF OffsetTime Fixer - Photo Gallery App

A modern, responsive web application for viewing and managing photos. Built with React and Vite, designed to work seamlessly on mobile devices.

## Features

- 📁 **Folder Selection** - Select any folder to view photos
- 🖼️ **Image Grid** - Beautiful, responsive photo gallery
- ✅ **Multi-Selection** - Select multiple photos with visual feedback
- 📱 **Mobile Optimized** - Touch-friendly interface
- 🎨 **Modern UI** - Beautiful gradient design with smooth animations
- ⚡ **Fast Loading** - Optimized for performance

## Getting Started

### Prerequisites

- Node.js (version 16 or higher)
- npm or yarn

### Installation

1. Clone or download this project
2. Navigate to the project directory:
   ```bash
   cd exif_fixer
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:5173`

### Building for Production

To create a production build:

```bash
npm run build
```

The built files will be in the `dist` directory, ready for deployment.

## Usage

### Desktop
1. Click "Choose Folder" to select a folder with photos
2. Browse through your photos in the grid view
3. Click on photos to select/deselect them
4. Use "Select All" or "Clear Selection" buttons for bulk operations

### Mobile
1. Open the app in your mobile browser
2. Grant permission to access files when prompted
3. Select a folder to view your photos
4. Tap photos to select/deselect them

## File Access

The app uses the File System Access API to access local files. This allows you to:

- Browse and select folders
- View all images in the selected folder
- Access photos from your device's storage
- Works with mobile photo libraries

## Browser Compatibility

- Chrome/Edge (Desktop & Mobile) - Full support
- Safari (iOS) - Limited support
- Firefox - Limited support

## Development

### Project Structure

```
exif_fixer/
├── public/           # Static assets
├── src/
│   ├── App.jsx      # Main application component
│   ├── App.css      # Application styles
│   └── main.jsx     # Application entry point
├── vite.config.js   # Vite configuration
└── package.json     # Dependencies and scripts
```

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Technologies Used

- **React 19** - UI framework
- **Vite** - Build tool and dev server
- **CSS Grid & Flexbox** - Responsive layout
- **File System Access API** - Local file access

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source and available under the MIT License.
