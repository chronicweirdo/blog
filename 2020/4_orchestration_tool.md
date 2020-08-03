# Orchestration Tool (rethink name)

Part of my current work I am handling the implementation and deployment of several big data pipelines. The particular challenges of our big data setup is not the amount of data
handled, but the aount of variation in our data, a large number of different projects, with the originating devices having different setups, resulting in very different labels and
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
