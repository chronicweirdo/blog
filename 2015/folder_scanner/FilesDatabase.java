import java.io.File;

/**
 * Created by scacoveanu on 25/6/2015.
 */
public interface FilesDatabase {

    void addFile(File file);

    void updateFile(File file);

    void removeFile(File file);

    void addFolder(File folder);

    void updateFolder(File folder);

    void removeFolder(File folder);
}
