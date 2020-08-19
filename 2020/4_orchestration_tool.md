# Orchestration Tool (rethink name)

As part of my current work I am handling the implementation and deployment of several big data pipelines. The particular challenges of our big data setup is not the amount of data
handled, but the amount of variation in our data, a large number of different projects, with the originating devices having different setups, resulting in very different labels and
data types for similar signals that we have to eventually unify and process in a uniform manner. For this purspose we have implemented configurable jobs in out pipeline, but
the large variation in source configuration results in the need to have a lot of projects, configured and deployed separately. Our pipeline jobs are implemented in 
[Apache Spark](https://spark.apache.org/)
and the data is saved in [Hadoop HDFS](https://hadoop.apache.org/) and in databases on top of HDFS, mainly [Apache Hive](http://hive.apache.org/). Our deployment cluster is a 
[Cloudera CDH](https://docs.cloudera.com/documentation/enterprise/6/release-notes/topics/rg_cdh_6_download.html) cluster, which comes with [Oozie](https://oozie.apache.org/),
a tool
made for deployment configuration that we use successfully in our setup.

But there is still a missing link in this setup. Oozie can handle the deployment and scheduling of a large number of projects and jobs, but we still have a problem with frequent
changes in our setup. Our project is constantly growing, we add new functionality to process new signals, and this results in the need to weekly change our deployment setup. This
means that we very often need to stop Oozie schedules and workflows, change their configuration and restart them. This step is not automated in the CDH cluster, and in this
article I will go over a general concepte that can be used, and we are already using successfully, to handle configuration redeployment in our cluster.

## The concept

The problem we are looking to solve is to automate an often-changing configuration for a large number of projects. The solution we are looking for is inspired from the
[declarative management of Kubernetes objects](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/declarative-config/). With Kubernetes, it is very easy to keep
the configuration of your deployments in a version control system, like Git, which reliably keeps track of the history of your deployments. Then, as changes are necessary
for your deployment, you can add those changes to your version control system and then run a simple `kubectl apply` command to make Kubernetes aware of the new deployment
configuration. After this, Kubernetes takes over and handles all the necessary changes so the deployed services are reflect the current state of the deplyment as defined
by you in the version control system. Kubernetes can compare the current deployment with the new desired state and stop, change and redeploy only the services where this is
necessary, without disrupting the operation of the other services.

This is the functinality we are looking for on our Spark cluster, we want to hold our configuration in version control, and once we have a new desired configuration, we want
to run a single command that will check the deployment status in Oozie, stop the services that need to be changed, apply the configuration changes, then restart those services.

But a tool like this can be implemented in a very generic manner. It does not have to be tightly-coupled to Oozie or a Spark cluster. Our approach was to identify the basic
characteristic such a system must have, implement them, and then link the system to our cluster with a few custom scripts. With a powerful concept, it's easy to reason about the
problem and develop a versatile solution.

The basic features of the system are:

- we have two main locations, a place where the current configuration is stored and a place where the new desired configuration is stored;
- we have a comparison tool, that can look at the two locations and identify what needs to change to bring the system to the desired configuration;
- based on the changes and the type of changes, an action list is developed: these are the necessary actions to bring the system to the desired state;
- finally, the action list is applied, and the system is brought to the desired state.

Once we have these basic features, we must look for what part of the system can be generic, and where we need to leave the possibility to plug in custom functionality that will
be tailored to our cluster but can be configured for a very different ecosystem. We have:

- plug in different ways to obtain file trees, where a file tree will consist of both the file names and a checksum value that can be used to see if file contents differ;
- a generic implementation of two file trees comparison, that results in a list of changes, with change types, like `deleted`, `modified`, `new;
- plug in way of defining the actions that must be executed on the changes list to bring the current system to the desired state.

Next, I will go over the current implementation of these features, with the plug in functionality only described for our current HDFS cluster.

## The implementation

The tool is implemented in Scala and compiled into a JDK that we can run on one of our cluster edge nodes.

Since this is a console application, the main steps that the tool executes when invoked is defined in a `Console` object:

``` scala
object Console {

  // [...]

  def main(args: Array[String]): Unit = {
    if (args.length < 2 || args.length > 3) {
      println(instructions)
      return
    }

    val source = args(0)
    val destination = args(1)
    val configuration = if (args.length == 3) args(2) else "config"

    val operations = Operation.readOperations(configuration)
    val scriptsPath = new File(configuration).getParentFile.getAbsolutePath + File.separator
    val sourceTree = new FileTree(source)
    val destinationTree = new FileTree(destination)

    val changes = sourceTree.compare(destinationTree)
    println(changes)
    changes.applyChanges(sourceTree, destinationTree, operations, scriptsPath)
    println("done")
  }
}
```

As seen above, the application performs the following steps:

- it expects two or three arguments, this is the way we can provide the location of the configuration trees, the current configurationa and the desired configuration; the third argument can be a path to a configuration file;
- from the configuration file we read a list of operations;
- we use the source (desired configuration) and destination (current configuration) paths to get the source and destination trees; these trees can be read from different file systems but are stored in a uniform internal class structure that can be easily compared;
- we compare the two trees to obtain the list of changes that need to be applied to the destination path to bring it to the same state as the source path;
- then, we apply those changes; when changes are applied, the operations list is used to plug in custom operations, as defined in a configuration file, this is where we plug in the custom functionality we need to start and stop jobs in the cluster.

### The file tree

``` scala
class FileTree(root: String) {

  private val ops: FileSystemOperations = FileSystemOperations.getFileSystemOperations(root)
  
  // [...]
}
```

The file tree class is initialized with a root path. Once we know the root path, we use it to first obtain a `FileSystemOperations` object. This is a different object depending on the file system we want to access. In our current tool, we have a file system object for a normal Windows or Linux file system, implemented using standard Java functionality to
access these kinds of file systems, and another file system object that helps us access HDFS, implemented using Java libraries for HDFS access.

``` scala
trait FileSystemOperations {

  def getInputStream(path: String): InputStream

  def write(path: String, input: InputStream)

  def getChecksum(path: String): String
  
  def getTree(path: String): Seq[Seq[String]]

  def getFileSeparator(): String
}
```

The `FileSystemOperations` interface defines methods for obtaining the input stream of a file, which allows us to read that file, another method that lets us write to a file path; these two methods being used to copy files from the desired configuration tree to the current configuration tree. We also have functionality for obtaining the checksum of a file, scanning the whole file tree of a folder, and getting the file separator for that file system.

``` scala
object LocalFileSystemOperations extends FileSystemOperations {

  override def getInputStream(path: String): InputStream = new FileInputStream(path)

  override def write(path: String, input: InputStream): Unit = {
    val output = new FileOutputStream(path)
    Iterator
      .continually (input.read)
      .takeWhile (-1 !=)
      .foreach (output.write)
    output.close()
  }

  override def getChecksum(path: String): String = {
    val in = getInputStream(path)
    val checksum = FilesystemUtils.getInputStreamChecksum(in)
    IOUtils.closeStream(in)
    checksum
  }

  private def getLocalTree(current: String, relativePath: Seq[String], withFolders: Boolean): Seq[Seq[String]] = {
    val f = new File(current)
    f.listFiles().flatMap(e => {
      val currentPath = relativePath ++ Seq(e.getName)
      if (e.isDirectory) {
        (if (withFolders) Seq(currentPath) else Seq()) ++ getLocalTree(e.getPath, currentPath, withFolders)
      } else {
        Seq(currentPath)
      }
    })
  }

  private def getLocalTree(path: String): Seq[Seq[String]] = getLocalTree(path, Seq(), false)

  override def getTree(path: String): Seq[Seq[String]] = {
    getLocalTree(path)
  }

  override def getFileSeparator(): String = File.separator
}
```

Above is the implementation of the `LocalFileSystemOperations` object which can work with local file systems, standard file systems used in Linux, Windows operating systems that can be handled out of the box by the JVM. Computing the checksum is deferred to a utility function that can read the byte content of any input stream and compute a checksum based on those bytes:

``` scala
object FilesystemUtils {

  def getInputStreamChecksum(in: InputStream) = {
    val barr = Iterator.continually(in.read).takeWhile(_ != -1).map(_.toByte).toArray
    val md: Array[Byte] = MessageDigest.getInstance("MD5").digest(barr)
    new String(Base64.getEncoder.encode(md))
  }
  
  // [...]
}
```

``` scala
object HdfsFileSystemOperations extends FileSystemOperations {

  private def getHdfs(path: String) = {
    val conf = new Configuration()
    import org.apache.hadoop.security.UserGroupInformation
    UserGroupInformation.setConfiguration(conf)
    UserGroupInformation.loginUserFromSubject(null)

    FileSystem.get(conf)
  }

  override def getInputStream(path: String): InputStream = {
    val hdfs = getHdfs(path)
    hdfs.open(new Path(path))
  }

  override def write(path: String, input: InputStream): Unit = {
    val hdfs = getHdfs(path)
    val p = new Path(path)
    if (hdfs.exists(p)) hdfs.delete(p, true)
    val output = hdfs.create(p)
    Iterator
      .continually (input.read)
      .takeWhile (-1 !=)
      .foreach (output.write)
    output.close()
  }

  override def getChecksum(path: String): String = {
    val in = getInputStream(path)
    val checksum = FilesystemUtils.getInputStreamChecksum(in)
    IOUtils.closeStream(in)
    checksum
  }

  private def getHdfsTree(fs: FileSystem, current: String, relativePath: Seq[String], withFolders: Boolean = false): Seq[Seq[String]] = {
    val fileStatus = fs.listStatus(new Path(current))
    fileStatus.flatMap(s => {
      val currentPath = relativePath ++ Seq(s.getPath.getName)
      if (s.isDirectory) {
        (if (withFolders) Seq(currentPath) else Seq()) ++ getHdfsTree(fs, s.getPath.toString, currentPath, withFolders)
      } else {
        Seq(currentPath)
      }
    })
  }

  private def getHdfsTree(uri: String): Seq[Seq[String]] = {
    val fs: FileSystem = getHdfs(uri)
    getHdfsTree(fs, uri, Seq(), false)
  }

  override def getTree(path: String): Seq[Seq[String]] = {
    getHdfsTree(path)
  }

  override def getFileSeparator(): String = "/"
}
```

With the `HdfsFileSystemOperations` we must use the `org.apache.hadoop.hadoop-client` and `org.apache.hadoop.hadoop-hdfs-client` libraries to access HDFS.

As seen in the code sequences abote, the file tree obtained from our file systems is a sequence of sequences of strings. Every file path for each file in the interest subfolder is relativized to the root path we provided, then the path elements are split and stored in a sequence of strings. We do this so we don't have to take into account different file
separators for different files systems when comparing file paths. A file tree is just a list of the paths of files in our interest folders.

``` scala
class FileTree(root: String) {

  // [...]
  
  private val tree = ops.getTree(root)
  
  // [...]
  
  def compare(other: FileTree): Seq[Change] = {
    // check which files are new: files in source that are missing in the destination
    val newFiles = tree.filter(sf => !other.tree.contains(sf)).map(f => Change("new", f))
    
    // check which files are deleted: files in destination that are missing in the source
    val deletedFiles = other.tree.filter(df => !tree.contains(df)).map(f => Change("deleted", f))
    
    // check which files have been modified: files that are in source and destination but have different checksums
    val modifiedFiles = tree.filter(sf => other.tree.contains(sf))
      .filter(f => ops.getChecksum(getFullPath(f)) != other.ops.getChecksum(other.getFullPath(f)))
      .map(f => Change("modified", f))
      
    newFiles ++ deletedFiles ++ modifiedFiles
  }
}
```

The `FileTree` class also has a method for comparing file trees. From this comparison we obtain three classes of files: new files, deleted files and modified files. These are different classes of changes, and are stored into a `Change` class, which contains a kind of change and the file that change refers to:

``` scala
case class Change(kind: String, file: Seq[String])
```

### The operations

The next part we will look over is the operations that permit us to customize a general tool for a particular use case. An operation is encoded in the following class:

``` scala
case class Operation(kind: String, file: String, when: String, script: String)
```

Each operation has a `kind`, which correspond to the kind of change that this opperation will be triggered by. We also have a file that will trigger the change, but in this particular case the value stored in the `file` field can be an exact file path, or a regex that can match on multiple files. We also have a `when` field, which will define when we want to run this operation: before the change has been applied to the destination folder, after the change has been applied to the destination folder, or at the end, after all changes have been applied to the destination folder. This granularity will allow us to control when scripts are run, and this is the way we can ensure that we have the desired environment set up before we run our scripts. Finally, the operation contains the path to a `script` that will be triggered when necessary.

Operations are defined in a simple CSV file, in the following manner:

```
(new|modified),".*\\.csv","after","D:\\orchestration\\diffscripts\\modifiedCsvScript.bat"
"new", ".*\\.txt", "end", "D:\\orchestration\\diffscripts\\addedTextScript.bat"
```

We see above two operations:

- the first one is run on CSV files only, and only when a CSV file has been added or modified to the configuration; the operation will run after the added/modified CSV file has been copied from the source folder to the destination folder; and this operation will execute the `modifiedCsvScript.bat` script;
- the second operation is run only on TXT files when a file was added to our configuration; the operation will execute the `addedTextScript.bat` script only after all the changes have been applied on the destination folder.

``` scala
object Operation {

  private def parseLine(line: String): Option[Operation] = {
    val tokens = line.split(",(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)")
    if (tokens.length == 4) {
      val t = tokens
        .map(t => t.trim)
        .map(t => if (t.startsWith("\"") && t.endsWith("\"")) t.substring(1, t.length - 1) else t)
      Some(Operation(t(0), t(1), t(2), t(3)))
    } else {
      None
    }
  }

  def readOperations(path: String): Seq[Operation] = {
    val input = FileSystemOperations.getFileSystemOperations(path).getInputStream(path)
    val lines: Seq[String] = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8)).lines().collect(Collectors.toList()).asScala.toList
    lines.map(parseLine).filter(o => o.isDefined).map(o => o.get)
  }

  implicit class OperationExtensions(operation: Operation) {
    private def mergePath(file: Seq[String]) = file.mkString("/")
    def matches(change: Change) = {
      operation.kind.r.matches(change.kind) && operation.file.r.matches(mergePath(change.file))
    }
  }
}
```

The `Operation` object parses the lines of the configuration file and extracts `Operation` class entities from each line, if possible. In the `Operation` object we also have an implicit class that adds a `matches` functionality for each operation. This method is used to extract all the changes that an operation can apply to.

### Applying the changes and operations

``` scala
object Change {
  implicit class ChangeSeqExtensions(changes: Seq[Change]) {
    private def getEnvironment(sourceTree: FileTree, destinationTree: FileTree, change: Change): Map[String, String] =
      Map(
        "DESTINATION_FILE" -> destinationTree.getFullPath(change.file),
        "DESTINATION_FOLDER" -> destinationTree.getFullPath(change.file.slice(0, change.file.length - 1))
      ) ++ (if ("(new|modified)".r.matches(change.kind))
        Map(
          "SOURCE_FILE" -> sourceTree.getFullPath(change.file),
          "SOURCE_FOLDER" -> sourceTree.getFullPath(change.file.slice(0, change.file.length - 1))
        ) else Map())

    def applyChanges(sourceTree: FileTree, destinationTree: FileTree, operations: Seq[Operation], scriptsPath: String) = {
      changes.foreach(change => {
        val environment = getEnvironment(sourceTree, destinationTree, change)
        
        val aplicableOperations = operations.filter(o => o.matches(change))
        
        val beforeOperations = aplicableOperations.filter(o => o.when == "before")
        beforeOperations.foreach(o => ScriptUtils.executeScript(scriptsPath + o.script, environment))
        
        destinationTree.write(change.file, sourceTree.read(change.file))
        
        val afterOperations = aplicableOperations.filter(o => o.when == "after")
        afterOperations.foreach(o => ScriptUtils.executeScript(scriptsPath + o.script, environment))
      })

      changes.foreach(change => {
        val environment = getEnvironment(sourceTree, destinationTree, change)
        
        val endOperations = operations.filter(o => o.matches(change)).filter(o => o.when == "end")
        endOperations.foreach(o => ScriptUtils.executeScript(scriptsPath + o.script, environment))
      })
    }
  }
}
```

The final part of our code is executing operations and applying changes. For each change, we first need to get some environment variables. These will contain the source file and folder and the destination file and folder. Not all operations will have all these paths available. The paths to destination and source are passed to the scripts which are executed by `Operation` objects.

Once we have the environment, the following steps are executed for each change:

- the aplicable operations for a change are filtered;
- the "before" operations for that change are found and executed, if there are any;
- the change is then executed - this means copying the source to the destination;
- the "after" operations for that change are found and executed, if there are any;
- after all changes have been processed, we go over the changes again and find the "end" operations for each change and execute them, if there are any.

``` scala
object ScriptUtils {

  def executeScript(scriptPath: String, environment: Map[String, String]) = {
    val builder = new ProcessBuilder()
    builder.command(scriptPath)
    environment.foreach(e => builder.environment().put(e._1, e._2))
    val process = builder.start()
    val gobbler = new StreamGobbler(process.getInputStream, println)
    val executor = Executors.newSingleThreadExecutor()
    executor.submit(gobbler)
    val exitCode = process.waitFor()
    println("script done: " + exitCode)
    
    if (executor.awaitTermination(10, TimeUnit.SECONDS)) {
      println("task completed")
    } else {
      println("forced stop")
      executor.shutdownNow()
    }
  }
  
}
```

The script itself is executed by the method shown above. We create a process, we configure the environment variables, as provided in the `environment` map, then we start the process and wait for a result. If the timeout is exceeded, we force stop the process.

The following is an example shell script that will try to stop an Oozie scheduler. the `DESTINATION_FOLDER` environment variable is used to obtain the scheduler name, afterwards the `oozie jobs` command is invoked to search for that scheduler name and obtain the coordinator ID. With the ID we can kill the Oozie coordinator:

```
COORD_NAME=`hdfs dfs -cat $DESTINATION_FOLDER/coordinator.xml | sed -n '/name/{s/.*<coordinator-app.*name="\(.*\)".*/\1/p}'`
COORD_ID=`oozie jobs -jobtype coordinator | grep $COORD_NAME.*RUNNING | sed -n 's/^\([^ \t][^ \t]*\).*/\1/p'`
oozie job -kill $COORD_ID
```

The operations CSV for our deployment is the following:

```
(new|modified|deleted),".*/coordinator\.xml","before","stop_scheduler.sh"
(new|modified),".*/coordinator\.xml","end","start_oozie_job.sh"
```

Before any "new", "modified" or "deleted" change on a "coordinator.xml" file, we stop the scheduler. After all changes have been applied, to the coordinator files and all other configuration files in the project, we can run the `start_oozie_job.sh` script that will deploy the new or modified Oozie coordinators.

## Conclusions

With the above project we have achieved what we set out to do, have a one-command declarative deployment setup for our Spark cluster. We hold the desired configuration in a git project and the real configuration in HDFS. Once we want to deploy the changes from git to our cluster, we check out the latest state of the git project and run the following command:

```
java -cp $(hadoop classpath):orchestration-assembly-0.1.jar com.cacoveanu.orchestration.Console ~/git-source-configuration/config hdfs:///deployment-configuration ~/git-source-configuration/scripts/operations
```

Our code packages in `orchestration-assembly-0.1.jar`. From this JAR, we execute the main class `Console`. The source folder, containing the desired configuration in git, is at `~/git-source-configuration/config`. The destination folder with the real, active configuration is in HDFS at `hdfs:///deployment-configuration`. Our scripts and operations are also stored in the git configuration folder under `~/git-source-configuration/scripts/operations`.

With just this command, changes between the desired and actual configuration are detected, Oozie schedulers are stopped, the changes to the configuration files are copied in HDFS and then the relevant Oozie schedulers are started. Oozie jobs that did not change are not affected. This tool greatly simplifies our deployment process on the Spark cluster.
