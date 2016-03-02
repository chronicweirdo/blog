---
layout: post
title:  'Unchecked exceptions in Java API'
date:   2015-09-14 11:00:00
tags: ['java', 'exceptions']
---

This post is a comment on the Java checked exceptions debate. While the usefulness of checked exceptions has already been discussed in other places, I wanted to bring to attention an argument that may be made in favor of checked exceptions and a compromise that lets one avoids checked exceptions but still communicate to other developers that exceptions may occur.

One of the main reasons checked exceptions are valued in Java development is the fact that they are advertised. If you are writing an API, it's better to let the people using your API know that it could throw some exception. A checked exception will force them to think about how they want to deal with it when using your API, but will also force them to handle the exception immediately, making your API cumbersome to use, as in the example below.

~~~ java
public interface Service {
    void executeOperation() throws ServiceException;
}
~~~
~~~ java
public class ServiceException extends Exception {
}
~~~
~~~ java
public class ServiceImpl implements Service {
    @Override
    public void executeOperation() throws ServiceException {
        // do the thing
    }
}
~~~
~~~ java
// using the service:
public class ExceptionTest {
    @Test
    public void testWithException() {
        Service service = new ServiceImpl();
        try {
            service.executeOperation();
        } catch (ServiceException e) {
            // handle, log or swallow
        }
    }
}
~~~

An unchecked exception used the wrong way (not advertised) may cause problems later in development. The API user has no idea your API could throw an exception, then they are surprised when that exception arises. In the example below, we are changing our ServiceException to a RuntimeException. This means that the service implementation may throw this exception but we are not forced to declare this in the service interface. Developers that are using our API have no way of knowing that an exception may arise until they encounter this scenario in practice. Using unchecked exceptions simplifies the code that uses the API, but using them as in the example below is risky.

~~~ java
public class ServiceException extends RuntimeException {
}
~~~
~~~ java
public interface Service {
    void executeOperation();
}
~~~
~~~ java
public class UnadvertisedRuntimeExceptionTest {
    @Test
    public void testHiddenException() {
        Service service = new ServiceImpl();
        // exception may occur and surprise us
        service.executeOperation();
    }
}
~~~

There is a way to throw an unchecked exception and still advertise it in your API definitions. This seems to be the best of both worlds. Just change the service interface to declare it may throw a ServiceException:

~~~ java
public interface Service {
    void executeOperation() throws ServiceException;
}
~~~
~~~ java
public class RuntimeExceptionTest {
    @Test
    public void testWithoutException() {
        Service service = new ServiceImpl();
        service.executeOperation();
    }

    @Test
    public void testWithException() {
        Service service = new ServiceImpl();
        try {
            service.executeOperation();
        } catch (ServiceException e) {
            // handle exception
        }
    }
}
~~~

With the above implementation, you can still use the Java exception mechanism to signal errors in your programs. Advertising these exceptions in the API you are developing will let users know about them. Users won't be forced by the compiler to handle the exceptions, and some may argue that this is a problem and they will forget about them, but if they forget about handling their exceptions they didn't really care about them in the first place, so they would probably just have swallowed them. This approach will let developers using your API focus on writing code and worrying about exceptions later, just as the whole exception paradigm intended.

Read more about the [checked exception situation in this article by Bruce Eckel](http://www.mindview.net/Etc/Discussions/CheckedExceptions).
