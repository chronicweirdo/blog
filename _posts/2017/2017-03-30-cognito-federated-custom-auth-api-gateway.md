---
title: 'Integrating Cognito federated identities and a custom authentication service with secured services exposed through the API Gateway'
date: 2017-03-30 16:25:00 BST
tags: ['aws', 'api gateway', 'cognito', 'sts', 'federated identities']
---

# Integrating Cognito federated identities and a custom authentication service with secured services exposed through the API Gateway

This document explores how we can use federated Cognito identities authenticated through our own custom service to access secured APIs exposed through API Gateway. The scenario we are considering is creating temporary users that we can identify through Cognito, then obtain some credentials for those temporary users to access the a secure service we have exposed through API Gateway. Going through our custom authorization service means we can use fields like family name and date of birth to identify users, and relying on Cognito and API Gateway to handle the authentication flow will make the whole solution more secure that if we were to roll out our custom implementation.

We need to go thorough the following steps to implement this:

- implement an authentication service that works with Cognito federated identities
- log in with the authentication service to obtain a token for the new/existing identity
- use the token to get credentials from Amazon's Secure Token Service
- use the credentials to access a secure service exposed throug API gateway (will imply signing the request with the credentials)

## Setting up federated identities in Amazon Cognito

Go to the Amazon Cognito console and select _manage federated identities_. You will need to create a new user pool for this (I named it `tempusers`). Give a name to your new pool and don't check the _enable access to unauthenticated identities_. Under _authentication providers_ click on the _custom_ tab and set a name for your developer provider. Save your changes, create the pool and Cognito is ready for business.

The federated pool will also create two roles, one for authenticated and another for nonauthenticated users. You will need to go to the IAM console and give the authenticated user role permissions to run API Gateway if we are to use credentials for this role to access secured services exposed through API Gateway.

## Creating a custom web authentication service

I created a very simple Java Lambda to work as an authentication service:

``` java
public class AuthenticationLambda implements RequestHandler<Request, Response> {

    private static final String POOL_ID = "federated pool id";
    public static final long TOKEN_DURATION = 60 * 15l;
    private final AmazonCognitoIdentity identityClient;
    public static final String DEVELOPER_PROVIDER = "provider name used when creating the federated pool";

    public AuthenticationLambda() {
        identityClient = AmazonCognitoIdentityAsyncClientBuilder.defaultClient();
    }
}
```

- when we instantiate the `AuthenticationLambda` we also instantiate a `AmazonCognitoIdentity` object
- the role used to run the Lambda, once uploaded, needs to have permissions to access Cognito

``` java
public class AuthenticationLambda implements RequestHandler<Request, Response> {

    // constants and constructor

    public Response handleRequest(Request request, Context context) {
        String username = authenticateUser(request.getFamilyName(), request.getDateOfBirth());
        return getToken(username);
    }
}
```

- our service will use _family name_ and _date of birth_ information to authenticate a user
- we first try to authenticate the user based on the information in the request; this step would look in some database to see if the information provided is correct, and obtain a unique identifier for the user, like a username
- we then get a token using the unique identifier

``` java
public class AuthenticationLambda implements RequestHandler<Request, Response> {

    // constants and constructor

    // handler

    private String authenticateUser(String familyName, String dateOfBirth) {
        // this method will look in some database and check if the values correspond to a user,
        // the return that user's id/username
        if ("Popescu".equals(familyName) && "19800101".equals(dateOfBirth)) {
            return "PopescuD";
        } else {
            return null;
        }
    }
}
```

- for now we are just implementing a mock service that will accept hardcoded _family name_ and _date of birth_ values
- if no match is found, the user does not exist or they have the wrong information, so we return _null_

``` java
public class AuthenticationLambda implements RequestHandler<Request, Response> {

    // constants and constructor

    // handler

    // authenticate user

    private Response getToken(String username) {
        if (username != null) {
            GetOpenIdTokenForDeveloperIdentityRequest request =
                    new GetOpenIdTokenForDeveloperIdentityRequest();
            request.setIdentityPoolId(POOL_ID);

            HashMap<String,String> logins = new HashMap<>();
            logins.put(DEVELOPER_PROVIDER, username);
            request.setLogins(logins);
            request.setTokenDuration(TOKEN_DURATION);
            GetOpenIdTokenForDeveloperIdentityResult response = identityClient.getOpenIdTokenForDeveloperIdentity(request);

            Response lambdaResponse = new Response();
            lambdaResponse.setIdentityId(response.getIdentityId());
            lambdaResponse.setToken(response.getToken());
            return lambdaResponse;
        } else {
            return new Response();
        }
    }
}
```

- the `getToken` method will obtain a token from Cognito for the unique `username` provided
- we make a `GetOpenIdTokenForDeveloperIdentityRequest`
- we need to specify the `POOL_ID`, and a `username` for the `DEVELOPER_PROVIDER` we configured in our federated pool
- we can also specify for how long this token should be valid
- if we already have an identity for this `username`, a token for that identity will be returned
- if we don't have an identity, Cognito will create a new identity and provide a token
- we also receive an _identity ID_, which we can include in the response

This is our whole authorization service. The _Request_ and _Response_ classes are simple Java beans. We still need to package the Lambda and upload it to Amazon, and we also have to expose this service as an API through Amazon API Gateway. This API does not require authentication.

## Create an API secured through IAM credentials

We also need an API that is secured through _AWS_IAM_. We can use another Lambda that returns some data (a JSON) and expose it through Amazon API Gateway. Once that is done, we need to go to our method configuration in API Gateway, click the _method request_ section and under _authorization settings_ select _AWS_IAM_ for the _authorization_ field. We can now deploy the API to staging (both the secured API and the authorization service need to be deployed).

## Logging in with our custom authentication service

I created a JavaScript file to handle the whole authentication service. This file can be easily adapted in a UI that takes user credentials, then accesses the secured service for the required data to build the application UI.

We start out with the following required libraries and constants:

``` javascript
var https = require('https');
var collecter = require('./collecter.js').jsonCollecter;

var ROLE_ARN = "federated pool authenticated role";
var REGION = 'region'
var SERVICE = 'execute-api'
```

- we need to make HTTPS request to API Gateway
- the `collecter` library will help us read the responses (included below)
- include the _ARN_ for your federated pool authenticated role; this is the role we will assume to access the secured API
- we also need the Amazon region in which our services are deployed
- `execute-api` is the service name for the API Gateway

Next step is to call our authentication API and obtain the token:

``` javascript
function loginToCustomAuthService(familyName, dateOfBirth, callback) {
    var options = {
        method: 'POST',
        host: 'api staging url',
        path: '/cognitotest/auth'
    }
    var body = {
        familyName: familyName,
        dateOfBirth: dateOfBirth
    }
    var request = https.request(options, collecter(callback));
    request.write(JSON.stringify(body));
    request.end();
}

var familyName = "Popescu";
var dateOfBirth = "19800101";
loginToCustomAuthService(familyName, dateOfBirth, console.log);
```

- this is a simple POST request, sending the _family name_ and _date of birth_ as part of a JSON body
- the response will contain an _identity ID_ and a _token_

Running this program should print the token response to the console:

```
{ identityId: '****',
  token: '****' }
```

### Collecter library

``` javascript
var bl = require('bl');

exports.collecter = function(callback) {
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

exports.jsonCollecter = function(callback) {
    return function(result) {
        function onceCollected(err, data) {
            var string = data.toString();
            callback(JSON.parse(string));
        }
        result.setEncoding('utf8');
        result.pipe(bl(onceCollected));
        result.on('error', console.error);
    }
}
```

- uses the `bl` library
- exposes two methods, one collecting the result to a string, a second one also converting the string to JSON before sending it to the callback method provided

## Obtaining credentials from Amazon STS

Now that we have the token, we can use it to obtain credentials from the Security Token Service. For this, we first need to add some new dependencies, the AWS SDK for JavaScript from which we instantiate the STS object:

``` javascript
var AwsSdk = require('aws-sdk')
var STS = new AwsSdk.STS();
```

Then we can use the STS object to securely obtain credentials from Amazon:

``` javascript
function obtainCredentials(roleArn, token, callback) {
    STS.assumeRoleWithWebIdentity({
        RoleArn: roleArn,
        RoleSessionName: 'someRoleSessionName',
        WebIdentityToken: token
    }, function(error, response) {
        callback(response.Credentials);
    })
}

var familyName = "Popescu";
var dateOfBirth = "19800101";

loginToCustomAuthService(familyName, dateOfBirth, function(tokenResponse) {
    obtainCredentials(ROLE_ARN, tokenResponse.token, console.log);
});
```

- we use the `assumeRoleWithWebIdentity` method to which we provide the _role ARN_, a _role session name_ (can be anything) and the _token_
- the response we obtain is a large object, but we only need `Credentials` from it

Running the program now should print something like the following output on the console:

```
{ AccessKeyId: '****',
  SecretAccessKey: '****',
  SessionToken: '****',
  Expiration: 2017-03-30T14:14:12.000Z }
```

## Accessing a secured API with a signed request

We now have the _access key id_, the _secret access key_ and the _session token_, all necessary to sign a request made to a secured API. We need to include the library that will do the signing, the implementation of which is described in a different document:

``` javascript
var signature = require('./signature.js');
```

And the final implementation of our client is:

``` javascript
function loadDataFromSecuredService(accessKeyId, secretKey, sessionToken, callback) {
    var options = {
            method: 'GET',
            host: 'staging api url',
            path: '/cognitotest/secured_api_path'
    };
    // build the signature, body is empty
    signature.signRequest(options, '', accessKeyId, secretKey, REGION, SERVICE, sessionToken);
    https.request(options, collecter(callback)).end();
}

var familyName = "Popescu";
var dateOfBirth = "19800101";

loginToCustomAuthService(familyName, dateOfBirth, function(tokenResponse) {
    obtainCredentials(ROLE_ARN, tokenResponse.token, function(credentials) {
        loadDataFromSecuredService(credentials.AccessKeyId, credentials.SecretAccessKey, credentials.SessionToken, console.log);
    });
});
```

- `loadDataFromSecuredService` created the _GET_ request
- next, the requet is signed with the `signRequest` method from the _signature_ library; this process will add some headers to the request
- we execute the request and send the response to the callback function, which will print the request to console

Executing the program now should print the data provided by your secure service, in my example this data is a JSON object:

```
{ fields:
   [ { name: 'family name', value: '' },
     { name: 'first name', value: '' },
     { name: 'address', value: '' },
     { name: 'postcode', value: '' } ] }
```

This is the while process of using a custom authorizer service that creates identities in a federated Cognito pool, then using those identities to obtain credentials from Amazon STS and finally using those credentials to access secured APIs exposed through Amazon API Gateway.

## References

- [Amazon Cognito federated identities authentication flow](https://docs.aws.amazon.com/cognito/latest/developerguide/authentication-flow.html)
- [Amazon Cognito developer authenticated federated identities](https://docs.aws.amazon.com/cognito/latest/developerguide/developer-authenticated-identities.html)
- [Amazon blog post about Amazon Cognito developer authenticated identities](https://aws.amazon.com/blogs/mobile/understanding-amazon-cognito-authentication-part-2-developer-authenticated-identities/)
- [jwt.io, inspect your tokens](https://jwt.io/)
- [stackoverflow discussion about how to use Cognito federated identities to secure APIs exposed through API Gateway](https://stackoverflow.com/questions/39019244/api-gateway-authentication-with-cognito-federated-identities)
