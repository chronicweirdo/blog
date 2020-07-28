# Caching and preloading in comic books

- issues when loading images: large, some hundreds of megabytes, take a while to download over the network

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



- archiving of data when sening over the network
- caching on the client side: pre-loading pages
- caching on the server side: loading in batches and caching the batch
