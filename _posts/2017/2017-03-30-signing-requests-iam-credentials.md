---
title: 'Signing requests with Amazon IAM credentials'
date: 2017-03-30 16:00:00 BST
tags: ['aws', 'api gateway', 'iam', 'sigv4']
---

This document explores the process of accessing services exposed through Amazon's API Gateway that are secured with IAM credentials instead of Cognito tokens. The mechanism for getting access to those services is based on signing the request using our secret key instead of actually sending the key over. When accessing Amazon services through the SDK, the SDK takes care of this signing process for you, but if you want to access your own custom services exposed through API Gateway you will have to write your own code to sign that request, and this is quite an involved process.

<!--more-->

## Creating a mock service and exposing it throguh the API Gateway

First we need a service we want to access. I've created a simple javascript Lambda that returns some JSON data (I named it _getUserForms_):

``` javascript
exports.handler = (event, context, callback) => {
    var result = {
        'fields': [
            { 'name': 'family name', 'value': ''},
            { 'name': 'first name', 'value': ''},
            { 'name': 'address', 'value': ''},
            { 'name': 'postcode', 'value': ''}
        ]
    }
    callback(null, result);
};
```

Next, I make this service accessible through API Gateway by creating a new resource and a _GET_ method invoking the Lambda. Once the API is published to staging, we can invoke it to obtain our data with some very simple javascript code:

``` javascript
var https = require('https');
var bl = require('bl');

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

function loadForms(callback) {
    var options = {
            method: 'GET',
            host: 'staging url',
            path: '/cognitotest/forms'
    };
    var request = https.request(options, collecter(callback));
    request.end()
}

loadForms(function(result) {
    console.log(result);
});
```

I've added this code to a file _test.js_. Running it on node (with the appropriate dependencies available), we see the data getting printed on screen. Now it's time to secure this endpoint. Go back to the API Gateway console, on your _forms_ resource and the _GET_ method and click the _method request_ section. Under _authorization settings_ select _AWS_IAM_ for the _authorization_ field and click the small check sign to confirm (small side note: the role corresponding to the credentials you will use to connect to the API needs to have permissions to execute API Gateway endpoints, and you can take care of that in the IAM console). Deploy to staging and run the _test.js_ script again and you should see the following message:

``` json
{"message":"Missing Authentication Token"}
```

## Signing a request

Signing a request is a complicated process. I have added relevant links about this at the end of the document, but I will go over the process and its implementation in the following sections, step by step, providing a library that can be used for signing _almost_ any requests (there are still some parts I have not addressed).

The process for singing a request are:

- prepare a request
- convert it to a canonical request - a specific text representation of the request
- use the canonical request and some additional information to create a _string to sign_
- use your _AWS secret key_ to derive the signing key
- use the _derived key_ and the _string to sign_ to create a _signature_
- add the resulting _signature_ to the request in a header (or as a query string parameter)
- execute the request

These steps would work on the `options` object used to make the request. Besides the `options` object, other inputs will be

- the `requestBody`
- the `accessKeyID` - will be part of the signature header
- the `secretKey` - this will be used to sign the request
- the `region` - needed for the signature header
- the `service` - needed for the signature header
- the `sessionToken` - this is required when we are working with temporary credentials obtained from STS, which is the case when we are using federated Cognito identities

The following `signRequest` is the main method which will handle the whole process:

``` javascript
function signRequest(options, requestBody, accessKeyID, secretKey, region, service, sessionToken) {
    formatHeaders(options, sessionToken);

    var canonicalRequestAndHash = toCanonicalRequestAndHash(options, requestBody)
    var stringToSign = createStringToSign(options, canonicalRequestAndHash.rehashedCanonicalRequest, region, service)
    var signingKey = createSigningKey(options, secretKey, region, service);
    var signature = calculateSignature(signingKey, stringToSign.stringToSign)
    var authorization = createAuthorizationHeader(accessKeyID, stringToSign.credentialsScope, canonicalRequestAndHash.signedHeaders, signature);

    options.headers['Authorization'] = authorization;
}
```

- we first need to format the headers on the request; there are some required headers for sending this request to Amazon and we need to add them if they are missing
- then we obtain the _canonical request_ and a hash of the _canonical request_
- we create the _string to sign_, which includes the _canonical request_ hash and some other information
- we create the _signing key_ using our _secret key_
- we finally create the _signature_ using the _signing key_ and the _string to sign_
- and then we create the _authorization_ header and add it to the request

### Formatting headers

A signed request to API Gateway will require an _amazon date_ header and the _host_ header. The _session token_ will also need to be included in a header if we have one.

``` javascript
function formatHeaders(options, sessionToken) {
    if (options.headers == undefined) {
        options.headers = {}
    }
    if (options.headers[AMAZON_DATE_HEADER] == undefined) {
        options.headers[AMAZON_DATE_HEADER] = getISO8601UTC();
    }
    if (options.headers[HOST_HEADER] == undefined) {
        options.headers[HOST_HEADER] = options.host;
    }
    if (sessionToken) {
        options.headers[AMAZON_SESSION_TOKEN_HEADER] = sessionToken;
    }
}
```

The date itself needs to be the UTC date in ISO8601 format, and I compute it with the following (very unrefined) code:

``` javascript
function getISO8601UTC() {
    var today = new Date();
    var string = ''
    string += today.getUTCFullYear()
    string += withLeadingZero((today.getUTCMonth() + 1))
    string += withLeadingZero(today.getUTCDate())
    string += 'T'
    string += withLeadingZero(today.getUTCHours())
    string += withLeadingZero(today.getUTCMinutes())
    string += withLeadingZero(today.getUTCSeconds())
    string += 'Z'
    return string;
}

function withLeadingZero(value) {
    if (value < 10) {
        return '0' + value;
    } else {
        return value;
    }
}
```

### The canonical request

The Amazon documentation tells us the canonical request is just a very text representation of the request in the following form:

```
CanonicalRequest =
   HTTPRequestMethod + '\n' +
   CanonicalURI + '\n' +
   CanonicalQueryString + '\n' +
   CanonicalHeaders + '\n' +
   SignedHeaders + '\n' +
   HexEncode(Hash(RequestPayload))
```

`Hash` is a function that produces a message digest, typically _SHA-256_, `HexEncode` returns a base-16 encoding of the digest in lowercase characters. My implementation of this follows:

``` javascript
function toCanonicalRequestAndHash(options, requestBody) {
    var canonicalRequest = '';
    canonicalRequest += options.method + '\n';
    canonicalRequest += canonicalURI(options);
    canonicalRequest += canonicalQueryString(options);
    var canonicalHeaders = canonicalHeadersAndSignedHeaders(options);
    canonicalRequest += canonicalHeaders.combined
    var canonicalRequestHash = hashAndHexEncode(requestBody)
    canonicalRequest += canonicalRequestHash;
    var rehashedCanonicalRequest = hashAndHexEncode(canonicalRequest);

    return {
        'canonicalRequest': canonicalRequest,
        'canonicalRequestHash': canonicalRequestHash,
        'signedHeaders': canonicalHeaders.signedHeaders,
        'rehashedCanonicalRequest': rehashedCanonicalRequest
    };
}
```

- we instatiate the `canonicalRequest` to an empty string
- we add the `options.method` to this string, followed by newline (note: maybe that `options.method` should be capitalized)
- we add a new line containing the _canonical URI_
- we follow with another line containing the _canonical query string_
- the _canonical headers_ are represented on multiple lines, and we need to keep a subset list of the _signed headers_ and pass it along since this will be used later
- next, we hash and encode the request body and add a line with the hash to the _canonical request_
- finally, we hash the whole _canonical request_ (including the hash of the request body) and pass it on the return object since we will need this hash later

Next, let's visit the individual methods, starting with `canonicalURI`:

``` javascript
function canonicalURI(options) {
    var path = options.path;
    var parametersStart = path.indexOf("?");
    if (parametersStart > -1) {
        path = path.substring(0, parametersStart)
    }
    if (path && path.length > 0) {
        return encodeURI(path) + '\n';
    } else {
        return encodeURI('/') + '\n';
    }
}
```

- `canonicalURI` just takes the path, excluding the host and excluding the parameters, and returns it as a string on a single line
- if we are making a request to the root path, we must return `/` as the _canonical URI_

``` javascript
function canonicalQueryString(options) {
    // todo: implement
    return '\n';
}
```

- this method I did not implement because I was not working with URI parameters and I wanted to focus on the daunting task ahead

``` javascript
function canonicalHeadersAndSignedHeaders(options) {
    var sList = sortedList(options.headers);
    var cHeaders = '';
    var sHeaders = '';
    for (var i = 0; i < sList.length; i++) {
        cHeaders += sList[i].name + ':' + sList[i].value + '\n'
        sHeaders += ';' + sList[i].name;
    }
    if (cHeaders.length == 0) {
        // probably will never occur since the host header always needs to be included
        cHeaders += '\n';
    }
    sHeaders = sHeaders.substring(1)

    return {
        'canonicalHeaders': cHeaders,
        'signedHeaders': sHeaders,
        'combined': (cHeaders + '\n' + sHeaders + '\n')
    }
}

function sortedList(map) {
    var list = []
    for (name in map) {
        list.push({'name': lowercase(name), 'value': trimall(map[name])});
    }
    list.sort(function(a, b) {
        return a.name.localeCompare(b.name);
    });
    return list;
}

function lowercase(value) {
    return value.toLowerCase();
}

function trimall(value) {
    return value.trim().replace(new RegExp(/\s+/gi), " ");
}
```

- encoding the headers is a more complicated matter
- headers must be sorted by header name, that is what we use the `sortedList` method for
- header names must be in lowercase
- we must trim all extra spaces from the header values, this includes replacing multiple spaces inside the header value with a single space character; we use the `trimall` method for that
- the _canonical headers_ will have each header name, followed by a colon, followed by the header value on separate lines
- the _canonical headers_ end with an empty line, followed by the _signed headers_ list, which are the names of all header names included in the _canonical headers_ separated by semicolon, and a final newline character
- we are also including the _signed headers_ as a separate field in the return object because we will need to use them later

``` javascript
function hashAndHexEncode(requestBody) {
    var sha256 = crypto.createHash("sha256");
    var hashObject = sha256.update(requestBody || '', 'utf8');
    var hex = hashObject.digest('hex').toLowerCase();
    return hex;
}
```

- we are using node's `crypto` library to create a hash using the `sha256` algorithm
- next we are creating a `hex` digest and converting all characters to lowercase
- this method is used to first hash the request body
- then the request body hash is added to the _canonical request_ and a new hash of the whole _canonical request_ is created using this method

### The string to sign

The algorithm (in pseudocode) for creating a _string to sign_ is:

```
StringToSign =
    Algorithm + \n +
    RequestDateTime + \n +
    CredentialScope + \n +
    HashedCanonicalRequest
```

- we specify the hashing algorithm first
- we add the request date and time in ISO8601 format, the UTC value
- we add a _credential scope_ string
- the final line contains the hash of the _canonical request_ we obtained previously

The `createStringToSign` method follows this algorithm very closely, but the return object of this method contains two fields, one the _string to sign_ and the other the _credential scope_, because we will need both fields later.

``` javascript
function createStringToSign(options, canonicalRequestHash, region, service) {
    var stringToSign = '';
    stringToSign += 'AWS4-HMAC-SHA256' + '\n' // corresponds to SHA256
    stringToSign += options.headers[AMAZON_DATE_HEADER] + '\n'
    var credentialsScope = createCredentialsScope(options, region, service)
    stringToSign += credentialsScope + '\n'
    stringToSign += canonicalRequestHash;
    return {
        'stringToSign': stringToSign,
        'credentialsScope': credentialsScope
    }
}

function createCredentialsScope(options, region, service) {
    var date = options.headers[AMAZON_DATE_HEADER].substring(0, 8);
    return date + '/' + region + '/' + service + '/aws4_request'
}
```

- the _credentials scope_ consists of a string starting with the date (year, month and day), the AWS region we are accessing, the Amazon service we are accessing and always ends with the `aws4_request` string (we are implementing teh version 4 signature, there is a version 2 signing process as well).

### Getting the signing key

The signing key is created by following this algorithm:

```
kSecret = secret access key
kDate = HMAC("AWS4" + kSecret, Date)
kRegion = HMAC(kDate, Region)
kService = HMAC(kRegion, Service)
kSigning = HMAC(kService, "aws4_request")
```

- we are creating a series of HMACs (hash-based message authentication codes)
- we start by encoding the _date_ (year, month, day) with our _secret key_, obtaining the _date key_
- we then create the _region key_ by encoding the _region_ with the _date key_
- next we get the _service key_ by encoding the _service_ with the _region key_
- finally we get the _signing key_ by encoding the `aws4_request` string with the _service key_

``` javascript
function createSigningKey(options, secret, region, service) {
    var date = options.headers[AMAZON_DATE_HEADER].substring(0, 8);

    var kDate = HMAC("AWS4" + secret, date)
    var kRegion = HMAC(kDate, region)
    var kService = HMAC(kRegion, service)
    var kSigning = HMAC(kService, "aws4_request")
    return kSigning
}

function HMAC(original, update) {
    return crypto.createHmac('sha256', original).update(update).digest();
}
```

- the `createSigningKey` method follows every step of this algoritm
- the `HMAC` method takes the `original`, the key, and the `update`, the value that is getting encoded
- the `HMAC` method returns a binary digest of the key (this is a buffer)
- in the early lazy stages of investigating how I can access a service exposed through the API Gateway using federated identities I ran into an implementation of the signing process that tried to use `.digest('binary')`, which does not work because `binary` is not an accepted input for that method; this is why I ended up implementing the whole process from scratch

### Computing the signature

We now have all we need to compute the signature, with the `calculateSignature` method. We are signing the _string to sign_ with the _signing key_ we obtained before:

``` javascript
function calculateSignature(signingKey, stringToSign) {
    return crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex').toLowerCase();
}
```

### Building the authorization header

``` javascript
function createAuthorizationHeader(accessKeyID, credentialsScope, signedHeaders, signature) {
    var authorization = '';
    authorization += 'AWS4-HMAC-SHA256' + ' ';
    authorization += 'Credential=' + accessKeyID + '/' + credentialsScope + ', ';
    authorization += 'SignedHeaders=' + signedHeaders + ', '
    authorization += 'Signature=' + signature
    return authorization;
}
```

- the _authorization header_ is a single line of text consisting of several sections
- it starts with the code for the algorithm used to create the signature, which for _SHA-256_ is `AWS4-HMAC-SHA256`
- next we include the credentials, containing the `accessKeyID` and the _credentials scope_ we obtained in the `createStringToSign` method
- then we add the _signed headers_ list, obtained in the `toCanonicalRequestAndHash` method
- finally we add the _signature_ obtained by the `calculateSignature` method
- the `signRequest` method is also adding the value computed by `createAuthorizationHeader` to the request options, under the `Authorization` header name

Last thing we need to do is export the `signRequest` method and we can use our library to make signed calls to API Gateway:

``` javascript
exports.signRequest = signRequest
```

## Sending a signed request

In the _test.js_ I created another method, `loadFormsWithAuth` that will use our library to sign the request before sending it to API Gateway:

``` javascript
var signature = require('./signature.js');

function loadFormsWithAuth(callback) {
    var options = {
            method: 'GET',
            host: 'api gateway url',
            path: '/cognitotest/forms'
    };
    // build the signature
    var accessKeyId = 'access key id'
    var secretKey = 'secret key'
    var sessionToken = 'session token'
    signature.signRequest(options, '', accessKeyId, secretKey, 'region', 'execute-api', sessionToken);


    var request = https.request(options, collecter(callback));
    request.end()
}

loadFormsWithAuth(console.log);
```

- the `accessKeyID`, `secretKey` and `sessionToken` values are hardcoded here, I explain how to obtain them in the Cognito federated identities document
- the _service_ name for API Gateway is `execute-api`

Running the code, you should now have access to the secured API and see the following output on the console:

```
{ fields:
   [ { name: 'family name', value: '' },
     { name: 'first name', value: '' },
     { name: 'address', value: '' },
     { name: 'postcode', value: '' } ] }
```

## References

- [implementing IAM authentication for APIs created with API Gateway](https://aws.amazon.com/premiumsupport/knowledge-center/iam-authentication-api-gateway/)
- [create canonical request for sigv4](https://docs.aws.amazon.com/general/latest/gr/sigv4-create-canonical-request.html)
- [create credentials scope for API Gateway](https://docs.aws.amazon.com/apigateway/api-reference/signing-requests/)
- [sig4 add signature to request, create authorization header](https://docs.aws.amazon.com/general/latest/gr/sigv4-add-signature-to-request.html)
