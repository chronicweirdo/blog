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
