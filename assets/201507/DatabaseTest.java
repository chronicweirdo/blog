import org.junit.Test;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HashMap;
import java.util.Map;

public class DatabaseTest {

    @Test
    public void testDatabase() throws Exception {
        Database database = new Database();
        Path path1 = Paths.get("src/test/resources/csvdatabasetest.txt");
        database.read(path1);
        Path path2 = Paths.get("src/test/resources/csvdatabasetest2.txt");
        database.read(path2);

        Connection connection = database.getConnection();
        Statement statement = connection.createStatement();

        String selectQuery = "select * from " + database.getTableName(path1);
        ResultSet resultSet = statement.executeQuery(selectQuery);
        printResultSet(database, path1, resultSet);

        String selectQuery2 = "select * from " + database.getTableName(path2);
        ResultSet resultSet2 = statement.executeQuery(selectQuery2);
        printResultSet(database, path2, resultSet2);

        String selectQuery3 = "select * from " + database.getTableName(path1) + " join " + database.getTableName(path2)
                + " on " + database.getTableName(path1) + "." + database.getColumnNames(path1).get(0)
                + " = " + database.getTableName(path2) + "." + database.getColumnNames(path2).get(0);
        ResultSet resultSet3 = statement.executeQuery(selectQuery3);
        while (resultSet3.next()) {
            StringBuilder result = new StringBuilder();
            result.append(resultSet3.getString(database.getColumnNames(path1).get(1))).append(" ");
            result.append(resultSet3.getString(database.getColumnNames(path2).get(1))).append(" ");
            result.append(resultSet3.getString(database.getColumnNames(path2).get(2))).append(" ");
            System.out.println(result.toString());
        }

        statement.close();
        connection.close();
    }

    private void printResultSet(Database database, Path path, ResultSet resultSet) throws SQLException {
        while (resultSet.next()) {
            StringBuilder result = new StringBuilder();
            for (String column: database.getColumnNames(path)) {
                result.append(resultSet.getString(column)).append(" ");
            }
            System.out.println(result.toString());
        }
    }

}
