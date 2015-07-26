---
layout: post
title:  "Import CSV to in-memory DB"
date:   2015-07-03 20:13:16
tags: java csv "apache derby"
---
This is for all those times when you need to run some quick tests on a data file in CSV format. You could open it in excel, apply some filters on those columns, but I'm talking about those times when you need to bring the data into a programming language and be able to quickly run some queries on it or convert it into objects. With the new IO from Java 7 it's already really easy to read a file, parse the lines and convert them into objects. You could also just parse the lines and write a short program that searches for the exact lines you are looking for, but now it's starting to get verbose.

So how about this: read the lines and load them to an in-memory database. You can then run SQL queries on this database or convert the data to object through some ORM framework. The CSV becomes a database and you can take advantage of all the database processing tools we have in Java.

Quick test on in-memory database
---

We need a simple way to create an in-memory database that we can read and write to using JDBC. I've used [Apache Derby](https://db.apache.org/derby/). I've started with [HSQLDB](http://hsqldb.org/) but I could not find a way to make it start in memory quick enough so I switched to Derby. This is a surface exploration of a solution, so I have not invested any time in finding out the best possible in-memory database for Java, I just need one that works so I can move on to the next step of the implementation.

First, you need to import the Derby dependencies, and for Maven at the time I am writing this post they are:

~~~ xml
<dependency>
	<groupId>org.apache.derby</groupId>
	<artifactId>derby</artifactId>
	<version>10.11.1.1</version>
</dependency>
~~~

Next, I went with a small unit test that starts the database server, creates the database, inserts some data and then reads it.

First I try to get a connection to the database. It is recommended to instantiate the Derby EmbeddedDriver class, so it is loaded in the class manager when the DriverManager is trying to get a connection to the Derby database; however it does not look like this is necessary in Java 8, that is why the line is commented out. To start an in-memory database you need to specify "memory" under the subprotocol entry in the database URL. The "create=true" attribute lets Derby know that it should create the database if it does not exist.

~~~ java
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
~~~

Once we have the connection we can create a statement and start working with the database. It is empty at first so we need to create a table. This statement will return a 0 count, so we check that with an assert. Then we insert something in our new table. A simple insert SQL query that returns a count of 1 because we are inserting one row. Finally, we load the data we just created to check it is there. A select query, returning a ResultSet. We only expect one row that contains the values we just inserted, so we check them with asserts and also the number of rows that were loaded.

~~~ java
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
~~~

The test passes, we can use Apache Derby to build our in-memory database on top of a CSV file. Download the test file [here](ApacheDerbyTest.java).

Designing a database on top of CSV
---

What we want is to be able to run queries on the file. A CSV file is a table, so we can just load is as a table in the database. We can assume the first row contains the column names. We should remember these names because they can help us build the SQL queries that retrieve data, or extract values from the rows in the fetched ResultSet. We can also assume all values are strings; or we can try to infer the value types from the file, but not today, I say. And what if we want to work with multiple CSV files? Well, we'll just create a new table for each file, then we can run complex join queries on them. This gives us the requirements of the Database object:
- create separate tables for each CSV file;
- map between file paths and table names;
- assume first row in CSV file contains column names;
- store column names for each file/table;
- provide a Connection object back to the user.

Writing the CSV database
---

I'll just focus on the main parts of the code, starting with the data we need to keep: the list of files we added to the database as Path objects and the column names for each table.

~~~ java
private List<Path> paths = new ArrayList<>();
private Map<String, List<String>> columnNames = new HashMap<>();
~~~

Processing a CSV file is done by first reading all the lines in the file. Then we use the first column to get the column names and once we have those we can create a new table for this CSV file. We also need the table name, which is obtained through a utility method called **getTableName**. This method provides the mapping between a file and its corresponding table, and we are simply using the file name as the table name. (Of course, if we have more files with the same name in different folders we've got a problem, but that's for another day.)

~~~ java
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

public static String getTableName(Path path) {
    return path.getFileName().toString();
}
~~~

The **createTable** method will split the line in tokens, the column names, and build the create table query. We do a little processing of the column name, trim the empty spaces on the exterior and replace interior spaces with underscores. We add each column to the create table query as a new varchar column (since we assume all data is string). As we add the column names to the query, we also add them to our collection of column names. Hope this runs since we have no exception handling in this implementation.

~~~ java
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
~~~

Next, the **insertRow** method takes each row in the CSV file, except the header, breaks it down and inserts it into the table as string values. We don't trim these values, maybe they are supposed to have spaces in all sorts of places. This is not very efficient right now because we open up a new connection, create a new statement and run a query for each row. To improve it we could create a single bulk insert query, or some paginated bulk query. But we'll get away with it for now, the database is stored in memory so it is fast enough. We'll improve as we extend the tool.

~~~ java
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
~~~

The last method I'll go over is **getConnection**, we've already been using this in the above code. But we already know how to do this from the Derby test above.

~~~ java
public Connection getConnection() {
    Connection connection = null;
    try {
        Class.forName("org.apache.derby.jdbc.EmbeddedDriver").newInstance();
        connection = DriverManager.getConnection("jdbc:derby:memory:"
                + getDbName() + ";create=true");
    } catch (Exception ex) {
        ex.printStackTrace();
    }
    return connection;
}

private String getDbName() {
    return "csvdb";
}
~~~

That is almost everything, but if you want to see everything, get the [file](Database.java).

Testing the CSV database
---

Let's see if this works, I'll write another [test](DatabaseTest.java) to verify the Database class, using files [csvdatabasetest.txt](csvdatabasetest.txt) and [csvdatabasetest2.txt](csvdatabasetest2.txt), that does the following:
- read the two files in a new Database object;
- run queries to load and print data in each of the tables (use Database methods to map the file path to a table name and to get the name of the columns of each table);
- run a complex join query on the two tables in the database and print the results.

~~~ java
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

    String selectQuery3 = "select * from " + database.getTableName(path1)
            + " join " + database.getTableName(path2)
            + " on " + database.getTableName(path1)
            + "." + database.getColumnNames(path1).get(0)
            + " = " + database.getTableName(path2)
            + "." + database.getColumnNames(path2).get(0);
    ResultSet resultSet3 = statement.executeQuery(selectQuery3);
    while (resultSet3.next()) {
        StringBuilder result = new StringBuilder();
        result.append(resultSet3.getString(
                database.getColumnNames(path1).get(1))).append(" ");
        result.append(resultSet3.getString(
                database.getColumnNames(path2).get(1))).append(" ");
        result.append(resultSet3.getString(
                database.getColumnNames(path2).get(2))).append(" ");
        System.out.println(result.toString());
    }

    statement.close();
    connection.close();
}

private void printResultSet(Database database, Path path,
        ResultSet resultSet) throws SQLException {
    while (resultSet.next()) {
        StringBuilder result = new StringBuilder();
        for (String column: database.getColumnNames(path)) {
            result.append(resultSet.getString(column)).append(" ");
        }
        System.out.println(result.toString());
    }
}
~~~

I run, it works - there! A neat little tool!
