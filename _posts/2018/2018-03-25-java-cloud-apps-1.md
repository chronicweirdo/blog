---
title: 'Java Cloud Apps Workshop - Starting up with Spring Boot'
date: 2018-03-25 12:00:00
tags: ['java', 'cloud', 'microservices', 'spring boot']
---

What I will be looking at in the next few days is building a multi-service cloud app using Java.

For this, we need an example application for which it would make sense to have a complex cloud architecture. We want an app that can be organized into separate services, where it makes sense for some services at least to provide some value by themselves, even if other parts of the infrastructure are down. We also want some of the services to be more strained, so that after analyzing our system we will conclude we need to deploy more instances of those services.

<!--more-->

As you can see, we are already looking at the problem in reverse, we need a problem for the cloud microservices architecture we want to implement. This should not happen in real life. I wonder how often it does happen. But nevermind that, let's pick up our "hammer" and look for an appropriately challenging "nail".

We'll try to build a system tasked with running a large number of learning algorithms on many different data sets and evaluate the resulting models. We need a project that has to run time and CPU consuming computations. If we had a service in our app responsible for those computations, if implemented correctly, it would make sense that adding more instances of that service would improve the computation capabilities of the system. In addition, complex computations would need to run on large data, so we could use a separate service to load, store, make that data available. Our system would also accommodate multiple users, each user uploading their own data, asking the processing service to handle it, analyzing the results. Users could also share data and results, and organize into groups, maybe communicate with each other or just by annotating data with tags and observations. We could also create separate services to serve as the UI of the system, as a simple web app, or by providing an API for retrieving results and information.

It looks to me like we have a mission.

## Baby Steps

At a first glance, it looks like we could start out with three services: a user account service, for storing information about the users of our system, a data service, which will let us upload data to storage, and access that data, and a processing service that executes our algorithms and saves the results. All services will have rest APIs to communicate with each other. They will also need to work with some kind of database service (one or more), to persist their entities. Spring Boot will help us get a quick start in putting the services up, while providing additional requirements - logging. But first we need to initialize a git repository where our code will reside. Open git console, navigate to your workspace and enter:

```
mkdir msdm
cd msdm
git init
```

(MSDM = MicroServices Data Mining)

Next, navigate to the [Spring Initializr](https://start.spring.io/) and enter your group _com.msdm_ and artifact _users_ and add the _Web_ and _MongoDB_ dependencies. Download your project and extract it to your workspace folder. Now you can open it in your favorite IDE. You will also need something to test your API calls, [Postman](https://www.getpostman.com/) may be helpful, so you can download and install it. And you'll need some database server, we'll start with using [MongoDB](https://www.mongodb.com/download-center?jmp=tutorials#community) the free community server.

In the beginning, our users service will only need to let us view one user, all users, create, update and delete users. But first, you'll need to install and start your DB server. Once MongoDB is installed, you will need to go to the install location and start it up from the `bin` folder, the file will be named `mongod`; but only after you created the default data folder, which in Windows will be `c:\data\db`. You can then run the shell utility `mongo` from the same folder. The only Mongo command we are interested in now is `show dbs`. There should be no interesting database there yet. Let's jump in the Java project.

First we'll need to create a user object, our main service entity:

``` java
package com.msdm.users.entities;

import org.springframework.data.annotation.Id;

public class User {

    @Id
    private String id;

    private String email;

    public User() {
    }

    public User(String email) {
        this.email = email;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }
}
```

It's a simple Java object, with getters and setters. We have a unique ID for each user and we use annotations to specify which field to use as the ID. Each user also has an email, for now.

Next, we need a repository that we can use to move our entities to and from the database:

``` java
package com.msdm.users.repositories;

import com.msdm.users.entities.User;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface UserRepository extends MongoRepository<User, String> {

}
```

It's just an interface! And it will already provide all the basic functionality we need. When we extend the `MongoRepository` interface, we specify what entity will be handled by our new repository and the data type of the ID field.

What else? Some operation to create a new user when we run the application and save it to the database:

``` java
package com.msdm.users;

import com.msdm.users.entities.User;
import com.msdm.users.repositories.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.logging.LogManager;

@Component
public class CommandLineApp implements CommandLineRunner {

    private static Logger log = LoggerFactory.getLogger(CommandLineApp.class);

    @Autowired
    private UserRepository userRepository;

    @Override
    public void run(String... strings) throws Exception {
        userRepository.save(new User("testUser1"));
        userRepository.findAll().stream().map(User::getEmail).forEach(log::info);
    }
}
```

We first need to make sure the command line runner will be loaded, for that we use the `@Component` annotation. Then we autowire the user repository and in the `run` method we create and save a new user, then we load all users in the database and log their emails using a neat Java 8 stream. Oh, yes, we also initialized a logger at the beginning of the class, to make sure all our console output is formatted the same way.

Now run the app, `UsersApplication`! Everything should run smoothly, and we can go now in the MongoDB console and run the following commands to see all the results of our work:

```
show dbs
use test
show collections
db.user.find()
```

Those commands will list all the databases in MongoDB and now you will see that a new database named _test_ was created. This database will contain a _user_ collection and the collection will contain the new object. We already have a service that starts up and connects to a database. Building apps doesn't have to be hard.

One more thing we should do before we move on is change the name of the database where all this data is created, the database associated with this service should not be named _test_. Add the following line to your _application.properties_ file:

```
spring.data.mongodb.database=usersdb
```

And maybe also commit your changes to git.

## Opening Up

What we need to look into next is to open our service up to the world, at least our internal microservices universe. We need to publish a REST API for our service that allows us to perform basic operations with users. We'll start simple, with a user controller:

``` java
package com.msdm.users.controllers;

import com.msdm.users.entities.User;
import com.msdm.users.repositories.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping(value = "user")
public class UserController {

    @Autowired
    private UserRepository userRepository;

    @RequestMapping(
            method = RequestMethod.GET,
            produces = "application/json"
    )
    public User getUser(@RequestParam(value = "id") String id) {
        return userRepository.findOne(id);
    }

    @RequestMapping(
            method = RequestMethod.PUT,
            consumes = "application/json",
            produces = "application/json"
    )
    public User saveOrUpdateUser(@RequestBody User user) {
        return userRepository.save(user);
    }
}
```

Controllers need to be annotated with `@RestController` (or `@Controller`) for Spring to find them and load them on startup. We also provide the URI value at which we can access our controller using a `@RequestMapping` annotation directly on the controller. We autowire the user repository to the controller, then we can use it to load and save/update a user. Our controller will accept `GET` and `PUT` requests for now. We define which method is supported by each function in our class, as well as the type of data each function accepts, within the `@RequestMapping` annotation on each function. We also use `@RequestParam` to map parameters from the HTTP call. Both URL or form parameters can be mapped in this manner. And the last annotation we use is `@RequestBody`, which tells spring to take any JSON data it receives and try to map it to our `User` object.

If we run the application now, we can already use the above calls to manipulate users we have stored in the database. Postman can be used to execute the following calls:

- `GET` at `localhost:8080/user?id=5a05e46f61a42317e48c3ecd` (use the actual ID you have in the database) should return the user object in JSON form
- `PUT` at `localhost:8080/user` with a JSON body that updates the email value (see below) should update that value in the database:

``` json
{
    "id": "5a05e46f61a42317e48c3ecd",
    "email": "testUser2"
}
```

- `PUT` at `localhost:8080/user` with a JSON body that does not have an ID (see below) should create a new user in our database, and the response will contain the ID of the new user:

```
{
    "email": "testUser3"
}
```

So quick, so simple, so elegant, only the code we need. We still need to add code to delete a user and some code to retrieve a list of all users, and it may be a good idea to let us only retrieve that list page by page, for a future time when we will have a very large list of users. A little side note: most of the time, it's a good idea to only add functionality at the moment you need it. Don't run around trying to anticipate where the project will go too much, because more often than not your assumptions may be mistaken. None of us can predict the future accurately. Adding pagination to a call that retrieves a large number of users is not a very big assumption to make for a real project, but for the project developed in these posts it's probably not going to be needed, which is why I added this note.

Our final user controller, with the delete method and some refactoring to reduce repetition of code, will look like this:

``` java
package com.msdm.users.controllers;

import com.msdm.users.entities.User;
import com.msdm.users.repositories.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping(
        value = "user",
        produces = "application/json"
)
public class UserController {

    @Autowired
    private UserRepository userRepository;

    @RequestMapping(method = RequestMethod.GET)
    public User getUser(@RequestParam(value = "id") String id) {
        return userRepository.findOne(id);
    }

    @RequestMapping(method = RequestMethod.DELETE)
    public void deleteUser(@RequestParam(value = "id") String id) {
        userRepository.delete(id);
    }

    @RequestMapping(method = RequestMethod.PUT, consumes = "application/json")
    public User saveOrUpdateUser(@RequestBody User user) {
        return userRepository.save(user);
    }
}
```

And for handling a whole collection of users we are creating a new controller (this will keep the logic separated for our controllers, each controller handles its own URL; but of course, this is not necessary, what is necessary is that you are consistent in the way you implement all code across the whole project):

``` java
package com.msdm.users.controllers;

import com.msdm.users.entities.User;
import com.msdm.users.repositories.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping(value = "users")
public class UserCollectionController {

    private static int PAGE = 0;
    private static int SIZE = 10;

    @Autowired
    private UserRepository userRepository;

    @RequestMapping(
            method = RequestMethod.GET,
            produces = "application/json"
    )
    public List<User> getAllUsers(
            @RequestParam(value = "page", required = false) Integer page,
            @RequestParam(value = "size", required = false) Integer size
    ) {
        Pageable pageRequest = getPageRequest(page, size);
        if (pageRequest != null) {
            Page<User> resultPage = userRepository.findAll(pageRequest);
            return resultPage.getContent();
        } else {
            return userRepository.findAll();
        }
    }

    private Pageable getPageRequest(Integer page, Integer size) {
        if (page != null) {
            if (size == null) {
                size = SIZE;
            }
            return new PageRequest(page, size);
        } else if (size != null) {
            return new PageRequest(PAGE, size);
        } else {
            return null;
        }
    }
}
```

We could have used the new Java `Optional` when creating the `PageRequest` if we wanted to avoid null checks, but there is no practical advantage of using it here, so we can just write this code the old-fashioned way. The controller method will work both with parameters or without them. You can load the first page of users, when pages have two users each, by making a `GET` call to `localhost:8080/users?page=0&size=2`. Or, you could load all users in the database, without pagination, by making a `GET` call to `localhost:8080/users`.

You can also go ahead and delete `CommandLineApp` at this point to stop your application from creating rogue users at each restart. Start your app and play around with the various endpoints, and don't forget to make a Git commit once in a while.

## End Notes

With reaching the end of the first part of this project, we have created a simple Spring Boot service, a real micro one, that can store entities from our system in a database and provides REST API to other services in the system. From here on we'll be able to move faster when adding our other services and only focus on explaning the new concepts we are including for each service. Next up: a service that lets users store files.
