---
title: 'Creating a maven archetype for AWS Lambda'
date: 2017-02-28 10:30:00 BST
tags: ['maven', 'archetype', 'aws', 'lambda']
---

Following is a description on how to create a maven archetype for creating projects that can be packaged and deployed as Lambdas in Amazon Web Services.

<!--more-->

## Create an archetype archetype

```
mvn archetype:generate -DgroupId=com.cacoveanu.aws -DartifactId=aws-lambda-archetype -DarchetypeArtifactId=maven-archetype-archetype -DinteractiveMode=false
```

We will end up with a project with the following structure:

```
aws-lambda-archetype
- src
  - main
    - resources
      - archetype-resources
        - src
          - main
            - java
              - App.java
          - test
            - java
              - AppTest.java
        - pom.xml
      - META-INF
        - maven
          - archetype
- pom.xml
```

We will want to change the `src/main/resources/archetype-resources/src/pom.xml` to add the dependencies we'll need in our AWS project. We will also add new files in `src/main/resources/archetype-resources/src/main/java` and `src/main/resources/archetype-resources/src/test/java`.

Add the following dependency in the `src/main/resources/archetype-resources/src/pom.xml` file:

``` xml
<dependency>
    <groupId>com.amazonaws</groupId>
    <artifactId>aws-lambda-java-core</artifactId>
    <version>1.1.0</version>
</dependency>
```

Also to the pom file, add the build instructions for packaging the  code to upload lambda to AWS:

``` xml
<build>
    <plugins>
        <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-shade-plugin</artifactId>
            <version>2.3</version>
            <configuration>
                <createDependencyReducedPom>false</createDependencyReducedPom>
            </configuration>
            <executions>
                <execution>
                    <phase>package</phase>
                    <goals>
                        <goal>shade</goal>
                    </goals>
                </execution>
            </executions>
        </plugin>
    </plugins>
</build>
```

In the `src/main/resources/archetype-resources/src/main/java` folder add the following Java file, named `MyLambda.java`:

``` java
package ${groupId};

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;

public class MyLambda implements RequestHandler<Request, Response> {

    public Response handleRequest(Request request, Context context) {
        Response response = new Response();
        response.setOutput(request.getInput());
        return response;
    }
}
```

Notice that the package name is set to `${groupId}`. This will create the necessary folder structure and set the correct package name as defined in the `-DgroupId` variable when executing maven generate to create a new Lambda project.

In a similar way, you will need to add the `Request.java` and `Response.java` files;

``` java
package ${groupId};

public class Request {

    private String input;

    public String getInput() {
        return input;
    }

    public void setInput(String input) {
        this.input = input;
    }
}
```

``` java
package ${groupId};

public class Response {

    private String output;

    public String getOutput() {
        return output;
    }

    public void setOutput(String output) {
        this.output = output;
    }
}
```

You can also add a simple test, if you want.

## Build and use the archetype

Now it's time to build the artifact and add it to our local maven repository. Run the following command in the root folder of your archetype project:

```
mvn install
```

You should get a build success message.

Now you can generate a new project for creating Lambdas for AWS in a root workspace folder of your choosing:

```
mvn archetype:generate -DarchetypeGroupId=com.cacoveanu.aws -DarchetypeArtifactId=aws-lambda-archetype -DarchetypeVersion=1.0-SNAPSHOT -DgroupId=com.example.aws -DartifactId=custom-message -DinteractiveMode=false
```
