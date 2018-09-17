import org.junit.Assert;
import org.junit.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

public class ApacheDerbyTest {

    @Test
    public void createData() throws Exception {
        Connection connection = null;
        try {
            // Class.forName("org.apache.derby.jdbc.EmbeddedDriver").newInstance();
            // jdbc:derby:[subsubprotocol:][databaseName][;attribute=value]*
            connection = DriverManager.getConnection("jdbc:derby:memory:testdb;create=true");
        } catch (Exception ex) {
            ex.printStackTrace();
            Assert.fail("Exception during database startup.");
        }
        Assert.assertNotNull(connection);

        Statement statement = connection.createStatement();

        String createQuery = "create table data (id int, name varchar(255))";
        int createCount = statement.executeUpdate(createQuery);
        Assert.assertEquals(createCount, 0);

        String insertQuery = "insert into data values (10, 'thename')";
        int insertCount = statement.executeUpdate(insertQuery);
        Assert.assertEquals(insertCount, 1);

        String selectQuery = "select * from data";
        ResultSet resultSet = statement.executeQuery(selectQuery);
        Assert.assertNotNull(resultSet);
        int resultSetRowCount = 0;
        while (resultSet.next()) {
            resultSetRowCount++;
            Assert.assertEquals(resultSet.getInt("id"), 10);
            Assert.assertEquals(resultSet.getString("name"), "thename");
        }
        Assert.assertEquals(resultSetRowCount, 1);

        statement.close();
        connection.close();
    }
}