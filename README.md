# EXIF OffsetTime Fixer

This app was built because the DJI Action camera exports the camera time, but the OffSetTime in the EXIF tags for pictures taken with the camera. It magically does the right thing for video, but it sets nothing for pictures.
This causes your pictures to be all out of order in your gallery apps (like Google Photots) especially on shared
albums. 

This app gets permission to the file system, and asks you to select a folder. It loads all images in that folder that do not have the OffsetTime set. Clicking an image will set the OffsetTime, OffsetTimeOriginal, and OffsetTimeDigitized EXIF tags to the current offset of the phone (by default), and saves the image back.

* This app never uploads your pictures anywhere.
* This app will never change an image that already has OffsetTime, OffsetTimeOriginal, or OffSetTimeDigitzed set.

The app is available offline. So when I'm traveling I usually dump my images from my DJI to my phone, open the app, fix all the images in the DJI Album, then proceed with either editing, or dump them straight to the photo album.