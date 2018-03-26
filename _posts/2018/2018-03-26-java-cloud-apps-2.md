---
title: 'Java Cloud Apps Workshop - File server, work server'
date: 2018-03-26 19:00:00
tags: ['java', 'cloud', 'microservices', 'spring boot']
---

Our objectives for this second part of the workshop will be:

- create a service that allows us to upload files
- uploaded files are saved at a configurable location on the server, with a unique ID
- each file belongs to a user (for now)
- each file has an entry in a database that contains the original name and metadata
- the REST API lets us upload a file, get list of files, see file metadata, update file metadata and download the file
- we also want a service that does the "work"
- this service will accept request to start file analysis, with a file ID and some other analysis parameters
- the work service will communicate with the file service to obtain the file it is currently working on
- the work service will perform the "work" - really just some random generated data with time delays inserted in it
- if the work is successful, a report is saved
- the work service can accept work requests and add them to a queue
- the API of the work service lets us add work requests, interrogate the current queue, see current execution information, interrogate results? or should results be sent to a different service?

<!--more-->

## The file service

Get a new Spring Boot app started with Spring Initializr, with `Web` and `MongoDB` dependencies. I called mine `com.msdm.files`. Add it to your project, and let's start by configuring some defaults, like database name and the port we start this service on. We'll want a different port that our users service for now so we can run both services on the same machine. Add the following in the `application.properties` file:

```
spring.data.mongodb.database=filesdb
server.port=8090
```

Next, we'll create our entity:

``` java
package com.msdm.files.entities;

import org.springframework.data.annotation.Id;

import java.util.List;

public class Datafile {

    @Id
    private String id;

    private String name;

    private String owner;

    private String note;

    private List<String> tags;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getOwner() {
        return owner;
    }

    public void setOwner(String owner) {
        this.owner = owner;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public List<String> getTags() {
        return tags;
    }

    public void setTags(List<String> tags) {
        this.tags = tags;
    }
}
```

And the associated repository:

``` java
package com.msdm.files.repositories;

import com.msdm.files.entities.Datafile;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface DatafileRepository extends MongoRepository<Datafile, String>{
}
```

Now, we need a service that can save a multipart file at a location on disk:

``` java
package com.msdm.files.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Optional;

@Component
public class FileStorageService {

    private static Logger logger = LoggerFactory.getLogger(FileStorageService.class);

    @Value("${storage.path}")
    private String storagePath;

    private File getNewFile(String id) {
        Path path = Paths.get(storagePath, id);
        return path.toFile();
    }

    public Optional<File> save(MultipartFile receivedFile, String id) {
        try {
            File newFile = getNewFile(id);
            receivedFile.transferTo(newFile);
            return Optional.of(newFile);
        } catch (IOException e) {
            logger.error(e.getMessage(), e);
            return Optional.empty();
        }
    }
}
```

First here we notice we have a `@Value` annotation. That is the way we insert properties from the `application.properties` file in our Java code. This means we will need to add a new line in the `application.properties` with the path to the location where we store files: `storage.path=C:\\datadir`. Make sure that folder exists on you machine. Next, we transfer the multipart data to a new file on disk. The `MultipartFile` datatype gives us a handy method to do this, but we must have a way to signal the calling code if the operation failed. We use an empty `Optional` to signal that file saving has failed.

We can now put this all together ny adding a controller, the basic API to test all this out:

``` java
package com.msdm.files.controllers;

import com.msdm.files.entities.Datafile;
import com.msdm.files.repositories.DatafileRepository;
import com.msdm.files.services.FileStorageService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.util.Optional;

@RestController
@RequestMapping(value = "datafile")
public class DatafileController {

    @Autowired
    private DatafileRepository datafileRepository;

    @Autowired
    private FileStorageService fileStorageService;

    @RequestMapping(method = RequestMethod.POST)
    public ResponseEntity<?> upload(
            @RequestParam("owner") String owner,
            @RequestParam("file") MultipartFile multipartFile
    ) {
        Datafile datafile = datafileRepository.save(getDatafile(multipartFile, owner));
        Optional<File> savedFile = fileStorageService.save(multipartFile, datafile.getId());
        if (savedFile.isPresent()) {
            return new ResponseEntity(HttpStatus.OK);
        } else {
            datafileRepository.delete(datafile);
            return new ResponseEntity<>(HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    private Datafile getDatafile(MultipartFile multipartFile, String owner) {
        Datafile datafile = new Datafile();
        datafile.setOwner(owner);
        datafile.setName(multipartFile.getOriginalFilename());
        return datafile;
    }
}
```

We'll keep the call basic for now. The controller accepts a POST call with an owner name/id and a multipart file. First, we save the file details to MongoDB. This operation will assign a unique ID to our `Datafile` entity. We then use that ID to call the `FileStorageService` and save the file to disk, if possible. If this operation was successful, we just return an empty `200` response. If saving the file to disk failed, we first make sure to delete the file from MongoDB and then we return an empty `500` response. It's a stripped down version of the final thing, but it will let us quickly test if the service works as expected. You can start the service and test it out, Postman will provide all the required functionality to make a call to your new service. Upload a simple text file and verify MongoDB and the local data folder to make sure it all works.

## POST or PUT a file

We could use either one, and since we program the backend of our API, we could make a DELETE method create a new file, if we really wanted to mess with the heads of the people using our API. But if we want to implement a REST API that respects the definition of the REST methods, our options for uploading a file are either POST or PUT, and which is the right one to use depends on the way we implement its operation. The difference between POST and PUT is based on the concept of _idempotence_. An idempotent operation will bring the system to a clearly defined state based on the parameters of that operation. The state of the system will be the same even if we repeat the call, with the same parameters, multiple times. Let's say our operation is _create an entity with ID and DATA_, where _ID_ and _DATA_ are the parameters of the operation. When we make this call, if an entity with _ID_ does not exist, it will be created with the _DATA_ we provided, and if an entity with _ID_ does exist, its data will be replaced with the _DATA_ we provided. So wether we make this call one time, or one hundred times, the system will be in the exact same state at the end: we will have one entity with _ID_ and _DATA_ in our system. According to the definition of REST methods, PUT should be an idempotent operation (as well as GET, DELETE, HEAD, TRACE, OPTIONS). POST, on the other hand, is not required to be an idempotent operation. With POST, we can just provide the _DATA_ and let the system choose an _ID_. This also means that id we make a POST call with the same _DATA_ multiple consecutive times, we will end up with multiple entities having the same _DATA_ but different _IDs_.

Now that we clarified this subtle difference we can see that the POST method is the correct one based on the current implementation of the Java function handling the call. If we look back at our user service, we can see that the PUT method used there is not correctly implemented. If the data given to the PUT method does not contain a user ID, a new user will be created. If we make the same call multiple times without an ID, we will end up with multiple users, so the system state changes with each subsequent call. So our PUT implementation is not idempotent. We would have to refuse to service calls to the PUT endpoint when no ID is provided (for example return a BAD_REQUEST). We should also add a POST endpoint for creating new users. We can quickly fix this in our user service:

``` java
@RequestMapping(method = RequestMethod.POST, consumes = "application/json")
public ResponseEntity<User> newUser(@RequestParam(value = "email") String email) {
    User user = new User(email);
    User savedUser = userRepository.save(user);
    return new ResponseEntity<User>(savedUser, HttpStatus.OK);
}

@RequestMapping(method = RequestMethod.PUT, consumes = "application/json")
public ResponseEntity<User> saveOrUpdateUser(@RequestBody User user) {
    if (user.getId() != null) {
        User savedUser = userRepository.save(user);
        return new ResponseEntity<User>(savedUser, HttpStatus.OK);
    } else {
        return new ResponseEntity<User>(HttpStatus.BAD_REQUEST);
    }
}
```

## Downloading files

We next implement the file download controller:

``` java
package com.msdm.files.controllers;

import com.msdm.files.entities.Datafile;
import com.msdm.files.repositories.DatafileRepository;
import com.msdm.files.services.FileStorageService;
import org.apache.tomcat.util.http.fileupload.IOUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletResponse;
import java.io.FileInputStream;
import java.io.IOException;

@RestController
@RequestMapping(value = "download")
public class DownloadController {

    private static Logger logger = LoggerFactory.getLogger(DownloadController.class);

    @Autowired
    private DatafileRepository datafileRepository;

    @Autowired
    private FileStorageService fileStorageService;

    @RequestMapping(value = "{id}", method = RequestMethod.GET)
    public void getFile(
            @PathVariable("id") String id,
            HttpServletResponse response
    ) {
        Datafile datafile = datafileRepository.findOne(id);
        if (datafile != null) {
            response.addHeader("Content-Type", "application/octet-stream");
            response.addHeader("Content-Disposition", getFilenameHeader(datafile));
            FileInputStream inputStream = fileStorageService.getInputStream(id);
            if (inputStream != null) {
                try {
                    IOUtils.copy(inputStream, response.getOutputStream());
                    response.flushBuffer();
                } catch (IOException e) {
                    logger.error(e.getMessage(), e);
                    response.setStatus(HttpStatus.INTERNAL_SERVER_ERROR.value());
                }
            } else {
                response.setStatus(HttpStatus.NOT_FOUND.value());
            }
        } else {
            response.setStatus(HttpStatus.NOT_FOUND.value());
        }
    }

    private String getFilenameHeader(Datafile datafile) {
        return "attachment; filename=\"" + datafile.getName() + "\"";
    }
}
```

We have a few new elements in the implementation of this controller. First, the id of the file we are downloading should be provide din the URL, as part of the path. This is more in line with a REST approach where entities in your system are viewed as resources, with their unique URLs. As a future refactoring of the services, it would make sense to move entity ids in URLs, so our system has a consistent way of addressing data. We access the id in the path using the `@PathVariable` annotation. We also inject the response in the Java method parameters (Spring will automatically refer the right response object for us). We first load our file metadata, making sure that the file exists, at leat in the database, and obtaining the original file name in the process. Next, we add some headers to the response. The `Content-Disposition` header lets us instruct the browser or tool or service downloading the file what the downloaded file name should be. Finally, we obtain an input stream from the `FileStorageService` and write the contents of that input stream to the response output stream. The new method in `FileStorageService` is:

``` java
public FileInputStream getInputStream(String id) {
    File file = getFile(id);
    if (file.exists()) {
        try {
            return new FileInputStream(file);
        } catch (FileNotFoundException e) {
            logger.error(e.getMessage(), e);
        }
    }
    return null;
}
```

## A controller for all files

I am just adding the code for the controller that gives us information about all files in our database, just so the code is complete up to this point. This controller is almost identical to the collections controller in the users microservice:

``` java
package com.msdm.files.controllers;

import com.msdm.files.entities.Datafile;
import com.msdm.files.repositories.DatafileRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping(value = "datafiles")
public class DatafileCollectionController {

    private static int PAGE = 0;
    private static int SIZE = 10;

    @Autowired
    private DatafileRepository datafileRepository;

    @RequestMapping(
            method = RequestMethod.GET,
            produces = "application/json"
    )
    public List<Datafile> getAllDatafiles(
            @RequestParam(value = "page", required = false) Integer page,
            @RequestParam(value = "size", required = false) Integer size
    ) {
        Pageable pageRequest = getPageRequest(page, size);
        if (pageRequest != null) {
            Page<Datafile> resultPage = datafileRepository.findAll(pageRequest);
            return resultPage.getContent();
        } else {
            return datafileRepository.findAll();
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

## Analysis services

What we need now is to add ability to analyze the datasets we have in the system. This functionality will be split into two services, one to submit analysis requests to a queue and the second service to run the analysis. Since running an analysis is a resource consuming process, we expect that down the line we will need to deploy several analysis running services to ease the load on our system.

The service itself will be very simple; named `com.msdm.analysis`, with `Web` and `MongoDB` dependencies and running on a different port and databse:

```
spring.data.mongodb.database=analysisdb
server.port=8091
```

Our entity is the `Analysis`, and for now it only needs to store very little information:

``` java
package com.msdm.analysis.entities;

import org.springframework.data.annotation.Id;

import java.util.Date;

public class Analysis {

    @Id
    private String id;

    private String owner;

    private String fileId;

    private Date created;

    private Date started;

    private Date completed;

    private String result;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getOwner() {
        return owner;
    }

    public void setOwner(String owner) {
        this.owner = owner;
    }

    public String getFileId() {
        return fileId;
    }

    public void setFileId(String fileId) {
        this.fileId = fileId;
    }

    public Date getCreated() {
        return created;
    }

    public void setCreated(Date created) {
        this.created = created;
    }

    public Date getStarted() {
        return started;
    }

    public void setStarted(Date started) {
        this.started = started;
    }

    public Date getCompleted() {
        return completed;
    }

    public void setCompleted(Date completed) {
        this.completed = completed;
    }

    public String getResult() {
        return result;
    }

    public void setResult(String result) {
        this.result = result;
    }
}
```

The `AnalysisRepository` is, again, the basic version of a Mongo repository:

``` java
package com.msdm.analysis.repositories;

import com.msdm.analysis.entities.Analysis;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface AnalysisRepository extends MongoRepository<Analysis, String> {
}
```

We will also need the customary controllers, for working with a single analysis and a collection of analyses:

``` java
package com.msdm.analysis.controllers;

import com.msdm.analysis.entities.Analysis;
import com.msdm.analysis.repositories.AnalysisRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Date;

@RestController
@RequestMapping("analysis")
public class AnalysisController {

    @Autowired
    private AnalysisRepository analysisRepository;

    @RequestMapping(method = RequestMethod.POST)
    public Analysis createAnalysis(
            @RequestParam("owner") String owner,
            @RequestParam("fileId") String fileId
    ) {
        Analysis analysis = new Analysis();
        analysis.setOwner(owner);
        analysis.setFileId(fileId);
        analysis.setCreated(new Date());
        Analysis savedAnalysis = analysisRepository.save(analysis);
        return savedAnalysis;
    }

    @RequestMapping(value = "{id}", method = RequestMethod.GET)
    public Analysis getAnalysis(@PathVariable("id") String id) {
        return analysisRepository.findOne(id);
    }
}
```

``` java
package com.msdm.analysis.controllers;

import com.msdm.analysis.entities.Analysis;
import com.msdm.analysis.repositories.AnalysisRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("analyses")
public class AnalysisCollectionController {

    private static int PAGE = 0;
    private static int SIZE = 10;

    @Autowired
    private AnalysisRepository analysisRepository;

    @RequestMapping(
            method = RequestMethod.GET,
            produces = "application/json"
    )
    public List<Analysis> getAllAnalyses(
            @RequestParam(value = "page", required = false) Integer page,
            @RequestParam(value = "size", required = false) Integer size
    ) {
        Pageable pageRequest = getPageRequest(page, size);
        if (pageRequest != null) {
            Page<Analysis> resultPage = analysisRepository.findAll(pageRequest);
            return resultPage.getContent();
        } else {
            return analysisRepository.findAll();
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

What is more interesting about this service is that we will need to provide an interface to communicate to the executer service which analysis is next in line:

``` java
package com.msdm.analysis.controllers;

import com.msdm.analysis.entities.Analysis;
import com.msdm.analysis.repositories.AnalysisRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

import java.util.Date;
import java.util.Optional;

@RestController
@RequestMapping("scheduler")
public class SchedulingController {


    @Autowired
    private AnalysisRepository analysisRepository;


    @RequestMapping(method = RequestMethod.POST)
    public Analysis getNextAnalysis() {
        Optional<Analysis> first = analysisRepository.findAll().stream()
                .filter(a -> a.getStarted() == null)
                .filter(a -> a.getCompleted() == null)
                .findFirst();

        if (first.isPresent()) {
            Analysis analysis = first.get();
            analysis.setStarted(new Date());
            Analysis savedAnalysis = analysisRepository.save(analysis);
            return savedAnalysis;
        } else {
            return null;
        }
    }
}
```

For right this moment we'll implement a very basic scheduler. Using Java 8 streams, we'll load all analyses in our database, filter out the ones that are already started or completed and just pick one that was not started yet. This is a very inefficient and unfair implementation of the scheduler. We can improve this by making Mongo filter out the results we need, and even add some ordering to the next analysis, for example execute analyses in the order in which they were added. These are all changes we can consider doing once we start testing out our whole system. One more thing to mention about this service is that we are using the POST method to obtain the next analysis in line. We are not submitting any data for this call, we are only receiving something, so should this not be a GET call? Now if we want to respect the idempotency of the HTTP methods as it is defined in the standards. Multiple calls to this method will alter the system state by selecting and marking an analysis as started in each call. We are choosing to use POST as a way to make it evident that there are hidden operations being performed.

We need one more API to let the executer service communicate the result of the analysis to the analysis service:

``` java
package com.msdm.analysis.controllers;

import com.msdm.analysis.entities.Analysis;
import com.msdm.analysis.repositories.AnalysisRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Date;

@RestController
@RequestMapping("result")
public class ResultController {

    @Autowired
    private AnalysisRepository analysisRepository;

    @RequestMapping(value = "failed/{id}", method = RequestMethod.POST)
    public Analysis failedAnalysis(@PathVariable("id") String id) {
        Analysis analysis = analysisRepository.findOne(id);
        if (analysis != null) {
            analysis.setStarted(null);
            Analysis savedAnalysis = analysisRepository.save(analysis);
            return savedAnalysis;
        } else {
            return null;
        }
    }

    @RequestMapping(value = "success/{id}", method = RequestMethod.POST)
    public Analysis successAnalysis(
            @PathVariable("id") String id,
            @RequestParam("result") String result
    ) {
        Analysis analysis = analysisRepository.findOne(id);
        if (analysis != null) {
            analysis.setCompleted(new Date());
            analysis.setResult(result);
            Analysis savedAnalysis = analysisRepository.save(analysis);
            return savedAnalysis;
        } else {
            return null;
        }
    }
}
```

This interface will have two POST endpoints, on that marks an analysis as failed and adds it back to the pool of analyses that need to run, and the second one that marks the analysis as successful and saves the result of the analysis. There is much more we could add to improve the functionality of this service: some error handling and signaling, absolutely necessary to add some unit tests, and we'll get to those later. But right now we can run it and do a minor sanity check using Postman.

## The executer

The executer service will do very little, but it will be the first service in the system that can't function without communicating with another service. The executer service will need to call the analysis service to get the next analysis that it must run. After running the analysis, it must call the analysis service again to report the result. In between, we would also need to make a call to the file service and download the actual data to the executer service (in case of a real implementation). We'll need to generate a `com.msdm.executer` service with just `Web` dependency, then copy this new project to our workspace. After opening the project, we first need to make sure that the configuration is good. We'll need to run this service on a new port, and since this service communicates with other services, we will need to provide a way for it to find the other services. This will be done through properties, for the time being:

```
server.port=8092

analysis.url=http://localhost:8091
analysis.endpoint.scheduler=scheduler
analysis.endpoint.failure=result/failed
analysis.endpoint.success=result/success

file.url=http://localhost:8090
file.endpoint.download=download
```

Next, we will need to initialize the rest template, the object we will use to make REST calls to other services. We do this by adding a method annotated with @Bean in our application configuration class, which in this case is also the starting point of the microservice:

``` java
package com.msdm.executer;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

@SpringBootApplication
@EnableScheduling
public class ExecuterApplication {

	@Bean
	public RestTemplate initializeRestTemplate() {
		RestTemplate restTemplate = new RestTemplate();
		// restTemplate.getMessageConverters().add(new MappingJackson2HttpMessageConverter());
		return restTemplate;
	}

	public static void main(String[] args) {
		SpringApplication.run(ExecuterApplication.class, args);
	}
}
```

By doing this, we can configure the REST template in a single place and use is everywhere in the application (but the default REST template will do for now). You may notice something else there as well, the `@EnableScheduling` annotation. We will come back to that later.

The we will need to add two (internal) service classes, one to handle communication with the analysis service and the other one to download the files we need to run analyses on.

``` java
package com.msdm.executer.services;

import com.msdm.executer.entities.Analysis;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import javax.annotation.PostConstruct;
import java.net.URISyntaxException;
import java.util.List;

@Component
public class AnalysisService {

    @Value("${analysis.url}")
    private String analysisServiceUrl;

    @Value("${analysis.endpoint.scheduler}")
    private String schedulerEndpoint;

    @Value("${analysis.endpoint.failure}")
    private String failureEndpoint;

    @Value("${analysis.endpoint.success}")
    private String successEndpoint;

    @Autowired
    private RestTemplate restTemplate;

    private String getFullUrl(String relativeURl) {
        StringBuilder builder = new StringBuilder(analysisServiceUrl);
        if (! analysisServiceUrl.endsWith("/")) builder.append("/");
        if (relativeURl.startsWith("/")) {
            builder.append(relativeURl.substring(1));
        } else {
            builder.append(relativeURl);
        }
        return builder.toString();
    }

    public Analysis loadNextAnalysis() {
        Analysis analysis = restTemplate.postForObject(getFullUrl(schedulerEndpoint), null, Analysis.class);
        return analysis;
    }

    public void signalFailure(String id) {
        String url = getFullUrl(failureEndpoint) + "/" + id;
        restTemplate.postForObject(url, null, String.class);
    }

    public void signalSuccess(String id, String result) throws URISyntaxException {
        String url = getFullUrl(successEndpoint) + "/" + id;

        MultiValueMap<String, String> parametersMap = new LinkedMultiValueMap<String, String>();
        parametersMap.add("result", result);

        restTemplate.postForObject(url, parametersMap, String.class);
    }
}
```

We are loading field values with the relevant URLs to access the analysis service from our properties file. We are also autowiring the REST template. Our class will have three methods. The first one loads an analysis. We need to define an entity object in our executer service so we can save the JSON response we get from the analysis service to it. An `Analysis` entity that is identical to the one in the analysis service will do. With the second method, we call the analysis service to signal that the analysis has failed. The last method signals a success and also sends the result as a string.

``` java
package com.msdm.executer.services;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import javax.annotation.PostConstruct;
import java.net.URISyntaxException;
import java.util.Arrays;

@Component
public class FileService {

    @Value("${file.url}")
    private String fileServiceUrl;

    @Value("${file.endpoint.download}")
    private String downloadEndpoint;

    @Autowired
    private RestTemplate restTemplate;

    public byte[] downloadFile(String id) {
        String url = fileServiceUrl + "/" + downloadEndpoint + "/" + id;

        HttpHeaders headers = new HttpHeaders();
        headers.setAccept(Arrays.asList(MediaType.APPLICATION_OCTET_STREAM));

        HttpEntity<String> entity = new HttpEntity<String>(headers);

        ResponseEntity<byte[]> response = restTemplate.exchange(
                url,
                HttpMethod.GET, entity, byte[].class);
        return response.getBody();
    }
}
```

File download is not much harder. The `FileService` class has one method that downloads the file from the file service and keeps it in memory, as a byte array. This may work for smaller files, but if our system will need to handle large files we'll need to find a way to enable that. On the other hand, since files are now kept in memory, the analysis should run very fast.

But that will not be the case, because our playground implementation needs to simulate a service that consumes a large amount of resources, and we'll focus on making time the most used resource:

``` java
package com.msdm.executer.services;

import com.msdm.executer.entities.Analysis;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Random;
import java.util.concurrent.ExecutorService;

@Component
public class ExecuterService {

    private Logger logger = LoggerFactory.getLogger(ExecutorService.class);

    @Autowired
    private AnalysisService analysisService;

    @Autowired
    private FileService fileService;

    private int chance = 1000;

    private Random random = new Random(System.currentTimeMillis());

    @Scheduled(fixedRate = 5000)
    public void execute() {
        logger.info("retrieving analysis");
        Analysis analysis = analysisService.loadNextAnalysis();
        if (analysis != null) {
            logger.info("running analysis " + analysis.getId());
            logger.info("downloading file " + analysis.getFileId());
            byte[] bytes = fileService.downloadFile(analysis.getFileId());
            if (bytes != null) {
                logger.info("file downloaded successfully");
                chance = bytes.length;
                try {
                    String result = process(bytes);
                    analysisService.signalSuccess(analysis.getId(), result);
                } catch (Exception e) {
                    logger.error(e.getMessage(), e);
                    analysisService.signalFailure(analysis.getId());
                }
            } else {
                logger.info("file download failed");
                logger.info("analysis failed");
                analysisService.signalFailure(analysis.getId());
            }
        } else {
            logger.info("no analysis to schedule, will try again later");
        }
    }

    private String process(byte[] data) throws Exception {
        StringBuilder builder = new StringBuilder();
        for (byte b: data) {
            Character character = process(b);
            if (character != null) {
                builder.append(character);
            }
        }
        return builder.toString();
    }

    private Character process(byte b) throws Exception {
        int r = random.nextInt(chance);
        if (r == 0) {
            throw new Exception("this analysis has failed because of " + r);
        } else if (r < chance/100) {
            return (char) b;
        } else {
            return null;
        }
    }
}
```

This is a weird service. The service is tasked with periodically running analyses. The `execute()` method is annotated `@Scheduled` to let Spring know it should try to run that method every 5 seconds. When we use `@EnableScheduling` on the application entry class we let Spring know it should scan for `@Scheduled` annotations. This all means our application will try to download and run an analysis every five seconds. How the analysis is "run" is another matter. All this code does is go over every byte in the dataset, generate a random integer and do something with that byte based on the integer. If the integer is zero, the whole analysis will fail. If the random integer is less that 1% the size of the dataset, the byte will be converted into a char and added to the result string. The byte is selected from the interval 0 to size of the dataset, which means that in a larger dataset, the chance for getting a random 0 and failing the analysis is smaller at each step, but we have more steps than with a small dataset. I don't know how balanced the odds are, the main point is the service is performing some random computation that has a chance of failure. Later, when we test the whole system, we can add a sleep operation in there, possibly with a random interval, that will slow this microservice down and force use to experiment with creating multiple instances of the service to handle a higher load to the system.

That will be all for now. I believe that at this moment we have enough code to start looking into connecting the whole system together, in the next part of the workshop.
