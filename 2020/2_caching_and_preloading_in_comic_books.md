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

- archiving of data when sening over the network
- caching on the client side: pre-loading pages
- caching on the server side: loading in batches and caching the batch
