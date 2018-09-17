import java.io.File;
import java.io.IOException;
import java.nio.file.*;

public class FilesScanner implements Runnable {

    private String root;
    private FilesDatabase database;
    private WatchService watcher;

    public FilesScanner(FilesDatabase database, String root) {
        this.database = database;
        this.root = root;
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

    @Override
    public void run() {
        for (;;) {
            try {
                WatchKey changedKey = watcher.take();
                Path changedFolder = (Path) changedKey.watchable();

                for (WatchEvent event : changedKey.pollEvents()) {
                    WatchEvent<Path> pathEvent = (WatchEvent<Path>) event;
                    Path changedChildPath = changedFolder.resolve(pathEvent.context());
                    File changedChild = changedChildPath.toFile();

                    handleEventOnFile(event, changedChild);
                }

                boolean valid = changedKey.reset();
            } catch (InterruptedException e) {
                break;
            }
        }
    }

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

    private void addFolder(File folder) {
        database.addFolder(folder);

        Path path = folder.toPath();
        try {
            WatchKey key = path.register(watcher,
                    StandardWatchEventKinds.ENTRY_CREATE,
                    StandardWatchEventKinds.ENTRY_DELETE,
                    StandardWatchEventKinds.ENTRY_MODIFY);
        } catch (IOException e) {
            // log error
        }
    }

}
