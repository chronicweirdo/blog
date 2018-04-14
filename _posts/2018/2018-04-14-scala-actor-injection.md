---
title: 'Spring injection with Akka actors, the Scala version'
date: 2018-04-14 10:00:00
tags: ['scala', 'spring boot', 'akka', 'dependency injection']
---

The actor paradigm is useful in building and scaling a highly-parallelized application, but it makes sense to move the actual code that does the heavy computation outside the actors, in some auxiliary services. In addition, actors need to get access to outside resources, like database connections and API connections. You could just provide all those services and connections to each actor type when creating it. Or you could use some framework that provides dependency injection, like Spring, to just declare what your actor dependencies are and stop worrying about propagating them down the actor hierarchy through the `props` factory. 

## Injecting dependencies into an actor

To be able to inject Spring dependencies into our actors we'll have Akka use a special "producer" when creating them. This producer will load the new actors out of the Spring context.

``` scala
package com.cacoveanu.scalademo

import akka.actor.{Actor, IndirectActorProducer}
import org.springframework.context.ApplicationContext

class SpringActorProducer(private val applicationContext: ApplicationContext,
                          private val actorBeanName: String) extends IndirectActorProducer {

  override def produce(): Actor = applicationContext.getBean(actorBeanName).asInstanceOf[Actor]

  override def actorClass: Class[_ <: Actor] = classOf[Actor]
}
```

A new producer will be used for each new actor type we add to the system. We use a spring extension class to call the props factory and create a new actor in the actor system, but we provide our actor producer to the props factory. This way, the props factory will call the `produce` method in our producer when it wants to create a new actor, and the `produce` method will grab the actor from the Spring context, which means that dependencies inside the actor will be autowired.

``` scala
package com.cacoveanu.scalademo

import akka.actor.{Extension, Props}
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.context.ApplicationContext
import org.springframework.stereotype.Component

import scala.beans.BeanProperty

@Component
class SpringExtension extends Extension {

  @Autowired @BeanProperty val applicationContext: ApplicationContext = null

  def props(actorBeanName: String): Props =
    Props.create(classOf[SpringActorProducer], applicationContext, actorBeanName)
}
```

We'll need a test service in our Spring context.

``` scala
package com.cacoveanu.scalademo

import org.springframework.stereotype.Component

@Component
class TestService {

  def testItWorks(message: String) = println(message)

}
```

And a test actor that uses the service. What's important in the actor definition is that it gets inserted in the Spring context as a `@Component` and it gets scoped as `@Scope("prototype")`. The `protorype` means that everytime the producer will ask the spring context for a `TestInjectionActor`, Spring will create a new instance of that class and inject dependencies on it.

``` scala
package com.cacoveanu.scalademo

import akka.actor.Actor
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.context.annotation.{Bean, Scope}
import org.springframework.stereotype.Component

import scala.beans.BeanProperty

case class VerifyInjectionWorks(val message: String)

@Component
@Scope("prototype")
class TestInjectionActor extends Actor {

  @Autowired @BeanProperty val testService: TestService = null

  override def receive: Receive = {
    case VerifyInjectionWorks(message) => testService.testItWorks(message)
  }
}
```

Next we need to initalize the system and the actor in our Spring configuration.

``` scala
@Configuration
class AkkaSystem {
  @Bean
  def createSystem(springExtension: SpringExtension) : ActorSystem = {
    ActorSystem("helloAkka")
  }

  @Bean(Array("injectionActor"))
  def createInjectionActor(system: ActorSystem, springExtension: SpringExtension) = {
    system.actorOf(springExtension.props("testInjectionActor"), "injectionActor")
  }
}
```

We also need a reference to the actor in our Spring context so we can inject it into our controller and pass messages to the actor on certain requests.

``` scala
@Controller
class TestController @Autowired() (
    @Qualifier("injectionActor") private val injectionActor: ActorRef
    ) {

  @RequestMapping(Array("/injection"))
  @ResponseBody
  def testInjection(): String = {
    injectionActor ! VerifyInjectionWorks("injection works!")
    "verified injection"
  }
}
```

Start your app and go to localhost `/injection` to test this out, you should see the `injection works!` message in your console. Well, there you go!

## Injecting in the actor hierarchy

If you want to keep injecting your services in child actors (actors created by your actors), all you need to do is keep using the `SpringExtension` when you create them. We'll adapt our actor to accept a second message type and create a new injection actor when it receives that message.

``` scala
case class VerifyInjectionWorks(val message: String)
case class VerifyInjectionWorksInDepth(val message: String)

@Component
@Scope("prototype")
class TestInjectionActor extends Actor {

  @Autowired @BeanProperty val testService: TestService = null
  @Autowired @BeanProperty val springExtension: SpringExtension = null

  override def receive: Receive = {
    case VerifyInjectionWorks(message) => testService.testItWorks(message + " " + this.toString)
    case VerifyInjectionWorksInDepth(message) => {
      context.actorOf(springExtension.props("testInjectionActor")) ! VerifyInjectionWorks(message)
    }
  }
}
```

Next we'll have our controller send both messages to the actor.

``` scala
@RequestMapping(Array("/injection"))
@ResponseBody
def testInjection(): String = {
  injectionActor ! VerifyInjectionWorks("injection works!")
  injectionActor ! VerifyInjectionWorksInDepth("injection works in depth!")
  "verified injection"
}
```

If you start the app and call the `/injection` endpoint twice you should see the following in the console:

```
injection works! com.cacoveanu.scalademo.TestInjectionActor@7165bf7f
injection works in depth! com.cacoveanu.scalademo.TestInjectionActor@7fa25f23
injection works! com.cacoveanu.scalademo.TestInjectionActor@7165bf7f
injection works in depth! com.cacoveanu.scalademo.TestInjectionActor@648fb385
```

Why twice? If you look at the actor names you'll see that the base actor and the child actor have different IDs; also the child actor changes between calls because it is created by the base actor. And, of course, what we were interested in in the first place, the injection works for actors in the hierarchy as well if we use the spring extension.

With injection, your actor code should become cleaner and a lot more manageable. You can write the heavy processing code in services that you inject in the actors, and let the actors code focus on how the parallelization of your application is organized.

## Sources

- [Spring Boot meets Akka](http://kimrudolph.de/blog/spring-boot-meets-akka)