---
layout: post
title:  'Interrupt server operations through Spring Remoting'
date:   2015-09-19 12:30:00
tags: ['java', 'spring remoting', 'java concurrency', 'jetty']
---

Spring Remoting is a wonderful tool for seamlessly connecting Java services. However, ocasionally I have run into some inelegant practices when managing expensive tasks run through remoting. The premise is you have a service that runs a complex, expensive operation. The user starts an operation on the client but after waiting for the result, they decide to cancel that operation. If starting an operation blocks the UI with a modal loading screen, it's a good idea to allow users to cancel the operation and continue using your application. Blocking the UI is not a very user-friendly practice, but if it must be done, a cancel option is necessary. This practice becomes a problem when the cancel action only affects the UI. Clicking cancel, the call to the server is abandoned and the UI is unblocked. But if we just cancel the operation on the UI, the server will continue to execute the complex operation and eventually send some answer back. Unfortunately this strategy will waste server resources. Once a task is canceled on the UI, the work a server does for that task is wasted time, memory, processing power. As a compromise solution I have seen client code designed so as to limit how many calls a user can make to the server at a time, or how many calls they are allowed to cancel. Both approaches will eventually break if stressed by a user, and fall back to blocking the UI, and this time without a cancel option. The healthy solution is obvious: cancel the task on the server, not on the UI. But for this we need a mechanism to cancel an operation, made available through Spring Remoting.

<!--more-->

A basic spring remoting setup
---

First we must create a Spring Remoting setup. We need a service interface and an implementation. The initial service will just have a test method that we will use to confirm that remoting is working.

~~~ java
public interface ComplexOperationService {
    String sayHello(String name);
}
~~~

~~~ java
@Component
public class ComplexOperationServiceImpl implements ComplexOperationService {
    @Override
    public String sayHello(String name) {
        return "Hello, " + name + "!";
    }
}
~~~

Then we need to publish this service on a server, using Spring HTTP Remoting. I'm using annotation-based initialization of the application context, no configuration files, all is done in Java code.

I am creating a service exporter, which extends the HttpInvokerServiceExporter class. The service instance is autowired into the exporter. We run the init method after our exporter is initialized, and we set the service interface class and the service instance.

~~~ java
@Component("/ComplexService")
public class ComplexOperationServiceExporter extends HttpInvokerServiceExporter {

    @Autowired
    private ComplexOperationService complexOperationService;

    public void setComplexOperationService(ComplexOperationService complexOperationService) {
        this.complexOperationService = complexOperationService;
    }

    @PostConstruct
    public void init() {
        this.setService(complexOperationService);
        this.setServiceInterface(ComplexOperationService.class);
        System.out.println("finished initializing service exporter");
    }
}
~~~

The code above is the equivalent of the standard XML initialization code:

~~~ xml
<bean name="/ComplexService"
      class="org.springframework.remoting.httpinvoker.HttpInvokerServiceExporter"
      lazy-init="false">
    <property name="service" ref="complexOperationService" />
    <property name="serviceInterface"
              value="com.cacoveanu.makeitso.remoting.ComplexService" />
</bean>
~~~

The next step is to create a server (I am using Jetty) and publish our service through Spring HTTP remoting. We first create the spring context, an annotation-based context which scans the package containing the service implementation and the service exporter. We then create a DispatcherServlet over the spring context. We add the DispatcherServlet to a Jetty ServletContextHandler, define the root path for that handler and inject the handler into our server. It's starting to sound like a cooking recipe, but it's just boilerplate code to get our server up and running with the appropriate servlet and context without using XML files. Here's the code:

~~~ java
public class RemotingServerTest {

    @Test
    public void startServer() throws Exception {
        Server server = new Server(8087);
        server.setHandler(getServletContextHandler(getContext()));
        server.start();
        server.join();
    }

    private ServletContextHandler getServletContextHandler(WebApplicationContext context)
            throws IOException {
        ServletContextHandler contextHandler = new ServletContextHandler();
        contextHandler.setErrorHandler(null);
        contextHandler.setContextPath("/");
        contextHandler.addServlet(new ServletHolder(new DispatcherServlet(context)), "/*");
        contextHandler.addEventListener(new ContextLoaderListener(context));
        contextHandler.setResourceBase(new ClassPathResource("").getURI().toString());
        return contextHandler;
    }

    private WebApplicationContext getContext() {
        AnnotationConfigWebApplicationContext context = new AnnotationConfigWebApplicationContext();
        context.setConfigLocation("com.cacoveanu.makeitso.remoting");
        context.getEnvironment().setDefaultProfiles("dev");
        return context;
    }
}
~~~

Running the test will start the server. The server will wait to service any requests you send its way until you stop it. To send requests, we need to write our client code. I've set this up, again, without using any XML files. We create a HttpInvokerProxyFactoryBean, add the URL where our service is published and the service interface. We also need to call the afterPropertiesSet, which will trigger the initialization of the service. If we don't do this, the getObject method will return null. The getObject method is responsible with returning a service instance (actually a proxy) that we can use like we would a local service. Running the test below will print the response from the service on the server. Before running, make sure that RemotingServerTest is running and the server is started.

~~~ java
public class RemotingClientTest {

    private static final String SERVICE_URL = "http://localhost:8087/ComplexService";

    @Test
    public void testSayHelloProgramatic() throws Exception {
        HttpInvokerProxyFactoryBean proxyFactoryBean = new HttpInvokerProxyFactoryBean();
        proxyFactoryBean.setServiceUrl(SERVICE_URL);
        proxyFactoryBean.setServiceInterface(ComplexOperationService.class);
        proxyFactoryBean.afterPropertiesSet();

        ComplexOperationService complexOperationService =
            (ComplexOperationService) proxyFactoryBean.getObject();
        String hello = complexOperationService.sayHello("John");
        Assert.assertNotNull(hello);
        System.out.println("sayHello: " + hello);
    }
}
~~~

For reference, I am adding the XML definition of the proxy factory bean. Notice there is no mention of the afterPropertiesSet method, so it can be easily forgotten when moving from XML to programatic context declaration.

~~~ xml
<bean id="httpRemotingHelloService"
      class="org.springframework.remoting.httpinvoker.HttpInvokerProxyFactoryBean">
    <property name="serviceUrl"
              value="http://localhost:8087/HelloService">
    </property>
    <property name="serviceInterface"
              value="com.cacoveanu.makeitso.remoting.ComplexOperationService">
    </property>
</bean>
~~~

Introducting interrupt checks in the service
---

How can a complex operation be canceled in Java? If we want to stop it in the middle of its progress, we can send an interrupt to the thread running the operation. But for this to work, we must make sure the code executing the operation is occasionally checking to see if an interrupt was sent. In other words, it takes an effort on the developer side to prepare their code for a cancel operation. We'll have to design the code with periodic interrupt checks.

We add two new methods to the service interface, one to start the complex operation and another to cancel it.

~~~ java
public interface ComplexOperationService {
    String sayHello(String name);
    Long complexOperation(Long split) throws InterruptedException;
    void cancelComplexOperation();
}
~~~

When implementing the complex operation, we also implement cancel functionality. In this example, the operation is just a very large loop that saves the current time in a thread-safe variable. We start the operation by creating a separate thread, a worker-thread, to execute the task. We save the thread in a variable, we need it to know where to send the interrupt request later, if necessary. We then start the thread and wait for its execution to finish. Inside the runnable, we run a loop for a number of cycles. In each iteration of the loop we update the operation result with the current time. Next, we check if an interrupt was sent to the current thread. If we find an interrupt, we know it is time to stop executing the operation and return a partial result.

The cancel operation is very simple, we just send an interrupt request to the thread in which the complex operation is running.

~~~ java
@Component
public class ComplexOperationServiceImpl implements ComplexOperationService {

    private Thread thread;

    @Override
    public Long complexOperation(Long split) throws InterruptedException {
        final long cycles = (split == 0) ? Long.MAX_VALUE : (Long.MAX_VALUE / split);
        final AtomicLong result = new AtomicLong();

        thread = new Thread(new Runnable() {
            @Override
            public void run() {
                boolean interrupted = false;
                long startTime = System.currentTimeMillis();
                result.set(startTime);

                for (long i = 0; i < cycles; i++) {
                    result.set(System.currentTimeMillis());
                    if (Thread.interrupted()) {
                        interrupted = true;
                        break;
                    }
                }

                long time = result.longValue() - startTime;
                if (interrupted) {
                    System.out.println("interrupted after " + time + " ms");
                } else {
                    System.out.println("operation finished successfully after " + time + " ms");
                }
            }
        });
        thread.start();
        thread.join();

        return result.longValue();
    }

    @Override
    public void cancelComplexOperation() {
        thread.interrupt();
    }

    @Override
    public String sayHello(String name) {
        return "Hello, " + name + "!";
    }
}
~~~

Sending interrupt checks through Spring Remoting
---

Now that we have a time-consuming cancellable operation implemented on the server, we can write a test client to place a call to the server, starting the complex operation, wait a while, then cancel the operation. When the operation is canceled on the client, the server should return a partial result.

The test client code is split into three parts. The first part obtains a proxy to the service. The second part defines a separate worker thread that will make the call to the server. This thread just calls the complexOperation method on the server and prints the result. The third part simulates user interaction with a client. First, we start the thread, the equivalent of a user starting a complex operation through a client application. The call to the server is made and the user may see a loading screen. Then they wait for a while - the sleep method. After about five seconds, in this example, the user decides to stop waiting for a result and they click a cancel button somewhere in the UI which triggers a second call to the server, to the cancel service method. The server complies and immediately returns a partial result which the client prints to the user. Multiple threads on the client orchestrating multiple threads on the server, making for a beautiful concept test.

~~~ java
@Test
public void testCancelComplexOperation() throws Exception {
    HttpInvokerProxyFactoryBean proxyFactoryBean = new HttpInvokerProxyFactoryBean();
    proxyFactoryBean.setServiceUrl(SERVICE_URL);
    proxyFactoryBean.setServiceInterface(ComplexOperationService.class);
    proxyFactoryBean.afterPropertiesSet();
    ComplexOperationService complexOperationService =
        (ComplexOperationService) proxyFactoryBean.getObject();

    Thread operationCallThread = new Thread(new Runnable() {
        @Override
        public void run() {
            try {
                Long result = complexOperationService.complexOperation(0L);
                System.out.println("remote complex operation result = " + result);
            } catch (InterruptedException e) {
                System.out.println("remote complex operation was canceled");
            }
        }
    });

    operationCallThread.start();
    Thread.sleep(5000);
    complexOperationService.cancelComplexOperation();
    operationCallThread.join();
}
~~~

More work has to be put into this idea to end up with a final server-client interaction framework. We can extend this by providing a mechanism for creating a worker thread for each operation and returning an identifier for that thread. The identifier can be used with the cancel operation or with a polling call that periodically checks if we have an answer. Or implement a task queue to help with starting, stopping, polling tasks on the server. There are many directions to go from here, and each one requires work, but it is worth investing development time in a well thought-out client-server interaction strategy that will allow your application to perform well as its code base grows.

You can look at and download the example files:

- [the service interface](/assets/2015.09/ComplexOperationService.java);
- [the service implementation](/assets/2015.09/ComplexOperationServiceImpl.java);
- [the service exporter](/assets/2015.09/ComplexOperationServiceExporter.java);
- [start the server with the server test](/assets/2015.09/RemotingServerTest.java);
- [start and cancel a complex operation with the client test](/assets/2015.09/RemotingClientTest.java).
