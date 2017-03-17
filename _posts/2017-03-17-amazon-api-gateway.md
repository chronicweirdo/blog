---
title: 'Securing Amazon API Gateway exposed service using Amazon Cognito'
date: 2017-03-17 13:40:00 BST
tags: ['aws', 'api gateway', 'cognito', 'node']
---

This document will detail the process of exposing a service through Amazon API Gateway, securing access to that service using a Cognito user pool and customizing the authorization process to expose identity information to be used in the service.

## Creating a mock microservice

The first step is simple. We need a microservice we can expose through API Gateway. The easiest way to put up a mock microservice is by creating a new Node.js Lambda in the Amazon Lambda web UI and writing a very simple function:

``` javascript
exports.handler = (event, context, callback) => {
    console.log(event);
    console.log(context);

    var response = {
        'notes': [
            {
                'title': 'note 1',
                'contents': 'this is just a test note'
            },
            {
                'title': 'about the sunlight',
                'contents': 'sunlight is beautiful, but you need sunglasses sometimes'
            }
        ]
    };
    callback(null, response);
};
```

I have named this _listAccountNotes_, and all it does is return a json response. Make sure the role used to execute this Lambda function has permissions to execute Lambdas and write logs.

## Expose microservice through API Gateway

The next step is to expose this microservice through API Gateway. You will need to go in the API Gateway console. Click on _Create API_ and choose a _new API_. I've named mine _notes_. Once the API is created you need to add some resources and methods for those resources. Click on the _actions_ button, and on _create resource_. Name your resources something, I've used _notes_ again. Next, select your new resource, click the _actions_ button and _create method_. A simple _GET_ method will do for now. Choose _lambda function_ as the integration type, select your region and lambda and _save_. Now you will see a screen that gives you even more configuration options on your endpoint. We'll get back to this screen, but first we need to test this.

## Accessing the microservice

To be able to actually invoke our microservice through the API, we'll need to deploy the API first. Under _actions_ select _deploy API_ and create a new stage. Once you do this, you are taken to the _Stages_ tab, and here you can get the url of your staged API and test it. You can use Postman to make a GET call to this URL and see your notes.

## Securing the microservice using a Cognito User pool

But right now, your API is not secured. We need to configure API Gateway to only allow users to login if they have a token obtained through Cognito. Go back in the API Gateway console and select your API, then under _authorizers_, _create_ a _Cognito user pool authorizer_. You have to pick the pool region, a pool, an authorizer name and you can customize the section of the request where the identity token will be, and this is `method.request.header.Authorization` by default. This means the request you send to the API will need to contain a header named `Authorization` that should contain a valid token.

Once you created the authorizer, you need to enable it on your method by going back to _resources_, selecting the method and clicking _method request_. Here, under the _authorization_ field select your pool authorizer, and click the check mark to save the change. Don't forget to deploy the API before testing it. When you try to make a get call to that API now, you will get a _401_ response with the following body:

``` json
{
  "message": "Unauthorized"
}
```

## Logging in and accessing the microservice

I have created a small javascript program that uses the Amazon SDK for javascript to login the user, then makes a call to the mock service. You can create a node project and use npm to handle dependencies. You will need to create a new folder, then run `npm init` inside it, and this will create a _package.json_ file. Next you need to add dependencies to your project by running the following commands:

``` shell
npm install --save aws-sdk
npm install --save amazon-cognito-identity-js
npm install --save bl
```

First two are the Amazon SDK files, the third is a library that will help us read the response body from the API.

You can next create a _js_ file, I have called mine _loginAndCall.js_, and start it by including the dependencies:

``` javascript
var AWS = require('aws-sdk');
var Config = AWS.Config;
var CognitoIdentityCredentials = AWS.CognitoIdentityCredentials;
var AWSCognito = require('amazon-cognito-identity-js');
var CognitoUser = AWSCognito.CognitoUser;
var CognitoUserPool = AWSCognito.CognitoUserPool;
var CognitoUserAttribute = AWSCognito.CognitoUserAttribute;
var AuthenticationDetails = AWSCognito.AuthenticationDetails;
var https = require('https');
var bl = require('bl');
```

Next we need to create a class that will handle the Cognito login call (stupidly named here _Loginer_):

``` javascript
class Loginer {
    constructor(poolId, clientId) {
        this.poolId = poolId;
        this.clientId = clientId;
    }
    getAuthenticationDetails(username, password) {
        return new AuthenticationDetails({
            Username : username,
            Password: password
        });
    }
    getUserPool() {
        return new CognitoUserPool({
            UserPoolId: this.poolId,
            ClientId: this.clientId,
        });
    }
    getCognitoUser(username) {
        return new CognitoUser({
            Username : username,
            Pool : this.getUserPool()
        })
    }
    login(username, password, onLogin) {
        var cognitoUser = this.getCognitoUser(username);
        var callbacks =  {
            onSuccess: onLogin,
            onFailure: function(err) {
                cosole.err(err);
            }
        }
        cognitoUser.authenticateUser(this.getAuthenticationDetails(username, password), callbacks);
    }
}
```

The above class will:

- need to be initialized with the pool id and the client id (you can set client ids for clients that are allowed to use you Cognito pool in the Cognito web console for that pool, undert the _Apps_ section)
- has some utility methods that are used to create required AWS objects, like `CognitoUser` and `CognitoUserPool`
- has a main `login` method that takes the username and password, logs in the user and, if successful, calls a callback function with the result

Next, I implemented another class that will handle the call to the API:

``` javascript
class NotesCaller {
    call(token, callback) {
        var options = {
            method: 'GET',
            host: 'api_url',
            path: '/staging_name/notes',
            headers: {'Authorization': token}
        };
        var request = https.request(options, collecter(callback));
        request.end();
    }
}
```

It has only one method, `call` that makes a _GET_ call to our API and includes the token in the _authorization_ header. The response is handled by a special `collecter` function that takes a callback function as an argument, defined below:

``` javascript
function collecter(callback) {
    return function(result) {
        function onceCollected(err, data) {
            var string = data.toString();
            callback(string);
        }
        result.setEncoding('utf8');
        result.pipe(bl(onceCollected));
        result.on('error', console.error);
    }
}
```

As you can see, the `collecter` function will create a custom function to handle the response for a call. The response (`result` in our code) is piped throgh the _bl_ library we imported. This library will collect all parts of the response in a `data` object, and once the full response is read, the `onceCollected` function will invoke the custom callback function we provided.

Next, we put all these pieces togethers:

``` javascript
var userPoolId = 'user_pool_id';
var clientId = 'client_id';
var loginer = new Loginer(userPoolId, clientId);
loginer.login("username", "password", function(result) {
    var idToken = result.idToken.jwtToken;
    new NotesCaller().call(idToken, console.log);
});
```

The `Loginer` is initialized with the user pool id and client id. Then we call the `login` method, with the username and password and a callback function. Once we've had a successful login, we'll see that we have three tokens in the result. We're interested in getting the id token from `result.idToken.jwtToken` and using it with the `NotesCaller` to call our API and print the result with the `console.log` function.

## Getting more details about the identity using a custom authorizer

So we now have access to our API only when using a Cognito user pool token, but the service we are calling doesn't know anything about who is calling it. A JSON Web Token has useful information encoded in it, about the identity of the user who obtained that token, but none of that information is getting to our service, and we'll need to change that. We'll have to create a new Lambda which we will use as a custom API Gateway authorizer. This Lambda will parse the token received by API Gateway and extract the information we need, then add that information to the context of the call made to our service.

The custom authorizer describe here is based on the one in the [Integrating Amazon Cognito User Pools with API Gateway](https://aws.amazon.com/blogs/mobile/integrating-amazon-cognito-user-pools-with-api-gateway/) on the AWS Mobile Blog. I have removed some comments and modified the code to add more token data to the context we return to API Gateway.

First you need to download the [blueprint for a custom authorizer](https://s3.amazonaws.com/cup-resources/cup_custom_authorizer_lambda_function_blueprint.zip). Extract this to a new folder and open the _authorizer.js_ file. First thing you will see is that this script has dependencies on _jsonwebtoken_, _request_ and _jwk-to-pem_ libraries. You will need to set the values of the `userPoolId` and `region` variables. Here is the start of the file:

``` javascript
var jwt = require('jsonwebtoken');
var request = require('request');
var jwkToPem = require('jwk-to-pem');

var userPoolId = 'your_user_pool_id';
var region = 'your_region';
var iss = 'https://cognito-idp.' + region + '.amazonaws.com/' + userPoolId;
var pems;
```

This file is a node module that exports a `handler` function that receives the `event` and `context` variables. The first thing this function is doing is to download the keys required to verify the web token received from Cognito. This step can be removed, if you want to improve the efficiency of this function, by downloading and including the keys in the Lambda archive. Once the keys are available, the `ValidateToken` function is called:

``` javascript
function ValidateToken(pems, event, context) {
    var token = event.authorizationToken;
    //Fail if the token is not jwt
    var decodedJwt = jwt.decode(token, {complete: true});
    if (!decodedJwt) {
        console.log("Not a valid JWT token");
        context.fail("Unauthorized");
        return;
    }
    console.log(decodedJwt);
    //Fail if token is not from your UserPool
    if (decodedJwt.payload.iss != iss) {
        console.log("invalid issuer");
        context.fail("Unauthorized");
        return;
    }

    //Reject the jwt if it's not an 'Access Token'
    if (decodedJwt.payload.token_use != 'id') {
        console.log("Not an access token");
        context.fail("Unauthorized");
        return;
    }

    //Get the kid from the token and retrieve corresponding PEM
    var kid = decodedJwt.header.kid;
    var pem = pems[kid];
    if (!pem) {
        console.log('Invalid access token');
        context.fail("Unauthorized");
        return;
    }

    //Verify the signature of the JWT token to ensure it's really coming from your User Pool

    jwt.verify(token, pem, { issuer: iss }, function(err, payload) {
      if(err) {
        context.fail("Unauthorized");
      } else {
        //Valid token. Generate the API Gateway policy for the user
        //Always generate the policy on value of 'sub' claim and not for 'username' because username is reassignable
        //sub is UUID for a user which is never reassigned to another user.
        var principalId = payload.sub;

        //Get AWS AccountId and API Options
        var apiOptions = {};
        var tmp = event.methodArn.split(':');
        var apiGatewayArnTmp = tmp[5].split('/');
        var awsAccountId = tmp[4];
        apiOptions.region = tmp[3];
        apiOptions.restApiId = apiGatewayArnTmp[0];
        apiOptions.stage = apiGatewayArnTmp[1];
        var method = apiGatewayArnTmp[2];
        var resource = '/'; // root resource
        if (apiGatewayArnTmp[3]) {
            resource += apiGatewayArnTmp[3];
        }
        //For more information on specifics of generating policy, refer to blueprint for API Gateway's Custom authorizer in Lambda console
        var policy = new AuthPolicy(principalId, awsAccountId, apiOptions);
        policy.allowAllMethods();
        var policyData = {
            'principalId': principalId,
            'username': payload['cognito:username'],
            //'groups': payload['cognito:groups'],
            'email': payload.email
        };
        console.log(context);
        var finalPolicy = policy.build();
        finalPolicy.context = policyData;
        console.log(finalPolicy);
        context.succeed(finalPolicy);
      }
    });
}
```

- the `jwt` library is used to decode the token
- the payload is checked to confirm that the correct pool, token type, called `token_use` (the example file expects an `access` token here, but I changed it to an `id` token) are used
- then the keys downloaded from Cognito are used to verify the token
- if verification passes, we can build the policy object that we return
- there is a lot of code involved in building the policy object that I am not including here
- we are also creating a `policyData` object that contains the fields we are interested in
- we are adding everything in `policyData` to the policy object, under the `context` field; this field must be named `context` and is only allowed to have sub-fields of string, integer and boolean type (that is why the group list is currently commented out, if we will want to add a group list, we'll need to serialize that in a string)

Once you've made the necessary modifications to the function, you need to package it. Create a _zip_ with the _authorizer.js_ file and _node_modules_ folder and upload that as a new Node.js Lambda in the Lambda web console.

Now go to the API Gateway console, select your API and the _authorizers_ page and _create_ then _custom authorizer_. Fill in the Lambda region, authorizer name, use the role you use for Lambdas to execute the authorizer. You will need to go in the IAM console and edit the _trust relationships_ tab for this role to allow the `apigateway.amazonaws.com` service to run it, as shown below:

``` json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": [
          "apigateway.amazonaws.com",
          "lambda.amazonaws.com"
        ]
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

Once you have created your custom authorizer, all you still need to do is switch to the _resources_ tab and have your method use that authorizer, which you set up by clicking the _method request_ box. You also need to set the integration up correctly to transfer the values we want from the authorization context to the request API Gatewat makes to our service. To do this, click on your method, then click on the _integration request_ box, then under _body mapping templates_ add a new template for an `application/json` content-type (and you can secure the integration when that box appears). You can next work off of the _method request passthrough_ template that Amazon can generate for you. I have just added the following to the root object:

``` json
"policyContext": {
    "principalId": "$context.authorizer.principalId",
    "username": "$context.authorizer.username",
    "email": "$context.authorizer.email"
}
```

Now you can stage the API after applying the changes. Next, we need to update the service Lambda to use the newly acquired information. The `policyContext` we added will actually be available on the `event` object. We'll be adding a title to our collection of notes containing the name of the user accessing them, if it is available:

``` javascript
exports.handler = (event, context, callback) => {
    console.log(event);
    console.log(context);

    var notesTitle = "Notes for ";
    if (event.policyContext) {
        notesTitle = notesTitle + event.policyContext.username;
    } else {
        notesTitle = notesTitle + "anonymous";
    }
    var response = {
        'title': notesTitle,
        'notes': [
            {
                'title': 'note 1',
                'contents': 'this is just a test note'
            },
            {
                'title': 'about the sunlight',
                'contents': 'sunlight is beautiful, but you need sunglasses sometimes'
            }
        ]
    };
    callback(null, response);
};
```

If you go back and execute your test login and call node project you should get back a list of notes that has a title containing the username you used to log in.
