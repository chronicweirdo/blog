---
title: 'Scanning multiline logs with Logstash'
date: 2016-07-06 17:00:00 BST
tags: ['elasticsearch', 'logging', 'logstash', 'multiline']
---

Having good quality logs for your app will help you diagnose problems and understand what is going on a lot faster than trying to reproduce rare bugs or analyzing any possible path the program might take by reading the code. With good logs, you have the right path spelled out. Going one step further you can send those logs into a system that gives you numerous tools to investigate and aggregate log data, like using Logstash to pull data into Elasticsearch and then use Kibana to visualize it.

<!--more-->

While doing this, I ran into the problem of parsing multiline logs with Logstash, and one solution is below.

## Log sample

Below is a small excerpt from the logs. First line is a usual log line, listing a timestamp, the thread name, log level, logger, the message followed by a correlation id. The second line is an exception log, having the same structure as a usual line but followed by the stack trace on several lines below.

```
11:38:44.800 [qtp1172905021-195] INFO  com.cacoveanu.aop.Monitor - method com.cacoveanu.api.controller.DataController.data(User,String) execution took 690 milliseconds [CorrelationId=d0313c28-2121-4645-9592-216f5106638c]
11:39:24.876 [Thread-13] WARN  org.springframework.context.support.DefaultLifecycleProcessor - Failed to stop bean 'endpointMBeanExporter' []
java.lang.NoClassDefFoundError: org/springframework/context/support/DefaultLifecycleProcessor$1
	at org.springframework.context.support.DefaultLifecycleProcessor.doStop(DefaultLifecycleProcessor.java:229)
	at org.springframework.context.support.DefaultLifecycleProcessor.access$300(DefaultLifecycleProcessor.java:51)
	at org.springframework.context.support.DefaultLifecycleProcessor$LifecycleGroup.stop(DefaultLifecycleProcessor.java:363)
	at org.springframework.context.support.DefaultLifecycleProcessor.stopBeans(DefaultLifecycleProcessor.java:202)
	at org.springframework.context.support.DefaultLifecycleProcessor.onClose(DefaultLifecycleProcessor.java:118)
	at org.springframework.context.support.AbstractApplicationContext.doClose(AbstractApplicationContext.java:975)
	at org.springframework.context.support.AbstractApplicationContext$1.run(AbstractApplicationContext.java:901)
Caused by: java.lang.ClassNotFoundException: org.springframework.context.support.DefaultLifecycleProcessor$1
	at java.net.URLClassLoader$1.run(URLClassLoader.java:370)
	at java.net.URLClassLoader$1.run(URLClassLoader.java:362)
	at java.security.AccessController.doPrivileged(Native Method)
	at java.net.URLClassLoader.findClass(URLClassLoader.java:361)
	at java.lang.ClassLoader.loadClass(ClassLoader.java:424)
	at org.springframework.boot.loader.LaunchedURLClassLoader.doLoadClass(LaunchedURLClassLoader.java:178)
	at org.springframework.boot.loader.LaunchedURLClassLoader.loadClass(LaunchedURLClassLoader.java:142)
	at java.lang.ClassLoader.loadClass(ClassLoader.java:357)
	... 7 common frames omitted
Caused by: java.util.zip.ZipException: invalid block type
	at java.util.zip.InflaterInputStream.read(InflaterInputStream.java:164)
	at org.springframework.boot.loader.jar.ZipInflaterInputStream.read(ZipInflaterInputStream.java:52)
	at sun.misc.Resource.getBytes(Resource.java:124)
	at java.net.URLClassLoader.defineClass(URLClassLoader.java:462)
	at java.net.URLClassLoader.access$100(URLClassLoader.java:73)
	at java.net.URLClassLoader$1.run(URLClassLoader.java:368)
	... 14 common frames omitted
```

Logstash will treat each line in the log as a single event, but with the right configuration we can make it consider more lines a part o the same event.

## Reading the log in Logstash

First we configure the input to read multiple lines in a log file as the same log event when some condition is met.

```
input {
    file {
        path => "C:\ws\elastic\logs\dev\test.log"
        start_position => beginning
        ignore_older => 0
        codec => multiline {
          pattern => "^%{TIME}"
          negate => true
          what => "previous"
          auto_flush_interval => 1
        }
    }
}
```

The code above, explained:

- `input { file { path => "C:\ws\elastic\logs\dev\test.log"` we are reading data from a file;
- `start_position => beginning` start reading the file from the beginning;
- `ignore_older => 0` don't ignore anything;
- `codec => multiline {` use a multiline codec:
    - this will treat multiple lines as a single log entry when required (when we have multiline stack traces);
    - `pattern => "^%{TIME}"` when the line does not start with a time (pattern is negated with `negate => true`), merge line to previous entry `what => "previous"`;
    - `auto_flush_interval => 1` auto flush interval is one second, meaning that if no new line is read in one second the pattern is flushed; this will ensure the last entry in the log is read.

## Filter and output

The output is basic, but the filter is a complex Onigurama regex that can handle both the usual log message and the possible stack trace:

```
filter {
    grok {
        match => { "message" =>          "^%{TIME:time}\.(?<millis>[0-9]{1,3})\s+\[(?<thread>[^\]]+)\]\s+%{LOGLEVEL:level}\s+%{JAVACLASS:logger}\s+-\s+(?<actual_message>[^\[]+)\s+\[CorrelationId=%{UUID:correlationId}\]([\n\r]{1,2}(?<stacktrace_el>([^\n\r]+[\n\r]{1,2})*))?"
        }
    }
}
output {
    elasticsearch {}
    stdout {}
}
```

Pattern break down:

- `^%{TIME:time}` line starts with time, hour, minute and second;
- `\.(?<millis>[0-9]{1,3})` followed by a dot and milliseconds;
- `\s+\[(?<thread>[^\]]+)\]` space(s) and thread name between square brackets follows;
- `\s+%{LOGLEVEL:level}` more space(s) and the log level;
- `\s+%{JAVACLASS:logger}` spaces and the java logger class;
- `\s+-\s+(?<actual_message>[^\[]+)` a dash and the actual logging message that should not contain square brackets;
- `\s+\[CorrelationId=%{UUID:correlationId}\]` and the correlation id, a UUID printed between square brackets;
- `([\n\r]{1,2}(?<stacktrace_el>([^\n\r]+[\n\r]{1,2})*))?` may be followed by stack trace lines;
    - `[\n\r]{1,2}` meaning that a new line may follow;
    - `(?<stacktrace_el>([^\n\r]+[\n\r]{1,2})*)` and the stacktrace element pattern, which is anything except new line, followed by new line, as many times as necessary.

This setup will successfully handle stack traces in your logs. The stack trace is read as a string, but the pattern can be extended, or other filters added to break it down into individual stack trace elements if necessary.
