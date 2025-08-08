import { useState, useRef, useEffect } from 'react'
import exifr from 'exifr'
import piexif from 'piexifjs'

function App() {
  const MODE = { mode: 'readwrite' }
  const [images, setImages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [offsetTime, setOffsetTime] = useState('+00:00')
  const [directoryHandle, setDirectoryHandle] = useState(null)
  const [permissionGranted, setPermissionGranted] = useState(false)

  // Function to get timezone offset from user's location
  const detectUserTimezone = () => {
    try {
      // Get the current timezone offset in minutes
      const offsetMinutes = new Date().getTimezoneOffset()

      // Convert to hours and format as ±HH:MM
      const hours = Math.abs(Math.floor(offsetMinutes / 60))
      const minutes = Math.abs(offsetMinutes % 60)
      const sign = offsetMinutes <= 0 ? '+' : '-' // getTimezoneOffset() returns negative for positive offset

      const formattedOffset = `${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`

      console.log('Detected timezone offset:', formattedOffset)
      return formattedOffset
    } catch (error) {
      console.log('Could not detect timezone, using default:', error)
      return '+00:00' // fallback
    }
  }
  useEffect(() => {
    if (permissionGranted && directoryHandle) {
      loadImagesFromFileHandle(directoryHandle)
    }
  }, [directoryHandle, permissionGranted])

  // Set default offset on component mount
  useEffect(() => {
    const detectedOffset = detectUserTimezone()
    setOffsetTime(detectedOffset)
  }, [])

  useEffect(() => {
    // Retrieve the stored directory handle from IndexedDB on mount
    const dbName = 'exif-fixer-db'
    const storeName = 'handles'

    if ('indexedDB' in window) {
      const request = indexedDB.open(dbName, 1)
      request.onupgradeneeded = function (event) {
        const db = event.target.result
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName)
        }
      }
      request.onsuccess = function (event) {
        const db = event.target.result
        const tx = db.transaction(storeName, 'readonly')
        const store = tx.objectStore(storeName)
        const getRequest = store.get('dirHandle')
        getRequest.onsuccess = async function (event) {
          const handle = event.target.result
          if (handle) {
            await requestFilePermission(handle)
            setDirectoryHandle(handle)
          }
        }
      }
      request.onerror = function (event) {
        console.error('IndexedDB error:', event.target.error)
      }
    }
    // eslint-disable-next-line
  }, [])

  const storeDirHandleInIndexedDB = async (handle) => {
    if ('indexedDB' in window) {
      const dbName = 'exif-fixer-db'
      const storeName = 'handles'
      const request = indexedDB.open(dbName, 1)
      request.onupgradeneeded = function (event) {
        const db = event.target.result
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName)
        }
      }
      request.onsuccess = function (event) {
        const db = event.target.result
        const tx = db.transaction(storeName, 'readwrite')
        const store = tx.objectStore(storeName)
        // FileSystemHandle objects are serializable
        store.put(handle, 'dirHandle')
      }
      request.onerror = function (event) {
        console.error('IndexedDB error:', event.target.error)
      }
    }
  }

  const checkFilePermission = async (dirHandle) => {
    const existingPermission = await dirHandle.queryPermission(MODE)
    if (existingPermission === 'granted') {
      setPermissionGranted(true)
    } else {
      setPermissionGranted(false)
    }
  }

  useEffect(() => {
    if (directoryHandle) {
      checkFilePermission(directoryHandle)
    }
  }, [directoryHandle])

  const requestFilePermission = async (dirHandle) => {
    try {
      const grantedPermission = await dirHandle.requestPermission(MODE)
      if (grantedPermission === 'granted') {
        setPermissionGranted(true)
      }
    } catch (error) {
      console.error('Error requesting file permission:', error)
      setPermissionGranted(false)
    }
  }

  const showFolderSelector = async () => {
    const dirHandle = await window.showDirectoryPicker(MODE)
    await storeDirHandleInIndexedDB(dirHandle)
    setDirectoryHandle(dirHandle)
  }

  const loadImagesFromFileHandle = async (dirHandle) => {
    try {
      setIsLoading(true)

      const filePromises = []
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
          filePromises.push(entry.getFile())
        }
      }

      const allFiles = await Promise.all(filePromises)
      // Only keep files that do NOT have OffsetTimeOriginal in their EXIF
      // We'll need to check EXIF for each file, so filter asynchronously
      const allImages = allFiles.filter(file => file.type.startsWith('image/'))
      const filesWithNoOffsetTimeOriginal = []
      for (const file of allImages) {
        if (!file.type.startsWith('image/')) continue
        try {
          const exif = await exifr.parse(file, ['OffsetTimeOriginal'])
          if (!exif || !exif.OffsetTimeOriginal) {
            filesWithNoOffsetTimeOriginal.push(file)
          }
        } catch (err) {
          // If EXIF can't be read, assume no OffsetTimeOriginal
          filesWithNoOffsetTimeOriginal.push(file)
        }
      }
      const files = filesWithNoOffsetTimeOriginal

      if (files.length === 0) {
        setIsLoading(false)
        return
      }

      const imageData = await Promise.all(
        files.map(async (file) => {
          return new Promise((resolve) => {
            const reader = new FileReader()
            reader.onload = async (e) => {
              // Read EXIF data
              let exif = null
              try {
                exif = await exifr.parse(file, ['OffsetTime', 'TimeZoneOffset', "OffsetTimeOriginal", "OffsetTimeDigitized"])
                console.log("load offsets")
                console.log(exif)
              } catch (err) {
                console.log('No EXIF data found for:', file.name)
                // Set empty exif object instead of null to prevent crashes
                exif = {}
              }

              resolve({
                id: `${file.name}-${file.lastModified}`,
                name: file.name,
                size: file.size,
                type: file.type,
                lastModified: file.lastModified,
                url: e.target.result,
                file: file,
                exif: exif || {}
              })
            }
            reader.readAsDataURL(file)
          })
        })
      )

      setImages(imageData)
    } catch (err) {
      console.error('Error selecting folder:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const getImagesWithoutOffsetTime = () => {
    return images.filter(img => !img.exif?.OffsetTime)
  }

  const modifyExifData = async (file, offsetTime) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = function (e) {
        try {
          const imageData = e.target.result
          const exifObj = piexif.load(imageData)

          exifObj.Exif[piexif.ExifIFD.OffsetTime] = offsetTime // OffsetTime
          exifObj.Exif[piexif.ExifIFD.OffsetTimeOriginal] = offsetTime // OffsetTimeOriginal
          exifObj.Exif[piexif.ExifIFD.OffsetTimeDigitized] = offsetTime // OffsetTimeDigitized

          console.log(piexif.ExifIFD.OffsetTime)
          console.log(piexif.ExifIFD.OffsetTimeOriginal)
          console.log(piexif.ExifIFD.OffsetTimeDigitized)

          console.log("new Object", exifObj)
          // Convert EXIF object to string
          const exifStr = piexif.dump(exifObj)

          // Insert EXIF data into image
          let newImageData
          try {
            newImageData = piexif.insert(exifStr, imageData)
          } catch (insertError) {
            // If insertion fails, try to create a new image with EXIF
            console.log('EXIF insertion failed, creating new image with EXIF data')
            newImageData = imageData // Fallback to original if insertion fails
          }

          // Convert back to blob
          const byteString = atob(newImageData.split(',')[1])
          const mimeString = newImageData.split(',')[0].split(':')[1].split(';')[0]
          const ab = new ArrayBuffer(byteString.length)
          const ia = new Uint8Array(ab)
          for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i)
          }
          const blob = new Blob([ab], { type: mimeString })

          resolve(blob)
        } catch (error) {
          console.error('Error modifying EXIF data:', error)
          // Return the original file if EXIF modification fails
          resolve(file)
        }
      }
      reader.readAsDataURL(file)
    })
  }

  const writeFileDirectly = async (filename, blob) => {
    try {
      // Check if File System Access API is available
      if (!('showDirectoryPicker' in window)) {
        throw new Error('File System Access API not supported in this browser')
      }

      // Create or get the file handle
      const fileHandle = await dirHandle.getFileHandle(filename, { create: true })

      // Create a writable stream
      const writable = await fileHandle.createWritable()

      // Write the blob data
      await writable.write(blob)

      // Close the stream
      await writable.close()

      return true
    } catch (error) {
      console.error('Error writing file:', error)
      return false
    }
  }

  const handleImageClick = async (image) => {
    // Only process images that don't have OffsetTime
    if (image.exif?.OffsetTime) {
      return
    }

    setProcessingImages(true)

    try {
      // Check if File System Access API is available
      if (!('showDirectoryPicker' in window)) {
        throw new Error('File System Access API not supported in this browser. Please use Chrome or Edge.')
      }

      // Modify the EXIF data with -07:00 offset
      const modifiedBlob = await modifyExifData(image.file, offsetTime)

      const modifiedExif = await exifr.parse(modifiedBlob, ['OffsetTime', 'TimeZoneOffset', "OffsetTimeOriginal", "OffsetTimeDigitized"])
      console.log(modifiedExif)

      // Write directly to file system
      const success = await writeFileDirectly(image.name, modifiedBlob)

      if (!success) {
        throw new Error('Failed to write file. Please check file permissions.')
      }

      // Update the image in the state
      setImages(prev => prev.map(img =>
        img.id === image.id
          ? { ...img, exif: { ...img.exif, OffsetTime: offsetTime } }
          : img
      ))

    } catch (err) {
      console.error(`Error processing ${image.name}:`, err)
    } finally {
      setProcessingImages(false)
    }
  }

  const getExifStatus = (image) => {
    if (!image.exif) return { status: 'no-exif', text: 'No EXIF data', color: 'text-gray-400' }
    if (!image.exif.OffsetTime) return { status: 'no-offset', text: 'Missing OffsetTime', color: 'text-amber-400' }
    return { status: 'has-offset', text: `Offset: ${image.exif.OffsetTime}`, color: 'text-emerald-400' }
  }

  const formatLastModified = (timestamp) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffHours = Math.round((now - date) / (1000 * 60 * 60))

    if (diffHours < 1) return 'Just now'
    if (diffHours < 24) return `${diffHours} hours ago`
    const diffDays = Math.round(diffHours / 24)
    return `${diffDays} days ago`
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-center text-gray-100 mb-8 drop-shadow-lg tracking-wider">
          <span className="bg-gradient-to-r from-gray-100 to-gray-300 bg-clip-text text-transparent">
            EXIF OffsetTime Fixer
          </span>
        </h1>

        {/* Offset Time Input */}
        <div className="max-w-md mx-auto mb-8">
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="offsetTime" className="block text-sm font-medium text-gray-300">
              Time Zone Offset
            </label>
          </div>
          <input
            id="offsetTime"
            type="text"
            value={offsetTime}
            onChange={(e) => setOffsetTime(e.target.value)}
            placeholder="-07:00"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 text-gray-100 placeholder-gray-400"
          />
          <p className="mt-1 text-sm text-gray-400">
            Format: -07:00, +05:30, etc. • Auto-detected from your location
          </p>
        </div>

        {directoryHandle && !permissionGranted && (
          <div className="bg-gray-800/95 backdrop-blur-sm rounded-3xl p-4 md:p-8 shadow-2xl border border-gray-700 -mx-4 md:mx-0 flex flex-col items-center justify-center mb-6">
            <p className="text-gray-300 mb-4 text-center">
              Permission is required to access the folder. Please grant permission.
            </p>
            <button
              className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-4 py-2 rounded-full font-semibold transition-all duration-300 hover:scale-105 hover:shadow-lg border border-gray-600"
              onClick={async () => {
                if (directoryHandle) {
                  await requestFilePermission(directoryHandle)
                }
              }}
            >
              Grant Permission
            </button>
          </div>
        )}

        <main className="max-w-7xl mx-auto px-4 pb-8">
          {images.length === 0 ? (
            isLoading ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 border-4 border-gray-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-400">Loading images...</p>
              </div>
            ) : (
              <div className="flex justify-center items-center">
                <div className="bg-gray-800/95 backdrop-blur-sm rounded-3xl p-8 md:p-12 text-center cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-2xl border-2 border-dashed border-gray-600 hover:border-gray-500 max-w-lg w-full"
                  onClick={showFolderSelector}
                >
                  <div className="text-6xl mb-4">📁</div>
                  <h2 className="text-2xl md:text-3xl font-bold text-gray-200 mb-2">
                    Select Folder
                  </h2>
                </div>
              </div>
            )
          ) : (
            /* Gallery Section */
            <div className="bg-gray-800/95 backdrop-blur-sm rounded-3xl p-4 md:p-8 shadow-2xl border border-gray-700 -mx-4 md:mx-0">
              {/* Gallery Header */}
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4">
                <div>
                  <p className="text-gray-400">
                    {images.length} photos found that need OffsetTime fix.
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Click on photos to automatically set OffsetTime to {offsetTime}
                  </p>
                </div>
                <button
                  className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-4 py-2 rounded-full font-semibold transition-all duration-300 hover:scale-105 hover:shadow-lg border border-gray-600"
                  onClick={() => {
                    setImages([])
                  }}
                >
                  Choose Different Folder
                </button>
              </div>

              {/* Loading State */}
              {isLoading && (
                <div className="text-center py-8">
                  <div className="w-12 h-12 border-4 border-gray-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-gray-400">Loading images...</p>
                </div>
              )}

              {/* Image Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
                {images.map((image) => {
                  const exifStatus = getExifStatus(image)
                  const canProcess = !image.exif?.OffsetTime

                  return (
                    <div
                      key={image.id}
                      className={`relative group cursor-pointer transition-all duration-300 hover:scale-105 ${canProcess ? 'hover:ring-4 hover:ring-emerald-500 hover:ring-offset-2 hover:ring-offset-gray-800' : ''
                        }`}
                      onClick={() => canProcess && handleImageClick(image)}
                    >
                      <div className={`aspect-square rounded-2xl overflow-hidden bg-gray-900 shadow-lg hover:shadow-xl transition-shadow duration-300 border border-gray-700 ${canProcess ? 'cursor-pointer' : 'cursor-not-allowed opacity-75'
                        }`}>
                        <img
                          src={image.url}
                          alt={image.name}
                          loading="lazy"
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                        />
                        {/* Image Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <div className="absolute bottom-0 left-0 right-0 p-4 text-gray-100">
                            <div className="text-sm font-semibold truncate">
                              {image.name}
                            </div>
                            <div className="text-xs opacity-80">
                              {(image.size / 1024 / 1024).toFixed(1)} MB
                            </div>
                            <div className="text-xs opacity-80">
                              {formatLastModified(image.lastModified)}
                            </div>
                            <div className={`text-xs ${exifStatus.color} font-medium`}>
                              {exifStatus.text}
                            </div>
                            {canProcess && (
                              <div className="text-xs text-emerald-300 font-medium mt-1">
                                Click to set OffsetTime to {offsetTime}
                              </div>
                            )}
                          </div>
                        </div>
                        {/* EXIF Status Indicator */}
                        {exifStatus.status === 'no-offset' && (
                          <div className="absolute top-3 left-3 w-6 h-6 bg-amber-500 text-gray-900 rounded-full flex items-center justify-center text-xs font-bold shadow-lg">
                            ⚠
                          </div>
                        )}
                        {exifStatus.status === 'has-offset' && (
                          <div className="absolute top-3 left-3 w-6 h-6 bg-emerald-500 text-gray-900 rounded-full flex items-center justify-center text-xs font-bold shadow-lg">
                            ✓
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
