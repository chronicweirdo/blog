---
title: 'Amazon Cognito email customization'
date: 2017-03-03 11:40:00 BST
tags: ['java mail', 'aws', 'cognito', 'ses', 'lambda']
---

Amazon Cognito is a user identity service in the AWS suite. It helps you create users and user pools and delegate the authentication process to AWS. Cognito will also send emails to new users as they are added to the system, and those emails can be customized to some extent. This post investigates what customizations Cognito will let us do, how far we can push those customizations. I expect to be able to set up an email with two bodies, one HTML (to allow us to style the email) and the other text-only (to maximize accessibility). I'm setting myself up for (spoiler alert) disappointment.

## Send multipart emails from Java

First we'll try to check that we can deliver emails with multiple content bodies. We want to have a HTML body email but also provide a text-only body for users that don't have mail clients that support HTML (accessibility reasons). In the following example, I am doing this using the Java mail client and my gmail account. First, the dependencies:

~~~ xml
<dependency>
    <groupId>javax.mail</groupId>
    <artifactId>javax.mail-api</artifactId>
    <version>1.5.6</version>
</dependency>

<dependency>
    <groupId>com.sun.mail</groupId>
    <artifactId>javax.mail</artifactId>
    <version>1.5.6</version>
</dependency>
~~~

And the code for this is very simple:

~~~ java
@Test
public void sendEmail() throws MessagingException {
    String username = "****@gmail.com";
    String password = "****";
    String host = "smtp.gmail.com";

    Properties props = System.getProperties();
    props.put("mail.smtp.starttls.enable", "true");
    props.put("mail.smtp.host", host);
    props.put("mail.smtp.user", username);
    props.put("mail.smtp.password", password);
    props.put("mail.smtp.port", "587");
    props.put("mail.smtp.auth", "true");

    Session session = Session.getDefaultInstance(props);

    MimeMessage message = new MimeMessage(session);

    message.setFrom(username);
    message.addRecipient(Message.RecipientType.TO, new InternetAddress(username));
    message.setSubject("Lovely Email");

    MimeBodyPart textPart = new MimeBodyPart();
    textPart.setText("This is a simple text email.", "utf-8");

    MimeBodyPart htmlPart = new MimeBodyPart();
    htmlPart.setContent("This <strong>email</strong> has some <em>html</em> in it.", "text/html; charset=utf-8");

    Multipart multiPart = new MimeMultipart("alternative");
    multiPart.addBodyPart(textPart);
    multiPart.addBodyPart(htmlPart);
    message.setContent(multiPart);

    Transport transport = session.getTransport("smtp");
    transport.connect(host, username, password);
    transport.sendMessage(message, message.getAllRecipients());
    transport.close();
}
~~~

An important detail to note in the above code is using `alternative` subtype when creating the `MimeMultipart`. If you don't use that subtype, both MIME parts will be displayed in the email.

When running this for the first time, you may have some trouble with gmail not allowing the connection. You'll need to allow less secure apps to use your gmail account (preferable not to use your main account for testing). At this moment, to enable this setting you need to log in to google, go to your account settings and under _sign-in & security > connected apps & sites_ turn on the _Allow less secure_ apps setting.

After sending your first email, you should see the html content in your gmail web client. You can view the raw message by clicking the _more_ dropdown (down arrow on the right side of your email) and selecting _show original_. The original message should look something like this (excerpt):

~~~
Content-Type: multipart/alternative; boundary="----=_Part_0_1330106945.1488382096094"

------=_Part_0_1330106945.1488382096094
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: 7bit

This is a simple text email.
------=_Part_0_1330106945.1488382096094
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: 7bit

This <strong>email</strong> has some <em>html</em> in<br /> it
------=_Part_0_1330106945.1488382096094--
~~~

To test if the text part of the email is used in text-only clients, we can use [Thunderbird](https://www.mozilla.org/en-US/thunderbird/). Download Thunderbird, set up your gmail account with it, then open the _lovely email_. The default HTML content is displayed by default, but now you can go in the menu and select _view > message body as > plain text_. The text part of the email should now be displayed. Other emails in your inbox that are not as considerate towards their users will not display a very clean message.

## Using Lambda to send custom Cognito emails

AWS Cognito will let you customize the emails sent to users when new accounts are created, but your customization options are limited. You can't send alternate message bodies. You can use Lambdas to further customize the email you are sending.

A first try would be to decide what kind of message you want to send to a user, either text-only or HTML, based on some custom user property. The JavaScript Lambda below does just that:

~~~ javascript
exports.handler = (event, context, callback) => {
    if(event.userPoolId === "us-west-2_*********") {
        if(event.triggerSource === "CustomMessage_AdminCreateUser") {
            event.response.emailSubject = 'Message from Lambda';
            if (event.request.userAttributes['custom:basicMail'] === "true") {
                event.response.emailMessage = getBasicMailMessage(event.request.usernameParameter,
                    event.request.codeParameter);
            } else {
                event.response.emailMessage = getHtmlMailMessage(event.request.usernameParameter,
                    event.request.codeParameter);
            }
        }
    }
    console.log(event);
    // return result to cognito
    context.done(null, event);
};

function getBasicMailMessage(usernameParameter, codeParameter) {
    return 'Thank you for signing up. Your username is ' + usernameParameter + " and "
            + codeParameter + ' is your verification code.';
}

function getHtmlMailMessage(usernameParameter, codeParameter) {
    return '<em>Thank you for signing up.</em><br /> Your username is ' + usernameParameter
            + " and <strong>" + codeParameter + '</strong> is your verification code.'
}
~~~

The code above checks the user pool ID and the event that occurred (a new user was added by an administrator). Then, based on the `custom:basicMail` attribute value, the email message we sent will either be a text-only message or an HTML message.

You can plug this Lambda in by going to the Cognito console, selecting your user pool, and under _Triggers_, select your Lambda for the desired trigger (in this case _Custom message_ trigger).

To be able to debug your Lambda you'll need to make sure the role you are using to run the Lambda has permissions to write logs to CloudWatch. To do this, you can go to the IAM console and under Roles select your role name and then Create Role Policy. I have used the following policy:

```
{
  "Version": "2017-03-01",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogStreams"
      ],
      "Resource": [
        "arn:aws:logs:*:*:*"
      ]
    }
  ]
}
```

Doing this will let you view the logs generated by your Lambdas but going into the CloudWatch console, under _Logs_ and select the log group corresponding to your Lambda (or just click the link for _View logs in CloudWatch_ under the _Monitoring_ tab in you Lambda view). It may take a while for the settings you made in IAM to take effect, so give it an hour before you run your Lambda.

Those are a lot of services we had to configure to have more control over the email we send, but the setup is still not doing what we want it to do. This setup will send an email message with either a text-only OR an HTML body, depending on a flag set for the user account when the account is created. But what we want is to send multiple message bodies and let the mail client used by our users decide what to display. For this, we'll need to plug in the first part of this post into another AWS service.

## Using SES to send multiple body emails

What we'll need to try and do is use a Java Lambda to cancel the default email send event, and call AWS SES (Simple Email Service) to send an email message with multiple bodies.

We'll first run a small test to see if SES lets us send emails with multiple bodies. But first, we need to configure SES. Go in the SES console and under _Identity Management > Email Addresses_ click _Verify a New Email Address_ and setup the address you want to use for this test.

So, does SES let us send emails with multiple bodies? It does, but we need to use the `sendRawEmail` call:

``` java
@Test
public void sendEmail() throws IOException, MessagingException {
    String email = "****@gmail.com";

    AmazonSimpleEmailService client = AmazonSimpleEmailServiceClientBuilder.defaultClient();

    RawMessage message = new RawMessage().withData(ByteBuffer.wrap(getMessageBytes(email)));
    SendRawEmailRequest request = new SendRawEmailRequest(message);
    SendRawEmailResult result = client.sendRawEmail(request);
    assertNotNull(result);
    assertNotNull(result.getMessageId());
}
```

And we can build that raw message using the Java mail client:

``` java
private byte[] getMessageBytes(String to) throws MessagingException, IOException {
    Session session = Session.getDefaultInstance(new Properties());

    MimeMessage message = new MimeMessage(session);
    message.setSubject("Lovely email");
    message.setFrom(to);
    message.addRecipient(javax.mail.Message.RecipientType.TO, new InternetAddress(to));

    MimeBodyPart textPart = new MimeBodyPart();
    textPart.setText("This is a simple text email.", "utf-8");

    MimeBodyPart htmlPart = new MimeBodyPart();
    htmlPart.setContent("This <strong>email</strong> has some <em>html</em> in it.", "text/html; charset=utf-8");

    Multipart multiPart = new MimeMultipart("alternative");
    multiPart.addBodyPart(textPart);
    multiPart.addBodyPart(htmlPart);
    message.setContent(multiPart);

    ByteOutputStream stream = new ByteOutputStream();
    message.writeTo(stream);
    byte[] bytes = stream.getBytes();
    System.out.println(new String(bytes));
    return bytes;
}
```

Some shortcuts were taken in writing the above code (no exception handling, from and to addresses are the same), but it works, SES does the job. Now we only have to build a Lambda that can use this method to create the emails we want for Cognito.

## Using Lambda and SES to send custom Cognito emails

Next step, build a Java Lambda that can be plugged in to Cognito to serve custom messages. You'll need to create a new project (see previous post about how you can create a maven artifact for quickly setting up Java Lambda projects). We'll use input and output streams to have maximum control over how our Lambda interracts with the Cognito events. The following code will do approximately the same thing the JavaScript Lambda defined above does:

``` java
public class CognitoMessageLambda {

    private ObjectMapper mapper = new ObjectMapper();

    public void handler(InputStream inputStream, OutputStream outputStream, Context context) throws IOException {
        StringWriter writer = new StringWriter();
        String eventString = IOUtils.toString(inputStream);

        Event event = mapper.readValue(eventString, Event.class);

        if ("CustomMessage_AdminCreateUser".equals(event.getTriggerSource())) {
            context.getLogger().log("input event: " + mapper.writeValueAsString(event));

            Request request = event.getRequest();

            Response response = new Response();
            response.setEmailSubject("Hi from Java");
            StringBuilder builder = new StringBuilder();
            builder.append("This is a mail message generated by Java")
                    .append(" that tells you a user named ")
                    .append(request.getUsernameParameter())
                    .append(" was created for you with the temporary password ")
                    .append(request.getCodeParameter());
            response.setEmailMessage(builder.toString());

            event.setResponse(response);

            context.getLogger().log("output event: " + mapper.writeValueAsString(event));
            mapper.writeValue(outputStream, event);
        } else {
            outputStream.write(eventString.getBytes());
        }
    }
}
```

In more detail, the code above:

- defines a Lambda that takes an input stream, output stream and the context object as parameters
- the input stream is the string value of a json object representing the Cognito event
- Cognito expects the output stream to contain a string representation of the same event, with possible changes on the response object
- we first read the input stream to a string; we'll need to return this exact string on the output stream if the Lambda is triggered in other situations if we don't want to introduce errors in our setup
- we'll then try to read the string into an Event object (using Jackson)
- if the trigger source is the one we expect, we can process the event
- we use the context object to access the logger and log to CloudWatch
- we are building the Response object, containing the email subject and message, using the code and username parameters on the Request object
- we set the new Response object on the Event
- last step, we serialize the updated Event with Jackson and write it to the output stream

The following represents a json event object that Cognito sends thorugh the custom message trigger (different triggers will have a different structure):

``` json
{
    "version": "1",
    "region": "us-west-2",
    "userPoolId": "us-west-2_*********",
    "userName": "testuser1488376471957",
    "callerContext": {
        "awsSdkVersion": "aws-sdk-java-1.11.93",
        "clientId": "CLIENT_ID_NOT_APPLICABLE"
    },
    "triggerSource": "CustomMessage_AdminCreateUser",
    "request": {
        "userAttributes": {
            "sub": "aa820a7e-db4c-4f86-b250-dfbc51f4e3de",
            "cognito:user_status": "FORCE_CHANGE_PASSWORD",
            "custom:basicMail": "true",
            "email": "****@example.com"
        },
        "codeParameter": "{####}",
        "usernameParameter": "{username}"
    },
    "response": {
        "smsMessage": null,
        "emailMessage": null,
        "emailSubject": null
    }
}
```

I've also built a set of Java objects to mirror the json structure:

``` java
@JsonIgnoreProperties(ignoreUnknown = true)
class Event {

    private String version;
    private String region;
    private String userPoolId;
    private String userName;
    private String triggerSource;
    private CallerContext callerContext;
    private Request request;
    private Response response;

    // getters and setters
}

@JsonIgnoreProperties(ignoreUnknown = true)
class CallerContext {

    private String awsSdkVersion;
    private String clientId;

    // getters and setters
}

@JsonIgnoreProperties(ignoreUnknown = true)
class Request {

    private UserAttributes userAttributes;
    private String codeParameter;
    private String usernameParameter;

    // getters and setters
}

@JsonIgnoreProperties(ignoreUnknown = true)
class UserAttributes {

    @JsonProperty(value = "cognito:user_status") private String userStatus;
    @JsonProperty(value = "custom:basicMail") private String basicMail;
    private String sub;
    private String email;

    // getters and setters
}

@JsonIgnoreProperties(ignoreUnknown = true)
public class Response {

    private String smsMessage;
    private String emailMessage;
    private String emailSubject;

    // getters and setters
}
```

Run `mvn install`, upload your Lambda to AWS, link it in Cognito and now, when you add a new user to the pool, that user will receive the welcome messages, just like they received them from the JavaScript Lambda. Next step will be, of course, to plug in the Java mail client plus SES code to send a custom email with two bodies:

``` java
public class CognitoMessageLambda {

    private ObjectMapper mapper = new ObjectMapper();
    private CustomEmailService customEmailService = new CustomEmailService();

    public void handler(InputStream inputStream, OutputStream outputStream, Context context) throws IOException {
        String eventString = IOUtils.toString(inputStream);
        Event event = mapper.readValue(eventString, Event.class);

        if ("CustomMessage_AdminCreateUser".equals(event.getTriggerSource())) {

            context.getLogger().log("input event: " + mapper.writeValueAsString(event));

            Request request = event.getRequest();

            try {
                context.getLogger().log("trying to send custom email through SES");
                String email = request.getUserAttributes().getEmail();
                String username = event.getUserName();
                String password = "?";
                customEmailService.sendEmail(email, username, password);
            } catch (MessagingException e) {
                context.getLogger().log("failed to send custom email through SES because " + e.getMessage());
            }

            context.getLogger().log("output event: " + mapper.writeValueAsString(event));
            mapper.writeValue(outputStream, event);
        }
        outputStream.write(eventString.getBytes());
    }
}
```

This new and improved Lambda has a new component, the CustomEmailService, which I am not including here, but will use SES to send the email we want, just like in the previous section. Just a note on that, you can initialize the SES client with the default settings and the role used to run your Lambda will also be used to access SES, so make sure you go to the IAM console and give this role SES privileges.

Now, looking back at this Lambda that finally achieves what we were looking for, we can spot a few problems. First, we don't have access to the temporary password generated by Cognito. One way to go around that would be to set our own temporary password when we create the user, Cognito will let us do that. We could use a key to encrypt the username, share that key between the code that adds the new user and the Lambda code and rebuild the temporary password in the Lambda using the username. We are taking some responsibility away from Cognito and moving it in our code, which somewhat defeats the purpose of using Cognito, but we can console ourselves that this is just the initial temporary password.

The second problem you'll notice when you test the Lambda. We now get two welcome emails, one coming from Cognito and another one from our CustomEmailService. I've looked for ways to disable the Cognito emails and was not able to find one. If we don't assign any values to the email subject and message in the Lambda, Cognito will just use the defaults set in its web console. You can't delete those defaults using the console. Trying to delete them through the SDK will result in validation errors. At the moment, it looks like I am not really able to achieve the email customization I want with Amazon Cognito. Either settle for what Cognito is providing or consider writing your own authentication service.
