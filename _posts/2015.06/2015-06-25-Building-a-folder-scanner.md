---
layout: post
title:  'Building a folder scanner'
date:   2015-06-25 14:00:00
tags: ['java', 'nio']
---
I'll build a simple folder scanner using the Java 7 watch service. I want this service to constantly watch a folder for changes (in a separate thread) and, as soon as some change is detected to identify the type of change and notify a database about that change. The types of changes I'll be watching for are file and folder creation, modification and deletion.

Starting with the definition of the database interface. An implementation of this interface will handle the actions detected on the file system. For my particular implementation I am only interested in **addFile** and **removeFile** changes. Implementing this interface lets you decide what to do with this service.

<pre><code class="java">
import java.io.File;

public interface FilesDatabase {

    void addFile(File file);

    void updateFile(File file);

    void removeFile(File file);

    void addFolder(File folder);

    void updateFolder(File folder);

    void removeFolder(File folder);
}
</code></pre>

The next step is to create the scanning service itself. The service needs to know which is the root folder it should be watching and what database should it publish changes to. It will also have an internal **WatchService** that will do the actual work. The **init** method creates the **WatchService**, starts the preliminary scan and then starts the watch thread. The **scan** method is a very simple recursive method that goes over the file system tree, starting at the root folder. At each step it processes a file or folder. If it is working with a file, it will call the **addFile** method in the database. If it is working with a folder, it will call an **addFolder** method, not the one in the database, then call the **scan** method for each child file or folder.

<pre><code class="java">
public class FilesScanner implements Runnable {

	private String root;
	private FilesDatabase database;
	private WatchService watcher;

	public FilesScanner(String root, FilesDatabase database) {
		this.root = root;
		this.database = database;
	}

	public void init() {
        try {
            watcher = FileSystems.getDefault().newWatchService();
        } catch (IOException e) {
            // log error
        }

        scan(new File(root));

        new Thread(this).start();
    }

    private void scan(File file) {
        if (file.isFile()) {
            database.addFile(file);
        } else {
            addFolder(file);
            for (File child: file.listFiles()) {
                scan(child);
            }
        }
    }
</code></pre>

We need to look at the **addFolder** method that we are using in the **scan** method. We are not directly calling the **addFolder** method in the database because we need to perform an extra processing step when we discover folders and sub-folders that is specific to the scanner service. The first thing we do is send the newly discovered folder to the database, but after this we must register the folder with the **WatchService**. We can't do this once for the root folder, it doesn't work that way, we must register every sub-folder in the file system tree. To do this, we use the **register** method in the **Path** object, and we specify the event kinds we want to watch for, in our case create, delete and modify. The **register** method returns a **WatchKey** object that we could use if we wanted to cancel watching that folder. We won't need it, the only time we stop watching a folder in our case is when that folder is deleted, and in that case we just won't be able to reset the key since the object that is associated with it does not exist anymore.

<pre><code class="java">
private void addFolder(File folder) {
	database.addFolder(folder);

    Path path = folder.toPath();
    try {
		WatchKey key = path.register(watcher,
				StandardWatchEventKinds.ENTRY_CREATE,
            	StandardWatchEventKinds.ENTRY_DELETE,
            	StandardWatchEventKinds.ENTRY_MODIFY
            );
	} catch (IOException e) {
    	// log error
	}
}
</code></pre>

The last step is to handle changes as they get detected by the watch service. This is done in the *run* method (if you did not notice, our service implements **Runnable**). The method will start an infinite loop that will try call the **take** method on the **WatchService**. This method blocks the execution of the thread until a **WatchKey** containing some events can be returned. Once we have that key we need to find out in what sub-folder were changes detected. Then we can go over all watch events, find out which files or sub-folders were changed (we need to resolve their path against the changed folder path) and handle the event using **handleEventOnFile** method. The last thing we must do after we have processed the changed key is to reset it. This is crucial! If we do not reset the key, the folder corresponding to that key will no longer be watched for changes. The **reset** method returns false if the key is no longer valid, when the folder was deleted. We could do something with this information, log it or stop the service, but in the current implementation we don't. We can also see that the **take** method throws an **InterruptedException**. This is the way we can exit the infinite loop and stop watching the folder if we want.

<pre><code class="java">
public void run() {
	for (;;) {
		try {
			WatchKey changedKey = watcher.take();
			Path changedFolder = (Path) changedKey.watchable();

			for (WatchEvent event : changedKey.pollEvents()) {
				WatchEvent&lt;Path&gt; pathEvent = (WatchEvent&lt;Path&gt;) event;
				Path changedChildPath = changedFolder.resolve(pathEvent.context());
                File changedChild = changedChildPath.toFile();

                handleEventOnFile(event, changedChild);
			}

			boolean valid = changedKey.reset();
        } catch (InterruptedException e) {
            // log error
            break;
        }
	}
}
</code></pre>

As for the **handleEventOnFile** method, there is not much to say except that this method will notify the database of new events. One note, when a new sub-folder has been added we must handle it with the **addFolder** method, that way it will be registered with the watcher service.

<pre><code class="java">
private void handleEventOnFile(WatchEvent event, File changedChild) {
	if (event.kind() == StandardWatchEventKinds.ENTRY_CREATE) {
    	if (changedChild.isDirectory()) {
        	addFolder(changedChild);
        } else {
        	database.addFile(changedChild);
        }
    } else if (event.kind() == StandardWatchEventKinds.ENTRY_MODIFY) {
        if (changedChild.isDirectory()) {
            database.updateFolder(changedChild);
        } else {
            database.updateFile(changedChild);
        }
    } else if (event.kind() == StandardWatchEventKinds.ENTRY_DELETE) {
        if (changedChild.isDirectory()) {
            database.removeFolder(changedChild);
        } else {
            database.removeFile(changedChild);
        }
    }
}
</code></pre>

To use it, just create the service, passing the root folder and the database, and call the **init** method.

<pre><code class="java">
FilesScanner scanner = new FilesScanner(rootFolder, database);
scanner.init();
</code></pre>

Or an even more elegant solution, use spring to automatically inject the required parameters and trigger the **init** method.

<pre><code class="java">
@Component
public class FilesScanner implements Runnable {

    @Value("${folder.root}")
    private String root;

    @Autowired
    private FilesDatabase database;

    private WatchService watcher;

    @PostConstruct
    public void init() {
</code></pre>

Download the [FilesDatabase](/assets/2015.06/FilesDatabase.java) interface and the [FilesScanner](/assets/2015.06/FilesScanner.java).
