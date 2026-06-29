# Java Concurrency

- race conditions
	- occurs when the correctness of a computation depends on the relative timing or interleaving of multiple threads by the runtime
	- most common type of race condition is check-then-act
- reentrancy
	- intrinsic locks are reentrant
	- if a thread tries to acquire a lock that it already holds the request succeeds
	- locks are acquired on a per-thread rather than per-invocation basis
	- if the same thread acquires the lock again, the count is incremented
	- when count reaches zero again, the lock is released
- state access
	- if synchronization is used to coordinate access to a variable, it is needed everywhere that variable is accessed
	- the same lock must be used whenever that variable is accessed
	- common locking convention
		- encapsulate all mutable state within an object
		- synchronize any code path that accesses mutable state using the object's intrinsic lock
		- when a class has invariants that involve more than one variable, each variable participating in the invariant must be protected by the same lock
- Concurrency
	- process has self-contained execution environment
		- private set of basic run-time resources
		- own memory space
		- inter-process communication: pipes and sockets
		- mostly JVM runs in a single process
		- an app can create additional processes using ProcessBuilder
	- threads
		- lightweight processes
		- creating new thread requires fewer processing resources
		- share the process resources (memory, open files)
		- efficient but problematic communication
		- system threads do memory management and signal handling
		- start with one thread (from programmer's perspective) called the main thread
	- thread objects
		- control thread creation and management yourself: instantiate thread object
			- create a Runnable object (with run method) and pass it to a thread
			- or subclass thread
		- abstract thread management from the rest of the application: pass application's tasks to an executor
		- methods:
			- Thread.sleep: suspend thread execution for a specific period
				- can be used for pacing
				- sleep times not guaranteed to be precise
				- sleep periods can be terminated by interrupts
			- interrupts
				- indication that thread should stop what it's doing and do something else
				- invoking interrupt() method on the thread object
				- the thread must support it's own interruption
					- if invoking methods that throw interrupted exception, catch that exception
					- or by periodically invoking thread.interrupter() method which returns true if an interrupt has been received
				- interrupt status flag
					- Thread.interrupt sets the flag
					- Thread.interrupted clears the interrupt status
					- the nonstatic thread.isInterrupted does not clear the status
			- join
				- thread.join()
				- lets a thread wait for the completion of another thread
				- can specify a waiting period
				- dependent on the OS for timing
				- responds to interrupt by exiting with InterruptedException
	- synchronization
		- communicate by sharing access to fields and the objects
		- possible errors:
			- thread interference
			- memory consistency errors
		- _thread contention_ = two or more threads try to access the same resources simultaneously and cause java runtime to execute one or more threads more slowly or even suspend execution
			- types: _starvation_ and _livelock_
			- _thread interference_ = when two opperations running in different threads but acting on the same data interleave
				- the operation consists of multiple steps and the steps ovelap
		- _memory consistency errors_ = when two threads have inconsistent views of what should be the same data
			- key to avoiding: _happens-before_ = a guarantee that memory writes by one specific statement are visible to another specific statement
			- actions that create happens-before: thread.start and thread.join
		- synchronized methods
			- simple strategy
			- can cause liveness problems
		- intrinsic locks and synchronization
			- enforce access to an object state and create happens-before
			- every object has an intrinsic lock associated to it
			- acquire the object's intrinsic lock and release it
			- as long as a thread owns an intrinsic lock, no other thread can acquire the same lock; the other thread will block
			- classes also have intrinsic locks (acquired when synchronizing static methods)
		- synchronized statements
			- must specify the object that provides the intrinsic lock
		- reentrant synchronization
			- a thread can aquire a lock that it already has
			- reduces the possibility of a thread causing itself to block
		- atomic access
			- an atomic action happens all at once
			- side effects of an atomic action are only visible when the action is done
			- reads and writes for reference variables are atomic (all types except long and double)
			- reads and writes are atomic for all variables declared volatile (including long and double)
			- does not eliminate all need to synchronize atomic actions since memory consistency errors are still possible
			- more efficient than accessing the variables through synchronized code
	- _liveness_ = an application's ability to execute in a timely manner
		- _deadlock_ = a situation when two or more threads are blocked forever, waiting for each other
		- _starvation_ = thread unable to gain regular access to shared resources and is unable to make progress
			- when resources are made unavailable for a long time by greedy threads
		- _livelock_
		 	- if a thread acts in response to the action of another thread and the other thread's action is also a response to another thread
			- threads are unable to make progress but they are not blocked, only too busy responding to each other to resume work
	- guarded blocks
		- polling a condition that must be true before the block can proceed
		- invoke Object.wait to suspend the current thread
			- the invocation does not return until another thread has issued a notification that some event has occurred
			- can throw interrupted exception
			- when a thread invokes o.wait() it must own the intrinsic lock for o, otherwise an error is thrown
			- invoking wait inside a synchronized method is a simple way to acquire the intrinsic lock
			- when wait is invoked, the thread releases the lock and suspends execution
			- at some future time, another thread will acquire the lock and invoke object.notifyAll(), informing all threads waiting on that lock that something important has happened
			- some time after the second thread releases the lock, the first thread reacquires the lock and resumes by returning from the invocation of wait()
			- notify() wakes up a single thread (but don't know which one) - good in massively parallel applications (large number of threads all doing similar chores)
	- _immutable objects_
		- its state can't change after it is constructed
		- sound strategy for creating simple, reliable code
		- useful in concurrent applications - can't change state, can't be corrupted by thread interference
		- programmers worry about the cost of creating a new object as opposed to updating an object
		- efficiencies of immutable objects
			- decreased overhead due to garbage collection
			- elimination of code required to protect an object in case of concurrent access
		- strategy for creating immutable objects
			- no setter methods
			- all fields final and private
			- don't allow subclasses to override methods (declare class as final)
				- or make constructor private and create objects with factories
			- if instance fields contain references to mutable objects, don't allow these objects to be changed
				- don't provide methods that change their state
				- don't share references to mutable objects, if necessary create copies
	- high-level concurrency objects (introduced in version 5.0 of java)
		- lock objects
			- support locking idioms that simplify many concurrent applications
			- reentrant locks simple to use but has many limitations
			- Lock objects
				- only one thread can own a lock object at a time
				- support wait/notify mechanism (through their associated condition objects)
				- can back out of an attempt to acquire a lock (tryLock method)
		- executors
			- high-level API for launching and managing threads
			- thread-pool management suitable for large scale apps
			- executor interfaces
				- executor: an interface that supports launching new tasks
					- execute(), receives runnable
					- will likely use an existing executor thread to run r or place it in a queue to wait for a thread
				- executorService: a subinterface of executor, adds features to help manage the lifecycle of the task and the executor
					- adds submit() which accepts runnable and callable objects
					- can also submit large collections of callable objects
					- methods for managing the shutdown of the executor
						- to support immediate shutdown, tasks should handle interrupts correctly
				- scheduledExecutorService: subinterface of executor service, supports future and/or periodic execution of tasks
					- adds schedule method which executes a runnable or callable task after a specific delay
					- scheduleAtFixedRate and scheduleWithFixedDelay
			- thread pools
				- consist of worker threads
				- minimizes overhead due to thread creation (thread objects use significant ammount of memory)
				- fixed thread pool - always has a specific number of threads running
					- if a thread is terminated, it is replaced with a new one
					- tasks submitted through internal queue
					- applications using it degrade gracefully
					- use factory method: java.util.concurrent.Executors.newFixedThreadPool
						- newCachedThreadPool creates an executor with an expandable thread pool (for many short-lived tasks)
						- newSingleThreadExecutor - executes a single task at a time
			- fork/join
				- implementation of the executorService that helps you take advantage of multiple processors
				- designed for work that can be broken into smaller pieces recursively
				- goal: use all available processing power
				- ForkJoinPool
		- concurrent collections
			- greatly reduce the need for synchronization
			- BlockingQueue: FIFO structure that blocks or times out when you attempt to add to a full queue or retrieve from an empty queue
			- ConcurrentMap:
				- defines useful atomic operations
				- remove or replace a key-value pair only if a key is present
				- add key-value pair only if key is absent
				- helps avoid synchronization
				- ConcurrentHashMap
			- ConcurrentNavigableMap
				- supports approximate matches
				- ConcurrentSkipListMap (concurrent analogue of TreeMap)
		- atomic variables
			- minimize synchronization requirements and help avoid memory consistency errors
			- classes that support atomic operations on single variables
			- have get and set methods that work like reads and writes on volatile variables
			- ex: AtomicInteger: incrementAndGet, decrementAndGet
		- ThreadLocalRandom
			- efficient generation for pseudorandom numbers for multiple threads

# [Flavors of Java concurrency](https://virtualjug.com/flavors-of-java-concurrency/)

- concurrency problems:
	- shared resources
	- multiple consumers and producers
	- out of order events
	- locks and deadlocks
- models of organizing parallel computation
	- threads
	- organized threads (thread pools and executers)
	- fork-join framework
	- completeable futures + actors + fibers
	- software transactional memory (unicorn of concurrent computation)

## Threads

- simple model, represents hardware best
- thread safety: guarantee safe execution by multiple threads
	- use plain objects and fields
	- use Atomics*
	- Queues
	- Database
- require manual management
- hard to build a large system with them

## Organized threads

- executors
	- an interface that lets you define a chunk of code well separated from other code
	- have a thread pool used to run the executors
	- executors just take a task and run with it
	- completion services will also need to return a result

``` java
private static String getFirstResultExecutors(String question, List<String> engines) {
	ExecutorCompletionService<String> service = new ExecutorCompletionService<String>(Executors.newFixedThreadPool(4));

	for (String base: engines) {
		String url = base + question;
		service.submit(() -> {
			return WS.url(url).get();
		});
	}

	try {
		return service.take().get();
	} catch (InterruptedException | ExecutionException e) {
		return null;
	}
}
```

- concerns
	- queue size
	- overflow strategy
	- cancellation strategy
- "things in software are cheap only when someone else paid for them before"
- takeaway for executors:
	- simple configuration
	- bounded overhead
	- pushing complexity deeper

## Fork-join framework

- written for java 1.7
- recursive tasks
- general parallel tasks
- work stealing: workers and threads that don't do anything will be used to solve the tasks
- individual threads that compute tasks can chunk work in smaller pieces and solve tasks recursively

``` java
private static String getFirstResult(String question, List<String> engines) {
	Optional<String> result = engines.stream().parallel().map((base) -> {
		String url = base + question;
		return WS.url(url).get();
	}).findAny();
	return result.get();
}
```

- but example above is flawed because it is blocking threads (depending on how slow the internet is)
- a blocked thread is a thread some other part of the app can't use
- so don't block, use this for operations that are quick
- takeaway
	- efficient
	- precofigured
	- easy to get right
	- easy to get wrong (and make JVM performance worse)
- "Which form of concurrency do reactive Java libraries use? Executors or fork-join pools?"
	- RXJava - implementation of reactive extensions
	- usually use executers

## Completable futures

``` java
private static String getFirstResultCompletableFuture(String question, List<String> engines) {
	CompletableFuture result = CompletableFuture.anyOf(engines.stream.map( (base) -> {
		return CompletableFuture.supplyAsync(() -> {
			String url = base + question;
			return WS.url(url).get();
		});
	}).collect(Collectors.toList()).toArray(new CompletableFuture[0]));

	try {
		return (String) result.get();
	} catch (InterruptedException | ExecutionException e) {
		return null;
	}
}
```

## Actors

- very light-weight instances that can execute code
- communicate via immutable messages
- Akka library for Java and Scala

``` java
static class UrlFetcher extends UntypedActor {

	@Override
	public void onReceive(Object message) throws Exception {
		if (message instanceof Message) {
			Message work = (Message) message;
			String result = WS.url(work.url).get();
			getSender().tell(new Result(result), getSelf());
		} else {
			unhadled(message);
		}
	}
}
```

- untyped actors don't necessarily provide responses, unless you handle response message passing yourself
- typed actors may let you write code in a more natural way
- takeaway
	- OOP is about messages
	- multiplex like a boss (millions of actors)
	- supervision and fault tolerance

## Fibers

- lightweight threads
- [quasar][] library
- introduces continuations in byte code
- takes method that your want to parallelize and introduces pauses between statements
- can pass execution to another fiber if necessary during those pauses
- just add an annotation to your code
- takeaway
	- progress all over the place
	- bytecode modification
	- highly scalabe

## Software transactional memory

- allows you to treat memory state as a database
- can have multiple operations that are not visible until you complete/commit the transaction
- area of research
- frameworks:
- as long as everything succeeds everything is good
- write optimistically, avoid locking
- when something fails: either retry, or rollback
- ACI, not ACID: atomic, consistent and isolated (not durable)
- https://www.baeldung.com/java-multiverse-stm

## Recommendations

- "Seven concurrency models in seven weeks: When threads unravel" by Paul Butcher
- "The art of multiprocessor programming" by Maurice Herlihy, Nir Shavit

[quasar]: https://github.com/puniverse/quasar
