---
title: 'Spring Boot Scala Akka project build'
date: 2018-04-09 15:00:00
tags: ['scala', 'spring boot', 'akka', 'gradle']
---

This post goes over the steps of setting up a Gradle project with Spring Boot written in Scala and using Akka actors.

## Prerequisites

Skip any that you have already installed on your system:

- install Java 8
- install Scala and sbt (Scala Build Tool)
- install Gradle
- install Intellij
- install MariaDB and run the instance

## Create new spring boot gradle project with spring initializr

Use [Spring Initializr](https://start.spring.io/) to create a new spring boot app with web dependency, using Gradle. Open your new project in Intellij (you may need to configure some stuff, like pointing it to your local Gradle location, and to the JDK).

## Implement Spring Boot controller in Scala

Once everything compiles ok, open `build.gradle` and add the Scala plugin to it.

``` groovy
apply plugin: 'scala'
```

Also add a dependency to Scala in `build.gradle` (use scala version installed on your system).

``` groovy
dependencies {
	compile('org.scala-lang:scala-library:2.12.5')
	compile('org.springframework.boot:spring-boot-starter-web')
	testCompile('org.springframework.boot:spring-boot-starter-test')
}
```

Next, convert your main class to Scala.

``` scala
package com.cacoveanu.scalademo

import org.springframework.boot.SpringApplication
import org.springframework.boot.autoconfigure.SpringBootApplication

@SpringBootApplication
class Configuration

object StartApplication {

  def main(args: Array[String]): Unit = {
    SpringApplication.run(classOf[Configuration])
  }
}
```

Because in Scala only objects can contain static methods, we need an object and a class. The object is responsible with providing the `main` method and starting up the Spring application to which we provide the configuration class. You can add `server.port = 8080` to your `application.properties` file and start the app, it should work although it does nothing becase there is no controller yet, so let's create that.

``` scala
package com.cacoveanu.scalademo

import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.{RequestMapping, ResponseBody}

@Controller
class TestController {

  @RequestMapping(Array("/test"))
  @ResponseBody
  def test(): String = {
    "This is a test, and it is working."
  }
}
```

When you now start the app and go to `localhost:8080/test`, everything should work just swell.

## Add database access

First, add required dependencies in `build.gradle`.

``` groovy
dependencies {
	...
	compile('org.springframework.boot:spring-boot-starter-data-jpa')
	compile('org.mariadb.jdbc:mariadb-java-client')
	...
}
```

We also need the database connection properties in `application.properties`.

```
spring.datasource.url=jdbc:mariadb://localhost:3306/testdb
spring.datasource.username=root
spring.datasource.password=admin
spring.datasource.driver-class-name=org.mariadb.jdbc.Driver
spring.jpa.hibernate.ddl-auto=update

spring.jpa.hibernate.naming.implicit-strategy=org.hibernate.boot.model.naming.ImplicitNamingStrategyLegacyJpaImpl
spring.jpa.hibernate.naming.physical-strategy=org.hibernate.boot.model.naming.PhysicalNamingStrategyStandardImpl
```

First group or properties define the connection to a local MariaDB. The secong group contains naming strategy properties. These naming strategy properties let us define the table and column names through annotations, instead of forcing us to use the class and field names of an entity (which is now the default for spring JPA). Also, pay attention if you are using `create-drop` for the `spring.jpa.hibernate.ddl-auto` property because that may empty your talbes when you start the application, best to use `update` if you are connecting to an existing database with strucutre and data.

Add the entity, a Scala class.

``` scala
package com.cacoveanu.scalademo

import javax.persistence._

import scala.beans.BeanProperty

@Entity
@Table(name = "testtable")
class Info {

  @Id
  @GeneratedValue
  //@Column(name = "id")
  @BeanProperty
  var id: Long = _

  //@Column(name = "info")
  @BeanProperty
  var info: String = _
}
```

Column names are not necessary in this case because they are the same as the field names, I am leaving them in so you know what you can use if you need to change them.

Add the repository, a Scala trait (kind of like an interface but not really).

``` scala
package com.cacoveanu.scalademo

import org.springframework.data.repository.CrudRepository

trait InfoRepository extends CrudRepository[Info, Long]
```

And a new method in the controller to load data from the database.

``` scala
package com.cacoveanu.scalademo

import org.springframework.beans.factory.annotation.Autowired
import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.{RequestMapping, ResponseBody}
import scala.collection.JavaConverters._

@Controller
class TestController @Autowired() (private val infoRepository: InfoRepository) {

  ...

  @RequestMapping(Array("/load"))
  @ResponseBody
  def load(): Array[Info] = {
    val data = infoRepository.findAll().asScala
    data.toArray
  }
}
```

Notice how we inject the repository dependency, the parantheses on `@Autowired()` annotation are necessary. Also notice the `JavaConverters` library import, used to change the `Iterable` returned by the repository into a Scala array. Start the project and go to `localhost:8080/load` to get all the entities you have in the DB as JSON objects.

## Integrate akka

Let's add those dependencies in the `build.gradle` file.

``` groovy
compile('com.typesafe.akka:akka-actor_2.12:2.5.11')
```

Then we create some actors, with companion classes.

``` scala
package com.cacoveanu.scalademo

import akka.actor.{Actor, ActorRef, Props}
import com.cacoveanu.scalademo.Greeter.{Greet, WhoToGreet}
import com.cacoveanu.scalademo.Printer.Greeting

object Greeter {
  final case class WhoToGreet(who: String)
  case object Greet

  def props(message: String, printerActor: ActorRef): Props = Props(new Greeter(message, printerActor))
}

class Greeter(message: String, printerActor: ActorRef) extends Actor {

  var greeting = ""

  override def receive: Receive = {
    case WhoToGreet(who) =>
      greeting = s"$message, $who"
    case Greet =>
      printerActor ! Greeting(greeting)
  }
}
```

``` scala
package com.cacoveanu.scalademo

import akka.actor.{Actor, ActorLogging, Props}
import com.cacoveanu.scalademo.Printer.Greeting

object Printer {

  def props: Props = Props[Printer]

  final case class Greeting(greeting: String)
}

class Printer extends Actor with ActorLogging {

  override def receive: Receive = {
    case Greeting(greeting) =>
      log.info(s"Greeting received (from ${sender()}): $greeting")
  }
}
```

We'll want to use a configuration class to initialize our actor system and the actors taking part in it, using Spring Boot autowiring.

``` scala
package com.cacoveanu.scalademo

import akka.actor.{ActorRef, ActorSystem}
import com.cacoveanu.scalademo.Greeter.{Greet, WhoToGreet}
import org.springframework.beans.factory.annotation.{Autowired, Qualifier}
import org.springframework.boot.context.event.ApplicationStartedEvent
import org.springframework.context.ApplicationListener
import org.springframework.context.annotation.{Bean, Configuration}
import org.springframework.stereotype.Component

@Configuration
class AkkaSystem {
  @Bean
  def createSystem() : ActorSystem = {
    ActorSystem("helloAkka")
  }

  @Bean(Array("printerActor"))
  def createPrinter(system: ActorSystem) : ActorRef = {
    system.actorOf(Printer.props, "printerActor")
  }

  @Bean(Array("howdyActor"))
  def createHowdyGreeter(system: ActorSystem, @Qualifier("printerActor") printer: ActorRef): ActorRef = {
    system.actorOf(Greeter.props("Howdy", printer))
  }

  @Bean(Array("helloActor"))
  def createHelloGreeter(system: ActorSystem, @Qualifier("printerActor") printer: ActorRef): ActorRef = {
    system.actorOf(Greeter.props("Hello", printer))
  }

  @Bean(Array("goodDayActor"))
  def createGoodDayGreeter(system: ActorSystem, @Qualifier("printerActor") printer: ActorRef): ActorRef = {
    system.actorOf(Greeter.props("G'day", printer))
  }
}
```

We also want to get some chatter going when we start the application, to see things are working.

``` scala
@Component
class AkkaSystemStarter @Autowired() (system: ActorSystem,
                                      @Qualifier("howdyActor") howdyGreeter: ActorRef,
                                      @Qualifier("helloActor") helloGreeter: ActorRef,
                                      @Qualifier("goodDayActor") goodDayGreeter: ActorRef)
  extends ApplicationListener[ApplicationStartedEvent] {

  override def onApplicationEvent(event: ApplicationStartedEvent): Unit = {
    howdyGreeter ! WhoToGreet("you")
    howdyGreeter ! Greet

    howdyGreeter ! WhoToGreet("the reader")
    howdyGreeter ! Greet

    helloGreeter ! WhoToGreet("a developer")
    helloGreeter ! Greet

    goodDayGreeter ! WhoToGreet("person intereseted in akka")
    goodDayGreeter ! Greet
  }
}
```

And we need to let Spring know about the new configuration class by updating the main configuration class.

``` scala
@SpringBootApplication
@Import(Array(classOf[AkkaSystem]))
class Configuration
```

If you run the application now, you'll see some logs with the expected messages.

```
[INFO] [04/07/2018 16:42:26.787] [helloAkka-akka.actor.default-dispatcher-6] [akka://helloAkka/user/printerActor] Greeting received (from Actor[akka://helloAkka/user/$a#451209049]): Howdy, you
[INFO] [04/07/2018 16:42:26.788] [helloAkka-akka.actor.default-dispatcher-6] [akka://helloAkka/user/printerActor] Greeting received (from Actor[akka://helloAkka/user/$a#451209049]): Howdy, the reader
[INFO] [04/07/2018 16:42:26.788] [helloAkka-akka.actor.default-dispatcher-6] [akka://helloAkka/user/printerActor] Greeting received (from Actor[akka://helloAkka/user/$b#-1093865442]): Hello, a developer
[INFO] [04/07/2018 16:42:26.788] [helloAkka-akka.actor.default-dispatcher-6] [akka://helloAkka/user/printerActor] Greeting received (from Actor[akka://helloAkka/user/$c#-1950071884]): G'day, person intereseted in akka
```

Let's also integrate our controller with the akka system. First autowire the actor we'll use in the controller.

``` scala
@Controller
class TestController @Autowired() (private val infoRepository: InfoRepository,
                                   @Qualifier("goodDayActor") private val greetingActor: ActorRef) {
```

Next create the method that will send the greeting.

``` scala
  @RequestMapping(Array("/greeting"))
  @ResponseBody
  def sendGreeting(): String = {
    greetingActor ! WhoToGreet("web api user")
    greetingActor ! Greet
    "greeting was sent"
  }
```

Start the app and navigate to `localhost:8080/greeting` and you'll see the following message in the logs:

```
[INFO] [04/07/2018 16:47:50.997] [helloAkka-akka.actor.default-dispatcher-5] [akka://helloAkka/user/printerActor] Greeting received (from Actor[akka://helloAkka/user/$c#2132999611]): G'day, web api user
```

And that's how you build a Spring Boot app with Scala and an Akka actor system running within it.

## Sources

- [Spring-boot and Scala](https://dzone.com/articles/spring-boot-and-scala)
- [Akka quickstart with Scala](https://developer.lightbend.com/guides/akka-quickstart-scala/)