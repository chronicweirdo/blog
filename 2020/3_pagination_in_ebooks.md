# Pagination in ebooks

- the ebook is a different afair from comics, displaying web pages

Reading and displaying ebooks is a very different problem from displaying comic books. Just like comic book files, ebook files, specifically `epub`, are archives, so the problem of extracting data from them is similar to comic books. But the data in this case is not images but text. For `epub` it's text in HTML format. Displaying HTML in web browsers is a very simple solution, the quickest approach would be to just extract the HTML file from the ebook archive and send it to the browser for display. But the resulting experience does not resemble a book reading experience. You can't flip pages, you have to scroll through the text. Sometimes the book is split into sections, so after scrolling for many chapters, you have to 

- how much content makes it in a screen? images and tables... the only way to really know is to actually display it in the rendering browser
- steps necessary to do that with javascript - leads to accurate results (except on iphone)
- this is a costly operation; caching on the client to save expensive work 
