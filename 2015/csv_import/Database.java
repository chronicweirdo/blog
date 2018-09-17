import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class Database {

    private static final String ISO_8859_1 = "ISO-8859-1";
    private List<Path> paths = new ArrayList<>();
    private Map<String, List<String>> columnNames = new HashMap<>();

    public static String getTableName(Path path) {
        return path.getFileName().toString();
    }

    public void read(Path path) {
        read(path, ISO_8859_1);
    }

    public void read(Path path, String charsetName) {
        this.paths.add(path);
        Charset charset = Charset.forName(charsetName);
        String tableName = getTableName(path);

        try {
            List<String> lines = Files.readAllLines(path, charset);

            createTable(tableName, lines.get(0));

            for (int i = 1; i < lines.size(); i++) {
                insertRow(tableName, lines.get(i));
            }
        } catch (IOException e) {
            e.printStackTrace();
        } catch (SQLException e) {
            e.printStackTrace();
        }
    }

    private void insertRow(String tableName, String line) throws SQLException {
        String[] values = line.split(",");

        StringBuilder query = new StringBuilder();
        query.append("INSERT INTO ").append(tableName);
        query.append(" VALUES (");
        String prefix = "";
        for (String value: values) {
            query.append(prefix);
            query.append("'").append(value).append("'");
            prefix = ",";
        }
        query.append(")");

        Connection connection = getConnection();
        Statement statement = connection.createStatement();
        statement.executeUpdate(query.toString());
        statement.close();
        connection.close();
    }

    private void createTable(String tableName, String line) throws SQLException {
        String[] columnNames = line.split(",");
        this.columnNames.put(tableName, new ArrayList<>());

        StringBuilder query = new StringBuilder();
        query.append("CREATE TABLE ").append(tableName);
        query.append(" (");
        String prefix = "";
        for (String columnName: columnNames) {
            String trimmedColumnName = columnName.trim().replaceAll("\\s", "_");
            query.append(prefix);
            query.append(trimmedColumnName).append(" ").append("varchar(255)");
            prefix = ",";
            this.columnNames.get(tableName).add(trimmedColumnName);
        }
        query.append(")");

        Connection connection = getConnection();
        Statement statement = connection.createStatement();
        statement.executeUpdate(query.toString());
        statement.close();
        connection.close();
    }

    public List<String> getColumnNames(Path path) {
        return columnNames.get(getTableName(path));
    }

    public Connection getConnection() {
        Connection connection = null;
        try {
            Class.forName("org.apache.derby.jdbc.EmbeddedDriver").newInstance();
            connection = DriverManager.getConnection("jdbc:derby:memory:" + getDbName() + ";create=true");
        } catch (Exception ex) {
            ex.printStackTrace();
        }
        return connection;
    }

    private String getDbName() {
        return "csvdb";
    }

    public List<Path> getPaths() {
        return paths;
    }
}
