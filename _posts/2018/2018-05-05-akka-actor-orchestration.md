---
title: 'Akka actors orchestration'
date: 2018-05-06 09:00:00
tags: ['scala', 'spring boot', 'akka', 'actors', 'multithreading', 'big data']
---

After a deeper dive into Akka actors I felt the need to explore some of the limitations of the actor model and what strategies we can use to overcome them. One obvious problem is blocking actors, actors that perform operations that keep a thread occupied for a long time. Another problem that I did not see debated when looking at discussions online, but I did run into when buiding my solution, was memory consumption. If your actors have state, and if an actor needs to save some data into that state, and if your system works with large amounts of data, you may end up with many actors saving large amounts of data in memory as they prepare to process it. This can result in the JVM crashing because of an out of memory error. This post gives an example of the strategies I used to orchestrate my actors in a way that avoids this problem.

## The failing setup

I'll start with the initial setup where I try to make the example app fail.

We want to simulate the services first, a slow service and a big data service:

``` scala
@Service
class SlowService {

  def execute() = {
    Thread.sleep(10000)
    "result"
  }
}
```

``` scala
import scala.util.Random

case class Record(value: Double)

@Service
class BigDataService {

  def execute =
    (1 to 1000000).map(i => Record(Random.nextDouble())).toList
}
```

The first iteration of the big data service was returning a list of strings, but because of string interning in Java, my goal to fill up too much memory was evading me, so I switched to generating some wrapper objects over randm double values.

Next we'll start work on our actors. First we want an actor to load all the data for us (an actor that wraps over our service):

``` scala
object DataSourceActor {
  case class Load(id: String)
  case class LoadResult(data: List[_])
}

@Component("dataSourceActorPrototype")
@Scope("prototype")
class DataSourceActor extends Actor {

  @Autowired
  @BeanProperty
  val bigDataService: BigDataService = null

  override def receive: Receive = {
    case Load(_) => sender() ! LoadResult(bigDataService.execute)
  }
}
```

The next actor is the one doing all the work. This is a stateful actor that, when receiving a process message, it will save the sender of the message in its internal state, then send a message for the data to the data source actor. When receiving the reply with the data, it will process that data with the slow service. If we need to process large amounts of data we can expect to have a large amount of worker actors, each one operating on its own data. Once the operation is done, the initiator will be notified about the result and the worker actor will send itself a `PoisonPill` message, which is an instruction telling the actor to shut down.

``` scala
object WorkerActor {
  case class Process(id: String)
  case class ProcessResult(success: Boolean)
}

@Component("workerActorPrototype")
@Scope("prototype")
class WorkerActor extends Actor {
  import WorkerActor._

  val logger = LoggerFactory.getLogger(classOf[WorkerActor])

  @Autowired
  @Qualifier("dataSourceActor")
  @BeanProperty
  val dataSourceActor: ActorRef = null

  @Autowired
  @BeanProperty
  val slowService: SlowService = null

  var initiator: ActorRef = _
  var id: String = _

  override def receive: Receive = {
    case Process(id) => {
      logger.info(s"starting work for $id")
      this.id = id
      this.initiator = sender()
      dataSourceActor ! Load(id)
    }
    case LoadResult(data) => {
      logger.info(s"received data for $id")
      // processing this data somehow
      slowService.execute()
      initiator ! ProcessResult(true)
      self ! PoisonPill
    }
  }
}
```

The last actor we need is the master, the actor that knows about all the data that needs to be processed and creates and manages the worker actors that process part of that data. When receiving a start work message, the master actor will load the list of data items (just their IDs) that need to be processed, create a new worker actor for each data item and send a process message with the item ID to the newly created actors. The master actor also keeps a counter of all running worker actors. When the master receives a process result message, it will know a worker finished its task and will decrease the running workers counter.

``` scala
object MasterActor {
  case object StartWork
  case object Check
  case class CheckResult(@BeanProperty running: Int)
}

@Component("masterActorPrototype")
@Scope("prototype")
class MasterActor extends Actor {

  @Autowired
  @BeanProperty
  val springExtension: SpringExtension = null

  def getWorker = context.actorOf(springExtension.props(classOf[WorkerActor]))

  var running = 0

  override def receive: Receive = {
    case StartWork =>
      (1 to 100000).foreach(id => {
        getWorker ! Process(id.toString)
        running += 1
      })
    case ProcessResult(_) => running -= 1
    case Check => sender() ! CheckResult(running)
  }
}
```

The master also accepts a check message and replies with the number of currently running actors. We send this message from our controller as a way to verify the progress of the system. The controller is also responsible with trigerring the start of data processing.

``` scala
import akka.actor.ActorRef
import com.cacoveanu.akkaorchestration.MasterActor.{Check, CheckResult, StartWork}
import org.springframework.beans.factory.annotation.{Autowired, Qualifier}
import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.{RequestMapping, ResponseBody}
import akka.pattern.ask
import akka.util.Timeout

import scala.beans.BeanProperty
import scala.concurrent.Await
import scala.concurrent.duration._

@Controller
class MonitoringController {

  @Autowired
  @Qualifier("masterActor")
  @BeanProperty
  val masterActor: ActorRef = null

  @RequestMapping(Array("/start"))
  @ResponseBody
  def start() = {
    masterActor ! StartWork
    "started"
  }

  @RequestMapping(Array("/check"))
  @ResponseBody
  def check() = {
    implicit val timeout = Timeout(1 second)
    val future = masterActor ? Check
    Await.result(future, timeout.duration).asInstanceOf[CheckResult]
  }
}
```

So, how do we test this? We run the project and navigate to `localhost:8080/start` in our browser, that should start the actors up. Navigate to `localhost:8080/check` to see how many workers are still running.

So... how do we crash this? Well, it's a bit harder on a system that has a big amount of memory. The best way to go about this is to limit the memory of the JVM by setting the `-Xmx=256M` flag when running the app. If you do this, in a little while you should start seeing errors like the following:

```
Uncaught error from thread [akka-orchestration-system-akka.actor.default-dispatcher-12]: GC overhead limit exceeded, shutting down JVM since 'akka.jvm-exit-on-fatal-error' is enabled for ActorSystem[akka-orchestration-system]
java.lang.OutOfMemoryError: GC overhead limit exceeded
	at java.util.Arrays.copyOf(Arrays.java:3332)
	at java.lang.AbstractStringBuilder.ensureCapacityInternal(AbstractStringBuilder.java:124)
Uncaught error from thread [akka-orchestration-system-akka.actor.default-dispatcher-11]: GC overhead limit exceeded, shutting down JVM since 'akka.jvm-exit-on-fatal-error' is enabled for ActorSystem[akka-orchestration-system]
java.lang.OutOfMemoryError: GC overhead limit exceeded
Uncaught error from thread [akka-orchestration-system-akka.actor.default-dispatcher-4]: GC overhead limit exceeded, shutting down JVM since 'akka.jvm-exit-on-fatal-error' is enabled for ActorSystem[akka-orchestration-system]
java.lang.OutOfMemoryError: GC overhead limit exceeded
[ERROR] [SECURITY][05/05/2018 09:51:15.454] [akka-orchestration-system-akka.actor.default-dispatcher-4] [akka.actor.ActorSystemImpl(akka-orchestration-system)] Uncaught error from thread [akka-orchestration-system-akka.actor.default-dispatcher-4]: GC overhead limit exceeded, shutting down JVM since 'akka.jvm-exit-on-fatal-error' is enabled for ActorSystem[akka-orchestration-system]
java.lang.OutOfMemoryError: GC overhead limit exceeded


Process finished with exit code -1
```

Success! Why be happy about our program crashing? Because now we have detected a limitation in our software, and we get to explore that and see how we can make our software more robust. It's better to be aware of the limitations of your system than to believe everything is fine and be taken by surprise later.

## But why?

Okay, okay, but why is this failing, specifically? What is "java.lang.OutOfMemoryError: GC overhead limit exceeded"? This means that the application has run out of free memory and the garbage collector failed to free up more memory. Why is this happening? We have a large number of data items we need to process, and we want to use a stateful actor for each data item. When created, each stateful worker actor takes a small amount of memory, it only needs to store the ID of the data item it wants to process. As worker actors start to get executed, they each send messages to the data source actor to ask for the actual data. Data loading does not take a particularly long time, and the data source actor replies to the worker actors with a message containing the data. This is where the problem lies, but I'll get back to this point immediately. As the worker actors start receiving the data, they start processing it, but this is a blocking operation! Processing of data takes a bit of time (10 seconds in our example), more that it takes to load the data in the system. The number of parallel processing threads is limited by the constraints of the system. The bottom line is that `LoadResult` messages, containing the large amounts of data, start piling up in memory, one in the message queue of each worker actor that did not have a chance to start data processing yet. And this is how we end up running out of memory. Akka is very good at doling out processing time to the actors in its system, but we still need to be smart about how we use the other resources of the system.

## Dealing with blocking operations

Akka's documentation warns about the dangers of executing blocking operations inside actors, while also recognising that there are situations when this may be necessary. Their recommendation is to use a different dispatcher to run the actors that do the blocking operations. What this means is that we use a different thread pool for the blocking actors. If all threads in the blocking pool are busy computing results, or waiting for external resource responses, our system still has the default thread pool to run all the other actors, so the other operations are not blocked.

In our case, the worker actors are the ones executing the blocking operations. Now, I don't know if you've noticed, but navigating to the `/check` endpoint in our browser works just fine before we start the processing (using the `/start` endpoint). However, if you try to check the progress of your system after starting to process the data, the operation will time out. This is because there are too many blocking operations (from the worker actors) taking up the available threads and the master actor, running on the same thread pool, does not get a chance to reply to the `Check` message in time (in the 1 second threshold we defined).

Let's go ahead and fix that by moving the worker actors on a different thread pool. To do this, we need to configure the new dispatcher (and I am doing this directly in the code when creating the actor system, but you can also do this in a configuration file).

``` scala
@Bean
  def createSystem(springExtension: SpringExtension): ActorSystem = {
    val customConf = ConfigFactory.parseString(
      """
        high-load-dispatcher {
          type = Dispatcher
          executor = "thread-pool-executor"
          thread-pool-executor {
            fixed-pool-size = 4
          }
          throughput = 1
        }
      """)

    ActorSystem("akka-orchestration-system", ConfigFactory.load(customConf))
  }
```

And the next step is to make sure our worker actors use the new dispatcher when we create them inside the master actor.

``` scala
def getWorker = context.actorOf(springExtension.props(classOf[WorkerActor])
    .withDispatcher("high-load-dispatcher"))
```

If we now start everything up, we will be able to use the `/check` endpoint to see the progress of our computation. We've solved our starvation problem, but this still doesn't solve the memory problem.

__Note:__ The `Check` message will still timeout if you make the call right after starting the computation process. This is because creating one hundred thousand new actors to process the data is also a somewhat blocking operation, so the master actor is busy doing that and can't reply to the `Check` message right away. We can optimize this by outsourcing the creation process to some other actor, or running that code on a worker thread, if you really want to involve worker threads too.

Let's explore this _side tangent_ for a moment. We need to pay attention if we want to use a worker thread to wrap the code that creates the workers, as seen below.

``` scala
var running = 0

override def receive: Receive = {
    case StartWork =>
        Executors.newFixedThreadPool(1).execute(() => {
        (1 to 100000).foreach(id => {
            logger.info(s"creating worker actor $id")
            getWorker ! Process(id.toString)
            running += 1
        })
        });
        logger.info("done start work")
    case Check =>
        logger.info("checking running tasks")
        sender() ! CheckResult(running)
}
```

But there's a big problem with the above code! You have a variable, `running`, that could be simultaneously accessed by two threads, the executor thread and the thread running the master actor when the master actor receives a `Check` message. Access to that variable should be thread safe, maybe we make it atomic, but now we're just going down a path we were trying to solve when we chose the actor model to handle our multi-threaded code.

We could just update the `running` variable on the worker thread, which works, but it's not accurate because the `Check` message will report 100000 workers were started when they haven't been actually all started yet.

``` scala
override def receive: Receive = {
    case StartWork =>
      val total = 100000
      Executors.newFixedThreadPool(1).execute(() => {
        (1 to total).foreach(id => {
          logger.info(s"creating worker actor $id")
          getWorker ! Process(id.toString)
        })
      });
      running += total
      logger.info("done start work")
}
``` 

Let's rely on the actor model for this multi-threadded scenario, as we do with the rest of the code, to keep our application consistent. For this we need a new actor to start all the workers:

``` scala
@Component("workerStarterActorPrototype")
@Scope("prototype")
class WorkerStarterActor extends Actor {

  @Autowired
  @BeanProperty
  val springExtension: SpringExtension = null

  def getWorker = context.actorOf(springExtension.props(classOf[WorkerActor])
    .withDispatcher("high-load-dispatcher"))

  override def receive: Receive = {
    case StartWorkers(ids) =>
      for (id <- ids) {
        getWorker ! Process(id.toString, sender())
        sender() ! StartedWorker(id)
      }
      self ! PoisonPill
  }
}
```

The actor starts all workerts, sends updates to the master (the master started it so it is the sender), and at the end kills itself. The master only has to create this new actor and send it a message to start the worker creation process. The master can also listen to `StartedWorker` messages to update its `running` variable.

``` scala
override def receive: Receive = {
    case StartWork =>
      getWorkerStarter ! StartWorkers(1 to 100000)
      logger.info("done start work")

    case StartedWorker(_) =>
      running += 1

    [...]
```

Another small change is in the worker actor itself, where we now must route results to a listener instead of the sender of the message.

``` scala
object WorkerActor {
  case class Process(id: String, listener: ActorRef)
  case class ProcessResult(success: Boolean)
}

@Component("workerActorPrototype")
@Scope("prototype")
class WorkerActor extends Actor {
  import WorkerActor._

  [...]

  override def receive: Receive = {
    case Process(id, listener) => {
      logger.info(s"starting work for $id (${context.dispatcher})")
      this.id = id
      this.initiator = listener
      dataSourceActor ! Load(id)
    }
    [...]
  }
}
```

This will work much better. You may still get an ocasional timeout when workers are starting up, because a lot of `StartedWorker` messages are enqueued in the master's mailbox and the master desn't get to process the `Check` message in time for the 1 second timeout we set in the controller. But overall, the design is much better now.

## Solving the memory problem - limitation/orchestration

Now's the time to solve the actual problem we had when we started this whole simulation: not enough memory for the data we need to process. The issue is we don't have enough processing power to examine the data at the same rate at which we are able to load the data in memory. To resolve this issue, we need to just load the data we can process at a time in memory. We have two ways of doing this: _synchronous data load and process_ or _creating and starting a limited number of worker actors at a time_.

For the synchronous data load solution, we need to ask for the data, wait for the data and process the data as part of a single unit of work. This prevents our system from stockpiling large amounts of data it cannot process in actor mailboxes. The data is loaded, processed, abandoned and memory can then be released by the garbage collector. This is how the new process message handler looks like, one large block of code:

``` scala
override def receive: Receive = {
    case Process(id, listener) =>
      logger.info(s"starting synchronous work for $id (${context.dispatcher})")
      this.id = id
      this.initiator = listener
      implicit val timeout = Timeout(30 second)
      val future = dataSourceActor ? Load(id)
      val result = Await.result(future, timeout.duration).asInstanceOf[LoadResult]
      logger.info(s"received synchronous data for $id of size ${result.data.size}")
      // processing this data somehow
      slowService.execute()
      initiator ! ProcessResult(true)
      self ! PoisonPill
```

One potential problem with this approach is that the worker will ask for the data and wait for a predefined time for the result. It's us who define the amount of time our worker should wait for that result, so we need to have some idea of what would be a reasonable time in which to expect a result. For the whole waiting time, the thread that is running the current worker actor is blocked. If we decide to wait for the data for an infinite amount of time, and the data source actor fails to deliver that data, we will end up with a number of blocked threads, maybe all of them, and our application is in dead water.

The other approach is to limit the number of workers we start. We choose a maximum number of concurrently running worker actors and our master actor will manage (or _orchestrate_, if you will) the creation of workers in such a manner that at most that maximum number of worker actors exist at any given moment.

``` scala
@Component("masterActorPrototype")
@Scope("prototype")
class MasterActor extends Actor {

  val logger = LoggerFactory.getLogger(classOf[MasterActor])

  @Autowired
  @BeanProperty
  val springExtension: SpringExtension = null

  def getWorker = context.actorOf(springExtension.props(classOf[WorkerActor])
    .withDispatcher("high-load-dispatcher"))

  var running = 0

  val messages = mutable.Queue.empty[Process]

  val maximumConcurrentWorkers = Runtime.getRuntime.availableProcessors() / 2

  def execute() = {
    while (running < maximumConcurrentWorkers && messages.nonEmpty) {
      getWorker ! messages.dequeue()
      running += 1
    }
  }

  override def receive: Receive = {
    case StartWork =>
      for (id <- 1 to 100000) {
        messages.enqueue(Process(id.toString))
      }
      execute()
      logger.info("done start work")
    case ProcessResult(_) =>
      logger.info("finished work")
      running -= 1
      execute()
    case Check =>
      logger.info("checking running tasks")
      sender() ! CheckResult(running, messages.size)
  }
}
```

The new master actor will enqueue all `Process` messages when `StartWork` is received, and then starts a few worker actors to process the first few messaged, up to the maximum number of concurrent workers allowed. Every time a `ProcessResult` is received, the master tries to start a new worker, if there are messages in the queue. 

One advantage with this approach is that we don't need to change the worker actors at all. Another is that we can keep the worker operating in an asynchronous way. The worker will first request data from the data source. While waiting to receive the data, the worker is not blocking a thread. Once the worker receives the data it can start processing. Since we are strictly controlling the number of worker actors that are started concurrently, we are controlling the amount of data that is loaded in memory. This is a more robust and more reponsive design of our system, but is our work done?

## Fault tolerance

Well, no. We'll make a small change to our data source to illustrate what can happen if our sytem is not designed to handle failures correctly.

``` scala
@Service
class BigDataService {

  def execute: List[_] =
    if (Random.nextBoolean())
      return (1 to 1000000).map(i => Record(Random.nextDouble())).toList
    else
      throw new Exception("data access failure")
}
```

``` scala
@Component("dataSourceActorPrototype")
@Scope("prototype")
class DataSourceActor extends Actor {

  val logger = LoggerFactory.getLogger(classOf[DataSourceActor])

  override def preRestart(reason: Throwable, message: Option[Any]): Unit = {
    logger.warn(s"restarting data source actor because: ${reason.getMessage}")
  }

  @Autowired
  @BeanProperty
  val bigDataService: BigDataService = null

  override def receive: Receive = {
    case Load(_) => sender() ! LoadResult(bigDataService.execute)
  }
}
```

If, by any chance, we get an error trying to retrieve the data, our system will get blocked very quickly. On error in the `BigDataService`, the wrapping data source actor will crash and be restarted. But! the `LoadResult` message never gets sent back to the worker actor, so we'll end up with worker actors waiting indefinitely for some reply, and blocking our limited number of concurrent running workers.

The first clear approach to handle this situation would be to correctly handle exceptions in our data source actor.

``` scala
object DataSourceActor {
  case class Load(id: String)
  case class LoadResult(data: Option[List[_]])
}

@Component("dataSourceActorPrototype")
@Scope("prototype")
class DataSourceActor extends Actor {

  [...]

  def getData =
    try {
      Some(bigDataService.execute)
    } catch {
      case _: Throwable => None
    }

  override def receive: Receive = {
    case Load(_) => sender() ! LoadResult(getData)
  }
}
```

``` scala
@Component("workerActorPrototype")
@Scope("prototype")
class WorkerActor extends Actor {
  [...]

  override def receive: Receive = {
    case Process(id) =>
      logger.info(s"starting work for $id (${context.dispatcher})")
      this.id = id
      this.initiator = sender()
      dataSourceActor ! Load(id)

    case LoadResult(None) =>
      logger.info(s"no data for $id")
      initiator ! ProcessResult(false)
      self ! PoisonPill

    case LoadResult(Some(data)) =>
      logger.info(s"received data for $id")
      // processing this data somehow
      slowService.execute()
      initiator ! ProcessResult(true)
      self ! PoisonPill
  }
}
```

To handle data retrieval failures correctly, the data source actor will catch the exception and return the result as an `Option`: a `None` if data retrieval failed and a `Some` if data was successfully loaded. The worker actor also handles the two different cases, so if data retrieval fails, the worker will gracefully end and notify the master that it finished. This is probably the best approach to solve failures like these, by anticipating them. But this presuposes that we are aware of all possible failures. What if we are not? How can we prevent our system from completely locking down?

We could use a timeout, just as we would with a future, but do this at a different level, using a scheduled message. In the worker actor, when requesting the data we also schedule a new message, `Timeout`, to be sent to itself after a period of time. If the data is not received on time by the worker, because the data source actor crashed, the worker actor will receive the timeout message and end gracefully, notifying the master.

``` scala
object WorkerActor {
  case class Process(id: String)
  case class ProcessResult(success: Boolean)
  case object Timeout
}

@Component("workerActorPrototype")
@Scope("prototype")
class WorkerActor extends Actor {
  import WorkerActor._
  import context._

  val logger = LoggerFactory.getLogger(classOf[WorkerActor])

  @Autowired
  @Qualifier("dataSourceActor")
  @BeanProperty
  val dataSourceActor: ActorRef = null

  @Autowired
  @BeanProperty
  val slowService: SlowService = null

  var initiator: ActorRef = _
  var id: String = _

  override def receive: Receive = {
    case Process(id) =>
      logger.info(s"starting work for $id (${context.dispatcher})")
      this.id = id
      this.initiator = sender()
      dataSourceActor ! Load(id)
      context.system.scheduler.scheduleOnce(30 seconds, self, Timeout)

    case LoadResult(data) =>
      logger.info(s"received data for $id")
      // processing this data somehow
      slowService.execute()
      initiator ! ProcessResult(true)
      self ! PoisonPill

    case Timeout =>
      logger.info("waiting for data timed out, stopping worker")
      initiator ! ProcessResult(false)
      self ! PoisonPill
  }
}
```

What if the worker actor crashes anyway? We can use a similar strategy, based on scheduled messages, with the master actor. We can decide if the master is stuck by looking at whether the master is making any progress. If it is not, we can crash the master to force it to restart and at least we can try and start the work process again.

``` scala
object MasterActor {

  [...]

  case class SanityCheck(lastProgress: CheckResult)

}

@Component("masterActorPrototype")
@Scope("prototype")
class MasterActor extends Actor {
  import context._

  [...]

  override def receive: Receive = {
    case StartWork =>
      context.system.scheduler.scheduleOnce(2 minutes, self, SanityCheck(CheckResult(running, messages.size)))
      for (id <- 1 to 100000) {
        messages.enqueue(Process(id.toString))
      }
      execute()
      logger.info("done start work")

    [...]

    case SanityCheck(CheckResult(lastRunning, lastEnqueued)) =>
      if (lastRunning == running && lastEnqueued == messages.size) {
        logger.warn("no progress being made")
        throw new Exception("no progress being made")
      } else {
        context.system.scheduler.scheduleOnce(2 minutes, self, SanityCheck(CheckResult(running, messages.size)))
      }
  }
}
```

To simulate this, we'll crash the slow service randomly.

``` scala
@Service
class SlowService {

  def execute() = {
    if (Random.nextBoolean()) throw new Exception("processing exception")
    Thread.sleep(10000)
    "result"
  }
}
```

Or we could implement a more graceful way for the master actor to reset its state: empty the queue, send `PoisonPill` message to all its child actors. Different approaches can be explored to discover what works best for your system.

__The thing to note about all these orchestration strategies__ is that they are based on asynchronous messages, which makes them a good candidate as fault and resource management strategies in an actor system.

## Resources

- [GitHub sources for this project](https://github.com/chronicweirdo/akka-orchestration)
- [GC overhead limit exceeded](https://docs.oracle.com/javase/8/docs/technotes/guides/troubleshoot/memleaks002.html)
- [Akka blocking operations](https://doc.akka.io/docs/akka/current/dispatchers.html)

