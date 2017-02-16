---
title: 'How to hide a file using reflection'
date: 2015-08-17 15:15:00 EET
tags: ['java nio', 'java reflection']
---

A very short piece of code today, as I get ready for some vacation time. How do you hide a file from Java? Is it even possible? Sometimes it is.

Starting with Java 7 we have the NIO (New IO) library which brings some new capabilities when accessing files, one of them being marking a file as hidden. On Linux and Unix-based systems linke OS X, hiding files is simple. Just prepend a "." to the file name. On, Windows, on the other hand, you have to access file attributes and mark files as hidden. This is an OS-specific operation and older Java versions did not provide any way of manipulating file attributes other than running native code. But now, with the NIO library, we can. We can, as long as the code runs on a Java 7 JVM.

<!--more-->

The following code will verify if we are on a Windows machine and then check what Java version is currently running. If all is well, we use reflection to load the NIO classes and manipulate the file attributes. We use reflection because we want our code to run on older versions of Java as well as new ones. If the code runs on a Java 6 or lower version, the file will not be hidden.

~~~ java
private void hideFile(File cookieFile) {
    if (System.getProperty("os.name").contains("Windows") &&
            (System.getProperty("java.version").startsWith("1.7")
                    || System.getProperty("java.version").startsWith("1.8"))) {
        try {
            // File has a new method that can return the NIO Path object
            Method m = File.class.getMethod("toPath");
            Object path = m.invoke(cookieFile);
            Class filesClass = Class.forName("java.nio.file.Files");
            // The method we will use from the Files class has variable
            // arguments; which means we will have to send it an array
            // of LinkOption objects; we are not using LinkOption, so this
            // array will be empty.
            Object linkOptionArray = Array.newInstance(
                    Class.forName("java.nio.file.LinkOption"), 0);
            Method setAttribute = filesClass.getMethod("setAttribute",
                    Class.forName("java.nio.file.Path"), String.class,
                    Object.class, linkOptionArray.getClass());
            setAttribute.invoke(null, path, "dos:hidden", true, linkOptionArray);
        } catch (NoSuchMethodException e) {
            log.warn("Unable to hide the file!", e);
        } catch (InvocationTargetException e) {
            log.warn("Unable to hide the file!", e);
        } catch (IllegalAccessException e) {
            log.warn("Unable to hide the file!", e);
        } catch (ClassNotFoundException e) {
            log.warn("Unable to hide the file!", e);
        }
    }
}
~~~
