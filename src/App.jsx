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
  const [selectedIds, setSelectedIds] = useState(new Set())

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
    setImages([])
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

      // Create or get the file handle
      const fileHandle = await directoryHandle.getFileHandle(filename, { create: true })

      // Create a writable stream
      const writable = await fileHandle.createWritable()

      // Write the blob data
      await writable.write(blob)

      // Close the stream
      await writable.close()

      // return true
    } catch (error) {
      console.error('Error writing file:', error)
      return false
    }
  }

  // Selection handling
  const toggleSelect = (image) => {
    if (image.exif?.OffsetTime) return
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(image.id)) next.delete(image.id)
      else next.add(image.id)
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const applyOffsetToSelected = async () => {
    if (selectedIds.size === 0) return
    try {
      // Process selected images sequentially for stability
      for (const image of images) {
        if (!selectedIds.has(image.id)) continue
        if (image.exif?.OffsetTime) continue
        try {
          const modifiedBlob = await modifyExifData(image.file, offsetTime)
          await writeFileDirectly(image.name, modifiedBlob)
        } catch (e) {
          console.error('Failed processing', image.name, e)
        }
      }
    } finally {
      clearSelection()
      loadImagesFromFileHandle(directoryHandle)
    }
  }

  const getExifStatus = (image) => {
    if (!image.exif) return { status: 'no-exif', text: 'No EXIF data', color: 'text-gray-400' }
    if (!image.exif.OffsetTime) return { status: 'no-offset', text: 'Missing OffsetTime', color: 'text-amber-400' }
    return { status: 'has-offset', text: `Offset: ${image.exif.OffsetTime}`, color: 'text-emerald-400' }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-center text-gray-100 mb-2 drop-shadow-lg tracking-wider">
          <span className="bg-gradient-to-r from-gray-100 to-gray-300 bg-clip-text text-transparent">
            EXIF OffsetTime Fixer
          </span>
        </h1>
        <div className="flex justify-center mb-6">
          <a
            href="https://github.com/hevans66/exif-offsettime-fixer/blob/main/README.md"
            className="text-xs text-blue-300 underline"
          >
            Why?
          </a>
        </div>

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
              className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-4 py-2 rounded-full font-semibold border border-gray-600"
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

        {isLoading ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 border-4 border-gray-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-400">Loading images...</p>
          </div>
        ) : (
          <main className="max-w-7xl mx-auto px-4 pb-8">
            {images.length === 0 ? (
              <div className="flex justify-center items-center">
                <div className="bg-gray-800/95 backdrop-blur-sm rounded-3xl p-8 md:p-12 text-center cursor-pointer  border-2 border-dashed border-gray-600 hover:border-gray-500 max-w-lg w-full"
                  onClick={showFolderSelector}
                >
                  <div className="text-6xl mb-4">📁</div>
                  <h2 className="text-2xl md:text-3xl font-bold text-gray-200 mb-2">
                    Select Folder
                  </h2>
                  <div className="text-gray-400 text-xs">{directoryHandle && permissionGranted && "No Images in Folder with missing OffsetTime in folder"}</div>
                </div>
              </div>
            ) : (
              /* Gallery Section */
              <div className="bg-gray-800/95 backdrop-blur-sm rounded-3xl p-4 md:p-8 shadow-2xl border border-gray-700 -mx-4 md:mx-0">
                {/* Gallery Header */}
                <div className="flex flex-col justify-between items-center mb-6 gap-4">
                  <div>
                    <p className="text-gray-400">
                      {images.length} photos found that need OffsetTime fix.
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      Click photos to select, then apply OffsetTime {offsetTime}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row justify-center gap-3 w-full">
                    <button
                      className="bg-emerald-600 text-white px-4 py-2 rounded-full font-semibold disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                      onClick={applyOffsetToSelected}
                      disabled={selectedIds.size === 0}
                      title={selectedIds.size === 0 ? 'Select images first' : 'Apply offset to selected'}
                    >
                      Apply Offset to Selected ({selectedIds.size})
                    </button>
                    <button
                      className="bg-gray-700 text-gray-200 px-4 py-2 rounded-full font-semibold border border-gray-600 w-full sm:w-auto"
                      onClick={() => {
                        showFolderSelector()
                      }}
                    >
                      Choose Different Folder
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
                  {images.map((image) => {
                    const exifStatus = getExifStatus(image)
                    const canProcess = !image.exif?.OffsetTime
                    const isSelected = selectedIds.has(image.id)

                    return (
                      <div
                        key={image.id}
                        className={`relative group`}
                        onClick={() => canProcess && toggleSelect(image)}
                      >
                        <div className={`aspect-square rounded-2xl overflow-hidden bg-gray-900 shadow-lg border border-gray-700 ${canProcess ? 'cursor-pointer' : 'cursor-not-allowed opacity-75'
                          }`}>
                          <img
                            src={image.url}
                            alt={image.name}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                          {canProcess && (
                            <div className={`absolute top-3 right-3 w-5 h-5 rounded-full border-2 ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-gray-400'} flex items-center justify-center text-[10px] font-bold text-gray-900`}>
                              {isSelected ? '✓' : ''}
                            </div>
                          )}
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
        )}
        <footer className="text-center text-gray-400 text-sm mt-8 bottom-0 inset-x-0">
          <a href="https://render.com" className="text-blue-300 hover:text-blue-200 transition">Deployed on Render</a> and <a href="https://heyoncall.com" className="text-blue-300 hover:text-blue-200 transition">Monitored with HeyOnCall</a>.
        </footer>
      </div >
    </div >
  )
}

export default App
