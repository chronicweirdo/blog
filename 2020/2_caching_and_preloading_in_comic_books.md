# Caching and preloading in comic books

There are two main time-consuming operations when loading comics for the UI: loading the image data from the comic archive and downloading the image data from the server to the client. Digital comic books are stored in archives under `cbz` or `cbr` extensions, corresponding to `zip` and `rar` archives. When we want to display pages from a comic book, we must first read the archive, get the files index, identify the images, order them by filename and then extract the pages we need. This is one costly operation in the comic reading process. The other costly operation is sending this image from the server to the client.  For one image, the download will not usually take a long time, but a comic mai have tens or even hundreds of pages. Depending on how fast the user reads those pages, a new page may have to be downloaded fairly often. The road the page takes from archive to user screen can be seconds long, and it would be a bad experience for the user to wait a few seconds for every new page to get displayed. This is why we must look for a a few shortcuts that can optimize the user experience.

## Caching on the server side

On the server side we load the archive from disk and extract the image files from it. The first improvement we can make is to cache the images in memory. This way, we don't have to read the archive from disk every time we need to load a page, and we don't have to extract the images from the archive, an expand operation that can some time. The backend part of the project is implemented in Scala using the [Spring Boot](https://spring.io/projects/spring-boot) framework, which gives us a very simple way to turn on caching for the whole project and enable caching on the method that loads the comic book pages:

``` scala
@SpringBootApplication
@EnableCaching
@EnableScheduling
class ReaderApplication {}
```

``` scala
@Service
class ContentService {

  // [...]
    
  @Cacheable(Array("resources"))
  def loadResources(bookId: java.lang.Long, positions: Seq[Int]): Seq[Content] = {
    bookRepository.findById(bookId).asScala match {
      case Some(book) => FileUtil.getExtension(book.path) match {

        case FileTypes.CBZ =>
          CbzUtil.readPages(book.path, Some(positions)).getOrElse(Seq())

        case FileTypes.CBR =>
          CbrUtil.readPages(book.path, Some(positions)).getOrElse(Seq())

        case _ =>
          Seq()
      }

      case None =>
        Seq()
    }
  }
  
  // [...]
 
}
```

This approach will work for most comic book files, but some files may be hundreds of megabytes, for comic books with hundreds of pages. Loading several of those files and holding them in memory will fill out a lot of space. To optimize the cache further, we can load pages from disk in batches: load the first X pages of the comic and hold them in cache, after the user read those X pages load the next batch of X pages and holde them in cache.

``` scala
@Controller
class ComicController {

  // [...]
  
  @RequestMapping(Array("/imageData"))
  @ResponseBody
  def getImageData(@RequestParam("id") id: java.lang.Long, @RequestParam("page") page: Int): String = {
    contentService
      .loadResources(id, contentService.getBatchForPosition(page))
      .find(p => p.index.isDefined && p.index.get == page)
      .map(p => WebUtil.toBase64Image(p.mediaType, p.data))
      .getOrElse("")
  }
}
```

``` scala
@Service
class ContentService {

  private val BATCH_SIZE = 20

  // [...]
  
  def getBatchForPosition(position: Int): Seq[Int] = {
    val part = position / BATCH_SIZE
    val positions = (part * BATCH_SIZE) until (part * BATCH_SIZE + BATCH_SIZE)
    positions
  }
  
  // [...]
  
}

```

As shown above, when the client asks the controller for a specific page, we first compute the batch for that page, then ask the `ContentService` to load the whole batch. If this batch was loaded before, the `ContentService` will just load the batch from cache. In practice this approach shows best results, we provide some caching on the server side without loading a whole archive in memory and holding resources occupied.

## Preloading and caching on the client side

Now that we have caching on the server side, comic pages will load faster on the client once a batch has been loaded in the server cache. However, there is still a small delay when the image for a page gets downloaded to the browser. To hide this delay, we can prelaod pages. We load the previous and next page and save it into a cache in the browser, ready to be displayed as soon as they are required. This preloading takes place while the user is reading the current page, so the time it takes to load pages is hidden except when the comic is opened up and the first page is loaded. Using the preloading will also hide loading of a page from a new batch, which will takes than loading pages from a batch that is already in the server cache.

``` js
function displayPage(page, callback) {
    var timestamp = + new Date()
    showSpinner()
    document.pageDisplayTimestamp = timestamp
    var displayPageInternalCallback = function(data) {
        if (document.pageDisplayTimestamp == timestamp) {
            hideSpinner()
            var img = getImage()
            img.onload = function() {
            
                // update page position and zoom
            
                if (callback != null) {
                    callback()
                }
                prefetch(page+1, function() {
                    prefetch(page+2, function() {
                        prefetch(page+3, function() {
                            prefetch(page-1, function() {
                                prefetch(page-2, null)
                            })
                        })
                    })
                })
            }
            img.src = data
        }
    }
    var imageData = getFromCache(page)
    if (imageData != null) {
        displayPageInternalCallback(imageData)
    } else {
        downloadImageData(page, function() {
            displayPageInternalCallback(getFromCache(page))
        })
    }
}
```

At the end of the `displayPage` method we first try to load the page from cache. If we have the image there, we invoke the `displayPageInternalCallback`. If the image is not there, we download the image from the server and then call `displayPageInternalCallback`. This second path is the one that gets executed when a comic if first loaded, and it takes longer. The `displayPageInternalCallback` will put the image data into the image element on page, then adjust the image position and zoom. At the end there is a series of prefetch method calls. We load, in succession, image data for several pages (three pages forward and two pages back), to make sure we have enough data in the cache to have smooth page to page transitions in the UI.

``` js
function prefetch(page, callback) {
    if (! cacheContains(page)) {
        downloadImageData(page, callback)
    } else {
        if (callback != null) {
            callback()
        }
    }
}

function downloadImageData(page, callback) {
    var xhttp = new XMLHttpRequest()
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200 && this.responseText.length > 0) {
            addToCache(page, this.responseText)
            if (callback != null) {
                callback()
            }
        }
    }
    xhttp.open("GET", "imageData?id=" + getComicId() + "&page=" + (page-1), true)
    xhttp.send()
}
```

The `prefetch` method does not always need to load an image from the server, if that image is already in the cache. `downloadImageData` makes an Ajax request and saves the response to the cache, with the timestamp when the image was loaded from the server.


``` js
function cacheContains(page) {
    if (document.comicPageCache && document.comicPageCache[page] && document.comicPageCache[page] != null) {
        return true
    } else {
        return false
    }
}

function addToCache(page, data) {
    if (! document.comicPageCache) document.comicPageCache = {}
    document.comicPageCache[page] = {
        "timestamp": + new Date(),
        "data": data
    }
    // evict some old data if cache is too large
    while (getCacheSize() > getMaximumCacheSize()) {
        evictOldest()
    }
}

function getMaximumCacheSize() {
    return 10
}

function getCacheSize() {
    return Object.keys(document.comicPageCache).length
}

function evictOldest() {
    if (document.comicPageCache) {
        var oldest = null
        var oldestPage = null
        for (let [key, value] of Object.entries(document.comicPageCache)) {
            if (oldest == null) {
                oldest = value.timestamp
                oldestPage = key
            } else if (value.timestamp < oldest) {
                oldest = value.timestamp
                oldestPage = key
            }
        }
        delete document.comicPageCache[oldestPage]
    }
}
```

The cache is stored in an object in the page, although this could be improved and we could store the cache in the browser local storage in the future. Every time we add something new to the cache, we also check if the chache size is exceeded and if necessary we evict the oldest pages from the cache.

## Conclusions

After implementing these two caching solutions, the loading times for comic books are very small and only noticeable when first opening a comic, an in very rare instances when moving through pages of a comic. The result is a streamlined comic reading experience, with sparse and short waiting times.
