---
title: 'Logging in to Amazon Cognito'
date: 2017-03-19 17:30:00 BST
tags: ['aws', 'cognito', 'node', 'react']
---

This document describes how to write a simple React UI for logging in to Amazon Cognito using the AWS SDK for JavaScript. We are designing the login form to allow user login, as well as handle user password change scenario when the user is logging in for the first time.

I am approaching this from a node and react beginner point of view, so there will be sections of this document I won't explain or explain correctly, but I am logging here my best understanding.

## Setting up the project

We'll run a node server that publishes a React UI, a single page application. First step, we need to create a new node project and add dependencies. Create a new folder, open it in a console and run the following commands:

``` shell
npm init
npm install --save amazon-cognito-identity-js aws-sdk babel bl body-parser express express-react-views react react-dom
npm install --save-dev babel-cli babel-core babel-preset-env babel-preset-es2015 babel-preset-react babel-register
```

Those are a lot of packages, and I know very little about what they each do. What I do know is that:

- we'll use _amazon-cognito-identity-js_ to log in to Amazon Cognito
- _aws-sdk_ provides some additional classes we may want to use to interact with Amazon Web Services (in the final project, this dependency is no longer necessary)
- _babel_ is used to convert ES2015 code (ECMAScript) into a version of JavaScript supported by most browsers
- we use _bl_ to collect the whole response before processing it
- _express_ is the server on which we'll run our code
- _react_ and _react-dom_ are required to build the React UI

The other dependencies are dev dependencies, which are test dependencies or transpilers (converting code from one format to some other format) and do not need to be packaged in a release. All the dev dependencies used here are _babel_ related and are used to interpret the more modern EC2015 and React's JSX and convert them to JavaScript.

## The login scenario

Logging in to Cognito using the Cognito SDK is pretty simple. The steps are:

- we need to create some JavaScript object to hold the user pool and user details
- we use the `CognitoUser` object to authenticate the user using their password
- the SDK does all necessary communication in the background and returns with a response

This is where it may get more complicated. If the user account is already enabled and active, and the credentials you used are correct, you will get a successful response containing some tokens that you can use to prove the user is now authenticated. But sometimes you will get a challenge instead of a successful response. This will happen when a user logs in for the first time and they are forced to change their password before proceeding. This scenario is not very well documented, but the `authenticateUser` method we are using to login will expect the following callbacks:

- `onSuccess` - straight-forward, this is where we have our tokens and we can continue to use the app as a logged in user
- `onFailure` - no explanations necessary, print the error message somewhere or add additional ways to handle and recover from it
- `newPasswordRequired` - this is what we are going to use when we are logging in a user for the first time, it is probably used in other scenarios, like when a password expires
- `mfaRequired` - this is for situations when you have multi factor authentication enabled
- `customChallenge` - with some Lambdas you can create your own custom challenges for Cognito

## The UI

We're writing the Login form and the whole UI of the app, in a single file (not necessary, not best practice for large apps, but this will do for now). To save you the refactoring trouble later I'll just ask you to create a _views_ subfolder and an _index.jsx_ file in that subfolder and put all your code there. I will explain why in the server section.

### First look at the application class

We start with dependencies at the top of the file. The imports from _aws-sdk_ are commented out because they are no longer necessary, but may be useful in the future.

``` javascript
import {
    Config,
    CognitoIdentityCredentials
} from "aws-sdk";
import {
    CognitoUserPool,
    CognitoUser,
    CognitoUserAttribute,
    AuthenticationDetails
} from "amazon-cognito-identity-js";
import React from 'react';
import http from 'http';
import bl from 'bl';
```

This is not the old-school `require(...)` imports, but we'll use those as well when we set up the server. We can use ES2015 syntax in this file because the server will compile it to plain JavaScript before sending it to the client.

I will start with a very rudimentary `Application` class that I will extend later in the document. The application will currently just contain a login form:

``` javascript
export default class Application extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="application">
                { this.renderLoginForm() }
            </div>
        )
    }

    renderLoginForm() {
        return (<LoginForm userPoolId={this.props.data.userPoolId} clientId={this.props.data.clientId}/>)
    }
}
```

The _application_ consists of a _div_ that contains a _LoginForm_ component. You can see the _LoginForm_ component expects some attributes: the user pool id and the client id.

### The login component

Let's move on to the login form. This is a large React component with a lot of methods and I will go over each of them in turn, starting with the constructor:

``` javascript
class LoginForm extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            username: "",
            password: "",
            isFirstLogin: false,
            newPassword: "",
            confirmNewPassword: "",
            passwordsDoNotMatch: false,
            challenge: null,
            cognitoUser: null
        }
        this.login = this.login.bind(this);
        this.changeUsername = this.changeUsername.bind(this);
        this.changePassword = this.changePassword.bind(this);
        this.changeNewPassword = this.changeNewPassword.bind(this);
        this.changeConfirmNewPassword = this.changeConfirmNewPassword.bind(this);

        this.newPasswordRequired = this.newPasswordRequired.bind(this);
        this.notifySuccessfulLogin = this.notifySuccessfulLogin.bind(this);
    }
}
```

- we can see that the state of this class consists of quite a few variables
- we have state variables that correspond to the form fields: `username`, `password`, `newPassword` and `confirmNewPassword`
- we have variables we use to manage the logic of the component: `isFirstLogin` and `passwordsDoNotMatch`
- and we also have variables used to hold hidden state objects: `challenge` and `cognitoUser`
- we need to bind some of the class methods to the current class instance, as you see at the end of the constructor; these are methods that are injected in the web UI to handle events or methods that are passed as callbacks; we will need these methods to have a link to the current instance even if they will be invoked from inside different objects

Next we'll look at the render method. How does the login form look like?

``` javascript
class LoginForm extends React.Component {

    // constructor

    render() {
        return (
            <div className="loginForm"><table><tbody>
                {this.renderMessageRow('loginForm', 'Login')}
                {this.renderFormFieldRow('username', 'text', this.state.username, this.changeUsername)}
                {this.renderFormFieldRow('password', 'password', this.state.password, this.changePassword)}
                {this.renderNewPasswordComponents()}
                {this.renderLoginButtonRow()}
            </tbody></table></div>
        )
    }

    renderFormFieldRow(label, type, value, onChange) {
        return (
            <tr key={label}>
                <td><label>{label}</label></td>
                <td><input type={type} value={value} onChange={onChange}/></td>
            </tr>
        )
    }

    renderLoginButtonRow() {
        return (
            <tr>
                <td colSpan="2"><input type="submit" onClick={this.login} value="login"/></td>
            </tr>
        )
    }

    renderMessageRow(key, message) {
        return (
            <tr key={key}>
                <td colSpan="2">{message}</td>
            </tr>
        )
    }

    renderNewPasswordComponents() {
        if (this.state.isFirstLogin) {
            return [
                renderMessageRow('new password message', 'Because this is the first time you are logging in, you will have to change your password'),
                renderFormFieldRow('new password', 'password', this.state.newPassword, this.changeNewPassword),
                renderFormFieldRow('confirm new password', 'password', this.state.confirmNewPassword, this.changeConfirmNewPassword),
                renderPasswordsDoNotMatchMessage()
            ];
        }
    }

    renderPasswordsDoNotMatchMessage() {
        if (this.state.passwordsDoNotMatch) {
            return renderMessageRow('passwordsDoNotMatchMessage', 'the new password and confirm new password fields do not match or are empty')
        }
    }

}
```

- starting with the main `render` method, we are delegating most of the form building to other methods
- `renderFormFieldRow` is the most used method; it creates a form field and associated label, wrapped in a row, with a value taken from the component and a method reference for handling the input change event
- `renderLoginButtonRow` and `renderMessageRow` are similar methods, returning table rows that either show the login button or a message
- `renderNewPasswordComponents` will only render something when `isFirstLogin` flag is set on the component state
- in the same way `renderPasswordsDoNotMatchMessage` will only render a message when the `passwordsDoNotMatch` flag is set

Directly related to the render methods are the change handlers for the input components, which only change the component state by using the `setState` method:

``` javascript
class LoginForm extends React.Component {

    // constructor

    // render methods

    changeUsername(event) {
        this.setState({username: event.target.value});
    }

    changePassword(event) {
        this.setState({password: event.target.value});
    }

    changeNewPassword(event) {
        this.setState({newPassword: event.target.value});
    }

    changeConfirmNewPassword(event) {
        this.setState({confirmNewPassword: event.target.value});
    }
}
```

Now we can move on to the `login` method:

``` javascript
class LoginForm extends React.Component {

    // constructor

    // render methods

    // change handlers

    login(e) {
        e.preventDefault();

        var cognitoUser = this.getCognitoUser();

        if (this.state.isFirstLogin) {
            if (this.verifyNewPassword()) {
                cognitoUser.completeNewPasswordChallenge(this.state.newPassword.trim(), this.state.challenge, this.getCallbacks())
            } else {
                this.setState({passwordsDoNotMatch: true});
            }
        } else {
            cognitoUser.authenticateUser(this.getAuthenticationDetails(), this.getCallbacks());
        }
    }

    verifyNewPassword() {
        return this.state.newPassword.trim().length > 0 &&
            this.state.newPassword.trim() === this.state.confirmNewPassword.trim();
    }
}
```

- the default form submission event is prevented
- we create a Cognito user object using a utility method (utility methods added below)
- we then progress the login based on the state
    - if this is a first login, we verify the new password and new password confirmation field
        - if passwords match, we execute the `completeNewPasswordChallenge` process
        - if passwords do not match, we change the state and set the `passwordsDoNotMatch` flag
    - if this is not a first login, we initiate the authentication/login process
- the `verifyNewPassword` method just compares the new password fields and makes sure they match and are not empty

Next we look at the utility methods:

``` javascript
class LoginForm extends React.Component {

    // constructor

    // render methods

    // change handlers

    // login method

    getUserPool() {
        return new CognitoUserPool({
            UserPoolId: this.props.userPoolId,
            ClientId: this.props.clientId,
        });
    }

    getCognitoUser() {
        if (this.state.cognitoUser) {
            return this.state.cognitoUser;
        } else {
            var newCognitoUser = new CognitoUser({
                Username : this.state.username.trim(),
                Pool : this.getUserPool()
            });
            this.setState({cognitoUser: newCognitoUser});
            return newCognitoUser;
        }

    }

    getAuthenticationDetails() {
        return new AuthenticationDetails({
            Username : this.state.username.trim(),
            Password: this.state.password.trim()
        });
    }
}
```

- the `getUserPool` method will just create a new `CognitoUserPool` using the properties used to create the component
- `getCognitoUser` will create a new Cognito user object, if one does not already exists; we need to use the Cognito user object that initiated the login process if the process is interrupted by a challenge, like resetting the password
- `getAuthenticationDetails` will create an object containing the username and password from the component state

The last part we need to talk about regarding the login component is how do we handle the events from the login process? We use the callbacks below:

``` javascript
class LoginForm extends React.Component {

    // constructor

    // render methods

    // change handlers

    // login method

    // utility methods

    getCallbacks() {
        return {
            onSuccess: this.notifySuccessfulLogin,
            onFailure: function(err) {
                alert(err);
            },
            newPasswordRequired: this.newPasswordRequired
        }
    }

    newPasswordRequired(result) {
        console.log("new password required");
        delete result.email_verified;
        this.setState({isFirstLogin: true, challenge: result});
    }

    notifySuccessfulLogin(result) {
        console.log(result.idToken.jwtToken);
        this.props.loginHandler(this.state.username.trim(), result.idToken.jwtToken);
    }
}
```

- `getCallbacks` will return the three callbacks required in our scenario: what happens when a login is successful, what happens when the login fails and what happens when we receive a `newPasswordRequired` challenge
- when we receive a `newPasswordRequired` challenge, the `newPasswordRequired` method will modify the state of the login component by setting the `isFirstLogin` flag to true and adding the challenge object received to the `challenge` state variable; next, the re-rendering of the component will show the new password fields and it is up to users to input a new valid password and to the `login` method to answer to the challenge when the login button is pressed again
- the interesting last case we must discuss is the `notifySuccessfulLogin` method:
    - when a successful login occured, we need to notify the parent component somehow
    - we do this through a `loginHandler` sent to us when the login component was initialized in the main application component
    - this handler does not appear in the main application code at the start of this page; I will update that code soon enough
    - when we want to notify the parent component, we just invoke the `loginHandler` function to which we provide the username and the id token we obtained through the login process

So, in summary, what this component does is:

- it displays a login form, with a username and password field, through the _render_ methods
- as users type in the username and password, _change handlers_ will take the type values and save them in the component state
- when the user click the login button, the _login_ method will start the authentication process
- the first call of the authentication process will try to obtain the tokens only using the username and password
- this may fail when the user is logging in for the first time; the login call will return a _new password required_ challenge, and when this happens we manipulate the state of the component to reflect this
- the _render_ methods are used again to update how the component is displayed based on the new state, and this will mean showing two new fields to input the new password
- when the user presses the login button again, the authentication process is continued, an answer to the _new password required_ challenge is sent to Cognito
- if this is successful, we finally obtain the new tokens and can now notify the parent component through the _login handler_ we received at initialization

### Back to the application class

It's time to go back to the application class and take a look at the actual implementation, the one that can receive a notification from the login component through a handler and then hide the login form and display a main application screen.

``` javascript
export default class Application extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            username: null,
            token: null
        }
        this.handleLoggedIn = this.handleLoggedIn.bind(this);
    }
}
```

- the new constructor will take set two state variables of the application, the `username` and the `token` used to make calls to APIs that require authentication
- we also bind the handler method, `handleLoggedIn`, to the current instance of the application; we are doing this because we will send the method to the login component, and the handler method will be called inside the login component, but we want the value of `this` inside the handler method to point to the current instance of the application class

The `handleLoggedIn` method will accept the `username` and `token` obtained by the login component and update the state of the application component.

``` javascript
export default class Application extends React.Component {
    // constructor

    handleLoggedIn(username, token) {
        this.setState({
            username: username,
            token: token
        })
    }
}
```

Updating the state of the application component will trigger a render of the component, and the render methods detailed below will change the UI from showing the login form to showing the main screen of the app:

``` javascript
export default class Application extends React.Component {
    // constructor

    // handler method

    render() {
        return (
            <div className="application">
                { this.renderLoginForm() }
                { this.renderMainScreen() }
            </div>
        )
    }

    renderLoginForm() {
        if (this.state.token == null) {
            return (<LoginForm userPoolId={this.props.data.userPoolId} clientId={this.props.data.clientId} loginHandler={this.handleLoggedIn}/>)
        }
    }

    renderMainScreen() {
        if (this.state.token) {
            return <div>MAIN SCREEN</div>
        }
    }
}
```

- the `render` method will just delegate to other more specific rendering methods
- you can see we have changed the `renderLoginForm` method to also provide the `loginHandler` to the `LoginForm` component when we initialize it
- `renderMainScreen` is currently just showing a div, we will return to this later

## Setting up the server

Time to set up the main program script, the one that starts everything up and monitors calls from clients. This is the part where we have a lot of third-party libraries that I don't yet understand, but I will explain things as best I can. Create a `program.js` file in the root folder of your project. We'll start with dependencies:

``` javascript
var express = require('express');
var app = express();
var React = require('react');
var ReactDOMServer = require('react-dom/server');
var DOM = React.DOM;
var body = DOM.body;
var div = DOM.div;
var script = DOM.script;
require('babel-core');
var https = require('https');
var bl = require('bl');

var browserify = require('browserify');
var babelify = require("babelify");
```

- express is the server we are using, we are instantiating it in the `app` variable
- `browserify` and `babelify` are used to convert and bundle our components to a javascript file that can be used to run all the component code on the client

Next, we are configuring the server to listen to port `8080` by default, or the first argument we send to the program. We are also setting the view engine of the server to `jsx` and pluggin in `express-react-views` to handle interpreting the views we are serving. We let the server know to load the views from the `/views` folder:

``` javascript
app.set('port', (process.argv[2] || 8080));
app.set('view engine', 'jsx');
app.set('views', __dirname + '/views');
app.engine('jsx', require('express-react-views').createEngine({transformViews: false}));

require('babel-register');
```

We also instantiate our `Application` component and we add the initial configuration to the data variable:

``` javascript
var Application = require('./views/index.jsx').default;
console.log(Application);

var data = {
    userPoolId: 'user pool id',
    clientId: 'client id',
    notesUrl: 'https://amazon-staging-api-url/cognitotest/notes'
};
```

Now let's prepare the javascript bundle and make the express server send the bundled file when the `/bundle.js` URL is accessed:

``` javascript
app.use('/bundle.js', function (req, res) {
    res.setHeader('content-type', 'application/javascript');

    browserify({debug: true})
        .transform(babelify.configure({
            presets: ["react", "es2015"],
            compact: false
        }))
        .require("./app.js", {entry: true})
        .bundle()
        .on("error", function(err) {
            console.log(err.message);
            res.end();
        })
        .pipe(res);
});
```

- we set the express server instantiated in the `app` variable to respond to calls to the `/bundle.js` URL with a function expecting a request and a response
- the function will use _browserify_ to transform _app.js_ using the _react_ and _es2015_ presets
- it will then bundle the result and pipe it to the responde body

So what is the _app.js_ file? You will need to create this file in the root of your project and include the following in it:

``` javascript
import React from 'react';
import ReactDOM from 'react-dom';
import Application from './views/index.jsx';

let data = JSON.parse(document.getElementById('initial-data').getAttribute('data-json'));
ReactDOM.render(<Application data={data}/>, document.getElementById("app"));
```

So this _app.js_ file is just a file importing all required dependencies to run the UI, then parsing the `intial-data` into an object and using that object to instantiate and render an `Application` component and add it to the HTML document under the element with id `app`.

We are using the generated _bundle.js_ in the main application that is accessed at the root path:

``` javascript
app.use('/', function (req, res) {
    var initialData = JSON.stringify(data);
    var markup = ReactDOMServer.renderToString(React.createElement(Application, {data: data}));

    res.setHeader('Content-Type', 'text/html');

    var html = ReactDOMServer.renderToStaticMarkup(body(null,
        div({id: 'app', dangerouslySetInnerHTML: {__html: markup}}),
        script({
            id: 'initial-data',
            type: 'text/plain',
            'data-json': initialData
        }),
        script({src: '/bundle.js'})
    ));

    res.end(html);
});
```

- the `data` variable is serialized into the `initial-data` variable
- the root page is a HTML page
- we are returning a HTML page containing a div element with id `app` and two scripts, one that contains the initial data and the second one loading the _bundle.js_ file
- the HTML is sent to the response

Finally, we make the express server listen on the port we want:

``` javascript
app.listen(app.get('port'), function() {})
```

Now, all you have to do is open a shell in the main folder and run `node program.js`, then open a browser and navigate to `localhost:8080`. You should have a running application that can handle a login to Cognito scenario. We are done with the login part, but we also want to use the token to access a secured API, which we describe in the next sections.

## The main app page

Right now, the main app only shows a simple text. We want our main app to access some secured data using the token we have obtained through the login process. The main screen is a pretty simple component, compared to the login component:

``` javascript
class MainScreen extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            title: "Your notes",
            notes: []
        }
        this.setNotes = this.setNotes.bind(this);
        this.loadNotes = this.loadNotes.bind(this);
        this.collectResponse = this.collectResponse.bind(this);
        this.loadNotes();
    }
}
```

- the constructor initializes the state to some default values
- we also bind some methods to the instance and make a call to `loadNotes` which will load the data

``` javascript
class MainScreen extends React.Component {
    // constructor

    render() {
        return (
            <div>
                <p>Hello, {this.props.username}, welcome to the app!</p>
                {this.renderNotes()}
            </div>
        )
    }

    renderNotes() {
        var renderedNotes = this.state.notes.map(function(note) {
            return (
                <div key={note.title}>
                    <h2>{note.title}</h2>
                    <p>{note.contents}</p>
                </div>
            )
        })
        return (
            <div>
                <h1>{this.state.title}</h1>
                {renderedNotes}
            </div>
        )
    }
}
```

- the `render` method will display a hello message and delegate to the `renderNotes` method
- `renderNotes` will map all notes in the state to divs that contain each note's title and contents
- `renderNotes` will also show a title value, and it is dependent on the current state of the component

Lastly, let's see how we get the notes:

``` javascript
class MainScreen extends React.Component {
    // constructor

    // render methods

    loadNotes() {
        var options = {
            method: 'GET',
            host: 'localhost',
            port: 8080,
            path: '/notes',
            headers: {'Authorization': this.props.token}
        };
        var req = http.request(options, this.setNotes);
        req.end();
    }

    setNotes(result) {    
        result.setEncoding('utf8');
        result.pipe(bl(this.collectResponse));
        result.on('error', console.error);
    }

    collectResponse(err, data) {
        var string = data.toString();
        var object = JSON.parse(string);
        this.setState({title: object.title, notes: object.notes});
    }
}
```

- the `loadNotes` makes a _GET_ call to an endpoint that expects an `Authorization` header
- when we get a response back, we use the `setNotes` method as callback
- the `setNotes` method will use the _bl_ library to read the whole response and save that response to the state of the component within the `collectResponse` method

When the state changes, the render methods are called again to update the UI. But there is a small detail in here I need to point out. We are making a _GET_ call to a _/notes_ endpoint on _localhost_. I did this because the call is made from the client, and the client will complain if we try to access data on some different server, so for this exercise I chose to pull data from an Amazon API through the server. And I'll show you how I do that in the next and final section.

## Making a call to some service

We need to add a new mapping for our express server in the _program.js_ folder:

``` javascript
app.use('/bundle.js', function (req, res) {
    // handle bundle
});

app.use('/notes', function(request, response) {
    var authorization = request.headers.authorization;
    if (authorization) {
        var options = {
            method: 'GET',
            host: 'amazon-notes-api-url',
            path: '/staging/notes',
            headers: {'Authorization': authorization}
        };
        var internalRequest = https.request(options, function(result) {
            result.setEncoding('utf8');
            result.pipe(bl(onceCollected));
            result.on('error', console.error);

            function onceCollected(err, data) {
                var string = data.toString();
                console.log(string);
                response.end(string);
            }
        });
        internalRequest.end();
    } else {
        response.end();
    }
});

app.use('/', function (req, res) {
    // handle root
});
```

- the new mapping is for the `/notes` URL
- we verify and only continue if we have an authorization header
- we make a get request to the Amazon API with the authorization header
- the response we receive from Amazon we read and the write to the response we want to return to the client

And now we finally have a working example of logging in with a Cognito identity, obtaining a user identity token and using that token to pull data from a secured Amazon API, all through a React UI. This example ties in with the previous post. Run `node program.js` and test it out.
